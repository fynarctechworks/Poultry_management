import { useCallback, useMemo, useState } from 'react';
import { Linking, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Stack, useFocusEffect } from 'expo-router';
import { ShieldCheck, AlertCircle, Clock } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { supabase } from '../../lib/supabase';
import { Card, SegmentedControl, TierCard, Snackbar } from '../../components/ui';
import { useTenantBilling, trialDaysLeft, type BillingCycle } from '../../lib/billing-hooks';
import { track, FUNNEL } from '../../lib/analytics';
import { colors, radius, spacing, typography } from '../../theme/tokens';

interface PlanRow {
  id: string;
  code: string;
  name: string;
  tier: string;
  monthly_price_inr: number;
  yearly_price_inr: number;
  max_farms: number | null;
  max_users: number | null;
  is_contactable: boolean;
  sort_order: number;
  recommended: boolean;
  features_json: Record<string, unknown>;
}

const CONTACT_EMAIL = 'sales@poultryos.app';

function buildHighlights(plan: PlanRow, t: TFunction): string[] {
  const f = plan.features_json ?? {};
  const out: string[] = [];

  out.push(plan.max_farms == null
    ? t('billing.tiers.hl.farms_unlimited')
    : t('billing.tiers.hl.farms', { count: plan.max_farms }));
  out.push(plan.max_users == null
    ? t('billing.tiers.hl.users_unlimited')
    : t('billing.tiers.hl.users', { count: plan.max_users }));

  const buyers = f.max_buyers as number | null | undefined;
  out.push(buyers == null
    ? t('billing.tiers.hl.buyers_unlimited')
    : t('billing.tiers.hl.buyers', { count: buyers }));

  const wa = f.whatsapp_alerts_per_month as number | null | undefined;
  out.push(wa == null
    ? t('billing.tiers.hl.whatsapp_unlimited')
    : t('billing.tiers.hl.whatsapp', { count: wa }));

  if (f.contract_farming === true) out.push(t('billing.tiers.hl.contract'));
  if (f.traceability_pdf === true) out.push(t('billing.tiers.hl.traceability'));
  if (f.multi_farm_dashboard === true) out.push(t('billing.tiers.hl.multi_farm'));
  if (f.vet_access === true) out.push(t('billing.tiers.hl.vet'));
  if (f.dedicated_support === true) out.push(t('billing.tiers.hl.support'));

  return out.slice(0, 6);
}

