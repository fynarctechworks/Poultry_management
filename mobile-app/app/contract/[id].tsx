import { useCallback, useState } from 'react';
import { Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { Snackbar } from 'react-native-paper';
import { useTranslation } from 'react-i18next';
import { MessageCircle } from 'lucide-react-native';
import { supabase } from '../../lib/supabase';
import { useFarmStore } from '../../stores/farm';
import {
  Button,
  Card,
  ContractReconciliationCard,
  ContractStatementModal,
  ContractTariffModal,
} from '../../components/ui';
import { colors, radius, spacing, typography } from '../../theme/tokens';
import { formatDDMMMYYYY } from '../../lib/format-date';
import {
  formatINR as sharedINR,
  computeContractReconciliation,
  parseTariffCard,
  buildContractReconciliationMessage,
  type ContractFigures,
  type ContractReconciliation,
} from '@poultryos/shared';


interface CycleRow {
  id: string;
  status: 'active' | 'harvest_complete' | 'settled' | 'disputed';
  chicks_supplied: number;
  chicks_supplied_date: string;
  total_feed_supplied_kg: number;
  expected_harvest_date: string | null;
  actual_harvest_date: string | null;
  birds_delivered: number | null;
  avg_weight_kg: number | null;
  actual_fcr: number | null;
  actual_mortality_pct: number | null;
  expected_settlement_amount: number | null;
  actual_settlement_amount: number | null;
  settlement_received_date: string | null;
  dispute_notes: string | null;
  integrator_birds_lifted: number | null;
  integrator_avg_weight_kg: number | null;
  integrator_fcr: number | null;
  integrator_mortality_pct: number | null;
  tariff_card_snapshot: any | null;
  tariff_confirmed_at: string | null;
  batches: { batch_code: string; breed_name: string | null } | null;
  integrators: { name: string; tariff_card_json: any } | null;
}

interface SettlementBreakdown {
  total_live_weight_kg: number;
  base_amount: number;
  fcr_bonus: number;
  mortality_bonus: number;
  total_settlement: number;
}

function formatINR(n: number | null | undefined): string {
  if (n === null || n === undefined) return '—';
  return sharedINR(n, { decimals: 2 });
}

const numOrNull = (v: unknown): number | null => (v == null ? null : Number(v));

function growerFigures(c: CycleRow): ContractFigures {
  return {
    birdsLifted: numOrNull(c.birds_delivered) ?? 0,
    avgWeightKg: numOrNull(c.avg_weight_kg) ?? 0,
    fcr: numOrNull(c.actual_fcr),
    mortalityPct: numOrNull(c.actual_mortality_pct),
  };
}

function integratorFigures(c: CycleRow): Partial<ContractFigures> {
  return {
    birdsLifted: numOrNull(c.integrator_birds_lifted) ?? undefined,
    avgWeightKg: numOrNull(c.integrator_avg_weight_kg) ?? undefined,
    fcr: numOrNull(c.integrator_fcr),
    mortalityPct: numOrNull(c.integrator_mortality_pct),
  };
}

function buildReconciliation(c: CycleRow): ContractReconciliation {
  const tariff = parseTariffCard(c.tariff_card_snapshot ?? c.integrators?.tariff_card_json ?? {});
  return computeContractReconciliation({
    tariff,
    your: growerFigures(c),
    integrator: integratorFigures(c),
    integratorStatedAmount: numOrNull(c.actual_settlement_amount),
    tariffConfirmed: c.tariff_confirmed_at != null,
  });
}

function hasIntegratorStatement(c: CycleRow): boolean {
  return (
    c.integrator_birds_lifted != null ||
    c.integrator_avg_weight_kg != null ||
    c.integrator_fcr != null ||
    c.integrator_mortality_pct != null ||
    c.actual_settlement_amount != null
  );
}

export default function ContractDetailScreen() {
  const { t } = useTranslation();
  const { id } = useLocalSearchParams<{ id: string }>();
  const currentFarm = useFarmStore((s) => s.currentFarm);
  const [cycle, setCycle] = useState<CycleRow | null>(null);
  const [breakdown, setBreakdown] = useState<SettlementBreakdown | null>(null);
  const [snackbar, setSnackbar] = useState<string | null>(null);
  const [recalcLoading, setRecalcLoading] = useState(false);
  const [tariffOpen, setTariffOpen] = useState(false);
  const [statementOpen, setStatementOpen] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    const { data, error } = await supabase
      .from('contract_cycles')
      .select(
        'id, status, chicks_supplied, chicks_supplied_date, total_feed_supplied_kg, expected_harvest_date, actual_harvest_date, birds_delivered, avg_weight_kg, actual_fcr, actual_mortality_pct, expected_settlement_amount, actual_settlement_amount, settlement_received_date, dispute_notes, integrator_birds_lifted, integrator_avg_weight_kg, integrator_fcr, integrator_mortality_pct, tariff_card_snapshot, tariff_confirmed_at, batches!inner(batch_code, breed_name), integrators(name, tariff_card_json)',
      )
      .eq('id', id)
      .maybeSingle();
    if (error) {
      setSnackbar(error.message);
      return;
    }
    if (!data) return;
    const normalised = {
      ...data,
      batches: Array.isArray((data as any).batches)
        ? (data as any).batches[0] ?? null
        : (data as any).batches,
      integrators: Array.isArray((data as any).integrators)
        ? (data as any).integrators[0] ?? null
        : (data as any).integrators,
    } as CycleRow;
    setCycle(normalised);
  }, [id]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  async function shareReconciliation() {
    if (!cycle) return;
    const recon = buildReconciliation(cycle);
    const text = buildContractReconciliationMessage(recon, {
      batchCode: cycle.batches?.batch_code ?? null,
      farmName: currentFarm?.farm_name ?? null,
      integratorName: cycle.integrators?.name ?? null,
      breedName: cycle.batches?.breed_name ?? null,
      chicksSupplied: Number(cycle.chicks_supplied),
      totalFeedSuppliedKg: Number(cycle.total_feed_supplied_kg),
      harvestDate: cycle.actual_harvest_date,
      settlementReceivedDate: cycle.settlement_received_date,
      disputeNotes: cycle.dispute_notes,
      your: growerFigures(cycle),
      integrator: integratorFigures(cycle),
    });
    const encoded = encodeURIComponent(text);
    const native = `whatsapp://send?text=${encoded}`;
    const fallback = `https://wa.me/?text=${encoded}`;
    try {
      const ok = await Linking.canOpenURL(native);
      await Linking.openURL(ok ? native : fallback);
    } catch {
      try {
        await Linking.openURL(fallback);
      } catch (err) {
        setSnackbar(err instanceof Error ? err.message : t('contract.detail.errors.whatsapp_failed'));
      }
    }
  }

  async function recalcSettlement() {
    if (!id) return;
    setRecalcLoading(true);
    try {
      const { data, error } = await supabase.rpc('calculate_contract_settlement', {
        p_cycle_id: id,
      });
      if (error) throw error;
      // RPC returns SETOF so the JS client gets an array.
      const row = Array.isArray(data) ? data[0] : data;
      setBreakdown(row as SettlementBreakdown);

      // Persist the expected_settlement_amount onto the cycle for the list view.
      if (row?.total_settlement != null) {
        await supabase
          .from('contract_cycles')
          .update({
            expected_settlement_amount: row.total_settlement,
            updated_at: new Date().toISOString(),
          })
          .eq('id', id);
        load();
      }
    } catch (err: unknown) {
      setSnackbar(err instanceof Error ? err.message : t('contract.detail.errors.compute_failed'));
    } finally {
      setRecalcLoading(false);
    }
  }

  if (!cycle) {
    return (
      <View style={styles.root}>
        <Stack.Screen options={{ title: t('contract.detail.fallback_title') }} />
        <View style={styles.loadingWrap}>
          <Text style={styles.muted}>{t('contract.detail.loading')}</Text>
        </View>
        <Snackbar visible={!!snackbar} onDismiss={() => setSnackbar(null)}>
          {snackbar ?? ''}
        </Snackbar>
      </View>
    );
  }

  const tariff = cycle.integrators?.tariff_card_json ?? {};
  const expectedVsActualDelta =
    cycle.actual_settlement_amount != null && cycle.expected_settlement_amount != null
      ? Number(cycle.actual_settlement_amount) - Number(cycle.expected_settlement_amount)
      : null;
  const tariffConfirmed = cycle.tariff_confirmed_at != null;
  const effectiveTariff = parseTariffCard(cycle.tariff_card_snapshot ?? cycle.integrators?.tariff_card_json ?? {});
  const reconciliation = buildReconciliation(cycle);
  const showReconciliation = hasIntegratorStatement(cycle);
  const isLocked = cycle.status === 'settled';

  return (
    <View style={styles.root}>
      <Stack.Screen
        options={{ title: cycle.batches?.batch_code ?? t('contract.detail.fallback_title') }}
      />
      <ScrollView contentContainerStyle={styles.content}>
        {/* Header card */}
        <Card>
          <Text style={styles.title}>
            {cycle.batches?.batch_code ?? '—'}
          </Text>
          <Text style={styles.meta}>
            {cycle.integrators?.name ?? '—'}
            {cycle.batches?.breed_name ? ` · ${cycle.batches.breed_name}` : ''}
          </Text>
          <Text style={styles.meta}>
            {t('contract.detail.status_line', { status: t(`contract.status.${cycle.status}`) })}
          </Text>
        </Card>

        {/* Inputs */}
        <Card>
          <Text style={styles.sectionTitle}>{t('contract.detail.inputs')}</Text>
          <Row label={t('contract.detail.chicks_supplied')} value={cycle.chicks_supplied.toLocaleString('en-IN')} />
          <Row label={t('contract.detail.placed_on')} value={formatDDMMMYYYY(cycle.chicks_supplied_date)} />
          <Row
            label={t('contract.detail.feed_supplied')}
            value={t('contract.kg_suffix', { value: Number(cycle.total_feed_supplied_kg).toLocaleString('en-IN') })}
          />
          <Row
            label={t('contract.detail.expected_harvest')}
            value={
              cycle.expected_harvest_date
                ? formatDDMMMYYYY(cycle.expected_harvest_date)
                : '—'
            }
          />
        </Card>

        {/* Actuals */}
        <Card>
          <Text style={styles.sectionTitle}>{t('contract.detail.performance')}</Text>
          <Row
            label={t('contract.detail.birds_delivered')}
            value={
              cycle.birds_delivered != null
                ? cycle.birds_delivered.toLocaleString('en-IN')
                : '—'
            }
          />
          <Row
            label={t('contract.detail.avg_weight')}
            value={
              cycle.avg_weight_kg != null ? t('contract.kg_suffix', { value: cycle.avg_weight_kg }) : '—'
            }
          />
          <Row
            label={t('contract.detail.actual_fcr')}
            value={cycle.actual_fcr != null ? `${cycle.actual_fcr}` : '—'}
          />
          <Row
            label={t('contract.detail.actual_mortality')}
            value={
              cycle.actual_mortality_pct != null
                ? `${cycle.actual_mortality_pct}%`
                : '—'
            }
          />
          <Row
            label={t('contract.detail.harvested_on')}
            value={
              cycle.actual_harvest_date
                ? formatDDMMMYYYY(cycle.actual_harvest_date)
                : '—'
            }
          />
        </Card>

        {/* Tariff card */}
        {tariff && Object.keys(tariff).length ? (
          <Card>
            <Text style={styles.sectionTitle}>{t('contract.detail.tariff_card')}</Text>
            <Row
              label={t('contract.detail.base_rate')}
              value={t('contract.detail.base_rate_value', { rate: tariff.base_growing_charge_per_kg ?? '—' })}
            />
            <Row
              label={t('contract.detail.fcr_bonus')}
              value={
                tariff.fcr_bonus
                  ? t('contract.detail.fcr_bonus_value', {
                      bonus: tariff.fcr_bonus.bonus_per_kg,
                      threshold: tariff.fcr_bonus.threshold,
                    })
                  : '—'
              }
            />
            <Row
              label={t('contract.detail.mortality_bonus')}
              value={
                tariff.mortality_bonus
                  ? t('contract.detail.mortality_bonus_value', {
                      bonus: tariff.mortality_bonus.bonus_per_kg,
                      threshold: tariff.mortality_bonus.threshold_pct,
                    })
                  : '—'
              }
            />
            <Row
              label={t('contract.detail.weight_target')}
              value={t('contract.kg_suffix', { value: tariff.weight_target_kg ?? '—' })}
            />
          </Card>
        ) : null}

        {/* Confirm tariff terms — required before reconciling */}
        {!isLocked ? (
          <Card>
            <Text style={styles.sectionTitle}>{t('contract.tariff.title')}</Text>
            <Text style={styles.bodyText}>
              {tariffConfirmed
                ? t('contract.tariff.confirmed_on', {
                    date: cycle.tariff_confirmed_at ? formatDDMMMYYYY(cycle.tariff_confirmed_at) : '',
                  })
                : t('contract.tariff.help')}
            </Text>
            <View style={styles.actionBtnWrap}>
              <Button
                variant={tariffConfirmed ? 'outlineDark' : 'primary'}
                label={tariffConfirmed ? t('contract.tariff.edit') : t('contract.tariff.confirm')}
                onPress={() => setTariffOpen(true)}
                fullWidth
              />
            </View>
          </Card>
        ) : null}

        {/* Settlement calculator */}
        <Card>
          <Text style={styles.sectionTitle}>{t('contract.detail.settlement')}</Text>
          {breakdown ? (
            <>
              <Row
                label={t('contract.detail.live_weight')}
                value={t('contract.kg_suffix', { value: Number(breakdown.total_live_weight_kg).toFixed(2) })}
              />
              <Row label={t('contract.detail.base_amount')} value={formatINR(breakdown.base_amount)} />
              <Row label={t('contract.detail.fcr_bonus')} value={formatINR(breakdown.fcr_bonus)} />
              <Row
                label={t('contract.detail.mortality_bonus')}
                value={formatINR(breakdown.mortality_bonus)}
              />
              <View style={styles.divider} />
              <Row
                label={t('contract.detail.expected_total')}
                value={formatINR(breakdown.total_settlement)}
                strong
              />
            </>
          ) : (
            <Row
              label={t('contract.detail.expected_saved')}
              value={formatINR(cycle.expected_settlement_amount)}
            />
          )}
          <Row
            label={t('contract.detail.actual_received')}
            value={formatINR(cycle.actual_settlement_amount)}
            strong
          />
          {expectedVsActualDelta !== null ? (
            <Row
              label={t('contract.detail.delta')}
              value={formatINR(expectedVsActualDelta)}
            />
          ) : null}
          {cycle.settlement_received_date ? (
            <Row
              label={t('contract.detail.received_on')}
              value={formatDDMMMYYYY(cycle.settlement_received_date)}
            />
          ) : null}
          <Button
            variant="primary"
            label={recalcLoading ? t('contract.detail.calculating') : t('contract.detail.recalculate')}
            onPress={recalcSettlement}
            disabled={recalcLoading || !cycle.birds_delivered || !cycle.avg_weight_kg || !tariffConfirmed}
            fullWidth
          />
          {!tariffConfirmed ? (
            <Text style={styles.muted}>{t('contract.reconcile.confirm_tariff_first')}</Text>
          ) : (!cycle.birds_delivered || !cycle.avg_weight_kg) ? (
            <Text style={styles.muted}>
              {t('contract.detail.need_inputs')}
            </Text>
          ) : null}
        </Card>

        {/* Reconciliation — your data vs integrator statement */}
        {showReconciliation ? <ContractReconciliationCard reconciliation={reconciliation} /> : null}

        {/* Enter / edit the integrator statement */}
        {!isLocked ? (
          <Card>
            <Text style={styles.sectionTitle}>{t('contract.statement.title')}</Text>
            <Text style={styles.bodyText}>{t('contract.statement.help')}</Text>
            <View style={styles.actionBtnWrap}>
              <Button
                variant={showReconciliation ? 'outlineDark' : 'primary'}
                label={showReconciliation ? t('contract.statement.edit') : t('contract.statement.enter')}
                onPress={() => setStatementOpen(true)}
                disabled={!tariffConfirmed}
                fullWidth
              />
            </View>
            {!tariffConfirmed ? (
              <Text style={styles.muted}>{t('contract.reconcile.confirm_tariff_first')}</Text>
            ) : null}
          </Card>
        ) : null}

        {cycle.dispute_notes ? (
          <Card>
            <Text style={styles.sectionTitle}>{t('contract.detail.dispute_notes')}</Text>
            <Text style={styles.bodyText}>{cycle.dispute_notes}</Text>
          </Card>
        ) : null}

        {/* Reconciliation report — share with integrator via WhatsApp */}
        {(cycle.expected_settlement_amount ?? null) !== null ||
        (cycle.actual_settlement_amount ?? null) !== null ? (
          <Card>
            <Text style={styles.sectionTitle}>{t('contract.detail.send_reconciliation')}</Text>
            <Text style={styles.bodyText}>
              {t('contract.detail.reconciliation_help')}
            </Text>
            <View style={styles.shareBtnWrap}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t('contract.detail.share_a11y')}
                onPress={shareReconciliation}
                style={({ pressed }) => [
                  styles.shareBtn,
                  pressed && styles.shareBtnPressed,
                ]}
              >
                <MessageCircle size={18} color={colors.onPrimary} />
                <Text style={styles.shareBtnLabel}>{t('contract.detail.send_to_integrator')}</Text>
              </Pressable>
            </View>
          </Card>
        ) : null}
      </ScrollView>

      <ContractTariffModal
        visible={tariffOpen}
        onDismiss={() => setTariffOpen(false)}
        cycleId={cycle.id}
        defaults={effectiveTariff}
        onSuccess={() => {
          setTariffOpen(false);
          setSnackbar(t('contract.tariff.saved'));
          load();
        }}
      />
      <ContractStatementModal
        visible={statementOpen}
        onDismiss={() => setStatementOpen(false)}
        cycleId={cycle.id}
        initial={{
          integrator_birds_lifted: cycle.integrator_birds_lifted,
          integrator_avg_weight_kg: cycle.integrator_avg_weight_kg,
          integrator_fcr: cycle.integrator_fcr,
          integrator_mortality_pct: cycle.integrator_mortality_pct,
          actual_settlement_amount: cycle.actual_settlement_amount,
          settlement_received_date: cycle.settlement_received_date,
          dispute_notes: cycle.dispute_notes,
        }}
        onSuccess={() => {
          setStatementOpen(false);
          setSnackbar(t('contract.statement.saved'));
          load();
        }}
      />

      <Snackbar visible={!!snackbar} onDismiss={() => setSnackbar(null)}>
        {snackbar ?? ''}
      </Snackbar>
    </View>
  );
}

