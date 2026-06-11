import { useEffect, useState } from 'react';
import { Stack, Redirect } from 'expo-router';
import { useAuthStore } from '../../stores/auth';
import { supabase } from '../../lib/supabase';
import { useFarmStore } from '../../stores/farm';
import { hydrateDraftIfEmpty } from '../../lib/onboarding-sync';

export default function OnboardingLayout() {
  const session = useAuthStore((s) => s.session);
  const setCurrentFarm = useFarmStore((s) => s.setCurrentFarm);
  const currentFarm = useFarmStore((s) => s.currentFarm);
  const [checked, setChecked] = useState(false);
  const [hasFarm, setHasFarm] = useState(false);

  useEffect(() => {
    if (!session) {
      setChecked(true);
      return;
    }

    async function checkFarm() {
      try {
        const { data } = await supabase
          .from('farm_users')
          .select('farm_id, farms(*)')
          .eq('user_id', session!.user.id)
          .maybeSingle();
        if (data?.farm_id) {
          if (data.farms && !Array.isArray(data.farms)) {
            setCurrentFarm(data.farms as any);
          }
          setHasFarm(true);
        } else {
          // No farm yet — pull any server-side draft so a cross-device resume
          // re-populates the wizard fields. Best-effort; never blocks.
          await hydrateDraftIfEmpty();
        }
      } catch {
        // ignore — leave hasFarm=false, proceed to onboarding
      } finally {
        setChecked(true);
      }
    }

    checkFarm();
  }, [session]);

  if (!checked) return null;

  if (hasFarm && currentFarm) {
    return <Redirect href="/(tabs)/dashboard" />;
  }

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        animation: 'slide_from_right',
      }}
    />
  );
}