export default function BillingScreen() {
  const { t } = useTranslation();
  const { billing, refetch } = useTenantBilling();
  const [plans, setPlans] = useState<PlanRow[]>([]);
  const [cycle, setCycle] = useState<BillingCycle>('monthly');
  const [subscribingCode, setSubscribingCode] = useState<string | null>(null);
  const [snackbar, setSnackbar] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data } = await supabase
      .from('subscription_plans')
      .select('id, code, name, tier, monthly_price_inr, yearly_price_inr, max_farms, max_users, is_contactable, sort_order, recommended, features_json')
      .eq('is_active', true)
      .order('sort_order');
    if (data) setPlans(data as PlanRow[]);
  }, []);

  useFocusEffect(useCallback(() => { load(); refetch(); }, [load, refetch]));

  async function handleSubscribe(plan: PlanRow) {
    setSubscribingCode(plan.code);
    void track(FUNNEL.PLAN_SELECTED, { plan_code: plan.code, billing_cycle: cycle });
    try {
      const { data, error } = await supabase.functions.invoke('create-razorpay-subscription', {
        body: { plan_code: plan.code, billing_cycle: cycle },
      });
      if (error) { setSnackbar(error.message ?? t('billing.errors.checkout_unknown')); return; }
      if (!data?.ok) {
        const reason = data?.reason ?? 'unknown';
        if (reason === 'not_configured') setSnackbar(t('billing.errors.not_configured'));
        else if (reason === 'plan_not_configured') setSnackbar(t('billing.errors.plan_not_configured'));
        else setSnackbar(t('billing.errors.checkout_failed', { reason }));
        return;
      }
      if (data.short_url) await Linking.openURL(data.short_url);
      else setSnackbar(t('billing.errors.missing_url'));
    } catch (err) {
      setSnackbar(err instanceof Error ? err.message : t('billing.errors.unexpected'));
    } finally {
      setSubscribingCode(null);
    }
  }

  function handleContact() {
    Linking.openURL(`mailto:${CONTACT_EMAIL}?subject=PoultryOS%20Enterprise`).catch(() =>
      setSnackbar(t('billing.tiers.contact_failed')),
    );
  }

  const daysLeft = useMemo(() => trialDaysLeft(billing), [billing]);
  const status = billing.status;

  // Status card colour + message
  const statusIcon = status === 'active' ? <ShieldCheck size={28} color={colors.success} />
    : status === 'trial' ? <Clock size={28} color={colors.primary} />
    : <AlertCircle size={28} color={colors.warning} />;

  const statusValue = status === 'trial' && daysLeft != null
    ? t('billing.tiers.status.trial_days', { count: daysLeft })
    : t(`billing.tiers.status.${status}`);

  return (
    <View style={styles.root}>
      <Stack.Screen options={{ title: t('billing.title') }} />
      <ScrollView contentContainerStyle={styles.content}>
        <Card>
          <View style={styles.statusRow}>
            {statusIcon}
            <View style={styles.statusTextCol}>
              <Text style={styles.statusLabel}>{t('billing.status')}</Text>
              <Text style={styles.statusValue}>{statusValue}</Text>
            </View>
          </View>
          {status === 'past_due' ? (
            <View style={styles.warningPill}>
              <Text style={styles.warningPillText}>{t('billing.past_due_warning')}</Text>
            </View>
          ) : null}
        </Card>

        <SegmentedControl
          value={cycle}
          onChange={(v) => setCycle(v as BillingCycle)}
          options={[
            { value: 'monthly', label: t('billing.tiers.monthly') },
            { value: 'yearly', label: t('billing.tiers.yearly_save') },
          ]}
        />

        {plans.map((plan) => {
          const isCurrent = plan.code === billing.currentPlanCode;
          const price = cycle === 'monthly' ? Number(plan.monthly_price_inr) : Number(plan.yearly_price_inr);
          const isFree = !plan.is_contactable && Number(plan.monthly_price_inr) === 0 && Number(plan.yearly_price_inr) === 0;

          let ctaLabel: string;
          let ctaDisabled = false;
          let onPress: () => void = () => { void handleSubscribe(plan); };
          let ctaVariant: 'primary' | 'outlineDark' = plan.recommended ? 'primary' : 'outlineDark';

          if (plan.is_contactable) {
            ctaLabel = t('billing.tiers.contact_sales');
            onPress = handleContact;
          } else if (isCurrent && (status === 'active' || status === 'trial')) {
            ctaLabel = t('billing.tiers.current_cta');
            ctaDisabled = true;
          } else if (isFree) {
            ctaLabel = t('billing.tiers.free_cta');
            ctaDisabled = true;
          } else {
            ctaLabel = t('billing.subscribe');
          }

          return (
            <TierCard
              key={plan.code}
              name={plan.name}
              price={price}
              cadence={cycle === 'monthly' ? t('billing.tiers.per_month') : t('billing.tiers.per_year')}
              priceLabel={plan.is_contactable ? t('billing.tiers.custom_price') : isFree ? t('billing.tiers.free_price') : undefined}
              recommended={plan.recommended}
              recommendedLabel={t('billing.tiers.recommended')}
              current={isCurrent}
              currentLabel={t('billing.tiers.current_badge')}
              highlights={buildHighlights(plan, t)}
              ctaLabel={ctaLabel}
              ctaVariant={ctaVariant}
              ctaDisabled={ctaDisabled}
              loading={subscribingCode === plan.code}
              onPress={onPress}
            />
          );
        })}

        <Card>
          <Text style={styles.helpTitle}>{t('billing.how_it_works_title')}</Text>
          <Text style={styles.helpBody}>{t('billing.how_it_works_p1')}</Text>
          <Text style={styles.helpBody}>{t('billing.how_it_works_p2')}</Text>
        </Card>
      </ScrollView>

      <Snackbar visible={!!snackbar} onDismiss={() => setSnackbar(null)}>{snackbar ?? ''}</Snackbar>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.canvasSoft },
  content: { padding: spacing.lg, gap: spacing.lg, paddingBottom: spacing['3xl'] },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  statusTextCol: { flex: 1 },
  statusLabel: { ...typography.captionUppercase, color: colors.body },
  statusValue: { ...typography.bodyMdStrong, color: colors.ink, marginTop: spacing.xxs },
  warningPill: {
    backgroundColor: colors.warningSoft, paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
    borderRadius: radius.sm, marginTop: spacing.md,
  },
  warningPillText: { ...typography.bodySm, color: colors.warningInk },
  helpTitle: { ...typography.bodyMdStrong, color: colors.ink, marginBottom: spacing.sm },
  helpBody: { ...typography.bodySm, color: colors.body, marginBottom: spacing.sm },
});
