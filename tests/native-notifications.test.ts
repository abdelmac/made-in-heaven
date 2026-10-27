import { beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  LocalNotificationSchema,
  LocalNotificationsPlugin,
} from '@capacitor/local-notifications';
import {
  buildNativeTimerNotification,
  createNativeTimerNotifier,
  NATIVE_TIMER_NOTIFICATION_ID,
  type NativeTimerNotificationInput,
} from '../src/lib/native-notifications';

const now = Date.UTC(2026, 9, 27, 9);
const timerInput = (
  overrides: Partial<NativeTimerNotificationInput> = {},
): NativeTimerNotificationInput => ({
  timer: {
    status: 'running',
    phase: 'focus',
    sessionId: 'session-1',
    endAt: new Date(now + 25 * 60_000).toISOString(),
  },
  workspaceId: 'workspace-1',
  userId: 'user-1',
  enabled: true,
  ready: true,
  sound: true,
  ...overrides,
});

type Plugin = Pick<
  LocalNotificationsPlugin,
  | 'checkPermissions'
  | 'checkExactNotificationSetting'
  | 'getPending'
  | 'cancel'
  | 'schedule'
  | 'createChannel'
>;

function fixture() {
  let pending: LocalNotificationSchema[] = [];
  const plugin = {
    checkPermissions: vi.fn(async () => ({ display: 'granted' as const })),
    checkExactNotificationSetting: vi.fn(async () => ({ exact_alarm: 'denied' as const })),
    getPending: vi.fn(async () => ({ notifications: pending })),
    cancel: vi.fn(async ({ notifications }: { notifications: { id: number }[] }) => {
      const ids = new Set(notifications.map((value) => value.id));
      pending = pending.filter((value) => !ids.has(value.id));
    }),
    schedule: vi.fn(async ({ notifications }: { notifications: LocalNotificationSchema[] }) => {
      pending = [
        ...pending.filter((value) => !notifications.some((item) => item.id === value.id)),
        ...notifications,
      ];
      return { notifications: notifications.map(({ id }) => ({ id })) };
    }),
    createChannel: vi.fn(async () => undefined),
  } satisfies Plugin;
  return {
    plugin,
    pending: () => pending,
    seed: (items: LocalNotificationSchema[]) => {
      pending = items;
    },
  };
}

beforeEach(() => vi.clearAllMocks());

describe('native timer notification plan', () => {
  it('uses the real deadline and keeps task details off the lock screen', () => {
    const planned = buildNativeTimerNotification(timerInput(), now)!;
    expect(planned.schedule?.at?.getTime()).toBe(now + 25 * 60_000);
    expect(planned.id).toBe(NATIVE_TIMER_NOTIFICATION_ID);
    expect(planned.body).toContain('La prochaine séance commencera quand vous serez prêt');
    expect(Object.keys(planned.extra)).toEqual(['solaceTimerKey']);
    expect(planned.schedule?.allowWhileIdle).toBe(true);
  });

  it('does not reschedule an elapsed, idle, paused or disabled timer on resume', () => {
    const input = timerInput();
    for (const candidate of [
      { ...input, ready: false },
      { ...input, enabled: false },
      { ...input, timer: { ...input.timer, status: 'idle' as const } },
      { ...input, timer: { ...input.timer, status: 'paused' as const, endAt: null } },
      { ...input, timer: { ...input.timer, endAt: 'invalid' } },
      { ...input, timer: { ...input.timer, endAt: new Date(now).toISOString() } },
      { ...input, timer: { ...input.timer, sessionId: null } },
    ]) {
      expect(buildNativeTimerNotification(candidate, now)).toBeNull();
    }
  });
});

