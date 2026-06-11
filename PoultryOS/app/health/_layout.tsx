import { Stack } from 'expo-router';
import { colors } from '../../theme/tokens';
import { HeaderBackButton } from '../../components/ui/HeaderBackButton';

export default function HealthLayout() {
  return (
    <Stack
      screenOptions={{
        headerTintColor: colors.ink,
        headerStyle: { backgroundColor: colors.canvas },
        headerShadowVisible: false,
        headerLeft: () => <HeaderBackButton />,
      }}
    >
      <Stack.Screen name="index" options={{ title: 'Health Incidents' }} />
      <Stack.Screen
        name="new"
        options={{ title: 'Report Incident', presentation: 'modal' }}
      />
    </Stack>
  );
}
