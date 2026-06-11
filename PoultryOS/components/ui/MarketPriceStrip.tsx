import { StyleSheet, Text, View, Pressable, ViewStyle } from 'react-native';
import { TrendingUp } from 'lucide-react-native';
import { colors, radius, spacing, typography } from '../../theme/tokens';
import { formatINR as sharedINR, formatNumber as sharedNum } from '@poultryos/shared';

export interface MarketPriceStripProps {
  state: string | null;
  priceDate: string | null;
  broilerPricePerKg: number | null;
  eggPricePer100: number | null;
  source?: 'agmarknet' | 'nafed' | 'manual' | null;
  loading?: boolean;
  onPress?: () => void;
  style?: ViewStyle;
  testID?: string;
}

function formatINR(n: number | null): string {
  if (n === null) return '—';
  return sharedINR(n, { decimals: 2 });
}

function formatPriceDate(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${String(d.getDate()).padStart(2, '0')}-${months[d.getMonth()]}`;
}

export function MarketPriceStrip({
  state,
  priceDate,
  broilerPricePerKg,
  eggPricePer100,
  source,
  loading = false,
  onPress,
  style,
  testID,
}: MarketPriceStripProps) {
  const dateLabel = formatPriceDate(priceDate);
  const sourceLabel = source ? source.toUpperCase() : '';

  const content = (
    <View style={[styles.row, style]} testID={testID}>
      <View style={styles.left}>
        <View style={styles.iconWrap}>
          <TrendingUp size={16} color={colors.primary} />
        </View>
        <View style={styles.labels}>
          <Text style={styles.eyebrow}>
            {state ? `${state} market` : 'Market prices'}
          </Text>
          <Text style={styles.meta}>
            {loading
              ? 'Loading…'
              : dateLabel
                ? `${dateLabel}${sourceLabel ? ` · ${sourceLabel}` : ''}`
                : 'No data yet'}
          </Text>
        </View>
      </View>

      <View style={styles.right}>
        <View style={styles.priceCol}>
          <Text style={styles.priceLabel}>Broiler/kg</Text>
          <Text style={styles.priceValue}>{formatINR(broilerPricePerKg)}</Text>
        </View>
        <View style={styles.divider} />
        <View style={styles.priceCol}>
          <Text style={styles.priceLabel}>Eggs/100</Text>
          <Text style={styles.priceValue}>{formatINR(eggPricePer100)}</Text>
        </View>
      </View>
    </View>
  );

  if (onPress) {
    return (
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel="Market prices"
      >
        {content}
      </Pressable>
    );
  }
  return content;
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.canvas,
    borderColor: colors.mute,
    borderWidth: 1,
    borderRadius: radius.card,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    gap: spacing.md,
  },
  left: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    flexShrink: 1,
  },
  iconWrap: {
    width: 28,
    height: 28,
    borderRadius: radius.full,
    backgroundColor: colors.canvasSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  labels: { flexShrink: 1 },
  eyebrow: {
    ...typography.captionUppercase,
    color: colors.body,
  },
  meta: {
    ...typography.caption,
    color: colors.body,
    marginTop: spacing.xxs,
  },
  right: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  priceCol: {
    alignItems: 'flex-end',
  },
  priceLabel: {
    ...typography.caption,
    color: colors.body,
  },
  priceValue: {
    ...typography.bodyMdStrong,
    color: colors.ink,
  },
  divider: {
    width: 1,
    height: 28,
    backgroundColor: colors.mute,
  },
});
