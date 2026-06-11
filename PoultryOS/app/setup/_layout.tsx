import { Stack } from 'expo-router';
import { colors } from '../../theme/tokens';
import { HeaderBackButton } from '../../components/ui/HeaderBackButton';

export default function SetupLayout() {
  return (
    <Stack
      screenOptions={{
        headerTintColor: colors.ink,
        headerStyle: { backgroundColor: colors.canvas },
        headerShadowVisible: false,
        headerLeft: () => <HeaderBackButton />,
      }}
    >
      <Stack.Screen name="sheds" options={{ title: 'Add your sheds' }} />
      <Stack.Screen name="batches" options={{ title: 'Add your first batch' }} />
      <Stack.Screen name="success" options={{ headerShown: false }} />
    </Stack>
  );
}