describe('native notification lifecycle', () => {
  it('restores one pending deadline after a cold start without duplicates', async () => {
    const test = fixture();
    const input = timerInput();
    test.seed([buildNativeTimerNotification(input, now)!]);
    const notifier = createNativeTimerNotifier(test.plugin, 'android', () => now);
    await notifier.reconcile(input);
    expect(test.plugin.schedule).not.toHaveBeenCalled();
    expect(test.plugin.cancel).not.toHaveBeenCalled();
    expect(test.plugin.checkPermissions).toHaveBeenCalledOnce();
  });

  it('schedules the OS reminder once and cancels on pause without touching other reminders', async () => {
    const test = fixture();
    test.seed([{ id: 123, title: 'A future reminder', body: 'Unrelated' }]);
    const notifier = createNativeTimerNotifier(test.plugin, 'android', () => now);
    const input = timerInput();
    await notifier.reconcile(input);
    await notifier.reconcile(input);
    expect(test.plugin.schedule).toHaveBeenCalledOnce();
    expect(test.pending()).toHaveLength(2);
    await notifier.reconcile({
      ...input,
      timer: { ...input.timer, status: 'paused', endAt: null },
    });
    expect(test.pending()).toEqual([{ id: 123, title: 'A future reminder', body: 'Unrelated' }]);
  });

  it('replaces reminders across account/workspace changes, changed deadlines and sound preference', async () => {
    const test = fixture();
    const notifier = createNativeTimerNotifier(test.plugin, 'android', () => now);
    const input = timerInput();
    await notifier.reconcile(input);
    const previous = test.pending()[0].extra.solaceTimerKey;
    await notifier.reconcile({
      ...input,
      userId: 'user-2',
      workspaceId: 'workspace-2',
      sound: false,
    });
    expect(test.pending()).toHaveLength(1);
    expect(test.pending()[0].extra.solaceTimerKey).not.toBe(previous);
    expect(test.pending()[0].channelId).toBe('solace-timer-silent-v2');
    expect(test.pending()[0].sound).toBeUndefined();
    expect(test.plugin.createChannel).toHaveBeenLastCalledWith(
      expect.objectContaining({
        id: 'solace-timer-silent-v2',
        importance: 2,
        vibration: false,
      }),
    );
    const changed = {
      ...input,
      timer: { ...input.timer, endAt: new Date(now + 60_000).toISOString() },
    };
    await notifier.reconcile(changed);
    expect(test.pending()[0].schedule?.at?.getTime()).toBe(now + 60_000);
    await notifier.reconcile({ ...changed, enabled: false });
    expect(test.pending()).toEqual([]);
  });

  it('leaves cold-start reminders untouched until the persisted workspace has loaded', async () => {
    const test = fixture();
    const input = timerInput();
    test.seed([buildNativeTimerNotification(input, now)!]);
    const notifier = createNativeTimerNotifier(test.plugin, 'ios', () => now);
    await notifier.reconcile({ ...input, ready: false });
    expect(test.plugin.getPending).not.toHaveBeenCalled();
    expect(test.pending()).toHaveLength(1);
  });

  it('uses inexact scheduling without prompting, then upgrades the same timer after explicit permission changes', async () => {
    const test = fixture();
    let exact = false;
    const plugin: Plugin = {
      ...test.plugin,
      checkExactNotificationSetting: vi.fn(async () => ({
        exact_alarm: exact ? ('granted' as const) : ('denied' as const),
      })),
    };
    const notifier = createNativeTimerNotifier(plugin, 'android', () => now);
    const input = timerInput();
    await notifier.reconcile(input);
    const approximate = test.pending()[0];
    expect(approximate.isExactNotification).toBe(false);
    expect(test.plugin.schedule).toHaveBeenCalledOnce();

    exact = true;
    await notifier.reconcile(input);
    const precise = test.pending()[0];
    expect(precise.isExactNotification).toBe(true);
    expect(precise.schedule?.at).toEqual(approximate.schedule?.at);
    expect(precise.extra.solaceTimerKey).not.toBe(approximate.extra.solaceTimerKey);
    expect(test.plugin.schedule).toHaveBeenCalledTimes(2);
    await notifier.reconcile(input);
    expect(test.plugin.schedule).toHaveBeenCalledTimes(2);

    exact = false;
    await notifier.reconcile(input);
    expect(test.pending()[0].isExactNotification).toBe(false);
    // The adapter exposes no method that can open the Android settings screen.
  });

  it('still schedules silently when reading Android precision settings fails', async () => {
    const test = fixture();
    test.plugin.checkExactNotificationSetting.mockRejectedValue(new Error('OS unavailable'));
    const notifier = createNativeTimerNotifier(test.plugin, 'android', () => now);
    await notifier.reconcile({ ...timerInput(), sound: false });
    expect(test.pending()[0]).toMatchObject({
      channelId: 'solace-timer-silent-v2',
      isExactNotification: false,
    });
    expect(test.plugin.createChannel).toHaveBeenCalledWith(
      expect.objectContaining({ importance: 2, vibration: false }),
    );
  });

  it('cancels a previously scheduled reminder if display permission is revoked', async () => {
    const test = fixture();
    test.seed([buildNativeTimerNotification(timerInput(), now)!]);
    const plugin: Plugin = {
      ...test.plugin,
      checkPermissions: vi.fn(async () => ({ display: 'denied' as const })),
    };
    const notifier = createNativeTimerNotifier(plugin, 'ios', () => now);
    await notifier.reconcile(timerInput());
    expect(test.pending()).toEqual([]);
    expect(test.plugin.schedule).not.toHaveBeenCalled();
    // The scheduling adapter has no requestPermissions method: reconciliation
    // cannot initiate permission or exact-alarm prompts.
  });

  it('a pause queued during native scheduling always cancels the late operation', async () => {
    const test = fixture();
    let release!: () => void;
    const barrier = new Promise<void>((resolve) => {
      release = resolve;
    });
    const schedule = test.plugin.schedule;
    const started = vi.fn();
    const plugin: Plugin = {
      ...test.plugin,
      schedule: async (options) => {
        started();
        await barrier;
        return schedule(options);
      },
    };
    const notifier = createNativeTimerNotifier(plugin, 'android', () => now);
    const input = timerInput();
    const start = notifier.reconcile(input);
    await vi.waitFor(() => expect(started).toHaveBeenCalledOnce());
    const pause = notifier.reconcile({
      ...input,
      timer: { ...input.timer, status: 'paused', endAt: null },
    });
    release();
    await Promise.all([start, pause]);
    expect(test.pending()).toEqual([]);
  });

  it('recovers after a plugin failure so a later timer change can still cancel reminders', async () => {
    const test = fixture();
    test.plugin.schedule.mockRejectedValueOnce(new Error('Device interrupted'));
    const notifier = createNativeTimerNotifier(test.plugin, 'android', () => now);
    await expect(notifier.reconcile(timerInput())).rejects.toThrow('Device interrupted');
    await notifier.reconcile(timerInput());
    expect(test.pending()).toHaveLength(1);
    await notifier.reconcile({ ...timerInput(), enabled: false });
    expect(test.pending()).toEqual([]);
  });
});
