import { StyleSheet, Text, View, ViewStyle } from 'react-native';
import { colors, spacing, typography } from '../../theme/tokens';
import { formatDDMMMYYYY } from '../../lib/format-date';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface StockMovementRowProps {
  movementType: 'purchase' | 'usage' | 'adjustment';
  quantity: number;
  movementDate: string;   // ISO date (YYYY-MM-DD or full ISO datetime)
  supplier?: string | null;
  notes?: string | null;
  style?: ViewStyle;
  testID?: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const MOVEMENT_LABEL: Record<StockMovementRowProps['movementType'], string> = {
  purchase: 'Purchase',
  usage: 'Usage',
  adjustment: 'Adjustment',
};

function formatQuantity(
  movementType: StockMovementRowProps['movementType'],
  quantity: number,
): string {
  if (movementType === 'purchase') return `+${quantity}`;
  if (movementType === 'usage') return `-${quantity}`;
  return String(quantity);
}

function quantityColor(movementType: StockMovementRowProps['movementType']): string {
  // usage is highlighted in primary (red) to draw attention to drawdowns
  if (movementType === 'usage') return colors.primary;
  return colors.ink;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function StockMovementRow({
  movementType,
  quantity,
  movementDate,
  supplier,
  notes,
  style,
  testID,
}: StockMovementRowProps) {
  const secondLine = [supplier, notes].filter(Boolean).join(' · ');

  return (
    <View style={[styles.row, style]} testID={testID}>
      {/* Main content */}
      <View style={styles.body}>
        {/* Type label + formatted date */}
        <Text style={styles.typeDate} numberOfLines={1}>
          {MOVEMENT_LABEL[movementType]}
          <Text style={styles.dateSeparator}> · </Text>
          <Text style={styles.date}>{formatDDMMMYYYY(movementDate)}</Text>
        </Text>

        {/* Optional supplier / notes sub-line */}
        {!!secondLine && (
          <Text style={styles.subLine} numberOfLines={2}>
            {secondLine}
          </Text>
        )}
      </View>

      {/* Quantity — right-aligned */}
      <Text style={[styles.quantity, { color: quantityColor(movementType) }]}>
        {formatQuantity(movementType, quantity)}
      </Text>

      {/* Hairline bottom border is rendered as a View so it doesn't affect layout */}
      <View style={styles.hairline} />
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    gap: spacing.md,
    // Position relative so hairline can be absolutely placed at the bottom.
    position: 'relative',
  },
  body: {
    flex: 1,
    gap: spacing.xxs,
  },
  typeDate: {
    fontSize: typography.bodySm.fontSize,
    lineHeight: typography.bodySm.lineHeight,
    fontWeight: typography.bodySm.fontWeight,
    fontFamily: typography.bodySm.fontFamily,
    color: colors.ink,
  },
  dateSeparator: {
    color: colors.body,
  },
  date: {
    fontSize: typography.bodySm.fontSize,
    lineHeight: typography.bodySm.lineHeight,
    fontWeight: typography.bodySm.fontWeight,
    fontFamily: typography.bodySm.fontFamily,
    color: colors.body,
  },
  subLine: {
    fontSize: typography.caption.fontSize,
    lineHeight: typography.caption.lineHeight,
    fontWeight: typography.caption.fontWeight,
    fontFamily: typography.caption.fontFamily,
    color: colors.body,
  },
  quantity: {
    fontSize: typography.bodySmStrong.fontSize,
    lineHeight: typography.bodySmStrong.lineHeight,
    fontWeight: typography.bodySmStrong.fontWeight,
    fontFamily: typography.bodySmStrong.fontFamily,
    flexShrink: 0,
  },
  hairline: {
    position: 'absolute',
    bottom: 0,
    left: spacing.lg,
    right: spacing.lg,
    height: 1,
    backgroundColor: colors.mute,
  },
});
