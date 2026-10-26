/**
 * Push notifications on the device side (docs/api.md §4, decisions D-007).
 * - Shows alerts as banners even while the app is open.
 * - Registers this device's Expo push token with Supabase (register_push_token) whenever the signed-in user changes,
 *   so guests still get emergency alerts (Q-005) and residents get their opted-in categories.
 * - Opens the matching screen when a notification is tapped.
 * Permission is requested during onboarding, or once on first reaching Home for people who
 * skipped it (e.g. straight to Sign in). After that, Profile offers a way to turn it on.
 */
import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { AppState, Linking, Platform } from 'react-native';

import { registerPushToken } from '@/lib/api';
import { isDemoAuth } from '@/lib/env';
import { storage, StorageKeys } from '@/lib/storage';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

type PushData =
  | { type: 'notification'; documentId: string }
  | { type: 'event-reminder'; eventDocumentId: string };

export function routeForPush(data: unknown): Parameters<typeof router.push>[0] | null {
  const d = data as Partial<PushData> | undefined;
  if (d?.type === 'notification' && typeof d.documentId === 'string') {
    return { pathname: '/alerts/[id]', params: { id: d.documentId } };
  }
  if (d?.type === 'event-reminder' && typeof d.eventDocumentId === 'string') {
    return { pathname: '/events/[id]', params: { id: d.eventDocumentId } };
  }
  return null;
}

async function currentPushToken(): Promise<string | null> {
  if (!Device.isDevice || isDemoAuth) return null; // simulators can't receive remote push
  const { status } = await Notifications.getPermissionsAsync();
  if (status !== 'granted') return null;
  const projectId = Constants.expoConfig?.extra?.eas?.projectId as string | undefined;
  const { data } = await Notifications.getExpoPushTokenAsync(projectId ? { projectId } : undefined);
  return data;
}

/** Ask for notification permission (records that we asked, so we only ever ask once). */
export async function askForNotifications(): Promise<boolean> {
  storage.set(StorageKeys.askedNotifications, '1');
  try {
    const { status } = await Notifications.requestPermissionsAsync();
    return status === 'granted';
  } catch {
    return false; // e.g. not available on this device
  }
}

/**
 * Register (or re-link) this device's push token whenever `userKey` changes. When `canPrompt`
 * is true and the person has never been asked, ask first (once per install).
 */
export function usePushRegistration(userKey: string | null, canPrompt: boolean) {
  useEffect(() => {
    if (!userKey) return;
    let cancelled = false;
    (async () => {
      try {
        if (canPrompt && Device.isDevice && storage.get(StorageKeys.askedNotifications) !== '1') {
          const { status } = await Notifications.getPermissionsAsync();
          if (status === 'undetermined') await askForNotifications();
        }
        const token = await currentPushToken();
        if (token && !cancelled) {
          await registerPushToken(token, Platform.OS === 'ios' ? 'ios' : 'android');
        }
      } catch (error) {
        // Push is best-effort; the app works without it.
        if (__DEV__) console.warn('Push registration failed', error);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [userKey, canPrompt]);
}

/** Current permission, refreshed when the app returns from Settings; `enable` asks or opens Settings. */
export function useNotificationPermission() {
  const [status, setStatus] = useState<'granted' | 'denied' | 'undetermined' | 'unknown'>(
    'unknown',
  );
  const refresh = useCallback(() => {
    Notifications.getPermissionsAsync()
      .then((result) => setStatus(result.status as 'granted' | 'denied' | 'undetermined'))
      .catch(() => setStatus('unknown'));
  }, []);
  useEffect(() => {
    refresh();
    const sub = AppState.addEventListener('change', (next) => next === 'active' && refresh());
    return () => sub.remove();
  }, [refresh]);
  const enable = async () => {
    if (status === 'undetermined') {
      await askForNotifications();
      refresh();
    } else {
      Linking.openSettings();
    }
  };
  return { status, enable };
}

/** Open the alert or event a tapped notification refers to (including cold starts). */
export function useNotificationNavigation() {
  const last = Notifications.useLastNotificationResponse();
  useEffect(() => {
    const route = routeForPush(last?.notification.request.content.data);
    if (route) router.push(route);
  }, [last]);
}
