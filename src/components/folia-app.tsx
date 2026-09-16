'use client';
import { ui } from '@/lib/i18n/ui';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  LayoutDashboard,
  CalendarDays,
  BookOpen,
  CheckSquare,
  History,
  ChartNoAxesCombined,
  Settings,
  Users,
  CreditCard,
  Search,
  ChevronDown,
  PanelLeftClose,
  PanelLeftOpen,
  Sun,
  Moon,
  Leaf,
  ArrowUpRight,
  SlidersHorizontal,
  HelpCircle,
  MoreHorizontal,
  X,
  Check,
  CloudOff,
  RefreshCw,
  WifiOff,
  Sparkles,
  ArrowRight,
  NotebookPen,
  Layers,
} from 'lucide-react';
import { useFolia } from '@/lib/use-folia';
import { en, type View } from '@/lib/i18n/en';
import { formatDay } from '@/lib/display';
import { AppContext } from './app-context';
import { Brand, Button, IconButton, Dialog, Empty } from './ui';
import { SolaceMark } from './solace-mark';
import { TimerCard } from './timer-card';
import { Planner, PlanEditor } from './planner';
import { TasksPage, TasksWidget, TaskEditor } from './tasks';
import { SubjectsPage, SubjectsWidget, SubjectEditor } from './subjects';
import { SummaryCards, ActivityHeatmap, HistoryPage, AnalyticsPage } from './activity';
import { SettingsPage, AccountPanel } from './settings';
import { OrganizationPage, BillingPage } from './workspaces';
import { NotesPage, FlashcardsPage, NoteSheetEditor } from './learning';
import { applyThemeColors, applyBackground, themeColors } from '@/lib/appearance';
import { GettingStarted } from './getting-started';
import { WorkSummary } from './work-summary';
import { FocusAudioPlayer } from './focus-audio-player';

