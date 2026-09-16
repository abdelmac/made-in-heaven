'use client';

import { useState } from 'react';
import { ArrowRight, CalendarPlus } from 'lucide-react';
import { workSummary } from '@/lib/work-summary';
import { formatDay, formatTime, minutesLabel } from '@/lib/display';
import { useApp } from './app-context';
import { Button, Panel } from './ui';
import styles from './welcome.module.css';

export function WorkSummary() {
  const { store, openTask, openPlan, canEdit } = useApp();
  const [period, setPeriod] = useState<'day' | 'week'>('week');
  const summary = workSummary(store.data, store.userId, period);
  return (
    <Panel
      title="Mon bilan"
      subtitle="Votre travail terminé et votre planning, dans le fuseau horaire de cet espace."
      className={styles.summary}
      action={
        <div className={styles.period} role="group" aria-label="Période du bilan">
          <Button
            variant={period === 'day' ? 'primary' : 'ghost'}
            aria-pressed={period === 'day'}
            onClick={() => setPeriod('day')}
          >
            Aujourd’hui
          </Button>
          <Button
            variant={period === 'week' ? 'primary' : 'ghost'}
            aria-pressed={period === 'week'}
            onClick={() => setPeriod('week')}
          >
            Cette semaine
          </Button>
        </div>
      }
    >
      <div className={styles.metrics}>
        <div>
          <strong>{minutesLabel(summary.completedMinutes)}</strong>
          <span>de concentration terminée</span>
        </div>
        <div>
          <strong>{minutesLabel(summary.plannedMinutes)}</strong>
          <span>prévues {period === 'day' ? 'aujourd’hui' : 'sur la semaine entière'}</span>
        </div>
        <div>
          <strong>{summary.overdueCount}</strong>
          <span>tâche{summary.overdueCount > 1 ? 's' : ''} en retard</span>
        </div>
      </div>
      <p className="helper">
        {summary.remainingToday
          ? `Encore ${summary.remainingToday} séance${summary.remainingToday > 1 ? 's' : ''} pour votre objectif du jour.`
          : 'Votre objectif de concentration du jour est atteint.'}
        {summary.blockedCount > 0 &&
          ` ${summary.blockedCount} tâche${summary.blockedCount > 1 ? 's restent bloquées' : ' reste bloquée'}.`}
      </p>
      <div className={styles.next}>
        <div>
          <strong>Prochaine action</strong>
          <p>
            {summary.nextTask
              ? summary.nextTask.title
              : 'Choisissez une petite action pour avancer à votre rythme.'}
          </p>
          {summary.nextPlan && (
            <p className="helper">
              Prochaine séance : {summary.nextPlan.title},{' '}
              {formatDay(summary.nextPlan.startsAt, store.data.preferences)} à{' '}
              {formatTime(summary.nextPlan.startsAt, store.data.preferences)}.
            </p>
          )}
        </div>
        <div className="row wrap">
          {summary.nextTask && (
            <Button variant="secondary" onClick={() => openTask(summary.nextTask!.id)}>
              Voir la tâche <ArrowRight size={14} />
            </Button>
          )}
          {canEdit && (
            <Button
              variant="ghost"
              onClick={() =>
                openPlan(undefined, summary.tomorrow, store.data.preferences.visibleStartHour)
              }
            >
              <CalendarPlus size={15} />
              Préparer demain
            </Button>
          )}
        </div>
      </div>
    </Panel>
  );
}
