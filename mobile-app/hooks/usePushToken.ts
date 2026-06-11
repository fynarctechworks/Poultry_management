/**
 * usePushToken.ts
 *
 * Registers the device for Expo push notifications and persists the token
 * in profiles.expo_push_token. Called once in RootLayout after auth resolves.
 *
 * - Skips on web (expo-notifications is mobile-only for push tokens)
 * - Requests permission gracefully — no-op if denied
 * - Writes token to Supabase via upsert (idempotent)
 */

import { useEffect } from 'react';
import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import { supabase } from '../lib/supabase';
import { colors } from '../theme/tokens';

export function usePushToken(userId: string | undefined): void {
  useEffect(() => {
    if (!userId) return;
    if (Platform.OS === 'web') return;

    let cancelled = false;

    (async () => {
      try {
        // Set up Android notification channel
        if (Platform.OS === 'android') {
          await Notifications.setNotificationChannelAsync('default', {
            name: 'default',
            importance: Notifications.AndroidImportance.HIGH,
            vibrationPattern: [0, 250, 250, 250],
            lightColor: colors.primary,
          });
        }

        // Request permission
        const { status: existingStatus } =
          await Notifications.getPermissionsAsync();
        let finalStatus = existingStatus;

        if (existingStatus !== 'granted') {
          const { status } = await Notifications.requestPermissionsAsync();
          finalStatus = status;
        }

        if (finalStatus !== 'granted') {
          // User denied — push notifications are best-effort
          return;
        }

        // Get the Expo push token
        // projectId left undefined → falls back to the EAS project ID from app config
        const tokenData = await Notifications.getExpoPushTokenAsync();
        if (cancelled) return;

        const token = tokenData.data;

        // Persist to profiles — upsert is safe if profile already has same token
        await supabase
          .from('profiles')
          .update({ expo_push_token: token })
          .eq('id', userId);
      } catch {
        // Push token registration is best-effort — don't crash the app
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [userId]);
}
