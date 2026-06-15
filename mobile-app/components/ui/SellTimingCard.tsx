import { StyleSheet, Text, View, ViewStyle } from 'react-native';
import { useTranslation } from 'react-i18next';
import { formatINR, type SellTimingResult } from '@poultryos/shared';
import { colors, radius, spacing, typography } from '../../theme/tokens';

export interface SellTimingCardProps {
  result: SellTimingResult;
  style?: ViewStyle;
  testID?: string;
}

export function SellTimingCard({ result, style, testID }: SellTimingCardProps) {
  const { t } = useTranslation();
  const { recommendation, netMarginPerDay, marginalRevenuePerDay, marginalFeedCostPerDay, daysToTarget } =
    result;

  if (recommendation === 'unknown') {
    return (
      <View style={[styles.card, style]} testID={testID}>
        <Text style={styles.heading}>{t('sell_timing.title')}</Text>
        <Text style={styles.unknown}>{t('sell_timing.unknown')}</Text>
      </View>
    );
  }

  const sell = recommendation === 'sell_now';
  const accent = sell ? colors.warning : colors.success;

  return (
    <View style={[styles.card, style]} testID={testID}>
      <Text style={styles.heading}>{t('sell_timing.title')}</Text>

      <View style={styles.verdictRow}>
        <View style={[styles.dot, { backgroundColor: accent }]} />
        <Text style={[styles.verdict, { color: sell ? colors.warningInk : colors.successInk }]}>
          {sell ? t('sell_timing.sell_now') : t('sell_timing.keep_growing')}
        </Text>
      </View>

      <Text style={styles.explain}>
        {sell ? t('sell_timing.explain_sell') : t('sell_timing.explain_grow')}
      </Text>

      <View style={styles.divider} />

      <Row label={t('sell_timing.extra_revenue')} value={`${formatINR(marginalRevenuePerDay, { decimals: 0 })}/${t('sell_timing.day')}`} />
      <Row label={t('sell_timing.extra_feed_cost')} value={`${formatINR(marginalFeedCostPerDay, { decimals: 0 })}/${t('sell_timing.day')}`} />
      <Row
        label={t('sell_timing.net_per_day')}
        value={`${formatINR(netMarginPerDay, { decimals: 0, signed: true })}/${t('sell_timing.day')}`}
        strong
        valueColor={netMarginPerDay >= 0 ? colors.successInk : colors.danger}
      />
      {daysToTarget != null ? (
        <Row label={t('sell_timing.days_to_target')} value={t('sell_timing.days', { count: Math.ceil(daysToTarget) })} />
      ) : null}
    </View>
  );
}

function Row({
  label,
  value,
  strong,
  valueColor,
}: {
  label: string;
  value: string;
  strong?: boolean;
  valueColor?: string;
}) {
  return (
    <View style={styles.row}>
      <Text style={[styles.rowLabel, strong && styles.rowLabelStrong]}>{label}</Text>
      <Text style={[styles.rowValue, strong && styles.rowValueStrong, valueColor ? { color: valueColor } : null]}>
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.canvas,
    borderWidth: 1,
    borderColor: colors.mute,
    borderRadius: radius.card,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  heading: { ...typography.captionUppercase, color: colors.body },
  unknown: { ...typography.bodySm, color: colors.body },
  verdictRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  dot: { width: 10, height: 10, borderRadius: radius.full },
  verdict: { ...typography.displayXs },
  explain: { ...typography.bodySm, color: colors.body },
  divider: { height: 1, backgroundColor: colors.mute, marginVertical: spacing.xs },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  rowLabel: { ...typography.bodySm, color: colors.body },
  rowLabelStrong: { ...typography.bodyMdStrong, color: colors.ink },
  rowValue: { ...typography.bodySm, color: colors.ink },
  rowValueStrong: { ...typography.bodyMdStrong },
});
