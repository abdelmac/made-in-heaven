export const HOME_TIMER_STORAGE_KEY = 'solace.home-timer.v1';
export const HOME_TIMER_DURATIONS = { focus: 25 * 60_000, break: 5 * 60_000 } as const;

export type HomeTimerPhase = keyof typeof HOME_TIMER_DURATIONS;
export type HomeTimerState = {
  version: 1;
  phase: HomeTimerPhase;
  status: 'idle' | 'running' | 'paused' | 'complete';
  remainingMs: number;
  deadline: number | null;
};

export function createHomeTimer(phase: HomeTimerPhase = 'focus'): HomeTimerState {
  return {
    version: 1,
    phase,
    status: 'idle',
    remainingMs: HOME_TIMER_DURATIONS[phase],
    deadline: null,
  };
}

export function homeTimerRemaining(timer: HomeTimerState, now: number): number {
  return timer.status === 'running' && timer.deadline !== null
    ? Math.max(0, Math.min(timer.remainingMs, timer.deadline - now))
    : timer.remainingMs;
}

export function refreshHomeTimer(timer: HomeTimerState, now: number): HomeTimerState {
  if (timer.status === 'running' && homeTimerRemaining(timer, now) === 0) {
    return { ...timer, status: 'complete', remainingMs: 0, deadline: null };
  }
  return timer;
}

export function startHomeTimer(timer: HomeTimerState, now: number): HomeTimerState {
  if (timer.status === 'running') return refreshHomeTimer(timer, now);
  const remainingMs = timer.remainingMs || HOME_TIMER_DURATIONS[timer.phase];
  return { ...timer, status: 'running', remainingMs, deadline: now + remainingMs };
}

export function pauseHomeTimer(timer: HomeTimerState, now: number): HomeTimerState {
  const current = refreshHomeTimer(timer, now);
  if (current.status !== 'running') return current;
  return {
    ...current,
    status: 'paused',
    remainingMs: homeTimerRemaining(current, now),
    deadline: null,
  };
}

/** Only this browser tab's practice timer is restored; workspace data is never read. */
export function parseHomeTimer(raw: string | null, now: number): HomeTimerState | null {
  if (!raw) return null;
  try {
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    const timer = value as Record<string, unknown>;
    if (
      timer.version !== 1 ||
      (timer.phase !== 'focus' && timer.phase !== 'break') ||
      typeof timer.status !== 'string' ||
      !['idle', 'running', 'paused', 'complete'].includes(timer.status) ||
      typeof timer.remainingMs !== 'number' ||
      !Number.isSafeInteger(timer.remainingMs) ||
      timer.remainingMs < 0 ||
      timer.remainingMs > HOME_TIMER_DURATIONS[timer.phase]
    ) {
      return null;
    }
    if (timer.status === 'running') {
      if (
        typeof timer.deadline !== 'number' ||
        !Number.isSafeInteger(timer.deadline) ||
        timer.deadline <= 0 ||
        timer.deadline > now + HOME_TIMER_DURATIONS[timer.phase] ||
        timer.remainingMs === 0
      ) {
        return null;
      }
    } else if (timer.deadline !== null) {
      return null;
    }
    if (
      (timer.status === 'idle' && timer.remainingMs !== HOME_TIMER_DURATIONS[timer.phase]) ||
      (timer.status === 'paused' && timer.remainingMs === 0) ||
      (timer.status === 'complete' && timer.remainingMs !== 0)
    ) {
      return null;
    }
    return refreshHomeTimer(timer as HomeTimerState, now);
  } catch {
    return null;
  }
}
