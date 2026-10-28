'use client';
import { ui } from '@/lib/i18n/ui';
import { localizeError } from '@/lib/i18n/errors';
import { themeLabels, widgetLabels } from '@/lib/i18n/dynamic';

import { useState, useRef, useEffect, type FormEvent } from 'react';
import {
  Sun,
  Moon,
  Monitor,
  Check,
  ArrowUp,
  ArrowDown,
  GripVertical,
  Download,
  Upload,
  RotateCcw,
  Plus,
  Bell,
  Palette,
  Timer,
  CalendarDays,
  LayoutDashboard,
  Database,
  UserRound,
  Trash2,
} from 'lucide-react';
import { useApp } from './app-context';
import { Button, Field, Panel, Dialog, IconButton } from './ui';
import { en } from '@/lib/i18n/en';
import { id, widgetNames, type Preferences } from '@/lib/model';
import { contrastRatio } from '@/lib/calendar';
import { createBrowserSupabase } from '@/lib/supabase/browser';
import { clearAccountCache, STORAGE_PREFIX } from '@/lib/persistence';
import { ClassicColors, BackgroundPanel } from './appearance';
import { applyThemeColors } from '@/lib/appearance';
import { appFetch } from '@/lib/app-fetch';
import { authRedirectUrl } from '@/lib/mobile-platform';
import { workspaceStorage } from '@/lib/workspace-storage';
import { Capacitor } from '@capacitor/core';
import { isNativeApp } from '@/lib/mobile-platform';
import { openNativeExactAlarmSettings } from '@/lib/native-notifications';
import { nativePurchases } from '@/lib/native-purchases';
import { AccountLegalConsent } from './account-legal-consent';
import {
  accountSignupMetadata,
  isOnlineAccountAgeGroup,
  type AccountAgeGroup,
} from '@/lib/account-eligibility';

