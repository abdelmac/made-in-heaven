import { describe, expect, it } from 'vitest';
import {
  createHomeTimer,
  HOME_TIMER_DURATIONS,
  homeTimerRemaining,
  parseHomeTimer,
  pauseHomeTimer,
  refreshHomeTimer,
  startHomeTimer,
} from '../src/lib/home-timer';

const now = Date.UTC(2026, 8, 27, 12);

describe('home practice timer', () => {
  it('uses a deadline so a background tab catches up without ticking every second', () => {
    const timer = startHomeTimer(createHomeTimer(), now);
    expect(homeTimerRemaining(timer, now + 12 * 60_000)).toBe(13 * 60_000);
    expect(refreshHomeTimer(timer, now + 30 * 60_000)).toMatchObject({
      phase: 'focus',
      status: 'complete',
      remainingMs: 0,
      deadline: null,
    });
  });

  it('keeps precise remaining time on pause and does not count paused time', () => {
    const started = startHomeTimer(createHomeTimer(), now);
    const paused = pauseHomeTimer(started, now + 27_450);
    expect(paused.status).toBe('paused');
    expect(homeTimerRemaining(paused, now + 60 * 60_000)).toBe(25 * 60_000 - 27_450);
    const resumed = startHomeTimer(paused, now + 60 * 60_000);
    expect(homeTimerRemaining(resumed, now + 60 * 60_000 + 550)).toBe(25 * 60_000 - 28_000);
  });

  it('restores running and paused sessions across refresh, including elapsed sessions', () => {
    const timer = startHomeTimer(createHomeTimer('break'), now);
    const restored = parseHomeTimer(JSON.stringify(timer), now + 100_000)!;
    expect(homeTimerRemaining(restored, now + 100_000)).toBe(200_000);
    expect(parseHomeTimer(JSON.stringify(timer), now + 300_000)?.status).toBe('complete');
    const paused = pauseHomeTimer(timer, now + 5_000);
    expect(parseHomeTimer(JSON.stringify(paused), now + 86_400_000)).toEqual(paused);
  });

  it('finishes when paused after the deadline and never automatically starts another phase', () => {
    const timer = startHomeTimer(createHomeTimer('break'), now);
    expect(pauseHomeTimer(timer, now + 300_001)).toEqual({
      ...createHomeTimer('break'),
      remainingMs: 0,
      status: 'complete',
    });
  });

  it('does not extend a running session on repeated start or a backwards clock change', () => {
    const timer = startHomeTimer(createHomeTimer(), now);
    expect(startHomeTimer(timer, now + 10_000)).toBe(timer);
    expect(homeTimerRemaining(timer, now - 60_000)).toBe(HOME_TIMER_DURATIONS.focus);
  });

  it('resets each mode to its own duration and can explicitly restart a completed timer', () => {
    const focus = createHomeTimer();
    const pause = createHomeTimer('break');
    expect(focus.remainingMs).toBe(1_500_000);
    expect(pause.remainingMs).toBe(300_000);
    const complete = refreshHomeTimer(startHomeTimer(pause, now), now + 300_000);
    expect(startHomeTimer(complete, now + 400_000).deadline).toBe(now + 700_000);
  });

  it('ignores malformed, unsupported and inconsistent persisted state', () => {
    const timer = createHomeTimer();
    for (const invalid of [
      null,
      '{broken',
      JSON.stringify([]),
      JSON.stringify({ ...timer, version: 2 }),
      JSON.stringify({ ...timer, phase: 'unknown' }),
      JSON.stringify({ ...timer, status: ['idle'] }),
      JSON.stringify({ ...timer, remainingMs: -1 }),
      JSON.stringify({ ...timer, remainingMs: 0.5 }),
      JSON.stringify({ ...timer, remainingMs: 1_500_001 }),
      JSON.stringify({ ...timer, remainingMs: 100 }),
      JSON.stringify({ ...timer, status: 'paused', remainingMs: 0 }),
      JSON.stringify({ ...timer, status: 'complete' }),
      JSON.stringify({ ...timer, status: 'running', deadline: null }),
      JSON.stringify({ ...timer, status: 'running', deadline: 'tomorrow' }),
      JSON.stringify({ ...timer, status: 'running', deadline: now + 1_500_001 }),
      JSON.stringify({ ...timer, status: 'paused', deadline: now }),
    ]) {
      expect(parseHomeTimer(invalid, now)).toBeNull();
    }
  });
});
