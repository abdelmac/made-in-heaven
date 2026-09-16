'use client';

import { useState, type FormEvent } from 'react';
import { ArrowRight, Sprout } from 'lucide-react';
import { addDays, dateKey } from '@/lib/calendar';
import { addStarterPlan } from '@/lib/getting-started';
import { useApp } from './app-context';
import { Button, Dialog, Field } from './ui';
import styles from './welcome.module.css';

export function GettingStarted() {
  const { store, canEdit, navigate, notify } = useApp();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [subject, setSubject] = useState('');
  const [task, setTask] = useState('');
  const [date, setDate] = useState(() =>
    addDays(dateKey(Date.now(), store.data.preferences.timeZone), 1),
  );
  const [time, setTime] = useState('09:00');
  const [duration, setDuration] = useState(store.data.preferences.focusMinutes);
  if (
    !canEdit ||
    store.isDemo ||
    store.currentWorkspace?.kind === 'organization' ||
    store.data.subjects.length ||
    store.data.tasks.length ||
    store.data.plannedSessions.length
  )
    return null;
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError('');
    const ok = await store.update((data) =>
      addStarterPlan(data, store.userId, { subject, task, date, time, duration }),
    );
    setBusy(false);
    if (ok) {
      setOpen(false);
      notify('Votre premier objectif est prêt. Retrouvez votre séance dans le planning.');
      navigate('planner');
    } else
      setError(
        'La création n’a pas pu être enregistrée. Vérifiez les informations ou le message de synchronisation.',
      );
  }
  return (
    <>
      <section className={styles.welcome} aria-label="Premiers pas dans Solace">
        <Sprout size={28} aria-hidden="true" />
        <div>
          <h2>Votre premier pas, en une minute</h2>
          <p>Un objectif, une tâche et une séance : donnez une place à ce qui compte pour vous.</p>
        </div>
        <Button onClick={() => setOpen(true)}>
          Créer mon premier objectif <ArrowRight size={16} />
        </Button>
      </section>
      {open && (
        <Dialog
          title="Préparer mon premier objectif"
          onClose={() => {
            if (!busy) setOpen(false);
          }}
        >
          <form onSubmit={submit} className={styles.starterForm}>
            <p>Ces trois éléments seront enregistrés ensemble dans votre espace personnel.</p>
            <Field label="1. Ma matière ou mon objectif">
              <input
                required
                maxLength={100}
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="Ex. Apprendre le japonais"
              />
            </Field>
            <Field label="2. Ma première tâche">
              <input
                required
                maxLength={300}
                value={task}
                onChange={(e) => setTask(e.target.value)}
                placeholder="Ex. Réviser les dix premiers hiragana"
              />
            </Field>
            <fieldset className={styles.schedule}>
              <legend>3. Ma première séance</legend>
              <Field label="Date">
                <input
                  type="date"
                  required
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                />
              </Field>
              <Field label="Heure">
                <input
                  type="time"
                  required
                  value={time}
                  onChange={(e) => setTime(e.target.value)}
                />
              </Field>
              <Field label="Durée (minutes)">
                <input
                  type="number"
                  required
                  min={1}
                  max={180}
                  value={duration}
                  onChange={(e) => setDuration(Number(e.target.value))}
                />
              </Field>
            </fieldset>
            <p className="helper">
              Fuseau horaire : {store.data.preferences.timeZone}. Vous pourrez modifier ces éléments
              à tout moment.
            </p>
            {error && (
              <p role="alert" className="error-message">
                {error}
              </p>
            )}
            <div className="form-actions">
              <Button
                type="button"
                variant="secondary"
                disabled={busy}
                onClick={() => setOpen(false)}
              >
                Plus tard
              </Button>
              <Button type="submit" disabled={busy}>
                {busy ? 'Création…' : 'Créer et voir mon planning'}
              </Button>
            </div>
          </form>
        </Dialog>
      )}
    </>
  );
}
