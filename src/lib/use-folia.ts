'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { ZodError } from 'zod';
import {
  createDemoData,
  createEmptyData,
  DEMO_WORKSPACE_ID,
  emptyTimer,
  id,
  LOCAL_USER_ID,
  workspaceDataSchema,
  type TimerPhase,
  type WorkspaceData,
} from './model';
import {
  completeTimer,
  pauseTimer as pause,
  remainingTime,
  resetTimer as reset,
  resumeTimer as resume,
  selectPhase as phase,
  skipTimer as skip,
  startTimer as start,
  type StartTimerContext,
} from './timer';
import {
  addMutationHistory,
  acknowledgePending,
  clearAccountCache,
  ConflictError,
  findActiveTimerConflict,
  isPreferencesOnlyChange,
  loadLocal,
  pendingKey,
  prepareImport,
  previewImport,
  readPending,
  saveLocal,
  serializeExport,
  STORAGE_PREFIX,
  storageKey,
  withWorkspaceLock,
  type ImportPreview,
} from './persistence';
import { createBrowserSupabase } from './supabase/browser';
import { findOverlap } from './calendar';
import type { Entitlements } from './billing/entitlements';
import { fetchWorkspaceSnapshot, makeDocumentPatch } from './sync-transfer';
import { localizeError } from './i18n/errors';

export type WorkspaceSummary = {
  icon?: string;
  id: string;
  name: string;
  kind: 'personal' | 'organization';
  role: 'owner' | 'admin' | 'member' | 'viewer';
  plan: 'free' | 'pro' | 'team';
  entitlements?: Entitlements;
};
export type AccountUser = { id: string; email?: string };
export type SaveStatus =
  'loading' | 'saving' | 'saved' | 'offline' | 'pending' | 'failed' | 'conflict';
type Conflict = {
  kind?: 'document' | 'preferences';
  data: WorkspaceData;
  localData?: WorkspaceData;
  version: number;
  storageVersion?: number;
  scope: 'cloud' | 'local';
};
const LOCAL_POINTER = `${STORAGE_PREFIX}active-local`;
const localWorkspace = (workspaceId: string): WorkspaceSummary => ({
  id: workspaceId,
  name: workspaceId === DEMO_WORKSPACE_ID ? 'Espace de démonstration' : 'Espace personnel',
  kind: 'personal',
  role: 'owner',
  plan: 'free',
});
function errorMessage(error: unknown) {
  if (error instanceof ZodError)
    return [...new Set(error.issues.map((issue) => localizeError(issue.message)))].join(' ');
  return error instanceof Error
    ? localizeError(error.message)
    : 'Une erreur est survenue. Vos dernières données enregistrées sont conservées.';
}
function unionRecords<T extends { id: string }>(remote: T[], local: T[]) {
  return [...new Map([...remote, ...local].map((record) => [record.id, record])).values()];
}

function fetchFoliaApi(input: string, init: RequestInit = {}) {
  const headers = new Headers(init.headers);
  headers.set('X-Folia-Document-Version', '2');
  if (input.startsWith('/api/sync?') && (!init.method || init.method === 'GET')) {
    const workspace = new URL(input, window.location.origin).searchParams.get('workspaceId');
    if (workspace)
      return fetchWorkspaceSnapshot(workspace).then((snapshot) => Response.json(snapshot));
  }
  return fetch(input, { ...init, headers });
}

