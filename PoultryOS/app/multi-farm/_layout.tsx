import { Stack } from 'expo-router';
import { colors } from '../../theme/tokens';
import { HeaderBackButton } from '../../components/ui/HeaderBackButton';

export default function MultiFarmLayout() {
  return (
    <Stack
      screenOptions={{
        headerTintColor: colors.ink,
        headerStyle: { backgroundColor: colors.canvas },
        headerShadowVisible: false,
        headerLeft: () => <HeaderBackButton />,
      }}
    >
      <Stack.Screen name="index" options={{ title: 'Multi-farm dashboard' }} />
    </Stack>
  );
}
