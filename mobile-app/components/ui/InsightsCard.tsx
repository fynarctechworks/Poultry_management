import { Fragment } from 'react';
import { Pressable, StyleSheet, Text, View, ViewStyle } from 'react-native';
import { useTranslation } from 'react-i18next';
import { formatINR, type Insight, type InsightSeverity } from '@poultryos/shared';
import { colors, radius, spacing, typography } from '../../theme/tokens';

export interface InsightsCardProps {
  insights: Insight[];
  onPressInsight?: (insight: Insight) => void;
  /** Cap the number of rows shown (the feed is pre-sorted most-actionable first). */
  maxItems?: number;
  style?: ViewStyle;
  testID?: string;
}

function severityColor(severity: InsightSeverity): string {
  switch (severity) {
    case 'critical': return colors.danger;
    case 'warning': return colors.warning;
    case 'positive': return colors.success;
    default: return colors.body;
  }
}

export function InsightsCard({
  insights,
  onPressInsight,
  maxItems = 4,
  style,
  testID,
}: InsightsCardProps) {
  const { t } = useTranslation();
  if (insights.length === 0) return null;

  const shown = insights.slice(0, maxItems);
  const remaining = insights.length - shown.length;

  return (
    <View style={[styles.card, style]} testID={testID}>
      <Text style={styles.heading}>{t('insights.section_title')}</Text>

      {shown.map((insight, idx) => {
        const accent = severityColor(insight.severity);
        const detail =
          t(insight.detailKey, insight.detailParams as Record<string, unknown>) +
          (insight.suffixKey ? t(insight.suffixKey) : '');
        const rupee = insight.rupeeImpact;
        const Row = (
          <View style={styles.row}>
            <View style={[styles.dot, { backgroundColor: accent }]} />
            <View style={styles.rowBody}>
              <Text style={styles.title}>{t(insight.titleKey)}</Text>
              <Text style={styles.detail}>{detail}</Text>
              {rupee != null && Math.abs(rupee) >= 1 ? (
                <Text
                  style={[
                    styles.rupee,
                    { color: rupee < 0 ? colors.danger : colors.successInk },
                  ]}
                >
                  {rupee < 0
                    ? t('insights.costing', { amount: formatINR(Math.abs(rupee), { decimals: 0 }) })
                    : t('insights.saving', { amount: formatINR(Math.abs(rupee), { decimals: 0 }) })}
                </Text>
              ) : null}
              <Text style={styles.batchMeta}>{insight.batchCode}</Text>
            </View>
          </View>
        );
        return (
          <Fragment key={insight.id}>
            {idx > 0 ? <View style={styles.divider} /> : null}
            {onPressInsight ? (
              <Pressable
                onPress={() => onPressInsight(insight)}
                accessibilityRole="button"
                style={({ pressed }) => [pressed && styles.pressed]}
                testID={`insight-${insight.metric}`}
              >
                {Row}
              </Pressable>
            ) : (
              Row
            )}
          </Fragment>
        );
      })}

      {remaining > 0 ? (
        <Text style={styles.more}>{t('insights.more', { count: remaining })}</Text>
      ) : null}
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
    gap: spacing.md,
  },
  heading: {
    ...typography.captionUppercase,
    color: colors.body,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: radius.full,
    marginTop: spacing.xs,
  },
  rowBody: {
    flex: 1,
    gap: spacing.xxs,
  },
  title: {
    ...typography.bodyMdStrong,
    color: colors.ink,
  },
  detail: {
    ...typography.bodySm,
    color: colors.body,
  },
  rupee: {
    ...typography.captionStrong,
    marginTop: spacing.xxs,
  },
  batchMeta: {
    ...typography.caption,
    color: colors.bodySoft,
    marginTop: spacing.xxs,
  },
  divider: {
    height: 1,
    backgroundColor: colors.mute,
  },
  pressed: {
    opacity: 0.85,
  },
  more: {
    ...typography.caption,
    color: colors.body,
  },
});
