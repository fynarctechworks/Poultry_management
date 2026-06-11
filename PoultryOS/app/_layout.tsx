import { useEffect, useState } from 'react';
import { View, ActivityIndicator, Platform } from 'react-native';
import { Slot, Redirect } from 'expo-router';
import {
  useFonts,
  IBMPlexSans_400Regular,
  IBMPlexSans_500Medium,
  IBMPlexSans_600SemiBold,
  IBMPlexSans_700Bold,
} from '@expo-google-fonts/ibm-plex-sans';
import * as Notifications from 'expo-notifications';
import { Providers } from '../components/providers';
import { supabase } from '../lib/supabase';
import { useAuthStore } from '../stores/auth';
import { useFarmStore } from '../stores/farm';
import { usePushToken } from '../hooks/usePushToken';
import { colors } from '../theme/tokens';
import { loadPersistedLanguage } from '../lib/i18n';

// Module-level notification handler — mobile only (web doesn't support push).
if (Platform.OS !== 'web') {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: true,
    }),
  });
}

export default function RootLayout() {
  const { session, isLoading, setSession, setLoading } = useAuthStore();
  const { currentFarm, setCurrentFarm } = useFarmStore();
  const [farmHydrated, setFarmHydrated] = useState(false);

  // IBM Plex Sans — registered under the exact family names the typography
  // tokens reference (theme/tokens.ts `fonts`). 4 weights max (perf budget).
  const [fontsLoaded] = useFonts({
    IBMPlexSans_400Regular,
    IBMPlexSans_500Medium,
    IBMPlexSans_600SemiBold,
    IBMPlexSans_700Bold,
  });

  // Register push token after auth resolves
  usePushToken(session?.user?.id);

  useEffect(() => {
    // Resolve the persisted language as early as possible so the first
    // render of any localised screen uses the right language.
    loadPersistedLanguage().catch(() => {
      // i18n falls back to English on failure
    });
  }, []);

  useEffect(() => {
    const failsafe = setTimeout(() => setLoading(false), 5000);

    supabase.auth.getSession()
      .then(({ data: { session } }) => {
        setSession(session);
        setLoading(false);
      })
      .catch(() => setLoading(false))
      .finally(() => clearTimeout(failsafe));

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, newSession) => {
      setSession(newSession);
      setLoading(false);
      if (event === 'SIGNED_OUT') {
        setCurrentFarm(null as any);
      }
    });

    return () => {
      clearTimeout(failsafe);
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!session) {
      setFarmHydrated(true);
      return;
    }
    let cancelled = false;
    setFarmHydrated(false);
    (async () => {
      try {
        const { data } = await supabase
          .from('farm_users')
          .select('farm_id, farms(id,farm_name,owner_name,state,district,phone,farm_type,upi_id,heat_stress_threshold_celsius)')
          .eq('user_id', session.user.id)
          .maybeSingle();
        if (cancelled) return;
        if (data?.farm_id && data.farms && !Array.isArray(data.farms)) {
          setCurrentFarm(data.farms as any);
        }
      } catch {
        // farm hydration is best-effort; routing falls through to onboarding
      } finally {
        if (!cancelled) setFarmHydrated(true);
      }
    })();
    return () => { cancelled = true; };
  }, [session?.user.id]);

  if (isLoading || !fontsLoaded || (session && !farmHydrated)) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.canvas }}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <Providers>
      {!session && <Redirect href="/(auth)/login" />}
      {session && !currentFarm && <Redirect href="/(onboarding)/step-1-profile" />}
      <Slot />
    </Providers>
  );
}