const navigation = [
  { id: 'overview', Icon: LayoutDashboard },
  { id: 'planner', Icon: CalendarDays },
  { id: 'subjects', Icon: BookOpen },
  { id: 'tasks', Icon: CheckSquare },
  { id: 'notes', Icon: NotebookPen },
  { id: 'flashcards', Icon: Layers },
  { id: 'history', Icon: History },
  { id: 'analytics', Icon: ChartNoAxesCombined },
] as const;
const secondary = [
  { id: 'organization', Icon: Users },
  { id: 'billing', Icon: CreditCard },
  { id: 'settings', Icon: Settings },
] as const;
const pageCopy: Record<View, { title: string; subtitle: string }> = {
  overview: en.overview,
  planner: en.planner,
  subjects: en.subjects,
  tasks: en.tasks,
  notes: {
    title: ui.foliaApp.aPlaceForYourThinking,
    subtitle: ui.foliaApp.captureIdeasKeepSubjectNotesAndReflectOnWhat,
  },
  flashcards: {
    title: ui.foliaApp.makeWhatYouLearnStick,
    subtitle: ui.foliaApp.buildADeckTurnACardAndComeBack,
  },
  history: en.history,
  analytics: en.analytics,
  settings: en.settings,
  organization: en.organization,
  billing: en.billing,
};
export function FoliaApp() {
  const store = useFolia();
  const [view, setView] = useState<View>('overview');
  const [collapsed, setCollapsed] = useState(false);
  const [more, setMore] = useState(false);
  const [help, setHelp] = useState(false);
  const [account, setAccount] = useState(false);
  const [timerSheet, setTimerSheet] = useState(false);
  const [reflectionSessionId, setReflectionSessionId] = useState<string | null>(null);
  const [noteEditor, setNoteEditor] = useState<{ sessionId: string; subjectId?: string } | null>(
    null,
  );
  const [toast, setToast] = useState('');
  const [search, setSearch] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [subjectEditor, setSubjectEditor] = useState<{ id?: string } | null>(null);
  const [taskEditor, setTaskEditor] = useState<{ id?: string } | null>(null);
  const [planEditor, setPlanEditor] = useState<{
    id?: string;
    date?: string;
    hour?: number;
  } | null>(null);
  const [invite, setInvite] = useState('');
  const [inviteError, setInviteError] = useState('');
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const completedRef = useRef<string | null>(null);
  const completionWorkspace = useRef<string | null>(null);
  const appliedAppearance = useRef('');
  const appliedBackground = useRef('');
  const reflectionSession = store.data.focusSessions.find(
    (session) => session.id === reflectionSessionId && session.userId === store.userId,
  );
  const canEdit = store.currentWorkspace?.role !== 'viewer';
  const showTimerDock = view !== 'overview' && store.timer.status !== 'idle';
  const notify = useCallback((message: string) => {
    setToast(message);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(''), 6000);
  }, []);
  const navigate = useCallback((next: View) => {
    setView(next);
    setMore(false);
    setSearchOpen(false);
    const url = new URL(window.location.href);
    url.searchParams.set('view', next);
    window.history.replaceState({}, '', url);
    window.scrollTo({ top: 0, behavior: 'instant' });
  }, []);
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const next = params.get('view');
    const timer = setTimeout(() => {
      if (next && next in en.navigation) setView(next as View);
      if (params.get('invite')) setInvite(params.get('invite')!);
      if (params.has('auth-error')) notify(ui.foliaApp.theEmailLinkCouldNotBeVerifiedRequestA);
      if (params.has('reset-password')) {
        setAccount(true);
        notify(ui.foliaApp.chooseANewPasswordUsingYourRecoverySession);
      }
    }, 0);
    return () => clearTimeout(timer);
  }, [notify]);
  useEffect(() => {
    if (!store.ready) return;
    const p = store.data.preferences;
    const root = document.documentElement;
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const apply = () => {
      root.dataset.theme =
        p.appearance === 'system' ? (media.matches ? 'dark' : 'light') : p.appearance;
      root.dataset.accent = p.accent;
      root.dataset.density = p.density;
      root.dataset.font = p.fontSize;
      root.dataset.radius = p.radius;
      root.dataset.motion = p.motion;
      const appearanceKey = JSON.stringify([
        store.workspaceId,
        p.appearance,
        root.dataset.theme,
        p.accent,
        p.accentColor,
        p.customTheme,
      ]);
      const backgroundKey = JSON.stringify([store.workspaceId, p.background]);
      // Unrelated preference saves must not erase an unsaved appearance preview.
      if (appliedAppearance.current !== appearanceKey) {
        applyThemeColors(p);
        appliedAppearance.current = appearanceKey;
      }
      if (appliedBackground.current !== backgroundKey) {
        applyBackground(p.background);
        appliedBackground.current = backgroundKey;
      }
    };
    apply();
    media.addEventListener('change', apply);
    try {
      localStorage.setItem(
        'folia.appearance',
        JSON.stringify({
          mode: p.appearance,
          accent: p.accent,
          accentColor: p.accentColor,
          resolvedAccent: root.style.getPropertyValue('--accent'),
          resolvedAccentHover: root.style.getPropertyValue('--accent-hover'),
          resolvedTheme: root.dataset.theme,
          resolvedColors: themeColors(p, root.dataset.theme === 'dark'),
          customTheme: p.customTheme,
          density: p.density,
          fontSize: p.fontSize,
          radius: p.radius,
          motion: p.motion,
        }),
      );
    } catch {}
    return () => media.removeEventListener('change', apply);
  }, [store.ready, store.data.preferences, store.workspaceId]);
  useEffect(() => {
    if (process.env.NODE_ENV === 'production' && 'serviceWorker' in navigator) {
      void navigator.serviceWorker
        .register('/sw.js')
        .catch(() => notify(ui.foliaApp.offlineInstallationIsUnavailableInThisBrowserYourWork));
    }
    return () => {
      if (toastTimer.current) clearTimeout(toastTimer.current);
    };
  }, [notify]);
  useEffect(() => {
    if (!store.ready) return;
    const latest = store.data.focusSessions
      .filter((s) => s.phase === 'focus' && s.status === 'completed' && s.userId === store.userId)
      .at(-1);
    if (completedRef.current === null || completionWorkspace.current !== store.workspaceId) {
      completionWorkspace.current = store.workspaceId;
      completedRef.current = latest?.id || '';
      return;
    }
    if (!latest) return;
    if (latest.id !== completedRef.current) {
      const timer = setTimeout(() => {
        notify(ui.foliaApp.focusCompleteTakeABreathThenCaptureAReflection);
        setReflectionSessionId(latest.id);
      }, 0);
      completedRef.current = latest.id;
      return () => clearTimeout(timer);
    }
    completedRef.current = latest.id;
  }, [store.ready, store.data.focusSessions, store.userId, store.workspaceId, notify]);
  const openTask = (id?: string) => {
    setSubjectEditor(null);
    setTaskEditor({ id });
  };
  const openSubject = (id?: string) => {
    setTaskEditor(null);
    setSubjectEditor({ id });
  };
  const openPlan = (id?: string, date?: string, hour?: number) => {
    setSubjectEditor(null);
    setPlanEditor({ id, date, hour });
  };
  const context = {
    store,
    notify,
    navigate,
    canEdit,
    openTask,
    openSubject,
    openPlan,
    openAccount: () => setAccount(true),
  };
  const saveLabel =
    store.saveStatus === 'saved'
      ? store.isCloud
        ? 'Toutes les modifications sont enregistrées'
        : en.common.local
      : (
          {
            loading: 'Chargement de l’espace',
            saving: 'Enregistrement…',
            pending: 'Modifications en attente',
            offline: store.isCloud
              ? 'Hors ligne · modifications conservées sur cet appareil'
              : 'Hors ligne · enregistré sur cet appareil',
            failed: 'Échec de l’enregistrement',
            conflict: 'Des modifications nécessitent votre attention',
          } as Record<string, string>
        )[store.saveStatus];
  const matches = search.trim()
    ? [
        ...store.data.tasks
          .filter((t) => t.title.toLowerCase().includes(search.toLowerCase()))
          .slice(0, 4)
          .map((t) => ({ id: t.id, title: t.title, type: 'task' })),
        ...store.data.subjects
          .filter((s) => s.name.toLowerCase().includes(search.toLowerCase()))
          .slice(0, 3)
          .map((s) => ({ id: s.id, title: s.name, type: 'subject' })),
      ]
    : [];
  if (!store.ready)
    return (
      <div className="app-loading">
        <Brand />
        <div className="loading-leaf">
          <SolaceMark size={34} />
        </div>
        <p>{en.common.loading}</p>
      </div>
    );
  return (
    <AppContext.Provider value={context}>
      <a className="skip-link" href="#main-content">
        {ui.foliaApp.skipToContent}
      </a>
      <div
        className={`app-shell ${collapsed ? 'sidebar-collapsed' : ''} ${showTimerDock ? 'has-active-dock' : ''}`}
      >
        <aside className="sidebar">
          <div className="sidebar-brand">
            <Brand />
            <IconButton
              label={collapsed ? ui.foliaApp.expandSidebar : ui.foliaApp.collapseSidebar}
              onClick={() => setCollapsed(!collapsed)}
            >
              {collapsed ? <PanelLeftOpen size={17} /> : <PanelLeftClose size={17} />}
            </IconButton>
          </div>
          <div className="workspace-switcher">
            <div className="workspace-avatar">
              {store.currentWorkspace?.icon ? (
                <span aria-hidden="true">{store.currentWorkspace.icon}</span>
              ) : (
                <Leaf size={17} />
              )}
            </div>
            <div>
              <span>{ui.foliaApp.yourWorkspace}</span>
              <select
                aria-label={ui.foliaApp.switchWorkspace}
                value={store.workspaceId}
                onChange={(e) => store.selectWorkspace(e.target.value)}
              >
                {store.workspaces.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.name}
                  </option>
                ))}
              </select>
            </div>
            <ChevronDown size={14} />
          </div>
          <nav className="main-navigation" aria-label={ui.foliaApp.mainNavigation}>
            {navigation.map(({ id, Icon }) => (
              <button
                title={en.navigation[id]}
                key={id}
                className={view === id ? 'active' : ''}
                aria-current={view === id ? 'page' : undefined}
                onClick={() => navigate(id)}
              >
                <Icon size={19} strokeWidth={1.7} />
                <span>{en.navigation[id]}</span>
                {id === 'tasks' && (
                  <small>{store.data.tasks.filter((t) => t.status !== 'done').length}</small>
                )}
                {view === id && <span className="nav-indicator" />}
              </button>
            ))}
          </nav>
          <div className="sidebar-divider" />
          <nav className="secondary-navigation" aria-label={ui.foliaApp.workspaceSettings}>
            {secondary.map(({ id, Icon }) => (
              <button
                title={en.navigation[id]}
                key={id}
                className={view === id ? 'active' : ''}
                onClick={() => navigate(id)}
              >
                <Icon size={19} strokeWidth={1.7} />
                <span>{en.navigation[id]}</span>
              </button>
            ))}
          </nav>
          <div className="sidebar-bottom">
            <div className="growth-card">
              <span className="growth-leaf">
                <Leaf size={26} strokeWidth={1.3} />
              </span>
              <h3>
                {ui.foliaApp.aLittleMoreRoom}
                <br />
                {ui.foliaApp.toGrow}
              </h3>
              <p>
                {ui.foliaApp.makeYourFocusSpace}
                <br />
                {ui.foliaApp.uniquelyYours}
              </p>
              <button onClick={() => navigate('billing')}>
                {ui.foliaApp.explorePro}
                <ArrowUpRight size={15} />
              </button>
            </div>
            <button className="help-button" onClick={() => setHelp(true)}>
              <HelpCircle size={18} />
              <span>{ui.foliaApp.helpGettingStarted}</span>
            </button>
            <button className="profile-button" onClick={() => setAccount(true)}>
              <span className="avatar">
                {store.user?.email?.charAt(0).toUpperCase() || ui.foliaApp.f}
              </span>
              <span>
                <strong>{store.user?.email?.split('@')[0] || ui.foliaApp.yourPersonalSpace}</strong>
                <small>
                  {store.isCloud ? ui.foliaApp.accountSettings : ui.foliaApp.localNoAccountNeeded}
                </small>
              </span>
              <ChevronDown size={14} />
            </button>
          </div>
        </aside>
        <div className="main-shell">
          <header className="topbar">
            <div className="breadcrumb">
              <span>{store.currentWorkspace?.name || en.common.demo}</span>
              <span className="slash">{ui.foliaApp.copy}</span>
              <strong>{en.navigation[view]}</strong>
            </div>
            <div className="topbar-actions">
              <div className="global-search">
                <Search size={16} />
                <input
                  aria-label={ui.foliaApp.searchWorkspace}
                  placeholder={ui.foliaApp.searchYourSpace}
                  value={search}
                  onFocus={() => setSearchOpen(true)}
                  onChange={(e) => {
                    setSearch(e.target.value);
                    setSearchOpen(true);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Escape') setSearchOpen(false);
                    if (e.key === 'Enter' && matches[0]) {
                      if (matches[0].type === 'task') openTask(matches[0].id);
                      else openSubject(matches[0].id);
                      setSearchOpen(false);
                    }
                  }}
                />
                <span className="search-hint">{ui.foliaApp.copy2}</span>
                {searchOpen && search.trim() && (
                  <div className="search-results">
                    {matches.length ? (
                      matches.map((m) => (
                        <button
                          key={m.id}
                          onClick={() => {
                            if (m.type === 'task') openTask(m.id);
                            else openSubject(m.id);
                            setSearchOpen(false);
                            setSearch('');
                          }}
                        >
                          {m.type === 'task' ? <CheckSquare size={16} /> : <BookOpen size={16} />}
                          <span>
                            {m.title}
                            <small>{m.type === 'task' ? 'Tâche' : 'Matière'}</small>
                          </span>
                          <ArrowRight size={14} />
                        </button>
                      ))
                    ) : (
                      <p>{en.common.noResults}</p>
                    )}
                  </div>
                )}
              </div>
              <span className="topbar-separator" />
              <IconButton
                label={ui.foliaApp.toggleLightAndDarkAppearance}
                onClick={() =>
                  store.update((d) => {
                    d.preferences.appearance =
                      document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
                  })
                }
              >
                {store.data.preferences.appearance === 'dark' ? (
                  <Sun size={19} />
                ) : (
                  <Moon size={19} />
                )}
              </IconButton>
              <button
                className="topbar-avatar avatar"
                aria-label={ui.foliaApp.openAccount}
                onClick={() => setAccount(true)}
              >
                {store.user?.email?.charAt(0).toUpperCase() || ui.foliaApp.f}
              </button>
            </div>
          </header>
          <div className="mobile-header">
            <Brand />
            <div className="row">
              <IconButton
                label={ui.foliaApp.appearanceSettings}
                onClick={() => navigate('settings')}
              >
                <Sun size={19} />
              </IconButton>
              <button
                className="avatar"
                aria-label={ui.foliaApp.openAccount}
                onClick={() => setAccount(true)}
              >
                {store.user?.email?.charAt(0).toUpperCase() || ui.foliaApp.f}
              </button>
            </div>
          </div>
          <main id="main-content" tabIndex={-1} className={`main-content view-${view}`}>
            <div className="page-heading">
              <div>
                {store.isCloud && (
                  <div className="scope-label">
                    <span className="badge">
                      {store.currentWorkspace?.kind === 'organization'
                        ? en.common.shared
                        : en.common.private}
                    </span>
                    <span>{store.currentWorkspace?.name}</span>
                  </div>
                )}
                <div className="eyebrow">
                  {view === 'overview' ? (
                    <>
                      <span className="tiny-leaf">
                        <Leaf size={13} />
                      </span>
                      {formatDay(new Date(), store.data.preferences, {
                        weekday: 'long',
                        month: 'long',
                        day: 'numeric',
                      })}
                    </>
                  ) : (
                    <>{en.overview.eyebrow}</>
                  )}
                </div>
                <h1>{pageCopy[view].title}</h1>
                <p>{pageCopy[view].subtitle}</p>
              </div>
              {view === 'overview' && (
                <Button variant="secondary" onClick={() => navigate('settings')}>
                  <SlidersHorizontal size={15} />
                  {ui.foliaApp.customize}
                </Button>
              )}
              {view === 'planner' && (
                <Button disabled={!canEdit} onClick={() => openPlan()}>
                  <CalendarDays size={16} />
                  {en.planner.add}
                </Button>
              )}
            </div>
            {store.error && (
              <div className="error-banner" role="alert">
                <CloudOff size={19} />
                <div>
                  <strong>
                    {store.saveStatus === 'conflict'
                      ? ui.foliaApp.letSReconcileYourChanges
                      : ui.foliaApp.yourChangesNeedAttention}
                  </strong>
                  <p>{store.error}</p>
                  {store.saveStatus === 'conflict' ? (
                    <div className="row wrap">
                      <Button variant="secondary" onClick={() => store.exportData()}>
                        {ui.foliaApp.exportThisDeviceSWork}
                      </Button>
                      <Button variant="secondary" onClick={() => store.resolveConflict('server')}>
                        {ui.foliaApp.useSavedVersion}
                      </Button>
                      <Button variant="secondary" onClick={() => store.resolveConflict('local')}>
                        {ui.foliaApp.mergeUsingMyEdits}
                      </Button>
                      <p className="helper">
                        {ui.foliaApp.mergingKeepsThisDeviceSVersionOfMatchingEditable}
                      </p>
                    </div>
                  ) : (
                    <div className="row">
                      <Button variant="ghost" onClick={() => store.retrySync()}>
                        <RefreshCw size={14} />
                        {ui.foliaApp.retrySync}
                      </Button>
                      <Button variant="ghost" onClick={store.clearError}>
                        {ui.foliaApp.dismiss}
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            )}
            {!canEdit && (
              <p className="notice">{ui.foliaApp.youHaveReadOnlyAccessToThisWorkspace}</p>
            )}
            {view === 'overview' && (
              <>
                <GettingStarted key={`${store.userId}:${store.workspaceId}`} />
                {reflectionSession && canEdit && (
                  <div className="completion-note-prompt">
                    <div>
                      <strong>{ui.foliaApp.focusCompleteKeepWhatYouLearned}</strong>
                      <p>
                        {reflectionSession.context.subjectName ||
                          reflectionSession.context.taskTitle ||
                          ui.foliaApp.yourFocusSession}{' '}
                        {ui.foliaApp.addANoteWhileItIsFresh}
                      </p>
                    </div>
                    <Button
                      variant="secondary"
                      onClick={() => {
                        setNoteEditor({
                          sessionId: reflectionSession.id,
                          subjectId: reflectionSession.context.subjectId,
                        });
                        setReflectionSessionId(null);
                      }}
                    >
                      <NotebookPen size={16} />
                      {ui.foliaApp.addSessionNote}
                    </Button>
                    <IconButton
                      label={ui.foliaApp.dismissSessionNotePrompt}
                      onClick={() => setReflectionSessionId(null)}
                    >
                      <X size={16} />
                    </IconButton>
                  </div>
                )}
                <SummaryCards />
                {store.isDemo && (
                  <div className="demo-notice">
                    <span>
                      <Sparkles size={14} />
                      {en.overview.demoNotice}
                    </span>
                    <button
                      onClick={async () => {
                        if (await store.startFresh()) notify(ui.foliaApp.yourFreshWorkspaceIsReady);
                      }}
                    >
                      {en.common.startFresh}
                      <ArrowRight size={13} />
                    </button>
                  </div>
                )}
                <div
                  className={`dashboard-widgets ${store.data.preferences.widgets.includes('planner') && store.data.preferences.widgets.includes('timer') ? (store.data.preferences.widgets.indexOf('planner') < store.data.preferences.widgets.indexOf('timer') ? 'planner-first' : '') : 'single-column'}`}
                >
                  {store.data.preferences.widgets.map((widget) => (
                    <div key={widget} className={`dashboard-widget widget-${widget}`}>
                      {widget === 'timer' ? (
                        <TimerCard />
                      ) : widget === 'planner' ? (
                        <Planner />
                      ) : widget === 'tasks' ? (
                        <TasksWidget />
                      ) : widget === 'activity' ? (
                        <ActivityHeatmap />
                      ) : (
                        <SubjectsWidget />
                      )}
                    </div>
                  ))}
                </div>
                {!store.data.preferences.widgets.length && (
                  <Empty
                    title={ui.foliaApp.aLittleBreathingRoom}
                    detail={ui.foliaApp.chooseTheWidgetsYouDLikeToSeeIn}
                    action={ui.foliaApp.customizeDashboard}
                    onAction={() => navigate('settings')}
                  />
                )}
                <WorkSummary />
              </>
            )}
            {view === 'planner' && <Planner full />}
            {view === 'subjects' && <SubjectsPage />}
            {view === 'tasks' && <TasksPage />}
            {view === 'notes' && <NotesPage />}
            {view === 'flashcards' && <FlashcardsPage />}
            {view === 'history' && <HistoryPage />}
            {view === 'analytics' && <AnalyticsPage />}
            {view === 'settings' && <SettingsPage key={`${store.userId}:${store.workspaceId}`} />}
            {view === 'organization' && <OrganizationPage />}
            {view === 'billing' && <BillingPage />}
            <FocusAudioPlayer />
            <footer className="page-footer">
              <span className={`save-status ${store.saveStatus}`} title={saveLabel}>
                {store.saveStatus === 'offline' ? (
                  <WifiOff size={13} />
                ) : store.saveStatus === 'saved' ? (
                  <Check size={13} />
                ) : (
                  <span className="live-dot" />
                )}
                {saveLabel}
              </span>
              <span>
                {en.tagline}
                <Leaf size={12} />
              </span>
            </footer>
          </main>
        </div>
        <nav className="bottom-navigation" aria-label={ui.foliaApp.mobileNavigation}>
          {navigation
            .filter((n) => ['overview', 'planner', 'tasks'].includes(n.id))
            .map(({ id, Icon }) => (
              <button
                key={id}
                className={view === id ? 'active' : ''}
                aria-current={view === id ? 'page' : undefined}
                onClick={() => navigate(id)}
              >
                <Icon size={21} />
                <span>{en.navigation[id]}</span>
              </button>
            ))}
          <button
            className={!['overview', 'planner', 'tasks'].includes(view) ? 'active' : ''}
            onClick={() => setMore(true)}
          >
            <MoreHorizontal size={23} />
            <span>{en.common.more}</span>
          </button>
        </nav>
      </div>
      {taskEditor && (
        <TaskEditor
          key={taskEditor.id || 'new-task'}
          taskId={taskEditor.id}
          onClose={() => setTaskEditor(null)}
        />
      )}
      {subjectEditor && (
        <SubjectEditor
          key={subjectEditor.id || 'new-subject'}
          subjectId={subjectEditor.id}
          onClose={() => setSubjectEditor(null)}
        />
      )}
      {planEditor && (
        <PlanEditor
          key={planEditor.id || `${planEditor.date}-${planEditor.hour}`}
          planId={planEditor.id}
          initialDate={planEditor.date}
          initialHour={planEditor.hour}
          onClose={() => setPlanEditor(null)}
        />
      )}
      {account && (
        <Dialog wide title={ui.foliaApp.yourFoliaAccount} onClose={() => setAccount(false)}>
          <AccountPanel />
        </Dialog>
      )}
      {more && (
        <Dialog title={ui.foliaApp.yourSpace} onClose={() => setMore(false)}>
          <nav className="more-navigation">
            {[...navigation, ...secondary].map(({ id, Icon }) => (
              <button key={id} onClick={() => navigate(id)}>
                <Icon size={20} />
                {en.navigation[id]}
                <ArrowRight size={16} />
              </button>
            ))}
            <button
              onClick={() => {
                setMore(false);
                setHelp(true);
              }}
            >
              <HelpCircle size={20} />
              {ui.foliaApp.helpGettingStarted}
              <ArrowRight size={16} />
            </button>
          </nav>
          <label className="field">
            <span>{ui.foliaApp.workspace}</span>
            <select
              value={store.workspaceId}
              onChange={(e) => store.selectWorkspace(e.target.value)}
            >
              {store.workspaces.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))}
            </select>
          </label>
        </Dialog>
      )}
      {help && (
        <Dialog title={en.help.title} onClose={() => setHelp(false)}>
          <div className="help-content">
            <SolaceMark size={40} />
            <p>{en.help.body}</p>
            <h3>{ui.foliaApp.whenYouReOffline}</h3>
            <p>{en.help.offline}</p>
            <h3>{ui.foliaApp.backgroundTimersAlarms}</h3>
            <p>{en.help.alarms}</p>
            <h3>{ui.foliaApp.installYourSpace}</h3>
            <p>{en.help.install}</p>
          </div>
        </Dialog>
      )}
      {invite && (
        <Dialog title={ui.foliaApp.youReInvitedToAWorkspace} onClose={() => setInvite('')}>
          <p>{ui.foliaApp.joinASharedFoliaWorkspaceWithThePermissionsAttached}</p>
          {!store.user ? (
            <>
              <p>{ui.foliaApp.signInWithTheEmailAddressThatReceivedThe}</p>
              <AccountPanel />
            </>
          ) : (
            <Button
              onClick={async () => {
                try {
                  const response = await fetch('/api/workspaces', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ action: 'acceptInvite', token: invite }),
                  });
                  const body = await response.json();
                  if (!response.ok) throw new Error(body.error);
                  await store.refreshAccount();
                  setInvite('');
                  notify(ui.foliaApp.youVeJoinedTheWorkspace);
                } catch (e) {
                  setInviteError(e instanceof Error ? e.message : String(e));
                }
              }}
            >
              {en.organization.accept}
            </Button>
          )}
          {inviteError && (
            <p className="error" role="alert">
              {inviteError}
            </p>
          )}
        </Dialog>
      )}
      {showTimerDock && (
        <button
          className="active-timer-dock"
          aria-label={en.timer.distractionFree}
          onClick={() => setTimerSheet(true)}
        >
          <SolaceMark size={21} />
          <span>
            <strong>
              {store.timer.context?.taskTitle || store.timer.context?.subjectName || en.timer.title}
            </strong>
            <small>{store.timer.status === 'paused' ? en.timer.paused : en.timer.running}</small>
          </span>
          <b>
            {String(Math.floor(Math.ceil(store.remainingMs / 1000) / 60)).padStart(2, '0')}
            {ui.foliaApp.copy3}
            {String(Math.ceil(store.remainingMs / 1000) % 60).padStart(2, '0')}
          </b>
          <ArrowUpRight size={16} />
        </button>
      )}
      {timerSheet && (
        <Dialog title={en.timer.title} onClose={() => setTimerSheet(false)}>
          <TimerCard />
        </Dialog>
      )}
      {noteEditor && <NoteSheetEditor {...noteEditor} onClose={() => setNoteEditor(null)} />}
      {toast && (
        <div className="toast" role="status">
          <span className="toast-icon">
            <Check size={16} />
          </span>
          <p>{toast}</p>
          <IconButton label={ui.foliaApp.dismissNotification} onClick={() => setToast('')}>
            <X size={16} />
          </IconButton>
        </div>
      )}
    </AppContext.Provider>
  );
}
