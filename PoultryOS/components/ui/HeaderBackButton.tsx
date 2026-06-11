import { Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { ChevronLeft } from 'lucide-react-native';
import { colors } from '../../theme/tokens';

export function HeaderBackButton() {
  const router = useRouter();
  if (!router.canGoBack()) return null;
  return (
    <Pressable
      onPress={() => router.back()}
      hitSlop={12}
      style={({ pressed }) => ({
        paddingHorizontal: 8,
        paddingVertical: 4,
        opacity: pressed ? 0.6 : 1,
      })}
      accessibilityRole="button"
      accessibilityLabel="Go back"
    >
      <ChevronLeft size={26} color={colors.ink} />
    </Pressable>
  );
}
