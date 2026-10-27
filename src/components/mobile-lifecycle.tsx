'use client';

import { useEffect, useRef } from 'react';
import { Capacitor, type PluginListenerHandle } from '@capacitor/core';
import { isNativeApp } from '@/lib/mobile-platform';
import { handleNativeAuthUrl } from '@/lib/native-auth';
import { setNativeAuthActive } from '@/lib/supabase/browser';
import { flushWorkspaceStorage } from '@/lib/workspace-storage';
import {
  NATIVE_TIMER_NOTIFICATION_ID,
  reconcileNativeTimerNotification,
} from '@/lib/native-notifications';
import { useApp } from './app-context';

/** Native listeners live beside the shared workspace rather than in the web shell. */
export function MobileLifecycle() {
  const context = useApp();
  const current = useRef(context);
  const lastNotificationError = useRef(false);
  useEffect(() => {
    current.current = context;
  }, [context]);

  const { store, notify } = context;
  const { timer } = store;
  useEffect(() => {
    if (!isNativeApp()) return;
    void reconcileNativeTimerNotification({
      timer,
      workspaceId: store.workspaceId,
      userId: store.userId,
      enabled: store.data.preferences.notifications,
      sound: store.data.preferences.sound,
      ready: store.ready,
    })
      .then(() => {
        lastNotificationError.current = false;
      })
      .catch(() => {
        if (lastNotificationError.current) return;
        lastNotificationError.current = true;
        notify(
          'Le rappel de fin de séance n’a pas pu être programmé. Vérifiez les notifications dans les réglages de votre appareil.',
        );
      });
  }, [
    timer,
    store.workspaceId,
    store.userId,
    store.ready,
    store.data.preferences.notifications,
    store.data.preferences.sound,
    notify,
  ]);

  useEffect(() => {
    if (!isNativeApp()) return;
    let disposed = false;
    const listeners: PluginListenerHandle[] = [];
    const callbackRequests = new Map<string, Promise<void>>();
    const completedCallbacks = new Set<string>();

    const add = async (pending: Promise<PluginListenerHandle>) => {
      const listener = await pending;
      if (disposed) await listener.remove();
      else listeners.push(listener);
    };

    const resume = () => {
      if (disposed) return;
      // The existing timer uses a deadline and completes through its normal
      // store transaction; a native notification never creates focus credit.
      window.dispatchEvent(new Event('focus'));
      const { store: active } = current.current;
      if (navigator.onLine && active.isCloud && !active.conflict)
        void active.retrySync().catch(() => undefined);
      void reconcileNativeTimerNotification({
        timer: active.timer,
        workspaceId: active.workspaceId,
        userId: active.userId,
        enabled: active.data.preferences.notifications,
        sound: active.data.preferences.sound,
        ready: active.ready,
      }).catch(() => undefined);
    };

    const openAuthUrl = (value: string): Promise<void> => {
      if (completedCallbacks.has(value)) return Promise.resolve();
      const existing = callbackRequests.get(value);
      if (existing) return existing;
      const pending = (async () => {
        try {
          const result = await handleNativeAuthUrl(value);
          if (!result.handled || disposed) return;
          if (result.error) {
            current.current.notify(result.error);
            return;
          }
          completedCallbacks.add(value);
          if (completedCallbacks.size > 16)
            completedCallbacks.delete(completedCallbacks.values().next().value!);
          const url = new URL(window.location.href);
          // Never place callback access tokens, hashes or authorization codes
          // in the WebView history. Only application state survives the callback.
          for (const key of [
            'code',
            'token_hash',
            'access_token',
            'refresh_token',
            'type',
            'error',
            'error_description',
          ])
            url.searchParams.delete(key);
          url.hash = '';
          url.searchParams.set('view', result.recovery ? 'settings' : 'overview');
          if (result.recovery) url.searchParams.set('reset-password', '1');
          else url.searchParams.delete('reset-password');
          window.history.replaceState(null, '', url);
          current.current.navigate(result.recovery ? 'settings' : 'overview');
          if (result.recovery) current.current.openAccount();
          resume();
        } catch {
          if (!disposed)
            current.current.notify(
              'Ce lien de connexion n’a pas pu être vérifié. Demandez un nouveau lien depuis votre compte.',
            );
        }
      })();
      callbackRequests.set(value, pending);
      void pending.finally(() => callbackRequests.delete(value));
      return pending;
    };

    const setup = async () => {
      const [{ App }, { LocalNotifications }] = await Promise.all([
        import('@capacitor/app'),
        import('@capacitor/local-notifications'),
      ]);
      if (disposed) return;
      await add(
        App.addListener('appStateChange', ({ isActive }) => {
          void setNativeAuthActive(isActive).catch(() => undefined);
          if (isActive) resume();
          else void flushWorkspaceStorage().catch(() => undefined);
        }),
      );
      await add(
        App.addListener('appUrlOpen', ({ url }) => {
          void openAuthUrl(url);
        }),
      );
      await add(
        LocalNotifications.addListener('localNotificationActionPerformed', ({ notification }) => {
          if (disposed || notification.id !== NATIVE_TIMER_NOTIFICATION_ID) return;
          current.current.navigate('overview');
          resume();
        }),
      );
      if (Capacitor.getPlatform() === 'android') {
        await add(
          App.addListener('backButton', async () => {
            if (disposed) return;
            const dialogs = document.querySelectorAll<HTMLDialogElement>('dialog[open]');
            const dialog = dialogs.item(dialogs.length - 1);
            if (dialog) {
              dialog.dispatchEvent(new Event('cancel', { cancelable: true }));
              return;
            }
            if (new URLSearchParams(window.location.search).get('view') !== 'overview') {
              current.current.navigate('overview');
              return;
            }
            await App.minimizeApp().catch(() => undefined);
          }),
        );
      }
      const state = await App.getState();
      if (!disposed) void setNativeAuthActive(state.isActive).catch(() => undefined);
      const launch = await App.getLaunchUrl();
      if (!disposed && launch?.url) await openAuthUrl(launch.url);
    };

    void setup().catch(() => {
      if (!disposed)
        current.current.notify(
          'Certaines fonctions de votre appareil sont indisponibles. Vous pouvez continuer à utiliser votre espace.',
        );
    });
    return () => {
      disposed = true;
      void setNativeAuthActive(false).catch(() => undefined);
      void flushWorkspaceStorage().catch(() => undefined);
      for (const listener of listeners) void listener.remove().catch(() => undefined);
    };
  }, []);

  return null;
}
