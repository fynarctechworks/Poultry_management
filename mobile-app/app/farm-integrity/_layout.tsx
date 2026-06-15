import { Stack } from 'expo-router';
import { colors } from '../../theme/tokens';
import { HeaderBackButton } from '../../components/ui/HeaderBackButton';

export default function FarmIntegrityLayout() {
  return (
    <Stack
      screenOptions={{
        headerTintColor: colors.ink,
        headerStyle: { backgroundColor: colors.canvas },
        headerShadowVisible: false,
        headerLeft: () => <HeaderBackButton />,
      }}
    >
      <Stack.Screen name="index" options={{ title: 'Farm Integrity' }} />
    </Stack>
  );
}
