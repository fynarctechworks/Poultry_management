import { Pressable, StyleSheet, Text, View, ViewStyle } from 'react-native';
import { useRouter } from 'expo-router';
import { Lock, ArrowRight } from 'lucide-react-native';
import { colors, radius, spacing, typography, fonts } from '../../theme/tokens';

export interface UpgradeBannerProps {
  reason: string;
  ctaLabel?: string;
  onPress?: () => void;
  style?: ViewStyle;
  testID?: string;
}

export function UpgradeBanner({
  reason,
  ctaLabel = 'Upgrade',
  onPress,
  style,
  testID,
}: UpgradeBannerProps) {
  const router = useRouter();

  const handlePress = () => {
    if (onPress) {
      onPress();
      return;
    }
    router.push('/billing');
  };

  return (
    <Pressable
      onPress={handlePress}
      accessibilityRole="button"
      accessibilityLabel={`${reason}. ${ctaLabel}`}
      testID={testID}
      style={({ pressed }) => [
        styles.banner,
        pressed && styles.pressed,
        style,
      ]}
    >
      <View style={styles.iconWrap}>
        <Lock size={18} color={colors.onPrimary} />
      </View>
      <Text style={styles.reason} numberOfLines={2}>
        {reason}
      </Text>
      <View style={styles.cta}>
        <Text style={styles.ctaLabel}>{ctaLabel}</Text>
        <ArrowRight size={16} color={colors.onPrimary} />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.primary,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.card,
    minHeight: 56,
  },
  pressed: { opacity: 0.85 },
  iconWrap: {
    width: 32,
    height: 32,
    borderRadius: radius.full,
    backgroundColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  reason: {
    flex: 1,
    fontSize: typography.bodySm.fontSize,
    lineHeight: typography.bodySm.lineHeight,
    fontWeight: '600', fontFamily: fonts.semibold,
    color: colors.onPrimary,
  },
  cta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  ctaLabel: {
    fontSize: typography.caption.fontSize,
    lineHeight: typography.caption.lineHeight,
    fontWeight: '700', fontFamily: fonts.bold,
    color: colors.onPrimary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
});
