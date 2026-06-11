import { Plus } from 'lucide-react-native';
import { Pressable, StyleSheet } from 'react-native';
import { colors, radius, spacing } from '../../theme/tokens';

export interface DailyLogFabProps {
  onPress: () => void;
  visible?: boolean;
  testID?: string;
}

export function DailyLogFab({ onPress, visible = true, testID }: DailyLogFabProps) {
  if (!visible) return null;

  return (
    <Pressable
      onPress={onPress}
      accessible
      accessibilityRole="button"
      accessibilityLabel="Add daily log"
      testID={testID}
      style={({ pressed }) => [styles.fab, pressed && styles.pressed]}
    >
      <Plus size={24} color={colors.onPrimary} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  fab: {
    position: 'absolute',
    bottom: spacing['2xl'],
    right: spacing['2xl'],
    width: 56,
    height: 56,
    borderRadius: radius.full,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    // Drop shadow — cross-platform
    shadowColor: colors.ink,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.24,
    shadowRadius: 8,
    elevation: 6,
  },
  pressed: {
    opacity: 0.85,
  },
});
