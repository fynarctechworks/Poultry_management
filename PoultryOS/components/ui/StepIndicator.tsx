import { StyleSheet, Text, View, ViewStyle } from 'react-native';
import { colors, spacing, typography } from '../../theme/tokens';

export interface StepIndicatorProps {
  current: number;
  total: number;
  style?: ViewStyle;
}

const DOT_SIZE = 8;

export function StepIndicator({ current, total, style }: StepIndicatorProps) {
  return (
    <View style={[styles.wrapper, style]}>
      <View style={styles.dotsRow} accessible accessibilityRole="progressbar" accessibilityValue={{ min: 1, max: total, now: current }}>
        {Array.from({ length: total }, (_, i) => {
          const stepNumber = i + 1;
          const isActive = stepNumber <= current;
          return (
            <View
              key={stepNumber}
              testID={isActive ? 'dot-filled' : 'dot-muted'}
              accessibilityLabel={isActive ? `Step ${stepNumber} filled` : `Step ${stepNumber} muted`}
              style={[
                styles.dot,
                isActive ? styles.dotActive : styles.dotInactive,
                i < total - 1 && styles.dotGap,
              ]}
            />
          );
        })}
      </View>
      <Text style={styles.stepLabel}>
        Step {current} of {total}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    flexDirection: 'column',
  },
  dotsRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  dot: {
    width: DOT_SIZE,
    height: DOT_SIZE,
    borderRadius: DOT_SIZE / 2,
  },
  dotActive: {
    backgroundColor: colors.primary,
  },
  dotInactive: {
    backgroundColor: colors.mute,
  },
  dotGap: {
    marginRight: spacing.sm,
  },
  stepLabel: {
    fontSize: typography.caption.fontSize,
    lineHeight: typography.caption.lineHeight,
    fontWeight: typography.caption.fontWeight,
    fontFamily: typography.caption.fontFamily,
    color: colors.body,
    textAlign: 'left',
    marginTop: spacing.xs,
  },
});
