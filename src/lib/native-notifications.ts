import { Capacitor } from '@capacitor/core';
import type {
  LocalNotificationSchema,
  LocalNotificationsPlugin,
} from '@capacitor/local-notifications';
import type { TimerState } from './model';
import { isNativeApp } from './mobile-platform';

// One reserved identifier follows the active timer across pauses, account changes,
// and restarts. Other future reminder types must use their own identifiers.
export const NATIVE_TIMER_NOTIFICATION_ID = 7_301_025;
const SOUND_CHANNEL = 'solace-timer-sound';
// Android channels keep their original importance/sound settings. Version this
// identifier so a development install cannot retain the earlier audible channel.
const SILENT_CHANNEL = 'solace-timer-silent-v2';

export type NativeTimerNotificationInput = {
  timer: Pick<TimerState, 'status' | 'phase' | 'sessionId' | 'endAt'>;
  workspaceId: string;
  userId: string;
  enabled: boolean;
  ready: boolean;
  sound: boolean;
};

export type NativeNotificationPermission = {
  granted: boolean;
  exact: boolean;
  message?: string;
};

type TimerNotificationsPlugin = Pick<
  LocalNotificationsPlugin,
  | 'checkPermissions'
  | 'checkExactNotificationSetting'
  | 'getPending'
  | 'cancel'
  | 'schedule'
  | 'createChannel'
>;

export function buildNativeTimerNotification(
  input: NativeTimerNotificationInput,
  now: number,
  exact = false,
): LocalNotificationSchema | null {
  const { timer } = input;
  const endAt = timer.endAt ? Date.parse(timer.endAt) : Number.NaN;
  if (
    !input.ready ||
    !input.enabled ||
    timer.status !== 'running' ||
    !timer.sessionId ||
    !Number.isFinite(endAt) ||
    endAt <= now
  ) {
    return null;
  }

  return {
    id: NATIVE_TIMER_NOTIFICATION_ID,
    title: timer.phase === 'focus' ? 'Solace — Séance terminée' : 'Solace — Pause terminée',
    body:
      timer.phase === 'focus'
        ? 'Prenez une pause. La prochaine séance commencera quand vous serez prêt.'
        : 'Votre pause est terminée. Reprenez à votre rythme.',
    schedule: { at: new Date(endAt), allowWhileIdle: true },
    // Recent plugins open Android's precision screen when this defaults to true.
    // A normal timer restore must never request that optional setting itself.
    isExactNotification: exact,
    channelId: input.sound ? SOUND_CHANNEL : SILENT_CHANNEL,
    ...(input.sound ? { sound: 'solace_timer.wav' } : {}),
    smallIcon: 'ic_stat_solace',
    iconColor: '#2F6547',
    // Lock-screen text deliberately omits private subjects, tasks, and notes.
    extra: {
      solaceTimerKey: JSON.stringify([
        'v2',
        input.userId,
        input.workspaceId,
        timer.sessionId,
        timer.endAt,
        timer.phase,
        input.sound,
        exact,
      ]),
    },
  };
}

