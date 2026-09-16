'use client';

import { useCallback, useMemo, useSyncExternalStore } from 'react';
import {
  activityViewStorageKey,
  parseActivityViewPreference,
  type ActivityViewPreference,
} from './activity-range';

const changedEvent = 'folia:activity-view-changed';
// Storage can be unavailable in private/embedded contexts. Keep navigation usable
// for this page lifetime, without making any workspace or cloud mutation.
const temporaryPreferences = new Map<string, string>();
const serverSnapshot = () => null;

export function useActivityView(userId: string, workspaceId: string) {
  const key = activityViewStorageKey(userId, workspaceId);
  const subscribe = useCallback(
    (onChange: () => void) => {
      const onStorage = (event: StorageEvent) => {
        if (event.key === key || event.key === null) {
          temporaryPreferences.delete(key);
          onChange();
        }
      };
      const onLocalChange = (event: Event) => {
        if ((event as CustomEvent<string>).detail === key) onChange();
      };
      window.addEventListener('storage', onStorage);
      window.addEventListener(changedEvent, onLocalChange);
      return () => {
        window.removeEventListener('storage', onStorage);
        window.removeEventListener(changedEvent, onLocalChange);
      };
    },
    [key],
  );
  const getSnapshot = useCallback(() => {
    if (temporaryPreferences.has(key)) return temporaryPreferences.get(key)!;
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  }, [key]);
  const raw = useSyncExternalStore(subscribe, getSnapshot, serverSnapshot);
  const selection = useMemo(() => parseActivityViewPreference(raw), [raw]);
  const setSelection = useCallback(
    (value: Omit<ActivityViewPreference, 'version'>) => {
      const raw = JSON.stringify({ version: 1, ...value });
      if (!parseActivityViewPreference(raw)) return;
      try {
        localStorage.setItem(key, raw);
        temporaryPreferences.delete(key);
      } catch {
        temporaryPreferences.set(key, raw);
      }
      window.dispatchEvent(new CustomEvent(changedEvent, { detail: key }));
    },
    [key],
  );
  return { view: selection?.view ?? 'year', month: selection?.month ?? null, setSelection };
}
