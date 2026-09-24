'use client';

import { useRef, useState } from 'react';
import {
  ArrowRight,
  BatteryMedium,
  Check,
  ChevronLeft,
  ChevronRight,
  CloudRain,
  Frown,
  Laugh,
  LockKeyhole,
  Meh,
  Smile,
  Trash2,
} from 'lucide-react';
import type { MoodEntry } from '@/lib/model';
import { dateKey, minutesLabel } from '@/lib/display';
import { shiftActivityMonth } from '@/lib/activity-range';
import { formatMoodDay, moodFocusMinutes, moodMonth, saveMoodEntry } from '@/lib/mood';
import { moodCopy } from '@/lib/i18n/mood';
import { useApp } from './app-context';
import { Button, Field, IconButton, Panel } from './ui';
import styles from './mood.module.css';

const icons = [CloudRain, Frown, Meh, Smile, Laugh];
function MoodIcon({ value, size = 24 }: { value: number; size?: number }) {
  const Icon = icons[value - 1] || Smile;
  return <Icon size={size} aria-hidden="true" />;
}

function MoodChoices({
  value,
  onChange,
  disabled = false,
}: {
  value: number | null;
  onChange: (value: number) => void;
  disabled?: boolean;
}) {
  return (
    <fieldset className={styles.choices} disabled={disabled}>
      <legend>{moodCopy.question}</legend>
      {moodCopy.moods.map((label, index) => (
        <button
          type="button"
          key={label}
          className={styles.choice}
          aria-label={`Humeur : ${label}`}
          aria-pressed={value === index + 1}
          onClick={() => onChange(index + 1)}
        >
          <MoodIcon value={index + 1} />
          <span>{label}</span>
        </button>
      ))}
    </fieldset>
  );
}

export function MoodOverview() {
  const { store, navigate, notify } = useApp();
  const [saving, setSaving] = useState(false);
  const today = dateKey(new Date(), store.data.preferences.timeZone);
  const entry = store.data.preferences.moodEntries.find((item) => item.date === today);
  async function choose(mood: number) {
    setSaving(true);
    try {
      if (
        await store.update((draft) => {
          const current = draft.preferences.moodEntries.find((item) => item.date === today);
          draft.preferences.moodEntries = saveMoodEntry(
            draft.preferences.moodEntries,
            {
              date: today,
              mood,
              energy: current?.energy ?? null,
              note: current?.note ?? '',
              updatedAt: new Date().toISOString(),
            },
            dateKey(new Date(), draft.preferences.timeZone),
          );
        })
      )
        notify(moodCopy.saved);
    } finally {
      setSaving(false);
    }
  }
  return (
    <Panel
      title="Un moment pour vous"
      className={styles.overview}
      action={
        <Button variant="ghost" onClick={() => navigate('mood')}>
          Mon suivi d’humeur <ArrowRight size={14} />
        </Button>
      }
    >
      <div className={styles.overviewInner}>
        {entry ? (
          <div className={styles.saved}>
            <MoodIcon value={entry.mood} />
            <div>
              <strong>{moodCopy.moods[entry.mood - 1]}</strong>
              <p>Votre humeur aujourd’hui{entry.energy ? ` · Énergie ${entry.energy}/5` : ''}</p>
            </div>
            <Button variant="secondary" onClick={() => navigate('mood')}>
              Modifier mon point du jour
            </Button>
          </div>
        ) : (
          <>
            <div>
              <strong>Avant de continuer, faites le point.</strong>
              <p>Un geste pour prendre du recul sur votre journée.</p>
            </div>
            <MoodChoices value={null} onChange={(mood) => void choose(mood)} disabled={saving} />
          </>
        )}
      </div>
    </Panel>
  );
}

