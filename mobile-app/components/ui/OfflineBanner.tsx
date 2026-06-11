import { WifiOff } from 'lucide-react-native';
import { StyleSheet, Text, View, ViewStyle } from 'react-native';
import { colors, spacing, typography } from '../../theme/tokens';

export interface OfflineBannerProps {
  visible: boolean;
  pendingCount?: number;
  style?: ViewStyle;
}

export function OfflineBanner({
  visible,
  pendingCount,
  style,
}: OfflineBannerProps) {
  if (!visible) return null;

  const message =
    pendingCount && pendingCount > 0
      ? `Working offline — data will sync when connected · ${pendingCount} pending`
      : 'Working offline — data will sync when connected';

  return (
    <View style={[styles.banner, style]}>
      <WifiOff size={16} color={colors.warningInk} />
      <Text style={styles.text} numberOfLines={2}>
        {message}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.warningSoft,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    gap: spacing.sm,
  },
  text: {
    flex: 1,
    fontSize: typography.bodySmStrong.fontSize,
    lineHeight: typography.bodySmStrong.lineHeight,
    fontWeight: typography.bodySmStrong.fontWeight,
    fontFamily: typography.bodySmStrong.fontFamily,
    color: colors.warningInk,
  },
});
