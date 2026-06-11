import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Check } from 'lucide-react-native';
import { colors, radius, spacing, typography, fonts } from '../../theme/tokens';
import { Button } from './Button';
import { formatINR as sharedINR, formatNumber as sharedNum } from '@poultryos/shared';

export type BillingCycle = 'monthly' | 'yearly';

export interface PlanCardProps {
  name: string;
  monthlyPrice: number;
  yearlyPrice: number;
  features: Record<string, boolean>;
  cycle: BillingCycle;
  onChangeCycle: (cycle: BillingCycle) => void;
  onSubscribe: () => void;
  loading?: boolean;
  ctaLabel?: string;
  ctaDisabled?: boolean;
}

const FEATURE_LABELS: Record<string, string> = {
  unlimited_farms: 'Unlimited farms',
  unlimited_sheds: 'Unlimited sheds',
  unlimited_workers: 'Unlimited workers',
  vet_access: 'Vet role access',
  unlimited_buyers: 'Unlimited buyers',
  unlimited_whatsapp_alerts: 'Unlimited WhatsApp alerts',
  contract_farming: 'Contract farming module',
  traceability_pdf: 'Traceability QR & PDF',
  multi_farm_dashboard: 'Multi-farm dashboard',
};

function formatINR(n: number): string {
  return sharedINR(n);
}

export function PlanCard({
  name,
  monthlyPrice,
  yearlyPrice,
  features,
  cycle,
  onChangeCycle,
  onSubscribe,
  loading = false,
  ctaLabel = 'Subscribe',
  ctaDisabled = false,
}: PlanCardProps) {
  const price = cycle === 'monthly' ? monthlyPrice : yearlyPrice;
  const cadence = cycle === 'monthly' ? '/month' : '/year';

  const enabledFeatures = useMemo(
    () =>
      Object.entries(features)
        .filter(([, on]) => on === true)
        .map(([key]) => FEATURE_LABELS[key] ?? key),
    [features],
  );

  // 17% yearly savings: 299 × 12 = 3588 → yearly 2999 = ~17% off
  const yearlySavingsPct = useMemo(() => {
    if (monthlyPrice <= 0) return 0;
    const annualised = monthlyPrice * 12;
    if (annualised <= 0) return 0;
    return Math.round(((annualised - yearlyPrice) / annualised) * 100);
  }, [monthlyPrice, yearlyPrice]);

  return (
    <View style={styles.card}>
      <Text style={styles.name}>{name}</Text>

      <View style={styles.cycleToggle}>
        <CycleButton
          label="Monthly"
          active={cycle === 'monthly'}
          onPress={() => onChangeCycle('monthly')}
        />
        <CycleButton
          label="Yearly"
          sublabel={yearlySavingsPct > 0 ? `Save ${yearlySavingsPct}%` : undefined}
          active={cycle === 'yearly'}
          onPress={() => onChangeCycle('yearly')}
        />
      </View>

      <View style={styles.priceRow}>
        <Text style={styles.price}>{formatINR(price)}</Text>
        <Text style={styles.cadence}>{cadence}</Text>
      </View>

      <View style={styles.featuresList}>
        {enabledFeatures.map((label) => (
          <View key={label} style={styles.featureRow}>
            <Check size={18} color={colors.success} />
            <Text style={styles.featureText}>{label}</Text>
          </View>
        ))}
      </View>

      <Button
        variant="primary"
        label={loading ? 'Working…' : ctaLabel}
        onPress={onSubscribe}
        disabled={loading || ctaDisabled}
        fullWidth
      />
    </View>
  );
}

interface CycleButtonProps {
  label: string;
  sublabel?: string;
  active: boolean;
  onPress: () => void;
}

function CycleButton({ label, sublabel, active, onPress }: CycleButtonProps) {
  return (
    <View
      style={[styles.cycleBtnWrap, active && styles.cycleBtnWrapActive]}
      onTouchEnd={onPress}
      accessible
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected: active }}
    >
      <Text style={[styles.cycleLabel, active && styles.cycleLabelActive]}>
        {label}
      </Text>
      {sublabel ? (
        <Text style={[styles.cycleSublabel, active && styles.cycleSublabelActive]}>
          {sublabel}
        </Text>
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
    padding: spacing['2xl'],
    gap: spacing.lg,
  },
  name: {
    fontSize: typography.displaySm.fontSize,
    lineHeight: typography.displaySm.lineHeight,
    fontWeight: typography.displaySm.fontWeight,
    fontFamily: typography.displaySm.fontFamily,
    color: colors.ink,
  },
  cycleToggle: {
    flexDirection: 'row',
    backgroundColor: colors.canvasSoft,
    borderRadius: radius.pillLg,
    padding: spacing.xs,
    gap: spacing.xs,
  },
  cycleBtnWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radius.pillLg,
    minHeight: 44,
  },
  cycleBtnWrapActive: {
    backgroundColor: colors.canvas,
  },
  cycleLabel: {
    fontSize: typography.bodySm.fontSize,
    lineHeight: typography.bodySm.lineHeight,
    fontWeight: '600', fontFamily: fonts.semibold,
    color: colors.body,
  },
  cycleLabelActive: {
    color: colors.ink,
  },
  cycleSublabel: {
    fontSize: 11,
    lineHeight: 14,
    fontWeight: '700', fontFamily: fonts.bold,
    color: colors.success,
    marginTop: 2,
  },
  cycleSublabelActive: {
    color: colors.success,
  },
  priceRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: spacing.xs,
  },
  price: {
    fontSize: typography.displayMd.fontSize,
    lineHeight: typography.displayMd.lineHeight,
    fontWeight: '700', fontFamily: fonts.bold,
    color: colors.ink,
  },
  cadence: {
    fontSize: typography.bodyMd.fontSize,
    lineHeight: typography.bodyMd.lineHeight,
    color: colors.body,
  },
  featuresList: {
    gap: spacing.sm,
  },
  featureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  featureText: {
    flex: 1,
    fontSize: typography.bodySm.fontSize,
    lineHeight: typography.bodySm.lineHeight,
    color: colors.ink,
  },
});
