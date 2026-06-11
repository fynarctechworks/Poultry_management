import { Pressable, StyleSheet, Text, View, ViewStyle } from 'react-native';
import { colors, spacing, typography } from '../../theme/tokens';

export interface SectionHeaderProps {
  title: string;
  actionLabel?: string;
  onAction?: () => void;
  style?: ViewStyle;
  testID?: string;
}

export function SectionHeader({
  title,
  actionLabel,
  onAction,
  style,
  testID,
}: SectionHeaderProps) {
  const hasAction = !!actionLabel && !!onAction;

  return (
    <View style={[styles.row, style]} testID={testID}>
      <Text style={styles.title}>{title}</Text>
      {hasAction && (
        <Pressable
          onPress={onAction}
          accessible
          accessibilityRole="button"
          accessibilityLabel={actionLabel}
          hitSlop={{ top: spacing.sm, bottom: spacing.sm, left: spacing.sm, right: spacing.sm }}
          style={({ pressed }) => pressed && styles.pressed}
        >
          <Text style={styles.action}>{actionLabel}</Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.sm,
  },
  title: {
    fontSize: typography.captionUppercase.fontSize,
    lineHeight: typography.captionUppercase.lineHeight,
    fontWeight: typography.captionUppercase.fontWeight,
    fontFamily: typography.captionUppercase.fontFamily,
    letterSpacing: typography.captionUppercase.letterSpacing,
    textTransform: typography.captionUppercase.textTransform,
    color: colors.body,
    flex: 1,
  },
  action: {
    fontSize: typography.bodySmStrong.fontSize,
    lineHeight: typography.bodySmStrong.lineHeight,
    fontWeight: typography.bodySmStrong.fontWeight,
    fontFamily: typography.bodySmStrong.fontFamily,
    color: colors.primary,
  },
  pressed: {
    opacity: 0.7,
  },
});