/** Serialize native operations so a late schedule cannot outlive a newer pause. */
export function createNativeTimerNotifier(
  plugin: TimerNotificationsPlugin,
  platform: string,
  now: () => number = Date.now,
) {
  let queued: Promise<void> = Promise.resolve();
  let latest = 0;

  return {
    reconcile(input: NativeTimerNotificationInput): Promise<void> {
      const revision = ++latest;
      queued = queued
        .catch(() => undefined)
        .then(async () => {
          if (revision !== latest || !input.ready) return;
          let planned = buildNativeTimerNotification(input, now());
          const { notifications } = await plugin.getPending();
          if (revision !== latest) return;
          const pending = notifications.find((item) => item.id === NATIVE_TIMER_NOTIFICATION_ID);

          if (!planned) {
            if (pending)
              await plugin.cancel({ notifications: [{ id: NATIVE_TIMER_NOTIFICATION_ID }] });
            return;
          }

          // schedule() can itself prompt in recent plugin versions. Only call it
          // after a permission check; prompts belong to the explicit Settings action.
          const permission = await plugin.checkPermissions();
          if (revision !== latest) return;
          if (permission.display !== 'granted') {
            if (pending)
              await plugin.cancel({ notifications: [{ id: NATIVE_TIMER_NOTIFICATION_ID }] });
            return;
          }
          let exact = false;
          if (platform === 'android') {
            try {
              exact = (await plugin.checkExactNotificationSetting()).exact_alarm === 'granted';
            } catch {
              // Schedule approximately when the optional setting is unavailable.
            }
          }
          if (revision !== latest) return;
          planned = buildNativeTimerNotification(input, now(), exact);
          if (!planned) {
            if (pending)
              await plugin.cancel({ notifications: [{ id: NATIVE_TIMER_NOTIFICATION_ID }] });
            return;
          }
          if (pending?.extra?.solaceTimerKey === planned.extra?.solaceTimerKey) return;
          if (pending)
            await plugin.cancel({ notifications: [{ id: NATIVE_TIMER_NOTIFICATION_ID }] });
          if (revision !== latest) return;

          if (platform === 'android') {
            await plugin.createChannel({
              id: input.sound ? SOUND_CHANNEL : SILENT_CHANNEL,
              name: input.sound ? 'Fin des séances' : 'Fin des séances sans son',
              description: 'Rappels du minuteur de concentration et des pauses.',
              // LOW keeps the notification visible without the default channel
              // sound; simply omitting `sound` leaves Android's default audible.
              importance: input.sound ? 4 : 2,
              visibility: 0,
              vibration: input.sound,
              ...(input.sound ? { sound: 'solace_timer.wav' } : {}),
            });
          }
          if (revision !== latest) return;
          await plugin.schedule({ notifications: [planned] });
        });
      return queued;
    },
  };
}

let notifier: ReturnType<typeof createNativeTimerNotifier> | undefined;

export async function reconcileNativeTimerNotification(input: NativeTimerNotificationInput) {
  if (!isNativeApp()) return;
  const { LocalNotifications } = await import('@capacitor/local-notifications');
  notifier ??= createNativeTimerNotifier(LocalNotifications, Capacitor.getPlatform());
  await notifier.reconcile(input);
}

export async function nativeNotificationPermission(): Promise<boolean> {
  if (!isNativeApp()) return false;
  const { LocalNotifications } = await import('@capacitor/local-notifications');
  return (await LocalNotifications.checkPermissions()).display === 'granted';
}

/** Called only by the user's notification button, never during app startup. */
export async function requestNativeNotifications(): Promise<NativeNotificationPermission> {
  if (!isNativeApp()) return { granted: false, exact: false };
  try {
    const { LocalNotifications } = await import('@capacitor/local-notifications');
    const permission = await LocalNotifications.requestPermissions();
    if (permission.display !== 'granted') {
      return {
        granted: false,
        exact: false,
        message:
          'Les notifications ne sont pas autorisées. Vous pouvez les activer dans les réglages de votre appareil.',
      };
    }
    let exact = Capacitor.getPlatform() !== 'android';
    if (!exact) {
      try {
        exact =
          (await LocalNotifications.checkExactNotificationSetting()).exact_alarm === 'granted';
      } catch {
        // Display permission still works even if this OS cannot report its
        // exact-alarm setting; precision is then treated as unavailable.
      }
    }
    return {
      granted: true,
      exact,
      ...(!exact
        ? {
            message:
              'Les rappels sont activés. Android peut les décaler lorsque le téléphone est en veille. Autorisez les alarmes exactes dans les réglages pour améliorer leur précision.',
          }
        : {}),
    };
  } catch {
    return {
      granted: false,
      exact: false,
      message:
        'Votre appareil n’a pas pu activer les notifications. Le minuteur reste disponible dans Solace.',
    };
  }
}

/** Opens Android's optional exact-alarm setting after an explicit user action. */
export async function openNativeExactAlarmSettings() {
  if (!isNativeApp() || Capacitor.getPlatform() !== 'android') return;
  const { LocalNotifications } = await import('@capacitor/local-notifications');
  await LocalNotifications.changeExactNotificationSetting();
}
