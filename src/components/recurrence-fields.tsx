'use client';

import { MAX_REPEAT_COUNT, type RepeatOptions } from '@/lib/recurrence';
import { Field } from './ui';

export function RecurrenceFields({
  value,
  onChange,
  task = false,
}: {
  value: RepeatOptions;
  onChange: (value: RepeatOptions) => void;
  task?: boolean;
}) {
  return (
    <>
      <div className="form-grid">
        <Field label="Répéter">
          <select
            value={value.frequency}
            onChange={(event) =>
              onChange({ ...value, frequency: event.target.value as RepeatOptions['frequency'] })
            }
          >
            <option value="none">Ne pas répéter</option>
            <option value="daily">Chaque jour</option>
            <option value="weekly">Chaque semaine</option>
          </select>
        </Field>
        {value.frequency !== 'none' && (
          <Field label="Nombre d'occurrences (première incluse)">
            <input
              type="number"
              min={2}
              max={MAX_REPEAT_COUNT}
              required
              value={value.count}
              onChange={(event) => onChange({ ...value, count: Number(event.target.value) })}
            />
          </Field>
        )}
      </div>
      {value.frequency !== 'none' && (
        <p className="helper">
          {value.count} {task ? 'tâches' : 'séances'} seront créées, première incluse.
          {task
            ? " La date d'échéance sert de première date."
            : " L'heure locale est conservée, même lors du changement d'heure."}{' '}
          Chaque occurrence se modifie et se supprime séparément. La répétition s’arrête après ce
          nombre d’occurrences.
        </p>
      )}
    </>
  );
}