function Row({
  label,
  value,
  strong = false,
}: {
  label: string;
  value: string;
  strong?: boolean;
}) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={[styles.rowValue, strong && styles.rowValueStrong]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.canvasSoft },
  loadingWrap: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  muted: { ...typography.bodySm, color: colors.body, marginTop: spacing.sm },
  content: { padding: spacing.lg, gap: spacing.lg, paddingBottom: spacing['3xl'] },
  title: { ...typography.displaySm, color: colors.ink },
  meta: { ...typography.bodySm, color: colors.body, marginTop: spacing.xxs },
  sectionTitle: {
    ...typography.bodyMdStrong,
    color: colors.ink,
    marginBottom: spacing.sm,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: spacing.xs,
  },
  rowLabel: { ...typography.bodySm, color: colors.body },
  rowValue: { ...typography.bodySm, color: colors.ink, textAlign: 'right' },
  rowValueStrong: { ...typography.bodyMdStrong, color: colors.ink },
  divider: { height: 1, backgroundColor: colors.mute, marginVertical: spacing.xs },
  bodyText: { ...typography.bodySm, color: colors.ink },
  shareBtnWrap: { marginTop: spacing.md },
  actionBtnWrap: { marginTop: spacing.md },
  shareBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    backgroundColor: colors.whatsapp,
    borderRadius: radius.pillLg,
    paddingHorizontal: spacing.lg,
    minHeight: 44,
  },
  shareBtnPressed: { opacity: 0.85 },
  shareBtnLabel: {
    ...typography.bodyMdStrong,
    color: colors.onPrimary,
  },
});
