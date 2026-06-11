import { StyleSheet, Text, View } from 'react-native';
import { Check } from 'lucide-react-native';
import { colors, radius, spacing, typography } from '../../theme/tokens';
import { Button, type ButtonVariant } from './Button';
import { formatINR } from '@poultryos/shared';

export interface TierCardProps {
  name: string;
  /** Resolved price for the selected cycle. Ignored when `priceLabel` is set. */
  price: number;
  /** "/month" · "/year" · "" — hidden when `priceLabel` is set. */
  cadence?: string;
  /** Override the price line, e.g. "Custom" / "Free" for edge tiers. */
  priceLabel?: string;
  recommended?: boolean;
  recommendedLabel?: string;
  current?: boolean;
  currentLabel?: string;
  highlights: string[];
  ctaLabel: string;
  ctaVariant?: ButtonVariant;
  ctaDisabled?: boolean;
  loading?: boolean;
  onPress: () => void;
  testID?: string;
}

export function TierCard({
  name,
  price,
  cadence = '',
  priceLabel,
  recommended = false,
  recommendedLabel = 'Recommended',
  current = false,
  currentLabel = 'Current plan',
  highlights,
  ctaLabel,
  ctaVariant = 'primary',
  ctaDisabled = false,
  loading = false,
  onPress,
  testID,
}: TierCardProps) {
  return (
    <View
      style={[styles.card, recommended && styles.cardRecommended, current && styles.cardCurrent]}
      testID={testID}
    >
      <View style={styles.headerRow}>
        <Text style={styles.name}>{name}</Text>
        {current ? (
          <View style={[styles.badge, styles.badgeCurrent]}>
            <Text style={styles.badgeCurrentText}>{currentLabel}</Text>
          </View>
        ) : recommended ? (
          <View style={[styles.badge, styles.badgeRecommended]}>
            <Text style={styles.badgeRecommendedText}>{recommendedLabel}</Text>
          </View>
        ) : null}
      </View>

      <View style={styles.priceRow}>
        {priceLabel ? (
          <Text style={styles.price}>{priceLabel}</Text>
        ) : (
          <>
            <Text style={styles.price}>{formatINR(price)}</Text>
            {!!cadence && <Text style={styles.cadence}>{cadence}</Text>}
          </>
        )}
      </View>

      <View style={styles.highlights}>
        {highlights.map((h) => (
          <View key={h} style={styles.highlightRow}>
            <Check size={16} color={colors.success} />
            <Text style={styles.highlightText}>{h}</Text>
          </View>
        ))}
      </View>

      <Button
        variant={ctaVariant}
        label={loading ? '…' : ctaLabel}
        onPress={onPress}
        disabled={ctaDisabled || loading}
        fullWidth
      />
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
  cardRecommended: { borderColor: colors.primary, borderWidth: 2 },
  cardCurrent: { borderColor: colors.success, borderWidth: 2 },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  name: { ...typography.displaySm, color: colors.ink },
  badge: { paddingHorizontal: spacing.sm, paddingVertical: spacing.xxs, borderRadius: radius.sm },
  badgeRecommended: { backgroundColor: colors.primarySubtle },
  badgeRecommendedText: { ...typography.captionStrong, color: colors.primary },
  badgeCurrent: { backgroundColor: colors.successSoft },
  badgeCurrentText: { ...typography.captionStrong, color: colors.successInk },
  priceRow: { flexDirection: 'row', alignItems: 'baseline', gap: spacing.xs },
  price: { ...typography.displayMd, color: colors.ink },
  cadence: { ...typography.bodyMd, color: colors.body },
  highlights: { gap: spacing.sm },
  highlightRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  highlightText: { ...typography.bodySm, color: colors.ink, flex: 1 },
});