const settingsTabs = [
  { id: 'appearance', label: en.settings.appearance, Icon: Palette },
  { id: 'timer', label: en.settings.timer, Icon: Timer },
  { id: 'calendar', label: en.settings.calendar, Icon: CalendarDays },
  { id: 'dashboard', label: en.settings.dashboard, Icon: LayoutDashboard },
  { id: 'data', label: en.settings.data, Icon: Database },
  { id: 'account', label: en.settings.account, Icon: UserRound },
];
const baseCustom = {
  accent: '#2f6547',
  background: '#f7f8f4',
  surface: '#ffffff',
  border: '#e3e7df',
  text: '#283b30',
  heatmap: ['#ebedf0', '#9be9a8', '#40c463', '#30a14e', '#216e39'],
};
export function SettingsPage() {
  const { store, notify, canEdit } = useApp();
  const [tab, setTab] = useState('appearance');
  const p = store.data.preferences;
  const [custom, setCustom] = useState(p.customTheme || baseCustom);
  const [customSource, setCustomSource] = useState(p.customTheme);
  if (customSource !== p.customTheme) {
    setCustomSource(p.customTheme);
    if (JSON.stringify(custom) === JSON.stringify(customSource || baseCustom))
      setCustom(p.customTheme || baseCustom);
  }
  const [preview, setPreview] = useState(false);
  const appearanceKey = JSON.stringify([p.appearance, p.accent, p.accentColor, p.customTheme]);
  const [previewSource, setPreviewSource] = useState(appearanceKey);
  if (previewSource !== appearanceKey) {
    setPreviewSource(appearanceKey);
    setPreview(false);
  }
  const [layoutName, setLayoutName] = useState('');
  const [dragging, setDragging] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const [fresh, setFresh] = useState(false);
  const paid = !store.isCloud || ['pro', 'team'].includes(store.currentWorkspace?.plan || 'free');
  const savedTheme = useRef(p);
  useEffect(() => {
    savedTheme.current = p;
  }, [p]);
  useEffect(() => () => applyThemeColors(savedTheme.current), []);
  function applyPreview(value: Preferences['customTheme']) {
    applyThemeColors(p, value);
  }
  async function set<K extends keyof Preferences>(key: K, value: Preferences[K]) {
    return store.update((d) => {
      d.preferences[key] = value;
    });
  }
  function previewTheme(value: typeof custom | null) {
    applyPreview(value);
    setPreview(!!value);
  }
  function switchTab(value: string) {
    if (preview) {
      applyPreview(p.customTheme);
      setPreview(false);
    }
    setTab(value);
  }
  async function saveTimer(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const f = new FormData(event.currentTarget);
    const ok = await store.update((d) => {
      for (const key of [
        'focusMinutes',
        'shortBreakMinutes',
        'longBreakMinutes',
        'cycleLength',
        'dailyGoal',
      ] as const)
        d.preferences[key] = Number(f.get(key));
      d.preferences.sound = f.get('sound') === 'on';
    });
    if (ok) notify(ui.settings.timerPreferencesSavedActiveSessionsKeepTheirOriginalDuration);
  }
  async function saveCalendar(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const f = new FormData(event.currentTarget);
    const ok = await store.update((d) => {
      d.preferences.timeZone = String(f.get('timeZone'));
      d.preferences.weekStartsOn = Number(f.get('weekStartsOn')) as 0 | 1;
      d.preferences.timeFormat = String(f.get('timeFormat')) as Preferences['timeFormat'];
      d.preferences.dateFormat = String(f.get('dateFormat')) as Preferences['dateFormat'];
      d.preferences.visibleStartHour = Number(f.get('visibleStartHour'));
      d.preferences.visibleEndHour = Number(f.get('visibleEndHour'));
    });
    if (ok) notify(ui.settings.calendarPreferencesSaved);
  }
  function moveWidget(name: (typeof widgetNames)[number], position: number) {
    void store.update((d) => {
      const widgets = d.preferences.widgets;
      const index = widgets.indexOf(name);
      if (index < 0) return;
      widgets.splice(index, 1);
      widgets.splice(Math.max(0, Math.min(position, widgets.length)), 0, name);
    });
  }
  return (
    <>
      <div className="settings-tabs">
        {settingsTabs.map(({ id, label, Icon }) => (
          <button className={tab === id ? 'active' : ''} key={id} onClick={() => switchTab(id)}>
            <Icon size={16} />
            {label}
          </button>
        ))}
      </div>
      <div className="settings-content">
        {tab === 'appearance' && (
          <>
            <Panel title={en.settings.appearance} subtitle={ui.settings.aCalmSpaceInYourOwnColors}>
              <h3>{en.settings.themeMode}</h3>
              <div className="appearance-options">
                {[
                  { mode: 'light', Icon: Sun },
                  { mode: 'dark', Icon: Moon },
                  { mode: 'system', Icon: Monitor },
                ].map(({ mode, Icon }) => (
                  <button
                    key={mode}
                    className={`appearance-option ${p.appearance === mode ? 'selected' : ''}`}
                    onClick={() => set('appearance', mode as Preferences['appearance'])}
                  >
                    <div className={`appearance-demo ${mode}`}>
                      <div />
                      <span />
                      <span />
                    </div>
                    <span>
                      <Icon size={16} />
                      {en.settings[mode as 'light' | 'dark' | 'system']}
                      {p.appearance === mode && <Check size={15} />}
                    </span>
                  </button>
                ))}
              </div>
              <ClassicColors key={store.workspaceId} />
              <div className="form-grid customization-options">
                <Field label={ui.settings.density}>
                  <select
                    value={p.density}
                    onChange={(e) => set('density', e.target.value as Preferences['density'])}
                  >
                    <option value="comfortable">{ui.settings.comfortable}</option>
                    <option value="compact">{ui.settings.compact}</option>
                  </select>
                </Field>
                <Field label={ui.settings.fontSize}>
                  <select
                    value={p.fontSize}
                    onChange={(e) => set('fontSize', e.target.value as Preferences['fontSize'])}
                  >
                    <option value="small">{ui.settings.small}</option>
                    <option value="medium">{ui.settings.default}</option>
                    <option value="large">{ui.settings.large}</option>
                  </select>
                </Field>
                <Field label={ui.settings.cornerRadius}>
                  <select
                    value={p.radius}
                    onChange={(e) => set('radius', e.target.value as Preferences['radius'])}
                  >
                    <option value="small">{ui.settings.subtle}</option>
                    <option value="medium">{ui.settings.rounded}</option>
                    <option value="large">{ui.settings.soft}</option>
                  </select>
                </Field>
                <Field label={ui.settings.motion}>
                  <select
                    value={p.motion}
                    onChange={(e) => set('motion', e.target.value as Preferences['motion'])}
                  >
                    <option value="standard">{ui.settings.followSystemPreference}</option>
                    <option value="reduced">{ui.settings.reducedMotion}</option>
                  </select>
                </Field>
              </div>
            </Panel>
            <BackgroundPanel key={store.workspaceId} />
            <Panel title={en.settings.custom} subtitle={en.settings.customHint}>
              <div className="form-grid">
                {(['accent', 'background', 'surface', 'border', 'text'] as const).map((key) => (
                  <Field key={key} label={themeLabels[key]}>
                    <div className="color-input">
                      <input
                        type="color"
                        aria-label={themeLabels[key]}
                        value={custom[key]}
                        onChange={(e) => {
                          const next = { ...custom, [key]: e.target.value };
                          setCustom(next);
                          previewTheme(next);
                        }}
                      />
                      <code>{custom[key]}</code>
                    </div>
                  </Field>
                ))}
              </div>
              <h3>{ui.settings.heatmapIntensityPalette}</h3>
              <div className="heatmap-colors">
                {custom.heatmap.map((color, index) => (
                  <label key={index}>
                    <input
                      type="color"
                      aria-label={`Intensité d’activité ${index}`}
                      value={color}
                      onChange={(e) => {
                        const next = {
                          ...custom,
                          heatmap: custom.heatmap.map((c, i) => (i === index ? e.target.value : c)),
                        };
                        setCustom(next);
                        previewTheme(next);
                      }}
                    />
                    <span>
                      {index === 0 ? ui.settings.none : index === 4 ? ui.settings.most : index}
                    </span>
                  </label>
                ))}
              </div>
              {Math.min(
                contrastRatio(custom.text, custom.surface),
                contrastRatio(custom.text, custom.background),
                contrastRatio(custom.accent, custom.surface),
                Math.max(
                  contrastRatio('#ffffff', custom.accent),
                  contrastRatio('#000000', custom.accent),
                ),
              ) < 4.5 && (
                <div className="notice">
                  {en.settings.contrast}
                  <Button
                    variant="ghost"
                    onClick={() => {
                      setCustom(baseCustom);
                      previewTheme(baseCustom);
                    }}
                  >
                    {ui.settings.useAccessibleColors}
                  </Button>
                </div>
              )}
              <div className="form-actions wrap">
                <Button
                  variant="secondary"
                  onClick={() => {
                    if (preview) {
                      applyPreview(p.customTheme);
                      setPreview(false);
                    } else previewTheme(custom);
                  }}
                >
                  {preview ? ui.settings.endPreview : en.settings.preview}
                </Button>
                <Button
                  variant="secondary"
                  onClick={async () => {
                    if (await set('customTheme', null)) {
                      applyPreview(null);
                      setPreview(false);
                      setCustom(baseCustom);
                    }
                  }}
                >
                  <RotateCcw size={15} />
                  {en.settings.reset}
                </Button>
                <Button
                  disabled={!paid || !canEdit}
                  onClick={async () => {
                    if (await set('customTheme', custom)) {
                      applyPreview(custom);
                      setPreview(false);
                      notify(ui.settings.yourCustomThemeIsSaved);
                    }
                  }}
                >
                  {en.settings.saveTheme}
                </Button>
              </div>
              {preview && (
                <p className="helper" role="status">
                  {ui.settings.unsavedThemePreview}
                </p>
              )}
              {!paid && (
                <p className="helper">{ui.settings.customThemesRequireProOrTeamForThisWorkspace}</p>
              )}
            </Panel>
          </>
        )}
        {tab === 'timer' && (
          <>
            <Panel
              title={ui.settings.yourFocusRhythm}
              subtitle={ui.settings.buildARoutineThatFeelsRightForYou}
            >
              <form onSubmit={saveTimer}>
                <div className="form-grid">
                  {[
                    { key: 'focusMinutes', label: en.settings.focusDuration, max: 180 },
                    { key: 'shortBreakMinutes', label: en.settings.shortDuration, max: 60 },
                    { key: 'longBreakMinutes', label: en.settings.longDuration, max: 120 },
                    { key: 'cycleLength', label: en.settings.cycle, max: 12 },
                    { key: 'dailyGoal', label: en.settings.dailyGoal, max: 100 },
                  ].map(({ key, label, max }) => (
                    <Field label={label} key={key}>
                      <input
                        name={key}
                        type="number"
                        min={1}
                        max={max}
                        required
                        defaultValue={p[key as 'focusMinutes']}
                      />
                    </Field>
                  ))}
                </div>
                <label className="toggle-row">
                  <span>{en.settings.sound}</span>
                  <input type="checkbox" name="sound" defaultChecked={p.sound} />
                </label>
                <div className="form-actions">
                  <Button type="submit">{en.common.save}</Button>
                </div>
              </form>
              <div className="row wrap">
                <Button variant="secondary" onClick={() => store.requestNotifications()}>
                  <Bell size={16} />
                  {p.notifications ? ui.settings.notificationsEnabled : en.settings.notifications}
                </Button>
                {p.notifications && (
                  <Button variant="ghost" onClick={() => set('notifications', false)}>
                    {ui.settings.disableNotifications}
                  </Button>
                )}
                {p.notifications && isNativeApp() && Capacitor.getPlatform() === 'android' && (
                  <Button
                    variant="ghost"
                    onClick={() =>
                      void openNativeExactAlarmSettings().catch(() =>
                        notify('Impossible d’ouvrir les réglages des rappels sur cet appareil.'),
                      )
                    }
                  >
                    Réglages des rappels précis
                  </Button>
                )}
              </div>
              <p className="helper">{en.settings.notificationHelp}</p>
            </Panel>
            <Panel
              title={en.settings.preset}
              subtitle={ui.settings.saveARhythmForDifferentKindsOfWork}
            >
              {p.presets.map((preset) => (
                <div className="preset-row" key={preset.id}>
                  <div>
                    <strong>{preset.name}</strong>
                    <span>
                      {preset.focusMinutes}
                      {ui.settings.mFocus} {preset.shortBreakMinutes}
                      {ui.settings.mShort} {preset.longBreakMinutes}
                      {ui.settings.mLong}
                    </span>
                  </div>
                  <Button
                    variant="secondary"
                    onClick={() =>
                      store.update((d) => {
                        d.preferences.focusMinutes = preset.focusMinutes;
                        d.preferences.shortBreakMinutes = preset.shortBreakMinutes;
                        d.preferences.longBreakMinutes = preset.longBreakMinutes;
                        d.preferences.cycleLength = preset.cycleLength;
                      })
                    }
                  >
                    {ui.settings.apply}
                  </Button>
                  <IconButton
                    label={`Supprimer le préréglage ${preset.name}`}
                    onClick={() =>
                      set(
                        'presets',
                        p.presets.filter((v) => v.id !== preset.id),
                      )
                    }
                  >
                    <Trash2 size={15} />
                  </IconButton>
                </div>
              ))}
              <form
                className="inline-form"
                onSubmit={async (e) => {
                  e.preventDefault();
                  const f = new FormData(e.currentTarget);
                  const form = e.currentTarget;
                  if (
                    await store.update((d) => {
                      d.preferences.presets.push({
                        id: id(),
                        name: String(f.get('name')),
                        focusMinutes: p.focusMinutes,
                        shortBreakMinutes: p.shortBreakMinutes,
                        longBreakMinutes: p.longBreakMinutes,
                        cycleLength: p.cycleLength,
                      });
                    })
                  ) {
                    form.reset();
                    notify(ui.settings.currentTimerSettingsSavedAsAPreset);
                  }
                }}
              >
                <input
                  name="name"
                  aria-label={ui.settings.presetName}
                  placeholder={ui.settings.eGDeepWork}
                  required
                  maxLength={60}
                />
                <Button type="submit" variant="secondary">
                  <Plus size={15} />
                  {en.settings.savePreset}
                </Button>
              </form>
            </Panel>
          </>
        )}
        {tab === 'calendar' && (
          <Panel
            title={ui.settings.aWeekThatWorksForYou}
            subtitle={ui.settings.calendarPreferencesApplyToPlanningAndActivity}
          >
            <form onSubmit={saveCalendar}>
              <Field
                label={en.settings.timeZone}
                hint={ui.settings.useAnIanaTimeZoneSuchAsEuropeParis}
              >
                <input name="timeZone" list="time-zones" required defaultValue={p.timeZone} />
                <datalist id="time-zones">
                  {Intl.supportedValuesOf('timeZone').map((tz) => (
                    <option key={tz} value={tz} />
                  ))}
                </datalist>
              </Field>
              <div className="form-grid">
                <Field label={en.settings.firstDay}>
                  <select name="weekStartsOn" defaultValue={p.weekStartsOn}>
                    <option value={1}>{en.settings.monday}</option>
                    <option value={0}>{en.settings.sunday}</option>
                  </select>
                </Field>
                <Field label={en.settings.hourFormat}>
                  <select name="timeFormat" defaultValue={p.timeFormat}>
                    <option value="24h">{ui.settings.copy24Hour}</option>
                    <option value="12h">{ui.settings.copy12Hour}</option>
                  </select>
                </Field>
                <Field label={en.settings.dateFormat}>
                  <select name="dateFormat" defaultValue={p.dateFormat}>
                    {['MMM d, yyyy', 'dd/MM/yyyy', 'MM/dd/yyyy', 'yyyy-MM-dd'].map((v) => (
                      <option key={v} value={v}>
                        {v === 'MMM d, yyyy'
                          ? '16 sept. 2026'
                          : v === 'dd/MM/yyyy'
                            ? '16/09/2026'
                            : v === 'MM/dd/yyyy'
                              ? '09/16/2026'
                              : '2026-09-16'}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label={en.settings.visibleStart}>
                  <input
                    name="visibleStartHour"
                    type="number"
                    min={0}
                    max={23}
                    defaultValue={p.visibleStartHour}
                    required
                  />
                </Field>
                <Field label={en.settings.visibleEnd}>
                  <input
                    name="visibleEndHour"
                    type="number"
                    min={1}
                    max={24}
                    defaultValue={p.visibleEndHour}
                    required
                  />
                </Field>
              </div>
              <p className="helper">
                {ui.settings.hoursExpandAutomaticallyForPlansOutsideYourVisibleRange}
              </p>
              <div className="form-actions">
                <Button type="submit">{en.common.save}</Button>
              </div>
            </form>
          </Panel>
        )}
        {tab === 'dashboard' && (
          <Panel
            title={ui.settings.yourDashboardYourWay}
            subtitle={ui.settings.keepWhatHelpsMakeALittleSpaceForThe}
          >
            {[...p.widgets, ...widgetNames.filter((w) => !p.widgets.includes(w))].map(
              (widget, index) => (
                <div
                  className="layout-widget"
                  key={widget}
                  draggable={p.widgets.includes(widget)}
                  onDragStart={() => setDragging(widget)}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={() => {
                    if (dragging) moveWidget(dragging as (typeof widgetNames)[number], index);
                    setDragging(null);
                  }}
                >
                  <GripVertical size={18} />
                  <label>
                    <input
                      type="checkbox"
                      checked={p.widgets.includes(widget)}
                      onChange={(e) =>
                        set(
                          'widgets',
                          e.target.checked
                            ? [...p.widgets, widget]
                            : p.widgets.filter((w) => w !== widget),
                        )
                      }
                    />
                    {widgetLabels[widget]}
                  </label>
                  <div className="row">
                    <IconButton
                      label={`Monter ${widgetLabels[widget]}`}
                      disabled={index === 0 || !p.widgets.includes(widget)}
                      onClick={() => moveWidget(widget, index - 1)}
                    >
                      <ArrowUp size={16} />
                    </IconButton>
                    <IconButton
                      label={`Descendre ${widgetLabels[widget]}`}
                      disabled={index >= p.widgets.length - 1 || !p.widgets.includes(widget)}
                      onClick={() => moveWidget(widget, index + 1)}
                    >
                      <ArrowDown size={16} />
                    </IconButton>
                  </div>
                </div>
              ),
            )}
            <div className="inline-form">
              <input
                placeholder={en.settings.layoutName}
                aria-label={en.settings.layoutName}
                maxLength={60}
                value={layoutName}
                onChange={(e) => setLayoutName(e.target.value)}
              />
              <Button
                disabled={!paid || !layoutName.trim()}
                onClick={async () => {
                  if (
                    await set('savedLayouts', [
                      ...p.savedLayouts,
                      { id: id(), name: layoutName.trim(), widgets: [...p.widgets] },
                    ])
                  ) {
                    setLayoutName('');
                    notify(ui.settings.dashboardLayoutSaved);
                  }
                }}
              >
                {en.settings.saveLayout}
              </Button>
            </div>
            {!paid && (
              <p className="helper">{ui.settings.namedLayoutsRequireProOrTeamInThisWorkspace}</p>
            )}
            {p.savedLayouts.map((layout) => (
              <div className="preset-row" key={layout.id}>
                <strong>{layout.name}</strong>
                <Button variant="secondary" onClick={() => set('widgets', layout.widgets)}>
                  {ui.settings.apply}
                </Button>
                <IconButton
                  label={`Supprimer la disposition ${layout.name}`}
                  onClick={() =>
                    set(
                      'savedLayouts',
                      p.savedLayouts.filter((l) => l.id !== layout.id),
                    )
                  }
                >
                  <Trash2 size={15} />
                </IconButton>
              </div>
            ))}
            <Button variant="ghost" onClick={() => set('widgets', [...widgetNames])}>
              <RotateCcw size={15} />
              {en.settings.restoreLayout}
            </Button>
          </Panel>
        )}
        {tab === 'data' && (
          <>
            <Panel
              title={ui.settings.yourWorkBelongsToYou}
              subtitle={ui.settings.keepABackupTakeYourFocusWithYou}
            >
              <p>{en.settings.importHelp}</p>
              <div className="row wrap">
                <Button variant="secondary" onClick={() => store.exportData()}>
                  <Download size={16} />
                  {en.settings.export}
                </Button>
                <Button
                  variant="secondary"
                  disabled={!canEdit}
                  onClick={() => input.current?.click()}
                >
                  <Upload size={16} />
                  {en.settings.import}
                </Button>
                <input
                  ref={input}
                  type="file"
                  accept="application/json,.json"
                  className="sr-only"
                  aria-label={ui.settings.importJsonFile}
                  onChange={async (e) => {
                    const f = e.target.files?.[0];
                    if (f) {
                      try {
                        store.previewImport(await f.text());
                      } catch (error) {
                        notify(
                          localizeError(error instanceof Error ? error.message : String(error)),
                        );
                      }
                    }
                    e.target.value = '';
                  }}
                />
              </div>
              {store.isCloud && (
                <>
                  <p className="helper">{en.account.localConsent}</p>
                  <Button variant="secondary" onClick={() => store.importLocalData()}>
                    {ui.settings.previewLocalDataMigration}
                  </Button>
                </>
              )}
            </Panel>
            {!store.isCloud && (
              <Panel title={ui.settings.aFreshPage} subtitle={en.settings.freshHelp}>
                <p>{ui.settings.startAnEmptyPersonalWorkspaceOnThisDeviceNo}</p>
                <Button variant="secondary" onClick={() => setFresh(true)}>
                  <Plus size={16} />
                  {en.common.startFresh}
                </Button>
              </Panel>
            )}
            <Panel title={ui.settings.offlineWithYou} subtitle={ui.settings.knowWhatStaysAvailable}>
              <p>{en.help.offline}</p>
              <p>{en.help.install}</p>
            </Panel>
          </>
        )}
        {tab === 'account' && <AccountPanel />}
      </div>
      {store.importPreview && (
        <Dialog title={ui.settings.reviewYourImport} onClose={store.cancelImport}>
          <p>{localizeError(store.importPreview.warning)}</p>
          <div className="mini-metrics">
            <div>
              <strong>{store.importPreview.subjects}</strong>
              <span>{ui.settings.subjects}</span>
            </div>
            <div>
              <strong>{store.importPreview.tasks}</strong>
              <span>{ui.settings.tasks}</span>
            </div>
            <div>
              <strong>{store.importPreview.focusSessions}</strong>
              <span>{ui.settings.focusRecords}</span>
            </div>
          </div>
          <p>
            {store.importPreview.plannedSessions} {ui.settings.plannedSessions}{' '}
            {store.importPreview.journalEntries} {ui.settings.journalEntries}
          </p>
          <p>
            {store.importPreview.noteSheets} {ui.settings.noteSheets}{' '}
            {store.importPreview.flashcardDecks} {ui.settings.flashcardDecks}{' '}
            {store.importPreview.flashcards} {ui.settings.cards}
          </p>
          <p className="helper">{ui.settings.recordsWillBeAddedWithNewIdsPermissionsAnd}</p>
          <div className="form-actions">
            <Button variant="secondary" onClick={store.cancelImport}>
              {en.common.cancel}
            </Button>
            <Button
              onClick={async () => {
                if (await store.confirmImport()) notify(ui.settings.productivityDataImported);
              }}
            >
              {ui.settings.confirmImport}
            </Button>
          </div>
        </Dialog>
      )}
      {fresh && (
        <Dialog title={ui.settings.startWithACleanWorkspace} onClose={() => setFresh(false)}>
          <p>{en.settings.freshHelp}</p>
          <div className="form-actions">
            <Button variant="secondary" onClick={() => setFresh(false)}>
              {en.common.cancel}
            </Button>
            <Button
              onClick={async () => {
                if (await store.startFresh()) {
                  setFresh(false);
                  notify(ui.settings.yourNewWorkspaceIsReady);
                }
              }}
            >
              {en.common.startFresh}
            </Button>
          </div>
        </Dialog>
      )}
    </>
  );
}
export function AccountPanel({ deletionIntent = false }: { deletionIntent?: boolean }) {
  const { store, notify } = useApp();
  const [mode, setMode] = useState<'signIn' | 'signUp' | 'reset' | 'password'>(() =>
    typeof window !== 'undefined' &&
    new URLSearchParams(window.location.search).get('reset-password') === '1'
      ? 'password'
      : 'signIn',
  );
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [confirmation, setConfirmation] = useState('');
  const [confirmSignOut, setConfirmSignOut] = useState(false);
  const [ageGroup, setAgeGroup] = useState<AccountAgeGroup | ''>('');
  const [legalAccepted, setLegalAccepted] = useState(false);
  const configured = !!createBrowserSupabase();
  const needsOnlineEligibility = mode === 'signIn' || mode === 'signUp';
  const onlineAgeEligible = isOnlineAccountAgeGroup(ageGroup);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const client = createBrowserSupabase();
    if (!client) {
      setMessage(en.account.unavailable);
      return;
    }
    const form = new FormData(event.currentTarget);
    if (needsOnlineEligibility && !onlineAgeEligible) {
      setMessage(
        'Choisissez votre tranche d’âge. Les comptes en ligne sont réservés aux personnes de 16 ans et plus ; les outils locaux restent disponibles sans compte.',
      );
      return;
    }
    const signupMetadata =
      mode === 'signUp' ? accountSignupMetadata(ageGroup, legalAccepted) : null;
    if (mode === 'signUp' && !signupMetadata) {
      setMessage(
        'Acceptez les conditions d’utilisation et prenez connaissance de la politique de confidentialité avant de créer un compte.',
      );
      return;
    }
    setBusy(true);
    setMessage('');
    try {
      const email = String(form.get('email') || '').trim();
      const password = String(form.get('password') || '');
      const callback = authRedirectUrl();
      const recovery = authRedirectUrl(true);
      const result =
        mode === 'signIn'
          ? await client.auth.signInWithPassword({ email, password })
          : mode === 'signUp'
            ? await client.auth.signUp({
                email,
                password,
                options: { emailRedirectTo: callback, data: signupMetadata! },
              })
            : mode === 'password'
              ? await client.auth.updateUser({ password })
              : await client.auth.resetPasswordForEmail(email, { redirectTo: recovery });
      if (result.error) throw result.error;
      if (mode === 'signUp') setMessage(en.account.verify);
      else if (mode === 'reset') setMessage(en.account.resetSent);
      else if (mode === 'password') {
        setMessage(ui.settings.passwordUpdated);
        setMode('signIn');
        const url = new URL(window.location.href);
        url.searchParams.delete('reset-password');
        if (!url.searchParams.has('view')) url.searchParams.set('view', 'overview');
        window.history.replaceState(null, '', url);
        await store.refreshAccount();
      } else {
        await store.refreshAccount();
        setAgeGroup('');
        setLegalAccepted(false);
        notify(ui.settings.signedInYourWorkspaceConnectionStatusAppearsBelow);
      }
    } catch (error) {
      setMessage(
        localizeError(
          error instanceof Error ? error.message : ui.settings.unableToCompleteYourRequest,
        ),
      );
    } finally {
      setBusy(false);
    }
  }

  function requestSignOut() {
    let hasPending =
      store.isCloud &&
      ['saving', 'pending', 'offline', 'failed', 'conflict'].includes(store.saveStatus);
    if (store.isCloud && store.user) {
      try {
        const prefix = `${STORAGE_PREFIX}account:${store.user.id}:`;
        for (let index = 0; index < workspaceStorage.length; index++) {
          const key = workspaceStorage.key(index);
          if (!key?.startsWith(prefix)) continue;
          const raw = workspaceStorage.getItem(key);
          if (raw && (key.endsWith(':pending') || JSON.parse(raw)?.pending)) {
            hasPending = true;
            break;
          }
        }
      } catch {
        hasPending = true;
      }
    }
    if (hasPending) setConfirmSignOut(true);
    else void signOut();
  }

  async function signOut() {
    const client = createBrowserSupabase();
    if (!client) {
      setMessage(en.account.unavailable);
      return;
    }
    setBusy(true);
    setMessage('');
    try {
      const result = await client.auth.signOut({ scope: 'local' });
      if (result.error) throw result.error;
      if (store.user) clearAccountCache(store.user.id);
      navigator.serviceWorker?.controller?.postMessage({ type: 'CLEAR_PRIVATE_CACHES' });
      await store.refreshAccount();
      setConfirmSignOut(false);
      setMode('signIn');
      notify(ui.settings.signedOutAccountDataClearedFromThisDevice);
    } catch (error) {
      setMessage(localizeError(error instanceof Error ? error.message : String(error)));
    } finally {
      setBusy(false);
    }
  }

  async function saveName(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setMessage('');
    try {
      const response = await appFetch('/api/account', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ displayName: String(form.get('displayName') || '') }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || 'Your display name could not be saved.');
      notify(ui.settings.accountSettingsSaved);
    } catch (error) {
      setMessage(localizeError(error instanceof Error ? error.message : String(error)));
    } finally {
      setBusy(false);
    }
  }

  async function deleteAccount(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (confirmation !== 'DELETE' || busy) return;
    const form = event.currentTarget;
    const passwordInput = form.elements.namedItem('deletionPassword') as HTMLInputElement | null;
    setBusy(true);
    setMessage('');
    try {
      const accountId = store.user?.id;
      const email = store.user?.email;
      const client = createBrowserSupabase();
      if (!email || !client || !passwordInput?.value) {
        throw new Error('Confirm your password before deleting your account.');
      }
      // Reauthenticate the current session, rather than relying on a recent
      // login in another browser. The API separately checks its signed AMR.
      const reauthentication = await client.auth.signInWithPassword({
        email,
        password: passwordInput.value,
      });
      passwordInput.value = '';
      if (reauthentication.error) throw reauthentication.error;
      const response = await appFetch('/api/account', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirmation }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || 'Your account could not be deleted.');
      // Server deletion is final even if this device cannot finish every local
      // cleanup step. Attempt all of them; never invite a second DELETE request.
      let cleanupFailed = false;
      const cleanupSteps = [
        () => {
          if (accountId) clearAccountCache(accountId);
        },
        () => navigator.serviceWorker?.controller?.postMessage({ type: 'CLEAR_PRIVATE_CACHES' }),
        async () => {
          const result = await client.auth.signOut({ scope: 'local' });
          if (result.error) throw result.error;
        },
        () => store.refreshAccount(),
      ];
      for (const cleanup of cleanupSteps) {
        try {
          await cleanup();
        } catch {
          cleanupFailed = true;
        }
      }
      setDeleting(false);
      setConfirmation('');
      notify(
        cleanupFailed
          ? 'Votre compte a été supprimé. Le nettoyage local est incomplet sur cet appareil : fermez l’application et effacez ses données locales avant de le partager.'
          : ui.settings.yourAccountHasBeenDeleted,
      );
    } catch (error) {
      setMessage(localizeError(error instanceof Error ? error.message : String(error)));
    } finally {
      if (passwordInput) passwordInput.value = '';
      setBusy(false);
    }
  }

  return (
    <Panel
      title={store.user ? en.account.connected : en.account.title}
      subtitle={store.user?.email || en.account.localConsent}
    >
      {!configured && <p className="notice">{en.account.unavailable}</p>}
      {deletionIntent && (
        <p className="notice" role="status">
          {store.user
            ? 'Vous pouvez supprimer ce compte et ses données ci-dessous. Aucune suppression ne sera lancée sans votre confirmation.'
            : 'Connectez-vous au compte Solace à supprimer. Vous pourrez ensuite consulter les conséquences et confirmer sa suppression ici.'}
        </p>
      )}
      {store.user && (
        <>
          <div className="account-summary">
            <span className="avatar">
              {store.user.email?.charAt(0).toUpperCase() || ui.settings.f}
            </span>
            <div>
              <strong>{store.user.email}</strong>
              <span>{ui.settings.personalAndSharedWorkspacesStaySeparate}</span>
            </div>
          </div>
          <AccountLegalConsent />
          <form className="inline-form" onSubmit={saveName}>
            <input
              name="displayName"
              placeholder={ui.settings.displayName}
              aria-label={ui.settings.displayName}
              maxLength={100}
            />
            <Button type="submit" variant="secondary" disabled={busy}>
              {ui.settings.saveName}
            </Button>
          </form>
          <div className="row wrap">
            <Button
              variant="secondary"
              disabled={busy}
              onClick={() => setMode(mode === 'password' ? 'signIn' : 'password')}
            >
              {mode === 'password' ? ui.settings.cancelPasswordChange : ui.settings.changePassword}
            </Button>
            <Button variant="secondary" disabled={busy} onClick={requestSignOut}>
              {en.account.signOut}
            </Button>
          </div>
        </>
      )}
      {mode === 'password' ? (
        <form onSubmit={submit}>
          <p className="helper">{ui.settings.chooseANewPasswordAValidSignedInOr}</p>
          <Field label={ui.settings.newPassword} hint={ui.settings.useAtLeast12Characters}>
            <input
              name="password"
              type="password"
              autoComplete="new-password"
              minLength={12}
              required
            />
          </Field>
          <Button type="submit" disabled={!configured || busy}>
            {busy ? ui.settings.pleaseWait : ui.settings.updatePassword}
          </Button>
          {!store.user && (
            <Button type="button" variant="ghost" disabled={busy} onClick={() => setMode('reset')}>
              {ui.settings.requestANewResetLink}
            </Button>
          )}
        </form>
      ) : (
        !store.user && (
          <>
            <div className="detail-tabs">
              {(['signIn', 'signUp', 'reset'] as const).map((value) => (
                <button
                  key={value}
                  disabled={busy}
                  onClick={() => {
                    setMode(value);
                    setMessage('');
                    setAgeGroup('');
                    setLegalAccepted(false);
                  }}
                  className={mode === value ? 'active' : ''}
                >
                  {en.account[value]}
                </button>
              ))}
            </div>
            <form onSubmit={submit}>
              {needsOnlineEligibility && (
                <>
                  <Field label="Votre tranche d’âge">
                    <select
                      name="ageGroup"
                      value={ageGroup}
                      required
                      disabled={busy}
                      onChange={(event) => {
                        setAgeGroup(event.target.value as AccountAgeGroup | '');
                        setLegalAccepted(false);
                        setMessage('');
                      }}
                    >
                      <option value="">Choisir une tranche d’âge</option>
                      <option value="under16">Moins de 16 ans</option>
                      <option value="16-17">16–17 ans</option>
                      <option value="18+">18 ans et plus</option>
                    </select>
                  </Field>
                  <p className="helper">
                    Les outils locaux sont accessibles sans compte. Les comptes en ligne sont
                    réservés aux personnes de 16 ans et plus. Aucune date de naissance n’est
                    demandée.
                  </p>
                  {ageGroup === 'under16' && (
                    <p className="notice" role="status">
                      Le minuteur, les tâches et le planning restent disponibles sur cet appareil
                      sans compte. Aucun compte en ligne ni achat ne sera lancé ici. Fermez cette
                      fenêtre pour continuer à utiliser les outils locaux.
                    </p>
                  )}
                </>
              )}
              {(!needsOnlineEligibility || onlineAgeEligible) && (
                <>
                  <Field label={en.account.email}>
                    <input
                      type="email"
                      name="email"
                      required
                      autoComplete="email"
                      placeholder={ui.settings.youExampleCom}
                    />
                  </Field>
                  {mode !== 'reset' && (
                    <Field
                      label={en.account.password}
                      hint={mode === 'signUp' ? ui.settings.useAtLeast12Characters : undefined}
                    >
                      <input
                        type="password"
                        name="password"
                        required
                        minLength={mode === 'signUp' ? 12 : 1}
                        autoComplete={mode === 'signUp' ? 'new-password' : 'current-password'}
                      />
                    </Field>
                  )}
                  {mode === 'signUp' && (
                    <label className="row">
                      <input
                        name="legalAccepted"
                        type="checkbox"
                        required
                        checked={legalAccepted}
                        disabled={busy}
                        onChange={(event) => setLegalAccepted(event.target.checked)}
                      />
                      <span>
                        J’accepte les{' '}
                        <a href="/terms" target="_blank" rel="noopener noreferrer">
                          conditions d’utilisation
                        </a>{' '}
                        et j’ai pris connaissance de la{' '}
                        <a href="/privacy" target="_blank" rel="noopener noreferrer">
                          politique de confidentialité
                        </a>
                        .
                      </span>
                    </label>
                  )}
                  <Button type="submit" disabled={!configured || busy}>
                    {busy ? ui.settings.pleaseWait : en.account[mode]}
                  </Button>
                </>
              )}
            </form>
          </>
        )
      )}
      {store.user && (
        <div className="danger-zone">
          <h3>{en.account.delete}</h3>
          <p>{en.account.deleteHelp}</p>
          <p className="helper">
            {ui.settings.exportYourPersonalDataFirstTransferOrganizationOwnershipAnd}
          </p>
          <Button
            variant="danger"
            disabled={busy}
            onClick={() => {
              setMessage('');
              setConfirmation('');
              setDeleting(true);
            }}
          >
            {en.account.delete}
          </Button>
        </div>
      )}
      {message && (
        <p className="notice" role="status">
          {message}
        </p>
      )}
      <nav className="helper row wrap" aria-label="Données et confidentialité">
        <a href="/privacy">Confidentialité</a>
        <a href="/account-deletion">Suppression du compte</a>
        <a href="/support">Assistance</a>
        <a href="/third-party-notices.txt">Licences tierces</a>
      </nav>
      {confirmSignOut && (
        <Dialog
          title={ui.settings.keepYourUnsyncedWork}
          onClose={() => {
            if (!busy) setConfirmSignOut(false);
          }}
        >
          <p>{ui.settings.someAccountChangesMayNotHaveReachedTheServer}</p>
          <p className="helper">{ui.settings.exportThisWorkspaceFirstOrKeepWorkingAndReconnect}</p>
          <Button variant="secondary" disabled={busy} onClick={() => store.exportData()}>
            <Download size={16} />
            {ui.settings.exportCurrentWorkspace}
          </Button>
          <div className="form-actions wrap">
            <Button variant="secondary" disabled={busy} onClick={() => setConfirmSignOut(false)}>
              {ui.settings.keepWorking}
            </Button>
            <Button variant="danger" disabled={busy} onClick={() => void signOut()}>
              {busy ? ui.settings.signingOut : ui.settings.discardUnsyncedChangesAndSignOut}
            </Button>
          </div>
        </Dialog>
      )}
      {deleting && (
        <Dialog
          title={en.account.delete}
          onClose={() => {
            if (!busy) {
              setDeleting(false);
              setConfirmation('');
              setMessage('');
            }
          }}
        >
          <form onSubmit={deleteAccount}>
            <p>{en.account.deleteHelp}</p>
            <p className="helper">
              Votre abonnement web personnel sera résilié immédiatement et l’accès Pro prendra fin.
              La suppression ne déclenche pas de remboursement automatique. Exportez vos données
              avant de continuer.
            </p>
            <p className="helper">
              Un abonnement Apple ou Google doit être résilié dans la boutique pour arrêter ses
              renouvellements : supprimer votre compte Solace ne le résilie pas automatiquement.
              Vous pouvez supprimer ce compte immédiatement, même si cet abonnement est encore
              actif. Vos droits légaux au remboursement restent applicables.
            </p>
            {isNativeApp() ? (
              <Button
                type="button"
                variant="secondary"
                disabled={busy}
                onClick={() => {
                  void nativePurchases
                    .manage()
                    .catch(() =>
                      setMessage(
                        'Ouvrez les réglages des abonnements Apple ou Google pour gérer votre abonnement.',
                      ),
                    );
                }}
              >
                Gérer les abonnements de la boutique
              </Button>
            ) : (
              <p className="helper">
                Gérer les abonnements :{' '}
                <a
                  href="https://apps.apple.com/account/subscriptions"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Apple
                </a>
                {' · '}
                <a
                  href="https://play.google.com/store/account/subscriptions"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Google Play
                </a>
                .
              </p>
            )}
            <Field
              label="Votre mot de passe actuel"
              hint="Il vérifie votre identité avant la suppression définitive."
            >
              <input
                name="deletionPassword"
                type="password"
                autoComplete="current-password"
                required
                disabled={busy}
              />
            </Field>
            <Field label={en.account.deleteConfirmation}>
              <input
                autoComplete="off"
                value={confirmation}
                onChange={(e) => setConfirmation(e.target.value)}
                disabled={busy}
              />
            </Field>
            {message && (
              <p className="notice" role="alert">
                {message}
              </p>
            )}
            <div className="form-actions">
              <Button
                type="button"
                variant="secondary"
                disabled={busy}
                onClick={() => {
                  setDeleting(false);
                  setConfirmation('');
                  setMessage('');
                }}
              >
                {en.common.cancel}
              </Button>
              <Button type="submit" variant="danger" disabled={confirmation !== 'DELETE' || busy}>
                {busy ? ui.settings.deleting : en.account.delete}
              </Button>
            </div>
          </form>
        </Dialog>
      )}
    </Panel>
  );
}
