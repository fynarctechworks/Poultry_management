import { Stack } from 'expo-router';
import { colors } from '../../theme/tokens';
import { HeaderBackButton } from '../../components/ui/HeaderBackButton';

export default function BuyersLayout() {
  return (
    <Stack
      screenOptions={{
        headerTintColor: colors.ink,
        headerStyle: { backgroundColor: colors.canvas },
        headerShadowVisible: false,
        headerLeft: () => <HeaderBackButton />,
      }}
    >
      <Stack.Screen
        name="new"
        options={{ title: 'Add Buyer', presentation: 'modal' }}
      />
      <Stack.Screen name="[id]" options={{ title: 'Buyer' }} />
    </Stack>
  );
}