export function useFolia() {
  const [data, setData] = useState<WorkspaceData>(() => createEmptyData());
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('loading');
  const [user, setUser] = useState<AccountUser | null>(null);
  const [workspaces, setWorkspaces] = useState<WorkspaceSummary[]>([]);
  const [workspaceId, setWorkspaceId] = useState(DEMO_WORKSPACE_ID);
  const [now, setNow] = useState(() => Date.now());
  const [conflict, setConflict] = useState<Conflict | null>(null);
  const [importCandidate, setImportCandidate] = useState<ImportPreview | null>(null);
  const dataRef = useRef(data);
  const accountRef = useRef<AccountUser | null>(null);
  const workspacesRef = useRef<WorkspaceSummary[]>([]);
  const workspaceRef = useRef(DEMO_WORKSPACE_ID);
  const localVersion = useRef(0);
  const serverVersion = useRef(0);
  const generation = useRef(0);
  const syncBusy = useRef(false);
  const mutationQueue = useRef<Promise<unknown>>(Promise.resolve());
  const conflictRef = useRef<Conflict | null>(null);
  const syncRef = useRef<() => Promise<void>>(async () => {});
  const switchRef = useRef<(workspace: string, account?: AccountUser | null) => Promise<void>>(
    async () => {},
  );
  const updateRef = useRef<
    (mutator: (draft: WorkspaceData) => void | WorkspaceData, history?: boolean) => Promise<boolean>
  >(async () => false);
  const publish = useCallback((next: WorkspaceData) => {
    dataRef.current = next;
    setData(next);
  }, []);
  const showConflict = useCallback((next: Conflict | null) => {
    conflictRef.current = next;
    setConflict(next);
  }, []);

  const sync = useCallback(async () => {
    const account = accountRef.current;
    const currentWorkspace = workspaceRef.current;
    const token = generation.current;
    if (!account || syncBusy.current || conflictRef.current) return;
    if (!navigator.onLine) {
      setSaveStatus('offline');
      return;
    }
    syncBusy.current = true;
    try {
      const operation = readPending(account.id, currentWorkspace);
      if (!operation) {
        setSaveStatus('saved');
        return;
      }
      setSaveStatus('saving');
      let method = 'PUT';
      let requestBody = JSON.stringify({
        ...(operation.kind === 'preferences'
          ? { preferences: operation.data.preferences }
          : { data: operation.data }),
        expectedVersion: operation.expectedVersion,
        operationId: operation.id,
      });
      const transferKey = `${storageKey(currentWorkspace, account.id)}:patch`;
      // Persist the exact compact request before sending, so a lost response can be
      // replayed even after another device has saved a newer document.
      if (
        operation.kind !== 'preferences' &&
        new TextEncoder().encode(requestBody).length > 450_000
      ) {
        const cached = localStorage.getItem(transferKey);
        const cachedBody = cached ? JSON.parse(cached) : null;
        if (
          cachedBody?.operationId === operation.id &&
          cachedBody?.expectedVersion === operation.expectedVersion
        ) {
          requestBody = cached!;
        } else {
          const remote = await fetchWorkspaceSnapshot(currentWorkspace);
          if (token !== generation.current) return;
          if (remote.version !== operation.expectedVersion) {
            showConflict({
              ...remote,
              scope: 'cloud',
              localData: dataRef.current,
              storageVersion: loadLocal(storageKey(currentWorkspace, account.id))?.version,
              kind: 'document',
            });
            setSaveStatus('conflict');
            setError(
              'Un autre appareil a modifié cet espace. Choisissez comment résoudre le conflit.',
            );
            return;
          }
          requestBody = JSON.stringify({
            patch: makeDocumentPatch(remote.data, operation.data),
            expectedVersion: operation.expectedVersion,
            operationId: operation.id,
          });
          localStorage.setItem(transferKey, requestBody);
        }
        method = 'PATCH';
      }
      const response = await fetchFoliaApi(
        `/api/${operation.kind === 'preferences' ? 'preferences' : 'sync'}?workspaceId=${encodeURIComponent(currentWorkspace)}`,
        {
          method,
          headers: { 'Content-Type': 'application/json' },
          body: requestBody,
        },
      );
      const body = await response.json();
      if (token !== generation.current) return;
      if (response.status === 409) {
        let remote = body;
        if (!('version' in body) || !('data' in body)) {
          const latest = await fetchFoliaApi(
            `/api/sync?workspaceId=${encodeURIComponent(currentWorkspace)}`,
            { cache: 'no-store' },
          );
          if (latest.ok) remote = await latest.json();
        }
        if (token !== generation.current) return;
        showConflict({
          data: remote.data
            ? workspaceDataSchema.parse(remote.data)
            : createEmptyData(currentWorkspace),
          version: remote.version ?? serverVersion.current,
          scope: 'cloud',
          localData: dataRef.current,
          storageVersion: loadLocal(storageKey(currentWorkspace, account.id))?.version,
          kind: readPending(account.id, currentWorkspace)?.kind || operation.kind || 'document',
        });
        setSaveStatus('conflict');
        setError(
          body.error ||
            'Another device changed this workspace. Choose how to resolve the conflict.',
        );
        return;
      }
      if (!response.ok)
        throw new Error(
          body.error || 'Cloud saving failed. Your edits remain queued on this device.',
        );
      const committedVersion = body.committedVersion ?? body.version;
      serverVersion.current = committedVersion;
      localStorage.setItem(
        `${storageKey(currentWorkspace, account.id)}:serverVersion`,
        String(committedVersion),
      );
      await withWorkspaceLock(storageKey(currentWorkspace, account.id), () =>
        token === generation.current
          ? acknowledgePending(account.id, currentWorkspace, operation.id, committedVersion)
          : undefined,
      );
      if (token !== generation.current) return;
      if (method === 'PATCH' && localStorage.getItem(transferKey) === requestBody)
        localStorage.removeItem(transferKey);
      const pending = readPending(account.id, currentWorkspace);
      if (!pending) {
        setSaveStatus('saved');
        setError(null);
      } else if (pending) {
        setSaveStatus('pending');
      }
    } catch (cause) {
      if (token === generation.current) {
        setError(errorMessage(cause));
        setSaveStatus(navigator.onLine ? 'failed' : 'offline');
      }
    } finally {
      syncBusy.current = false;
    }
  }, [showConflict]);
  useEffect(() => {
    syncRef.current = sync;
  }, [sync]);

  const selectWorkspace = useCallback(
    async (nextWorkspace: string, providedAccount?: AccountUser | null) => {
      const account = providedAccount === undefined ? accountRef.current : providedAccount;
      const token = ++generation.current;
      workspaceRef.current = nextWorkspace;
      setWorkspaceId(nextWorkspace);
      showConflict(null);
      setReady(false);
      setError(null);
      setSaveStatus('loading');
      const key = storageKey(nextWorkspace, account?.id);
      try {
        const cached = loadLocal(key);
        localVersion.current = cached?.version || 0;
        serverVersion.current = Number(localStorage.getItem(`${key}:serverVersion`) || 0);
        const initial =
          cached?.data ||
          (nextWorkspace === DEMO_WORKSPACE_ID && !account
            ? createDemoData()
            : createEmptyData(nextWorkspace));
        if (!cached) {
          const envelope = saveLocal(key, initial, 0);
          localVersion.current = envelope.version;
        }
        publish(initial);
        setReady(true);
        localStorage.setItem(
          account ? `${STORAGE_PREFIX}active:${account.id}` : LOCAL_POINTER,
          nextWorkspace,
        );
        if (!account) {
          setSaveStatus(navigator.onLine ? 'saved' : 'offline');
          return;
        }
        const pending = readPending(account.id, nextWorkspace);
        if (pending) {
          publish(pending.data);
          serverVersion.current = pending.expectedVersion;
          setSaveStatus(navigator.onLine ? 'pending' : 'offline');
          await syncRef.current();
          return;
        }
        if (!navigator.onLine) {
          setSaveStatus('offline');
          return;
        }
        const response = await fetchFoliaApi(
          `/api/sync?workspaceId=${encodeURIComponent(nextWorkspace)}`,
          {
            cache: 'no-store',
          },
        );
        const body = await response.json();
        if (token !== generation.current) return;
        if (!response.ok) throw new Error(body.error || 'Unable to load this workspace.');
        if (readPending(account.id, nextWorkspace)) {
          setSaveStatus('pending');
          await syncRef.current();
          return;
        }
        const remote = body.data
          ? workspaceDataSchema.parse(body.data)
          : createEmptyData(nextWorkspace);
        serverVersion.current = body.version;
        await withWorkspaceLock(key, () => {
          if (token !== generation.current || accountRef.current?.id !== account.id) return;
          const latest = loadLocal(key);
          if (readPending(account.id, nextWorkspace)) {
            if (latest) {
              localVersion.current = latest.version;
              publish(latest.data);
            }
            return;
          }
          const saved = saveLocal(key, remote, latest?.version || 0);
          localVersion.current = saved.version;
          localStorage.setItem(`${key}:serverVersion`, String(body.version));
          publish(remote);
        });
        if (token === generation.current)
          setSaveStatus(readPending(account.id, nextWorkspace) ? 'pending' : 'saved');
      } catch (cause) {
        if (token === generation.current) {
          setError(errorMessage(cause));
          setSaveStatus('failed');
          setReady(true);
        }
      }
    },
    [publish, showConflict],
  );
  useEffect(() => {
    switchRef.current = selectWorkspace;
  }, [selectWorkspace]);

  const refreshAccount = useCallback(async () => {
    const supabase = createBrowserSupabase();
    if (!supabase) {
      const active = localStorage.getItem(LOCAL_POINTER) || DEMO_WORKSPACE_ID;
      workspacesRef.current = [localWorkspace(active)];
      setWorkspaces(workspacesRef.current);
      await switchRef.current(active, null);
      return;
    }
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      if (!sessionData.session) {
        if (accountRef.current) clearAccountCache(accountRef.current.id);
        accountRef.current = null;
        setUser(null);
        const active = localStorage.getItem(LOCAL_POINTER) || DEMO_WORKSPACE_ID;
        workspacesRef.current = [localWorkspace(active)];
        setWorkspaces(workspacesRef.current);
        await switchRef.current(active, null);
        return;
      }
      const sessionAccount: AccountUser = {
        id: sessionData.session.user.id,
        email: sessionData.session.user.email,
      };
      if (!navigator.onLine) {
        const cachedWorkspaces = localStorage.getItem(
          `${STORAGE_PREFIX}account:${sessionAccount.id}:workspaces`,
        );
        if (!cachedWorkspaces)
          throw new Error(
            'Connect once to cache your permitted workspaces before using this account offline.',
          );
        const cached = JSON.parse(cachedWorkspaces) as WorkspaceSummary[];
        const previous = localStorage.getItem(`${STORAGE_PREFIX}active:${sessionAccount.id}`);
        const selected = cached.find((item) => item.id === previous) || cached[0];
        if (!selected) throw new Error('No cached workspace is available for this account.');
        accountRef.current = sessionAccount;
        setUser(sessionAccount);
        workspacesRef.current = cached;
        setWorkspaces(cached);
        await switchRef.current(selected.id, sessionAccount);
        return;
      }
      const response = await fetchFoliaApi('/api/workspaces', { cache: 'no-store' });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || 'Unable to load your account.');
      const account: AccountUser = body.user || {
        id: sessionData.session.user.id,
        email: sessionData.session.user.email,
      };
      accountRef.current = account;
      setUser(account);
      workspacesRef.current = body.workspaces;
      setWorkspaces(body.workspaces);
      localStorage.setItem(
        `${STORAGE_PREFIX}account:${account.id}:workspaces`,
        JSON.stringify(body.workspaces),
      );
      const previous = localStorage.getItem(`${STORAGE_PREFIX}active:${account.id}`);
      const selected =
        body.workspaces.find((item: WorkspaceSummary) => item.id === previous) ||
        body.workspaces[0];
      if (!selected)
        throw new Error(
          'Your account has no accessible workspace. Create a personal workspace to continue.',
        );
      await switchRef.current(selected.id, account);
    } catch (cause) {
      setError(errorMessage(cause));
      setSaveStatus('failed');
      setReady(true);
    }
  }, []);

  const update = useCallback(
    (mutator: (draft: WorkspaceData) => void | WorkspaceData, history = true): Promise<boolean> => {
      const requestedWorkspace = workspaceRef.current;
      const requestedGeneration = generation.current;
      const requestedAccount = accountRef.current?.id;
      const task = async () => {
        if (
          requestedWorkspace !== workspaceRef.current ||
          requestedGeneration !== generation.current ||
          requestedAccount !== accountRef.current?.id
        )
          return false;
        if (conflictRef.current) {
          setError(
            'Resolve the workspace conflict before editing. Your current data can still be exported.',
          );
          return false;
        }
        const account = accountRef.current;
        const key = storageKey(requestedWorkspace, account?.id);
        const viewer =
          account &&
          workspacesRef.current.find((workspace) => workspace.id === requestedWorkspace)?.role ===
            'viewer';
        let candidate: WorkspaceData | undefined;
        let candidateKind: 'document' | 'preferences' = 'document';
        try {
          let changed = false;
          await withWorkspaceLock(`${STORAGE_PREFIX}mutations:${account?.id || 'local'}`, () =>
            withWorkspaceLock(key, () => {
              if (
                requestedWorkspace !== workspaceRef.current ||
                requestedGeneration !== generation.current ||
                requestedAccount !== accountRef.current?.id
              )
                return;
              const before = dataRef.current;
              const draft = structuredClone(before);
              const result = mutator(draft) || draft;
              const preferencesOnly = isPreferencesOnlyChange(before, result);
              if (viewer && !preferencesOnly)
                throw new Error(
                  'This workspace is read-only for your role. You can still change your own preferences.',
                );
              if (JSON.stringify(result) === JSON.stringify(before)) return;
              const next = workspaceDataSchema.parse(
                history ? addMutationHistory(before, result, account?.id || LOCAL_USER_ID) : result,
              );
              candidate = next;
              next.revision = before.revision + 1;
              next.updatedAt = new Date().toISOString();
              if (
                next.timer.status === 'idle' &&
                before.timer.status === 'idle' &&
                JSON.stringify(next.preferences) !== JSON.stringify(before.preferences)
              )
                next.timer = emptyTimer(next.preferences, next.timer.phase, next.timer.cycleCount);
              const otherWorkspaces = workspacesRef.current
                .filter((workspace) => workspace.id !== requestedWorkspace)
                .map((workspace) => loadLocal(storageKey(workspace.id, account?.id))?.data)
                .filter((workspace): workspace is WorkspaceData => Boolean(workspace));
              const activeConflict = findActiveTimerConflict(next, otherWorkspaces);
              if (activeConflict)
                throw new Error(
                  'You already have an active timer in another workspace. Return to that workspace to resume or reset it.',
                );
              const allPlans = otherWorkspaces.flatMap((workspace) => workspace.plannedSessions);
              for (const plan of next.plannedSessions) {
                const overlap = findOverlap(plan, allPlans);
                if (overlap)
                  throw new Error(
                    `This session overlaps with “${overlap.title}” in another workspace.`,
                  );
              }
              const existing = account ? readPending(account.id, requestedWorkspace) : null;
              candidateKind =
                !preferencesOnly || (existing && (existing.kind || 'document') === 'document')
                  ? 'document'
                  : 'preferences';
              const saved = saveLocal(
                key,
                next,
                localVersion.current,
                localStorage,
                id(),
                account
                  ? {
                      expectedVersion:
                        existing?.expectedVersion ??
                        Number(
                          localStorage.getItem(`${key}:serverVersion`) || serverVersion.current,
                        ),
                      createdAt: new Date().toISOString(),
                      kind: candidateKind,
                    }
                  : undefined,
              );
              localVersion.current = saved.version;
              publish(next);
              changed = true;
              setError(null);
              setSaveStatus(
                account
                  ? navigator.onLine
                    ? 'pending'
                    : 'offline'
                  : navigator.onLine
                    ? 'saved'
                    : 'offline',
              );
            }),
          );
          if (!changed) return false;
          if (account) void syncRef.current();
          return true;
        } catch (cause) {
          if (cause instanceof ConflictError) {
            showConflict({
              data: cause.current.data,
              version: cause.current.version,
              scope: 'local',
              localData: candidate,
              storageVersion: cause.current.version,
              kind: candidateKind,
            });
            setSaveStatus('conflict');
          } else setSaveStatus('failed');
          setError(errorMessage(cause));
          return false;
        }
      };
      const next = mutationQueue.current.then(task, task);
      mutationQueue.current = next;
      return next;
    },
    [publish, showConflict],
  );
  useEffect(() => {
    updateRef.current = update;
  }, [update]);

  useEffect(() => {
    void refreshAccount();
    const supabase = createBrowserSupabase();
    const subscription = supabase?.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_IN' || event === 'SIGNED_OUT' || event === 'USER_UPDATED')
        setTimeout(() => void refreshAccount(), 0);
    });
    const onStorage = (event: StorageEvent) => {
      const key = storageKey(workspaceRef.current, accountRef.current?.id);
      if ((event.key !== key && event.key !== `${key}:serverVersion`) || !event.newValue) return;
      try {
        if (accountRef.current)
          serverVersion.current = Number(localStorage.getItem(`${key}:serverVersion`) || 0);
        if (conflictRef.current) return;
        const saved = loadLocal(key);
        if (saved && saved.version > localVersion.current) {
          localVersion.current = saved.version;
          publish(saved.data);
        }
        setSaveStatus(
          accountRef.current && readPending(accountRef.current.id, workspaceRef.current)
            ? navigator.onLine
              ? 'pending'
              : 'offline'
            : navigator.onLine
              ? 'saved'
              : 'offline',
        );
      } catch (cause) {
        setError(errorMessage(cause));
      }
    };
    const reconnect = () => {
      setSaveStatus(accountRef.current ? 'pending' : 'saved');
      void syncRef.current();
    };
    const offline = () => setSaveStatus('offline');
    window.addEventListener('storage', onStorage);
    window.addEventListener('online', reconnect);
    window.addEventListener('offline', offline);
    return () => {
      subscription?.data.subscription.unsubscribe();
      window.removeEventListener('storage', onStorage);
      window.removeEventListener('online', reconnect);
      window.removeEventListener('offline', offline);
    };
  }, [publish, refreshAccount]);

  useEffect(() => {
    if (!ready) return;
    const tick = () => {
      const instant = Date.now();
      setNow(instant);
      const active = dataRef.current.timer;
      if (
        active.status === 'running' &&
        remainingTime(active, instant) === 0 &&
        !conflictRef.current
      ) {
        void updateRef
          .current((draft) => completeTimer(draft, instant), false)
          .then((saved) => {
            if (!saved) return;
            const preferences = dataRef.current.preferences;
            if (preferences.sound) {
              try {
                const audio = new AudioContext();
                const oscillator = audio.createOscillator();
                const gain = audio.createGain();
                oscillator.connect(gain);
                gain.connect(audio.destination);
                oscillator.frequency.value = 660;
                gain.gain.setValueAtTime(0.12, audio.currentTime);
                gain.gain.exponentialRampToValueAtTime(0.001, audio.currentTime + 0.7);
                oscillator.start();
                oscillator.stop(audio.currentTime + 0.7);
                oscillator.onended = () => void audio.close();
              } catch {
                /* Browsers may require a fresh user gesture for audio. */
              }
            }
            if (
              preferences.notifications &&
              'Notification' in window &&
              Notification.permission === 'granted'
            ) {
              const notifyCompletion = async () => {
                try {
                  const registration =
                    'serviceWorker' in navigator
                      ? await navigator.serviceWorker.getRegistration()
                      : undefined;
                  const options = {
                    body: 'Prenez une pause. La prochaine séance commencera quand vous serez prêt.',
                    icon: '/icons/solace-192.png',
                  };
                  if (registration?.active)
                    await registration.showNotification('Solace — Séance terminée', options);
                  else new Notification('Solace — Séance terminée', options);
                } catch {
                  setError(
                    'Your session was saved. This browser could not show a background notification; keep Solace open for visual completion feedback.',
                  );
                }
              };
              void notifyCompletion();
            }
          });
      }
    };
    tick();
    const interval = window.setInterval(tick, 500);
    window.addEventListener('focus', tick);
    return () => {
      clearInterval(interval);
      window.removeEventListener('focus', tick);
    };
  }, [ready]);

  useEffect(() => {
    if (!ready || !user) return;
    const poll = async () => {
      if (!navigator.onLine || conflictRef.current || syncBusy.current) return;
      const account = accountRef.current;
      if (!account) return;
      const workspace = workspaceRef.current;
      const token = generation.current;
      try {
        if (readPending(account.id, workspace)) {
          await syncRef.current();
          return;
        }
        const response = await fetchFoliaApi(
          `/api/sync?workspaceId=${encodeURIComponent(workspace)}`,
          {
            cache: 'no-store',
          },
        );
        const body = await response.json();
        if (token !== generation.current || !response.ok || readPending(account.id, workspace))
          return;
        if (body.data && body.version > serverVersion.current) {
          const remote = workspaceDataSchema.parse(body.data);
          const key = storageKey(workspace, account.id);
          await withWorkspaceLock(key, () => {
            if (
              token !== generation.current ||
              accountRef.current?.id !== account.id ||
              readPending(account.id, workspace)
            )
              return;
            const current = loadLocal(key);
            const saved = saveLocal(key, remote, current?.version || 0);
            localVersion.current = saved.version;
            serverVersion.current = body.version;
            localStorage.setItem(`${key}:serverVersion`, String(body.version));
            publish(remote);
          });
          if (token === generation.current)
            setSaveStatus(readPending(account.id, workspace) ? 'pending' : 'saved');
        }
      } catch (cause) {
        setError(errorMessage(cause));
        setSaveStatus('failed');
      }
    };
    const interval = window.setInterval(() => void poll(), 15000);
    return () => clearInterval(interval);
  }, [publish, ready, user]);

  const resolveConflict = useCallback(
    async (choice: 'server' | 'local') => {
      const current = conflictRef.current;
      if (!current) {
        if (choice === 'server') await selectWorkspace(workspaceRef.current);
        return;
      }
      const account = accountRef.current;
      const key = storageKey(workspaceRef.current, account?.id);
      const token = generation.current;
      try {
        if (current.scope === 'local' && choice === 'server') {
          await withWorkspaceLock(key, () => {
            if (token !== generation.current) return;
            const saved = loadLocal(key);
            if (!saved)
              throw new Error(
                'The saved workspace is no longer available. Export your current work before continuing.',
              );
            localVersion.current = saved.version;
            if (account)
              serverVersion.current =
                readPending(account.id, workspaceRef.current)?.expectedVersion ??
                Number(localStorage.getItem(`${key}:serverVersion`) || 0);
            publish(saved.data);
          });
          if (token !== generation.current) return;
          showConflict(null);
          setError(null);
          setSaveStatus(
            account && readPending(account.id, workspaceRef.current) ? 'pending' : 'saved',
          );
          if (account) await syncRef.current();
          return;
        }
        let next = current.data;
        const preferencesOnly =
          account &&
          (current.kind || readPending(account.id, workspaceRef.current)?.kind) === 'preferences';
        if (choice === 'local') {
          const local = current.localData || dataRef.current;
          if (
            local.timer.status !== 'idle' &&
            current.data.timer.status !== 'idle' &&
            local.timer.sessionId !== current.data.timer.sessionId
          )
            throw new Error(
              'Two different timers are active. Export this device’s work, then choose the saved version to resolve the timer conflict.',
            );
          next = workspaceDataSchema.parse({
            ...local,
            subjects: unionRecords(current.data.subjects, local.subjects),
            projects: unionRecords(current.data.projects, local.projects),
            tasks: unionRecords(current.data.tasks, local.tasks),
            plannedSessions: unionRecords(current.data.plannedSessions, local.plannedSessions),
            focusSessions: unionRecords(local.focusSessions, current.data.focusSessions),
            journal: unionRecords(current.data.journal, local.journal),
            noteSheets: unionRecords(current.data.noteSheets, local.noteSheets),
            flashcardDecks: unionRecords(current.data.flashcardDecks, local.flashcardDecks),
            flashcards: unionRecords(current.data.flashcards, local.flashcards),
            events: unionRecords(current.data.events, local.events),
          });
          if (preferencesOnly)
            next = workspaceDataSchema.parse({
              ...current.data,
              preferences: local.preferences,
              timer:
                current.data.timer.status === 'idle'
                  ? emptyTimer(
                      local.preferences,
                      current.data.timer.phase,
                      current.data.timer.cycleCount,
                    )
                  : current.data.timer,
            });
        }
        await withWorkspaceLock(key, () => {
          if (token !== generation.current) return;
          const latest = loadLocal(key);
          if (
            latest &&
            latest.version !==
              (current.storageVersion ??
                (current.scope === 'local' ? current.version : latest.version))
          ) {
            showConflict({
              data: latest.data,
              version: latest.version,
              storageVersion: latest.version,
              scope: 'local',
              localData: next,
              kind: preferencesOnly ? 'preferences' : 'document',
            });
            throw new Error(
              'Another tab saved again while you were reviewing. Review the newest saved version before merging.',
            );
          }
          const baseVersion =
            current.scope === 'cloud'
              ? current.version
              : account
                ? (readPending(account.id, workspaceRef.current)?.expectedVersion ??
                  Number(localStorage.getItem(`${key}:serverVersion`) || serverVersion.current))
                : 0;
          const saved = saveLocal(
            key,
            next,
            loadLocal(key)?.version || 0,
            localStorage,
            id(),
            account && choice === 'local'
              ? {
                  expectedVersion: baseVersion,
                  createdAt: new Date().toISOString(),
                  kind: preferencesOnly ? 'preferences' : 'document',
                }
              : undefined,
          );
          localVersion.current = saved.version;
          if (account) {
            serverVersion.current = baseVersion;
            localStorage.setItem(`${key}:serverVersion`, String(baseVersion));
            localStorage.removeItem(pendingKey(account.id, workspaceRef.current));
          }
          publish(next);
        });
        if (token !== generation.current) return;
        showConflict(null);
        setError(null);
        setSaveStatus(choice === 'local' && account ? 'pending' : 'saved');
        if (choice === 'local') await syncRef.current();
      } catch (cause) {
        setError(errorMessage(cause));
      }
    },
    [publish, selectWorkspace, showConflict],
  );

  const exportData = useCallback(() => {
    const raw = serializeExport(conflictRef.current?.localData || dataRef.current);
    const url = URL.createObjectURL(new Blob([raw], { type: 'application/json' }));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `solace-${new Date().toISOString().slice(0, 10)}.json`;
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    return raw;
  }, []);
  const inspectImport = useCallback((raw: string) => {
    try {
      const result = previewImport(raw);
      setImportCandidate(result);
      setError(null);
      return result;
    } catch (cause) {
      setError(errorMessage(cause));
      throw cause;
    }
  }, []);
  const confirmImport = useCallback(
    async (candidate?: ImportPreview) => {
      const accepted = candidate || importCandidate;
      if (!accepted) return false;
      const workspace = workspacesRef.current.find((item) => item.id === workspaceRef.current);
      if (
        accountRef.current &&
        (accepted.flashcardDecks > 0 || accepted.flashcards > 0) &&
        !workspace?.entitlements?.features.flashcards
      ) {
        setError(
          'This backup contains Pro flashcards. Upgrade this workspace before importing it, or keep the backup in a local workspace. Your current data has not changed.',
        );
        return false;
      }
      const result = await update(
        (draft) => prepareImport(accepted, draft, accountRef.current?.id || LOCAL_USER_ID),
        false,
      );
      if (result) setImportCandidate(null);
      return result;
    },
    [importCandidate, update],
  );
  const startFresh = useCallback(async () => {
    if (accountRef.current) {
      setError(
        'Start fresh creates a separate local workspace. Export your account data or create a new workspace in Organization settings.',
      );
      return false;
    }
    const nextId = id();
    workspacesRef.current = [localWorkspace(nextId)];
    setWorkspaces(workspacesRef.current);
    await selectWorkspace(nextId, null);
    return true;
  }, [selectWorkspace]);
  const importLocalData = useCallback(async () => {
    const localId = localStorage.getItem(LOCAL_POINTER) || DEMO_WORKSPACE_ID;
    const cached = loadLocal(storageKey(localId));
    if (!cached) {
      setError('There is no local productivity data to import.');
      return null;
    }
    return inspectImport(serializeExport(cached.data));
  }, [inspectImport]);
  const requestNotifications = useCallback(async () => {
    if (!('Notification' in window)) {
      setError(
        'This browser does not support notifications. You can use the completion sound instead.',
      );
      return false;
    }
    let permission: NotificationPermission;
    try {
      permission = await Notification.requestPermission();
    } catch {
      setError(
        'This browser could not request notification permission. Your timer will still show completion in Solace.',
      );
      return false;
    }
    if (permission !== 'granted') {
      setError(
        'Notifications are unavailable or were not permitted. The timer still works normally.',
      );
      return false;
    }
    return update((draft) => {
      draft.preferences.notifications = true;
    });
  }, [update]);

  return {
    data,
    ready,
    error: error ? localizeError(error) : null,
    clearError: () => setError(null),
    saveStatus,
    update,
    timer: data.timer,
    remainingMs: remainingTime(data.timer, now),
    user,
    userId: user?.id || LOCAL_USER_ID,
    workspaces,
    workspaceId,
    currentWorkspace: workspaces.find((workspace) => workspace.id === workspaceId),
    entitlements: workspaces.find((workspace) => workspace.id === workspaceId)?.entitlements,
    isDemo: !user && workspaceId === DEMO_WORKSPACE_ID,
    isCloud: Boolean(user),
    selectWorkspace,
    refreshAccount,
    retrySync: sync,
    conflict,
    resolveConflict,
    startTimer: (context: StartTimerContext = {}) =>
      update((draft) => start(draft, context, accountRef.current?.id || LOCAL_USER_ID), false),
    pauseTimer: () => update((draft) => pause(draft), false),
    resumeTimer: () => update((draft) => resume(draft), false),
    resetTimer: () => update((draft) => reset(draft), false),
    skipTimer: () => update((draft) => skip(draft), false),
    selectPhase: (next: TimerPhase) => update((draft) => phase(draft, next), false),
    exportData,
    previewImport: inspectImport,
    importPreview: importCandidate,
    cancelImport: () => setImportCandidate(null),
    confirmImport,
    importLocalData,
    startFresh,
    requestNotifications,
  };
}
export type FoliaStore = ReturnType<typeof useFolia>;
