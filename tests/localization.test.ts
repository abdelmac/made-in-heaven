import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { DEFAULT_PREFERENCES } from '@/lib/model';
import { dateKey, formatDay, formatTime } from '@/lib/display';
import { localizeError } from '@/lib/i18n/errors';

const preferences = { ...DEFAULT_PREFERENCES, timeZone: 'Europe/Paris' };

describe('French display dates', () => {
  it('localizes month and day names while preserving ISO storage keys and the workspace time zone', () => {
    const instant = '2026-09-15T22:30:00Z';
    expect(dateKey(instant, preferences.timeZone)).toBe('2026-09-16');
    expect(
      formatDay(instant, preferences, { weekday: 'long', day: 'numeric', month: 'long' }),
    ).toBe('mercredi 16 septembre');
    expect(formatTime(instant, { ...preferences, timeFormat: '24h' })).toBe('00:30');
  });

  it('retains explicitly chosen numeric date formats for existing preferences', () => {
    const instant = '2026-09-16T12:00:00Z';
    expect(formatDay(instant, { ...preferences, dateFormat: 'dd/MM/yyyy' })).toBe('16/09/2026');
    expect(formatDay(instant, { ...preferences, dateFormat: 'MM/dd/yyyy' })).toBe('09/16/2026');
    expect(formatDay(instant, { ...preferences, dateFormat: 'yyyy-MM-dd' })).toBe('2026-09-16');
    expect(formatDay(instant, { ...preferences, dateFormat: 'MMM d, yyyy' })).toBe('16 sept. 2026');
  });
});

describe('presentation error localization', () => {
  it('presents actual Zod issue messages in French without exposing the internal JSON', () => {
    const parsed = z
      .object({ title: z.string().min(1), duration: z.number().max(180) })
      .safeParse({ title: '', duration: 300 });
    expect(parsed.success).toBe(false);
    if (parsed.success) return;
    expect(localizeError(parsed.error.message)).toBe(
      'Saisissez au moins 1 caractère(s). La valeur doit être inférieure ou égale à 180.',
    );
  });

  it('keeps actionable conflict details, existing French messages and unrecognized text', () => {
    expect(localizeError('Planned sessions overlap for the same person.')).toBe(
      'Des séances prévues se chevauchent pour la même personne.',
    );
    expect(localizeError('Votre connexion a expiré.')).toBe('Votre connexion a expiré.');
    expect(localizeError('Customer-provided status')).toBe('Customer-provided status');
    expect(localizeError('toString')).toBe('toString');
  });
});
