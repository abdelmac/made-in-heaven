'use client';

import { useEffect, useId, useRef, type KeyboardEvent } from 'react';
import { CalendarClock, Check, Flag, Plus } from 'lucide-react';
import { addDays, dateKey } from '@/lib/calendar';
import { formatTime, minutesLabel } from '@/lib/display';
import { calendarCopy as copy } from '@/lib/i18n/planner-calendar';
import { shiftPlannerDate, type PlannerDay } from '@/lib/planner-calendar';
import type { Preferences, Subject } from '@/lib/model';
import { Button, ColorDot } from './ui';
import styles from './planner.module.css';

const dayLabel = (date: string) =>
  new Intl.DateTimeFormat('fr-FR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${date}T12:00:00Z`));

type Props = {
  view: 'month' | 'agenda';
  days: PlannerDay[];
  selectedDate: string;
  leadingDays: number;
  today: string;
  preferences: Preferences;
  subjects: Subject[];
  canEdit: boolean;
  onSelect: (date: string) => void;
  onOpenPlan: (id?: string, date?: string, hour?: number) => void;
  onOpenTask: (id: string) => void;
  onScheduleTask: (taskId: string, date: string) => void;
  onShowWeek: (date: string) => void;
};

export function PlannerCalendar(props: Props) {
  const { view, days, selectedDate, today, preferences, canEdit } = props;
  const grid = useRef<HTMLDivElement>(null);
  const focusPending = useRef(false);
  const instructions = useId();
  const selected = days.find((day) => day.date === selectedDate) || days[0];
  useEffect(() => {
    if (!focusPending.current) return;
    focusPending.current = false;
    grid.current
      ?.querySelector<HTMLButtonElement>(`[data-calendar-day="${selectedDate}"]`)
      ?.focus();
  }, [selectedDate]);

  function changeDay(event: KeyboardEvent<HTMLButtonElement>, date: string) {
    let target: string;
    const weekday = (new Date(`${date}T12:00:00Z`).getUTCDay() - preferences.weekStartsOn + 7) % 7;
    switch (event.key) {
      case 'ArrowLeft':
        target = addDays(date, -1);
        break;
      case 'ArrowRight':
        target = addDays(date, 1);
        break;
      case 'ArrowUp':
        target = addDays(date, -7);
        break;
      case 'ArrowDown':
        target = addDays(date, 7);
        break;
      case 'Home':
        target = addDays(date, -weekday);
        break;
      case 'End':
        target = addDays(date, 6 - weekday);
        break;
      case 'PageUp':
        if (date.slice(0, 7) === '0001-01') {
          event.preventDefault();
          return;
        }
        target = shiftPlannerDate(date, -1, 'month');
        break;
      case 'PageDown':
        if (date.slice(0, 7) === '9999-12') {
          event.preventDefault();
          return;
        }
        target = shiftPlannerDate(date, 1, 'month');
        break;
      default:
        return;
    }
    event.preventDefault();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(target) || target < '0001-01-01' || target > '9999-12-31')
      return;
    focusPending.current = true;
    props.onSelect(target);
  }

  function entries(day: PlannerDay) {
    return (
      <>
        <div className={styles.dayEntries}>
          {!day.sessions.length && <p className={styles.quietDay}>{copy.noSessions}</p>}
          {day.sessions.map((session) => (
            <button
              type="button"
              className={styles.calendarEntry}
              key={session.id}
              data-calendar-plan={session.id}
              onClick={() => props.onOpenPlan(session.id)}
            >
              <CalendarClock size={16} aria-hidden="true" />
              <span className={styles.entryBody}>
                <strong>{session.title}</strong>
                <small>
                  {dateKey(session.startsAt, preferences.timeZone) < day.date
                    ? `${copy.continuation} · `
                    : ''}
                  {formatTime(session.startsAt, preferences)} ·{' '}
                  {minutesLabel(session.durationMinutes)}
                  {session.completed ? ` · ${copy.completed}` : ''}
                </small>
              </span>
              <ColorDot
                color={props.subjects.find((subject) => subject.id === session.subjectId)?.color}
              />
            </button>
          ))}
        </div>
        <div className={styles.dayEntries}>
          <h4>{copy.deadlines}</h4>
          {!day.tasks.length && <p className={styles.quietDay}>{copy.noTasks}</p>}
          {day.tasks.map((task) => (
            <div className={styles.dueEntry} key={task.id}>
              <button
                type="button"
                className={styles.calendarEntry}
                data-calendar-task={task.id}
                onClick={() => props.onOpenTask(task.id)}
              >
                {task.status === 'done' ? (
                  <Check size={16} aria-hidden="true" />
                ) : (
                  <Flag size={16} aria-hidden="true" />
                )}
                <span className={styles.entryBody}>
                  <strong>{task.title}</strong>
                  <small
                    className={
                      day.date < today && task.status !== 'done' ? styles.overdue : undefined
                    }
                  >
                    {task.status === 'done'
                      ? copy.completed
                      : day.date < today
                        ? copy.overdue
                        : copy.due}
                  </small>
                </span>
              </button>
              {canEdit && task.status !== 'done' && (
                <button
                  type="button"
                  className={styles.scheduleTask}
                  aria-label={`${copy.scheduleTask} : ${task.title}`}
                  onClick={() => props.onScheduleTask(task.id, day.date)}
                >
                  <Plus size={14} aria-hidden="true" /> {copy.scheduleTask}
                </button>
              )}
            </div>
          ))}
        </div>
      </>
    );
  }

  if (view === 'agenda')
    return (
      <div className={styles.agenda} aria-label={copy.agenda}>
        {days.map((day) => (
          <section className={styles.agendaDay} key={day.date} data-agenda-day={day.date}>
            <div className={styles.dayDetailHeading}>
              <div>
                <h3>{dayLabel(day.date)}</h3>
                <p>{minutesLabel(day.minutes)} de focus planifié</p>
              </div>
              <Button
                variant="secondary"
                disabled={!canEdit}
                aria-label={`${copy.schedule} le ${day.date}`}
                onClick={() => props.onOpenPlan(undefined, day.date, 9)}
              >
                <Plus size={14} /> {copy.schedule}
              </Button>
            </div>
            {entries(day)}
          </section>
        ))}
      </div>
    );

  return (
    <>
      <p className="helper" id={instructions}>
        {copy.monthHelp} {copy.keyboardHelp}
      </p>
      <div className={styles.monthLayout}>
        <div>
          <div
            className={styles.calendarMonth}
            ref={grid}
            role="group"
            aria-label="Calendrier mensuel"
            aria-describedby={instructions}
          >
            {Array.from(
              { length: 7 },
              (_, index) => copy.weekdays[(index + preferences.weekStartsOn) % 7],
            ).map((day) => (
              <span className={styles.calendarWeekday} key={day} aria-hidden="true">
                {day}
              </span>
            ))}
            {Array.from({ length: props.leadingDays }, (_, index) => (
              <span key={`padding-${index}`} aria-hidden="true" />
            ))}
            {days.map((day) => (
              <button
                type="button"
                key={day.date}
                data-calendar-day={day.date}
                className={styles.calendarDay}
                aria-current={day.date === today ? 'date' : undefined}
                aria-pressed={day.date === selected.date}
                tabIndex={day.date === selected.date ? 0 : -1}
                aria-label={`${dayLabel(day.date)}, ${day.sessions.length} séance(s), ${day.tasks.length} échéance(s), ${Math.round(day.minutes)} minutes planifiées`}
                onClick={() => props.onSelect(day.date)}
                onKeyDown={(event) => changeDay(event, day.date)}
              >
                <span className={styles.calendarDate} aria-hidden="true">
                  {Number(day.date.slice(-2))}
                </span>
                <span className={styles.monthCounts} aria-hidden="true">
                  {day.sessions.length > 0 && <span>{day.sessions.length} s.</span>}
                  {day.tasks.length > 0 && <span>{day.tasks.length} éch.</span>}
                </span>
                <span className={styles.monthPreview} aria-hidden="true">
                  {day.sessions[0]?.title || day.tasks[0]?.title || '\u00a0'}
                </span>
              </button>
            ))}
          </div>
          <p className={styles.calendarLegend}>{copy.legend}</p>
        </div>
        <section className={styles.dayDetail} aria-label={`Détails du ${selected.date}`}>
          <div className={styles.dayDetailHeading}>
            <div>
              <h3 aria-live="polite">{dayLabel(selected.date)}</h3>
              <p>{minutesLabel(selected.minutes)} de focus planifié</p>
            </div>
            <Button
              variant="secondary"
              disabled={!canEdit}
              onClick={() => props.onOpenPlan(undefined, selected.date, 9)}
            >
              <Plus size={14} /> {copy.schedule}
            </Button>
          </div>
          {entries(selected)}
          <Button variant="ghost" onClick={() => props.onShowWeek(selected.date)}>
            {copy.weekLink}
          </Button>
        </section>
      </div>
    </>
  );
}
