'use client';
import { ui } from '@/lib/i18n/ui';
import { localizeError } from '@/lib/i18n/errors';

import { useState } from 'react';
import { Play, Pause, RotateCcw, SkipForward, Maximize2, Volume2, VolumeX } from 'lucide-react';
import { useApp } from './app-context';
import { Button, Dialog, IconButton } from './ui';
import { SolaceMark } from './solace-mark';
import { en } from '@/lib/i18n/en';
import type { TimerPhase } from '@/lib/model';

const phases: { value: TimerPhase; label: string }[] = [
  { value: 'focus', label: en.timer.focus },
  { value: 'shortBreak', label: en.timer.short_break },
  { value: 'longBreak', label: en.timer.long_break },
];
export function TimerCard() {
  const { store, notify, canEdit } = useApp();
  const { data } = store;
  const [taskId, setTaskId] = useState('');
  const [subjectId, setSubjectId] = useState('');
  const [focusView, setFocusView] = useState(false);
  const [confirmAction, setConfirmAction] = useState<'reset' | 'skip' | null>(null);
  const timer = data.timer;
  const running = timer.status === 'running';
  const remaining = Math.max(0, Math.ceil(store.remainingMs / 1000));
  const minutes = String(Math.floor(remaining / 60)).padStart(2, '0');
  const seconds = String(remaining % 60).padStart(2, '0');
  const ratio = Math.min(1, store.remainingMs / timer.durationMs);
  const run = async (fn: () => Promise<boolean>) => {
    try {
      return await fn();
    } catch (error) {
      notify(localizeError(error instanceof Error ? error.message : String(error)));
      return false;
    }
  };
  const content = (
    <>
      <div className="timer-tabs" role="group" aria-label={en.timer.title}>
        {phases.map((phase) => (
          <button
            key={phase.value}
            disabled={timer.status !== 'idle' || !canEdit}
            className={timer.phase === phase.value ? 'active' : ''}
            onClick={() => run(() => store.selectPhase(phase.value))}
          >
            {phase.label}
          </button>
        ))}
      </div>
      <div className={`timer-face ${running ? 'is-running' : ''}`}>
        <svg viewBox="0 0 240 240" aria-hidden="true">
          <circle className="ring-track" cx="120" cy="120" r="107" />
          <circle
            className="ring-progress"
            cx="120"
            cy="120"
            r="107"
            strokeDasharray={`${2 * Math.PI * 107}`}
            strokeDashoffset={`${2 * Math.PI * 107 * (1 - ratio)}`}
            transform="rotate(-90 120 120)"
          />
        </svg>
        <div className="timer-numbers">
          <SolaceMark size={23} />
          <span className="countdown" aria-label={`${minutes} minutes, ${seconds} seconds`}>
            {minutes}
            <span>{ui.timerCard.copy}</span>
            {seconds}
          </span>
          <span className="timer-caption">
            {running
              ? en.timer.running
              : timer.status === 'paused'
                ? en.timer.paused
                : en.timer.ready}
          </span>
        </div>
      </div>
      <div
        className="cycle-dots"
        aria-label={`${timer.cycleCount % data.preferences.cycleLength} séances terminées sur ${data.preferences.cycleLength}`}
      >
        {Array.from({ length: data.preferences.cycleLength }, (_, i) => (
          <span
            key={i}
            className={i < timer.cycleCount % data.preferences.cycleLength ? 'filled' : ''}
          />
        ))}
        <small>
          {timer.cycleCount % data.preferences.cycleLength} {ui.timerCard.copy2}{' '}
          {data.preferences.cycleLength}
        </small>
      </div>
      <div className="timer-context">
        <label htmlFor={focusView ? 'focus-subject' : 'timer-subject'}>{en.timer.task}</label>
        <select
          id={focusView ? 'focus-subject' : 'timer-subject'}
          aria-label={en.timer.subject}
          value={subjectId}
          onChange={(e) => {
            setSubjectId(e.target.value);
            setTaskId('');
          }}
        >
          <option value="">{en.timer.subject}</option>
          {data.subjects
            .filter((s) => !s.archived)
            .map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
        </select>
        <select
          aria-label={en.tasks.titleField}
          value={taskId}
          onChange={(e) => {
            setTaskId(e.target.value);
            const task = data.tasks.find((t) => t.id === e.target.value);
            if (task?.subjectId) setSubjectId(task.subjectId);
          }}
        >
          <option value="">{en.common.unassigned}</option>
          {data.tasks
            .filter(
              (t) =>
                t.status !== 'done' &&
                (!subjectId || t.subjectId === subjectId) &&
                !data.subjects.find((s) => s.id === t.subjectId)?.archived,
            )
            .map((t) => (
              <option key={t.id} value={t.id}>
                {t.title}
              </option>
            ))}
        </select>
        {timer.context && (
          <div className="frozen-context">
            <span className="live-dot" />
            {timer.context.taskTitle || timer.context.subjectName || en.timer.focus}
          </div>
        )}
      </div>
      <div className="timer-controls">
        <IconButton
          label={en.timer.reset}
          disabled={!canEdit}
          onClick={() =>
            timer.status === 'idle' ? void run(() => store.resetTimer()) : setConfirmAction('reset')
          }
        >
          <RotateCcw size={18} />
        </IconButton>
        <Button
          disabled={!canEdit}
          onClick={() =>
            run(() =>
              running
                ? store.pauseTimer()
                : timer.status === 'paused'
                  ? store.resumeTimer()
                  : store.startTimer({
                      phase: timer.phase,
                      taskId: taskId || undefined,
                      subjectId: subjectId || undefined,
                    }),
            )
          }
        >
          {running ? (
            <Pause size={17} fill="currentColor" />
          ) : (
            <Play size={17} fill="currentColor" />
          )}
          {running
            ? en.timer.pause
            : timer.status === 'paused'
              ? en.timer.resume
              : timer.phase === 'focus'
                ? en.timer.start
                : phases.find((p) => p.value === timer.phase)?.label}
        </Button>
        <IconButton
          label={en.timer.skip}
          disabled={!canEdit}
          onClick={() =>
            timer.status === 'idle' ? void run(() => store.skipTimer()) : setConfirmAction('skip')
          }
        >
          <SkipForward size={18} />
        </IconButton>
      </div>
    </>
  );
  return (
    <section className="panel timer-card">
      <div className="panel-heading">
        <div>
          <h2>{en.timer.title}</h2>
          <p>{en.timer.subtitle}</p>
        </div>
        <div className="row">
          <IconButton
            label={en.timer.sound}
            aria-pressed={data.preferences.sound}
            onClick={() =>
              store.update((d) => {
                d.preferences.sound = !d.preferences.sound;
              })
            }
          >
            {data.preferences.sound ? <Volume2 size={17} /> : <VolumeX size={17} />}
          </IconButton>
          <IconButton label={en.timer.distractionFree} onClick={() => setFocusView(true)}>
            <Maximize2 size={17} />
          </IconButton>
        </div>
      </div>
      {!focusView && content}
      {focusView && (
        <Dialog title={en.timer.title} onClose={() => setFocusView(false)}>
          <div className="focus-view">{content}</div>
        </Dialog>
      )}
      {confirmAction && (
        <Dialog
          title={
            confirmAction === 'reset' ? ui.timerCard.resetThisSession : ui.timerCard.skipThisSession
          }
          onClose={() => setConfirmAction(null)}
        >
          <p>
            {ui.timerCard.theElapsedTimeWillBeRecordedAs}{' '}
            {confirmAction === 'reset' ? ui.timerCard.interrupted : ui.timerCard.skipped}
            {ui.timerCard.thisSessionWillNotCountAsACompletedPomodoro}
          </p>
          {store.error && (
            <p className="error" role="alert">
              {store.error}
            </p>
          )}
          <div className="form-actions">
            <Button variant="secondary" onClick={() => setConfirmAction(null)}>
              {en.common.cancel}
            </Button>
            <Button
              variant="danger"
              onClick={async () => {
                if (
                  await run(() =>
                    confirmAction === 'reset' ? store.resetTimer() : store.skipTimer(),
                  )
                )
                  setConfirmAction(null);
              }}
            >
              {confirmAction === 'reset' ? en.timer.reset : en.timer.skip}
            </Button>
          </div>
        </Dialog>
      )}
    </section>
  );
}