function MoodForm({ day, entry }: { day: string; entry?: MoodEntry }) {
  const { store, notify } = useApp();
  const [mood, setMood] = useState<number | null>(entry?.mood ?? null);
  const [energy, setEnergy] = useState<number | null>(entry?.energy ?? null);
  const [note, setNote] = useState(entry?.note ?? '');
  const [saving, setSaving] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [error, setError] = useState('');
  const today = dateKey(new Date(), store.data.preferences.timeZone);
  const future = day > today;
  const focus = moodFocusMinutes(store.data, store.userId, day);
  const unchanged = Boolean(
    entry && entry.mood === mood && entry.energy === energy && entry.note === note,
  );
  async function save() {
    if (mood === null || future) return;
    setError('');
    setSaving(true);
    try {
      const success = await store.update((draft) => {
        draft.preferences.moodEntries = saveMoodEntry(
          draft.preferences.moodEntries,
          {
            date: day,
            mood,
            energy,
            note: note.trim(),
            updatedAt: new Date().toISOString(),
          },
          dateKey(new Date(), draft.preferences.timeZone),
        );
      });
      if (success) notify(moodCopy.saved);
      else setError('Le point n’a pas pu être enregistré. Vos modifications sont toujours ici.');
    } finally {
      setSaving(false);
    }
  }
  async function remove() {
    setSaving(true);
    setError('');
    try {
      if (
        await store.update((draft) => {
          draft.preferences.moodEntries = draft.preferences.moodEntries.filter(
            (item) => item.date !== day,
          );
        })
      )
        notify(moodCopy.removed);
      else setError('La suppression n’a pas pu être enregistrée. Réessayez.');
    } finally {
      setSaving(false);
      setRemoving(false);
    }
  }
  return (
    <form
      className={styles.checkIn}
      aria-label="Point d’humeur"
      onSubmit={(event) => {
        event.preventDefault();
        void save();
      }}
    >
      <MoodChoices value={mood} onChange={setMood} disabled={saving || future} />
      <Field label="Votre énergie" hint="Facultatif : de très basse à élevée.">
        <select
          aria-label="Votre énergie"
          value={energy ?? ''}
          onChange={(event) => setEnergy(event.target.value ? Number(event.target.value) : null)}
          disabled={saving || future}
        >
          <option value="">Non renseignée</option>
          {moodCopy.energy.map((label, index) => (
            <option key={label} value={index + 1}>
              {index + 1}/5 · {label}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Quelques mots sur votre journée" hint={`${note.length}/280 · Facultatif`}>
        <textarea
          aria-label="Quelques mots sur votre journée"
          rows={3}
          maxLength={280}
          value={note}
          disabled={saving || future}
          placeholder="Ce qui vous a aidé, pesé, ou simplement fait sourire…"
          onChange={(event) => setNote(event.target.value)}
        />
      </Field>
      <p className={styles.privacy}>
        <LockKeyhole size={14} />
        {moodCopy.privacy}
      </p>
      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}
      <div className={styles.formRow}>
        <Button type="submit" disabled={mood === null || saving || future || unchanged}>
          <Check size={15} />
          {saving ? 'Enregistrement…' : unchanged ? 'Point enregistré' : 'Enregistrer mon humeur'}
        </Button>
        {entry && (
          <Button type="button" variant="ghost" disabled={saving} onClick={() => setRemoving(true)}>
            <Trash2 size={14} />
            Supprimer
          </Button>
        )}
      </div>
      {removing && (
        <div className={styles.context} role="group" aria-label="Supprimer le point d’humeur">
          <p>Supprimer l’humeur, l’énergie et la note du {formatMoodDay(day)} ?</p>
          <div className="row wrap">
            <Button type="button" variant="danger" disabled={saving} onClick={() => void remove()}>
              Confirmer la suppression
            </Button>
            <Button
              type="button"
              variant="ghost"
              disabled={saving}
              onClick={() => setRemoving(false)}
            >
              Annuler
            </Button>
          </div>
        </div>
      )}
      <div className={styles.context}>
        <strong>{minutesLabel(focus)} de concentration terminée ce jour</strong>
        <p>
          Un repère pour relire votre journée. Votre humeur ne change pas vos objectifs ni vos
          statistiques.
        </p>
      </div>
    </form>
  );
}

export function MoodPage() {
  const { store } = useApp();
  const preferences = store.data.preferences;
  const today = dateKey(new Date(), preferences.timeZone);
  const [day, setDay] = useState(today);
  const [month, setMonth] = useState(today.slice(0, 7));
  const dateInput = useRef<HTMLInputElement>(null);
  const entry = preferences.moodEntries.find((item) => item.date === day);
  const calendar = moodMonth(month, preferences.weekStartsOn);
  const entries = preferences.moodEntries.filter(
    (item) => item.date.slice(0, 7) === month && item.date <= today,
  );
  const byDate = new Map(entries.map((item) => [item.date, item]));
  const energies = entries.filter((item) => item.energy !== null);
  const energy = energies.length
    ? energies.reduce((sum, item) => sum + item.energy!, 0) / energies.length
    : null;
  function chooseDay(value: string) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || value < '0001-01-01' || value > today) return;
    const parsed = new Date(`${value}T12:00:00Z`);
    if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) return;
    setDay(value);
    setMonth(value.slice(0, 7));
  }
  return (
    <div className={styles.page}>
      <div className={styles.layout}>
        <Panel
          title={day === today ? 'Mon point du jour' : formatMoodDay(day)}
          subtitle="Une entrée par jour, à compléter ou modifier quand vous le souhaitez."
        >
          <Field label="Date du point d’humeur">
            <input
              ref={dateInput}
              type="date"
              min="0001-01-01"
              max={today}
              value={day}
              onChange={(event) => chooseDay(event.target.value)}
            />
          </Field>
          <MoodForm key={`${day}:${entry?.updatedAt || 'new'}`} day={day} entry={entry} />
        </Panel>
        <Panel
          title="Mon calendrier d’humeur"
          subtitle="Choisissez un jour pour relire votre point ou en ajouter un."
          className={styles.calendar}
        >
          <div className={styles.calendarHeader}>
            <h3>
              {new Intl.DateTimeFormat('fr-FR', {
                timeZone: 'UTC',
                month: 'long',
                year: 'numeric',
              }).format(new Date(`${month}-01T12:00:00Z`))}
            </h3>
            <div className={styles.calendarControls}>
              <IconButton
                label="Mois d’humeur précédent"
                disabled={month === '0001-01'}
                onClick={() => setMonth(shiftActivityMonth(month, -1))}
              >
                <ChevronLeft size={17} />
              </IconButton>
              <input
                type="month"
                aria-label="Mois du suivi d’humeur"
                min="0001-01"
                max={today.slice(0, 7)}
                value={month}
                onChange={(event) => {
                  const value = event.target.value;
                  if (
                    /^\d{4}-(0[1-9]|1[0-2])$/.test(value) &&
                    value >= '0001-01' &&
                    value <= today.slice(0, 7)
                  )
                    setMonth(value);
                }}
              />
              <IconButton
                label="Mois d’humeur suivant"
                disabled={month >= today.slice(0, 7)}
                onClick={() => setMonth(shiftActivityMonth(month, 1))}
              >
                <ChevronRight size={17} />
              </IconButton>
            </div>
            <Button variant="ghost" onClick={() => chooseDay(today)}>
              Aujourd’hui
            </Button>
          </div>
          <div className={styles.grid} role="group" aria-label="Jours du suivi d’humeur">
            {Array.from({ length: 7 }, (_, index) => (
              <span key={index} className={styles.weekday} aria-hidden="true">
                {
                  ['dim.', 'lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.'][
                    (preferences.weekStartsOn + index) % 7
                  ]
                }
              </span>
            ))}
            {Array.from({ length: calendar.leading }, (_, index) => (
              <span key={`blank-${index}`} aria-hidden="true" />
            ))}
            {calendar.days.map((date) => {
              const record = byDate.get(date);
              return (
                <button
                  type="button"
                  className={styles.day}
                  key={date}
                  data-mood-day={date}
                  data-recorded={Boolean(record)}
                  aria-label={`${formatMoodDay(date)} : ${record ? moodCopy.moods[record.mood - 1] : 'non renseigné'}`}
                  aria-pressed={date === day}
                  aria-current={date === today ? 'date' : undefined}
                  disabled={date > today}
                  onClick={() => chooseDay(date)}
                >
                  <span>{Number(date.slice(-2))}</span>
                  {record ? (
                    <MoodIcon value={record.mood} size={18} />
                  ) : (
                    <span className={styles.unrecorded} aria-hidden="true">
                      —
                    </span>
                  )}
                </button>
              );
            })}
          </div>
          <div className={styles.monthSummary}>
            <span>
              <strong>{entries.length}</strong> jour{entries.length > 1 ? 's' : ''} renseigné
              {entries.length > 1 ? 's' : ''}
            </span>
            {energy !== null && (
              <span>
                <BatteryMedium size={14} aria-hidden="true" /> Énergie moyenne :{' '}
                <strong>{energy.toLocaleString('fr-FR', { maximumFractionDigits: 1 })}/5</strong>
              </span>
            )}
          </div>
          <p className="helper">
            Les jours vides restent vides. Prenez ce moment quand il vous est utile, sans série à
            maintenir.
          </p>
        </Panel>
      </div>
      <Panel title="Mes derniers points" subtitle="Vos sept dernières entrées du mois affiché.">
        {entries.length ? (
          <ul className={styles.history}>
            {[...entries]
              .sort((a, b) => b.date.localeCompare(a.date))
              .slice(0, 7)
              .map((item) => (
                <li key={item.date}>
                  <button
                    type="button"
                    onClick={() => {
                      chooseDay(item.date);
                      dateInput.current?.focus();
                    }}
                  >
                    <MoodIcon value={item.mood} />
                    <div className={styles.historyText}>
                      <strong>
                        {moodCopy.moods[item.mood - 1]}
                        {item.energy ? ` · Énergie ${item.energy}/5` : ''}
                      </strong>
                      <span>{item.note || 'Sans note'}</span>
                    </div>
                    <span className={styles.historyDate}>{formatMoodDay(item.date, true)}</span>
                    <ArrowRight size={15} />
                  </button>
                </li>
              ))}
          </ul>
        ) : (
          <p className="helper">Aucun point ce mois-ci. Votre première entrée apparaîtra ici.</p>
        )}
      </Panel>
    </div>
  );
}
