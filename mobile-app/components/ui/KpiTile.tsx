import { Minus, TrendingDown, TrendingUp } from 'lucide-react-native';
import { StyleSheet, Text, View, ViewStyle } from 'react-native';
import { colors, spacing, typography } from '../../theme/tokens';
import { Card } from './Card';

export type KpiTone = 'neutral' | 'positive' | 'negative' | 'warning';

export type KpiDelta = {
  value: string;
  direction: 'up' | 'down' | 'flat';
};

export interface KpiTileProps {
  label: string;
  value: string | number;
  unit?: string;
  delta?: KpiDelta;
  /** Small caption below the value — e.g. "Target: 1.6 (Cobb 500)". */
  caption?: string;
  tone?: KpiTone;
  onPress?: () => void;
  style?: ViewStyle;
  testID?: string;
}

const TONE_COLORS: Record<KpiTone, string> = {
  neutral: colors.ink,
  positive: colors.success,
  negative: colors.primary,
  warning: colors.warning,
};

const DELTA_COLORS: Record<'up' | 'down' | 'flat', string> = {
  up: colors.success,
  down: colors.primary,
  flat: colors.body,
};

export function KpiTile({
  label,
  value,
  unit,
  delta,
  caption,
  tone = 'neutral',
  onPress,
  style,
  testID,
}: KpiTileProps) {
  const valueColor = TONE_COLORS[tone];

  const DeltaIcon =
    delta?.direction === 'up'
      ? TrendingUp
      : delta?.direction === 'down'
        ? TrendingDown
        : Minus;

  const deltaColor = delta ? DELTA_COLORS[delta.direction] : colors.body;

  return (
    <Card
      onPress={onPress}
      style={StyleSheet.flatten([styles.card, style])}
      testID={testID}
    >
      {/* Label row */}
      <Text style={styles.label} numberOfLines={1}>
        {label}
      </Text>

      {/* Value row */}
      <View style={styles.valueRow}>
        <Text style={[styles.value, { color: valueColor }]} numberOfLines={1}>
          {value}
        </Text>
        {!!unit && (
          <Text style={styles.unit} numberOfLines={1}>
            {unit}
          </Text>
        )}
      </View>

      {/* Delta row */}
      {!!delta && (
        <View style={styles.deltaRow}>
          <DeltaIcon size={14} color={deltaColor} />
          <Text style={[styles.deltaText, { color: deltaColor }]}>
            {delta.value}
          </Text>
        </View>
      )}

      {/* Caption (e.g. benchmark target) */}
      {!!caption && (
        <Text style={styles.caption} numberOfLines={2}>
          {caption}
        </Text>
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    padding: spacing.lg,
    minHeight: 44,
  },
  label: {
    fontSize: typography.captionUppercase.fontSize,
    lineHeight: typography.captionUppercase.lineHeight,
    fontWeight: typography.captionUppercase.fontWeight,
    fontFamily: typography.captionUppercase.fontFamily,
    letterSpacing: typography.captionUppercase.letterSpacing,
    textTransform: typography.captionUppercase.textTransform,
    color: colors.body,
    marginBottom: spacing.xs,
  },
  valueRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
  },
  value: {
    fontSize: typography.displayMd.fontSize,
    lineHeight: typography.displayMd.lineHeight,
    fontWeight: typography.displayMd.fontWeight,
    fontFamily: typography.displayMd.fontFamily,
  },
  unit: {
    fontSize: typography.bodySm.fontSize,
    lineHeight: typography.bodySm.lineHeight,
    fontWeight: typography.bodySm.fontWeight,
    fontFamily: typography.bodySm.fontFamily,
    color: colors.body,
    marginLeft: spacing.xs,
    // Align baseline with the large value numeral
    marginBottom: spacing.xs,
  },
  deltaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: spacing.xs,
    gap: spacing.xs,
  },
  deltaText: {
    fontSize: typography.caption.fontSize,
    lineHeight: typography.caption.lineHeight,
    fontWeight: typography.caption.fontWeight,
    fontFamily: typography.caption.fontFamily,
  },
  caption: {
    fontSize: typography.caption.fontSize,
    lineHeight: typography.caption.lineHeight,
    fontWeight: typography.caption.fontWeight,
    fontFamily: typography.caption.fontFamily,
    color: colors.body,
    marginTop: spacing.xs,
  },
});
