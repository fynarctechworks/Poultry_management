import { StyleSheet, Text, View } from 'react-native';
import { colors, radius, spacing, typography } from '../../theme/tokens';
import { formatDDMMMYYYY } from '../../lib/format-date';

export interface WithdrawalBadgeProps {
  /** health_incidents.withdrawal_clearance_date (ISO date or ISO datetime) or null. */
  clearanceDate: string | null;
  testID?: string;
}

/**
 * Status chip for medicine-withdrawal state.
 *
 * - null                 → renders nothing
 * - future date          → amber chip "Withdrawal until DD-MMM-YYYY"
 * - today or past date   → green chip "Withdrawal cleared"
 *
 * Uses the badge-chip recipe from DESIGN.md:
 *   pill-md radius, caption-strong typography, xs/md padding.
 */
export function WithdrawalBadge({ clearanceDate, testID }: WithdrawalBadgeProps) {
  if (!clearanceDate) return null;

  // Compare date portions only (no timezone shift).
  const todayStr = new Date().toISOString().slice(0, 10);
  const clearanceDateStr = clearanceDate.slice(0, 10);
  const isCleared = clearanceDateStr <= todayStr;

  if (isCleared) {
    return (
      <View style={[styles.chip, styles.chipCleared]} testID={testID}>
        <Text style={[styles.label, styles.labelCleared]}>Withdrawal cleared</Text>
      </View>
    );
  }

  return (
    <View style={[styles.chip, styles.chipPending]} testID={testID}>
      <Text style={[styles.label, styles.labelPending]}>
        Withdrawal until {formatDDMMMYYYY(clearanceDate)}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  // badge-chip base recipe (DESIGN.md)
  chip: {
    alignSelf: 'flex-start',
    borderRadius: radius.pillMd,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.md,
  },
  label: {
    fontSize: typography.captionStrong.fontSize,
    lineHeight: typography.captionStrong.lineHeight,
    fontWeight: typography.captionStrong.fontWeight,
    fontFamily: typography.captionStrong.fontFamily,
  },
  // Pending: amber-100 bg, warning-amber text (CLAUDE.md domain overlay)
  chipPending: {
    backgroundColor: colors.warningSoft,
  },
  labelPending: {
    color: colors.warning,
  },
  // Cleared: successSoft bg, success text
  chipCleared: {
    backgroundColor: colors.successSoft,
  },
  labelCleared: {
    color: colors.success,
  },
});
