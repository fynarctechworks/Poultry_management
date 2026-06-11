import { Stack } from 'expo-router';
import { colors } from '../../theme/tokens';
import { HeaderBackButton } from '../../components/ui/HeaderBackButton';

export default function SecurityLayout() {
  return (
    <Stack
      screenOptions={{
        headerTintColor: colors.ink,
        headerStyle: { backgroundColor: colors.canvas },
        headerShadowVisible: false,
        headerLeft: () => <HeaderBackButton />,
      }}
    >
      <Stack.Screen name="index" options={{ title: 'Security' }} />
      <Stack.Screen name="two-factor" options={{ title: 'Two-factor authentication' }} />
      <Stack.Screen name="sessions" options={{ title: 'Login history' }} />
      <Stack.Screen name="devices" options={{ title: 'Trusted devices' }} />
    </Stack>
  );
}
