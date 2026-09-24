import { describe, expect, it } from 'vitest';
import { createEmptyData, id, LOCAL_USER_ID, type FocusSession, type MoodEntry } from '@/lib/model';
import { moodFocusMinutes, moodMonth, saveMoodEntry } from '@/lib/mood';

const entry: MoodEntry = {
  date: '2026-09-24',
  mood: 4,
  energy: 3,
  note: 'Une petite avancée.',
  updatedAt: '2026-09-24T12:00:00Z',
};

describe('personal mood history', () => {
  it('handles leap days, week starts and month boundaries without borrowing other days', () => {
    expect(moodMonth('2024-02', 1)).toMatchObject({ leading: 3 });
    expect(moodMonth('2024-02', 1).days).toHaveLength(29);
    expect(moodMonth('2024-02', 1).days.at(-1)).toBe('2024-02-29');
    expect(moodMonth('2026-02', 0).leading).toBe(0);
    expect(moodMonth('2026-02', 1).leading).toBe(6);
    expect(moodMonth('2026-12', 1).days.at(-1)).toBe('2026-12-31');
    expect(() => moodMonth('2026-13', 1)).toThrow();
  });
  it('replaces just the selected day without mutating or pruning other entries', () => {
    const previous = { ...entry, date: '2026-09-22' };
    const input = [entry, previous];
    const changed = { ...entry, mood: 2, note: 'Un autre regard.' };
    expect(saveMoodEntry(input, changed, '2026-09-24')).toEqual([previous, changed]);
    expect(input).toEqual([entry, previous]);
    expect(() => saveMoodEntry(input, { ...entry, date: '2026-09-25' }, '2026-09-24')).toThrow();
  });
  it('shows only actual completed focus for this user, workspace and zoned day', () => {
    const data = createEmptyData();
    data.preferences.timeZone = 'Europe/Paris';
    const session: FocusSession = {
      id: id(),
      workspaceId: data.workspaceId,
      userId: LOCAL_USER_ID,
      phase: 'focus',
      status: 'completed',
      startedAt: '2026-09-23T22:00:00Z',
      endedAt: '2026-09-23T22:15:00Z',
      actualSeconds: 900,
      durationMinutes: 25,
      context: { workspaceId: data.workspaceId, userId: LOCAL_USER_ID },
    };
    data.focusSessions = [
      session,
      { ...session, id: id(), userId: id() },
      { ...session, id: id(), workspaceId: id() },
      { ...session, id: id(), phase: 'shortBreak' },
      { ...session, id: id(), status: 'interrupted' },
      { ...session, id: id(), endedAt: '2026-09-24T21:00:00Z' },
      { ...session, id: id(), endedAt: '2026-09-23T21:00:00Z' },
    ];
    expect(
      moodFocusMinutes(data, LOCAL_USER_ID, '2026-09-24', new Date('2026-09-24T12:00:00Z')),
    ).toBe(15);
    expect(data.preferences.moodEntries).toEqual([]);
  });
});
