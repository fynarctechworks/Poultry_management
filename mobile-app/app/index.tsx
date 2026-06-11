import { View, ActivityIndicator } from 'react-native';
import { Redirect } from 'expo-router';
import { useAuthStore } from '../stores/auth';
import { useFarmStore } from '../stores/farm';
import { colors } from '../theme/tokens';

export default function Index() {
  const { session, isLoading } = useAuthStore();
  const { currentFarm } = useFarmStore();

  if (isLoading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.canvas }}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }
  if (!session) return <Redirect href="/(auth)/login" />;
  if (!currentFarm) return <Redirect href="/(onboarding)/step-1-profile" />;
  return <Redirect href="/(tabs)/dashboard" />;
}
