import { Pressable, StyleSheet, Text, View, ViewStyle } from 'react-native';
import { colors, radius, spacing, typography } from '../../theme/tokens';
import { Card } from './Card';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface InventoryItemCardProps {
  itemName: string;
  category: 'feed' | 'medicine' | 'vaccine' | 'equipment';
  unit: 'kg' | 'litres' | 'units';
  currentStock: number;
  lowStockThreshold: number;
  onPress?: () => void;
  style?: ViewStyle;
  testID?: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const CATEGORY_LABEL: Record<InventoryItemCardProps['category'], string> = {
  feed: 'Feed',
  medicine: 'Medicine',
  vaccine: 'Vaccine',
  equipment: 'Equipment',
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function InventoryItemCard({
  itemName,
  category,
  unit,
  currentStock,
  lowStockThreshold,
  onPress,
  style,
  testID,
}: InventoryItemCardProps) {
  const isLowStock = lowStockThreshold > 0 && currentStock <= lowStockThreshold;

  const inner = (
    <View style={styles.inner}>
      {/* Top row: name + category chip */}
      <View style={styles.topRow}>
        <Text style={styles.name} numberOfLines={2}>
          {itemName}
        </Text>
        <View style={styles.categoryChip}>
          <Text style={styles.categoryChipLabel}>
            {CATEGORY_LABEL[category]}
          </Text>
        </View>
      </View>

      {/* Bottom row: stock amount + optional low-stock pill */}
      <View style={styles.bottomRow}>
        <Text style={styles.stockText}>
          {currentStock} {unit}
        </Text>
        {isLowStock && (
          <View style={styles.lowStockPill}>
            <Text style={styles.lowStockLabel}>Low stock</Text>
          </View>
        )}
      </View>
    </View>
  );

  if (onPress) {
    return (
      <Pressable
        onPress={onPress}
        accessible
        accessibilityRole="button"
        accessibilityLabel={`${itemName}, ${currentStock} ${unit}${isLowStock ? ', Low stock' : ''}`}
        testID={testID}
        style={({ pressed }) => [
          styles.pressableWrapper,
          pressed && styles.pressed,
          style,
        ]}
      >
        {inner}
      </Pressable>
    );
  }

  return (
    <Card style={style} testID={testID}>
      {inner}
    </Card>
  );
}

const styles = StyleSheet.create({
  // When onPress is present we render a Pressable that replicates Card styling.
  pressableWrapper: {
    minHeight: 44,
    backgroundColor: colors.canvas,
    borderWidth: 1,
    borderColor: colors.mute,
    borderRadius: radius.card,
    padding: spacing.lg,
  },
  pressed: {
    opacity: 0.85,
  },
  inner: {
    gap: spacing.sm,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  name: {
    flex: 1,
    fontSize: typography.bodyMdStrong.fontSize,
    lineHeight: typography.bodyMdStrong.lineHeight,
    fontWeight: typography.bodyMdStrong.fontWeight,
    fontFamily: typography.bodyMdStrong.fontFamily,
    color: colors.ink,
  },
  categoryChip: {
    alignSelf: 'flex-start',
    backgroundColor: colors.canvasSoft,
    borderRadius: radius.pillMd,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.md,
    flexShrink: 0,
  },
  categoryChipLabel: {
    fontSize: typography.captionStrong.fontSize,
    lineHeight: typography.captionStrong.lineHeight,
    fontWeight: typography.captionStrong.fontWeight,
    fontFamily: typography.captionStrong.fontFamily,
    color: colors.body,
  },
  bottomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  stockText: {
    fontSize: typography.bodySm.fontSize,
    lineHeight: typography.bodySm.lineHeight,
    fontWeight: typography.bodySm.fontWeight,
    fontFamily: typography.bodySm.fontFamily,
    color: colors.ink,
  },
  lowStockPill: {
    backgroundColor: colors.warningSoft,
    borderRadius: radius.pillMd,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.md,
  },
  lowStockLabel: {
    fontSize: typography.captionStrong.fontSize,
    lineHeight: typography.captionStrong.lineHeight,
    fontWeight: typography.captionStrong.fontWeight,
    fontFamily: typography.captionStrong.fontFamily,
    color: colors.warningInk,
  },
});
