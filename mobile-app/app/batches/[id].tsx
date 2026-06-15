import { useCallback, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { Stack, useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { Snackbar } from 'react-native-paper';
import { useTranslation } from 'react-i18next';
import { supabase } from '../../lib/supabase';
import { useFarmStore } from '../../stores/farm';
import {
  Button,
  Card,
  CloseBatchModal,
  EmptyState,
  HarvestBatchModal,
  HdepCurveCard,
  KpiTile,
  SellTimingCard,
  TraceabilityModal,
  TransferBatchModal,
  UpgradeBanner,
  type ClosedBatch,
  type HarvestBuyerOption,
  type KpiTone,
  type TraceabilityRecord,
  type TransferShedOption,
} from '../../components/ui';
import { hasTraceability } from '../../lib/freemium';
import { useIsPaid } from '../../lib/freemium-hooks';
import { colors, radius, spacing, typography } from '../../theme/tokens';
import { formatDDMMMYYYY } from '../../lib/format-date';
import {
  aggregateFcr,
  aggregateLivability,
  fcrTone,
  livabilityTone,
  type DailyLogRow,
} from '../../lib/kpis';
import {
  computeBatchPnl,
  daysSince,
  type BatchPnl,
  type BatchPnlLogRow,
  type BatchPnlTxn,
} from '../../lib/batch-pnl';
import {
  findBenchmark,
  fcrAgainstBenchmark,
  mortalityAgainstBenchmark,
  type BenchmarkTone,
} from '../../lib/breed-benchmarks';
import {
  formatINR as sharedINR,
  formatNumber as sharedNum,
  computeHdepSeries,
  computeSellTiming,
  deriveSellTimingInput,
  type HdepWeekPoint,
  type HdepLogRow,
  type SellTimingResult,
  type SellTimingLogRow,
} from '@poultryos/shared';

interface BatchRow {
  id: string;
  batch_code: string;
  breed_name: string;
  poultry_type: 'broiler' | 'layer' | 'breeder';
  placement_date: string;
  opening_bird_count: number;
  current_bird_count: number;
  cost_per_bird: number | null;
  sale_weight_kg: number | null;
  sale_price_per_kg: number | null;
  total_sale_revenue: number | null;
  harvest_date: string | null;
  status: 'active' | 'harvested' | 'closed';
  source_supplier: string | null;
  shed_id: string;
}

interface TransferRow {
  id: string;
  transfer_date: string;
  bird_count: number;
  notes: string | null;
  from_shed: { shed_name: string } | null;
  to_shed: { shed_name: string } | null;
}

function formatINR(n: number): string {
  return sharedINR(n, { decimals: 2 });
}

function benchToneToKpiTone(t: BenchmarkTone): 'positive' | 'warning' | 'negative' | 'neutral' {
  switch (t) {
    case 'success': return 'positive';
    case 'warning': return 'warning';
    case 'danger':  return 'negative';
    default:        return 'neutral';
  }
}

export default function BatchDetailScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const { id } = useLocalSearchParams<{ id: string }>();
  const currentFarm = useFarmStore((s) => s.currentFarm);
  const { isPaid } = useIsPaid();
  const traceGate = hasTraceability(isPaid);

  const [batch, setBatch] = useState<BatchRow | null>(null);
  const [pnl, setPnl] = useState<BatchPnl | null>(null);
  const [fcr, setFcr] = useState<number | null>(null);
  const [livability, setLivability] = useState<number | null>(null);
  const [latestWeightG, setLatestWeightG] = useState<number | null>(null);
  const [hdepSeries, setHdepSeries] = useState<HdepWeekPoint[]>([]);
  const [sellTiming, setSellTiming] = useState<SellTimingResult | null>(null);
  const [snackbar, setSnackbar] = useState<string | null>(null);
  const [closeModalOpen, setCloseModalOpen] = useState(false);
  const [transferModalOpen, setTransferModalOpen] = useState(false);
  const [harvestModalOpen, setHarvestModalOpen] = useState(false);
  const [buyers, setBuyers] = useState<HarvestBuyerOption[]>([]);
  const [farmSheds, setFarmSheds] = useState<TransferShedOption[]>([]);
  const [transfers, setTransfers] = useState<TransferRow[]>([]);
  const [traceModalOpen, setTraceModalOpen] = useState(false);
  const [traceRecord, setTraceRecord] = useState<TraceabilityRecord | null>(null);
  const [traceLoading, setTraceLoading] = useState(false);

  const load = useCallback(async () => {
    if (!id || !currentFarm) return;
    try {
      const [batchRes, logsRes, txnRes] = await Promise.all([
        supabase
          .from('batches')
          .select(
            'id, batch_code, breed_name, poultry_type, placement_date, opening_bird_count, current_bird_count, cost_per_bird, sale_weight_kg, sale_price_per_kg, total_sale_revenue, harvest_date, status, source_supplier, shed_id',
          )
          .eq('id', id)
          .eq('farm_id', currentFarm.id)
          .maybeSingle(),
        supabase
          .from('daily_logs')
          .select('feed_consumed_kg, feed_cost_per_kg, avg_bird_weight_g, eggs_collected, log_date')
          .eq('batch_id', id),
        supabase
          .from('financial_transactions')
          .select('transaction_type, amount, payment_status')
          .eq('batch_id', id),
      ]);

      if (batchRes.error) throw batchRes.error;
      if (!batchRes.data) {
        setBatch(null);
        return;
      }
      const b = batchRes.data as BatchRow;
      setBatch(b);

      // Sheds on this farm (transfer picker) + this batch's move history +
      // buyers (Khata picker on the harvest modal; owner-only via RLS).
      const [shedsRes, transfersRes, buyersRes] = await Promise.all([
        supabase
          .from('sheds')
          .select('id, shed_name, capacity, poultry_type, status')
          .eq('farm_id', currentFarm.id)
          .order('shed_name'),
        supabase
          .from('batch_transfers')
          .select('id, transfer_date, bird_count, notes, from_shed:sheds!from_shed_id(shed_name), to_shed:sheds!to_shed_id(shed_name)')
          .eq('batch_id', id)
          .order('transfer_date', { ascending: false }),
        supabase
          .from('buyers')
          .select('id, buyer_name')
          .eq('farm_id', currentFarm.id)
          .order('buyer_name'),
      ]);
      setFarmSheds((shedsRes.data ?? []) as TransferShedOption[]);
      setTransfers((transfersRes.data ?? []) as unknown as TransferRow[]);
      setBuyers((buyersRes.data ?? []) as HarvestBuyerOption[]);

      const logs = (logsRes.data ?? []) as BatchPnlLogRow[];
      const txns = (txnRes.data ?? []) as BatchPnlTxn[];

      setPnl(
        computeBatchPnl(
          {
            openingBirdCount: b.opening_bird_count,
            currentBirdCount: b.current_bird_count,
            costPerBird: b.cost_per_bird,
            saleWeightKg: b.sale_weight_kg,
            salePricePerKg: b.sale_price_per_kg,
            totalSaleRevenue: b.total_sale_revenue,
          },
          logs,
          txns,
        ),
      );

      const kpiLogs: DailyLogRow[] = logs.map((l) => ({
        batch_id: id,
        log_date: l.log_date,
        feed_consumed_kg: l.feed_consumed_kg,
        avg_bird_weight_g: l.avg_bird_weight_g,
      }));
      const snap = [
        {
          batchId: id,
          currentBirdCount: b.current_bird_count,
          openingBirdCount: b.opening_bird_count,
        },
      ];
      setFcr(aggregateFcr(snap, kpiLogs));
      setLivability(aggregateLivability(snap));

      // Existing traceability record (if any) — load lazily so the share
      // CTA can open the modal immediately.
      if (b.status === 'harvested' || b.status === 'closed') {
        const { data: trace } = await supabase
          .from('traceability_records')
          .select(
            'qr_token, supplier_name, placement_date, breed_name, total_vaccinations, health_incidents_count, withdrawal_cleared, harvest_date, is_locked',
          )
          .eq('batch_id', id)
          .maybeSingle();
        setTraceRecord((trace as TraceabilityRecord) ?? null);
      } else {
        setTraceRecord(null);
      }

      const latestWithWeight = logs
        .filter((l) => l.avg_bird_weight_g != null && Number(l.avg_bird_weight_g) > 0)
        .sort((a, b2) => (b2.log_date > a.log_date ? 1 : -1))[0];
      setLatestWeightG(latestWithWeight?.avg_bird_weight_g ?? null);

      // ---- Phase 3 operational intelligence (per batch) -------------------
      type RawLog = {
        feed_consumed_kg: number | null;
        feed_cost_per_kg: number | null;
        avg_bird_weight_g: number | null;
        eggs_collected: number | null;
        log_date: string;
      };
      const rawLogs = (logsRes.data ?? []) as RawLog[];

      // Layer HDEP curve
      if (b.poultry_type === 'layer' || b.poultry_type === 'breeder') {
        setHdepSeries(
          computeHdepSeries(
            rawLogs.map((l): HdepLogRow => ({ log_date: l.log_date, eggs_collected: l.eggs_collected })),
            b.current_bird_count,
            b.placement_date,
          ),
        );
      } else {
        setHdepSeries([]);
      }

      // Broiler sell-timing (active broiler/breeder batches only)
      if ((b.poultry_type === 'broiler' || b.poultry_type === 'breeder') && b.status === 'active') {
        // Latest broiler price for the farm's state, falling back to override.
        let pricePerKg = 0;
        if (currentFarm.state) {
          const { data: mp } = await supabase
            .from('market_prices')
            .select('broiler_price_per_kg')
            .eq('state', currentFarm.state)
            .order('price_date', { ascending: false })
            .limit(1)
            .maybeSingle();
          pricePerKg = Number(mp?.broiler_price_per_kg ?? 0);
        }
        if (!pricePerKg) {
          pricePerKg = Number(
            (currentFarm as { market_price_override_broiler?: number | null }).market_price_override_broiler ?? 0,
          );
        }

        const bench = findBenchmark(b.breed_name, b.poultry_type);
        setSellTiming(
          computeSellTiming(
            deriveSellTimingInput(rawLogs as SellTimingLogRow[], {
              birds: b.current_bird_count,
              pricePerKg,
              targetWeightKg: bench?.targetWeightKg ?? null,
            }),
          ),
        );
      } else {
        setSellTiming(null);
      }
    } catch (err: unknown) {
      setSnackbar(err instanceof Error ? err.message : t('batch_detail.errors.load_failed'));
    }
  }, [id, currentFarm, t]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  async function generateTraceability() {
    if (!batch) return;
    setTraceLoading(true);
    try {
      const { data, error } = await supabase.rpc('create_traceability_record', {
        p_batch_id: batch.id,
      });
      if (error) throw error;
      setTraceRecord(data as TraceabilityRecord);
      setTraceModalOpen(true);
      // The RPC promotes batch.status to 'closed'; refetch to reflect that.
      load();
    } catch (err: unknown) {
      setSnackbar(
        err instanceof Error ? err.message : t('batch_detail.errors.generate_failed'),
      );
    } finally {
      setTraceLoading(false);
    }
  }

  if (!batch) {
    return (
      <View style={styles.root}>
        <Stack.Screen options={{ title: t('batch_detail.fallback_title') }} />
        <View style={styles.loadingWrap}>
          <Text style={styles.muted}>{t('batch_detail.loading')}</Text>
        </View>
        <Snackbar visible={!!snackbar} onDismiss={() => setSnackbar(null)}>
          {snackbar ?? ''}
        </Snackbar>
      </View>
    );
  }

  const ageDays = daysSince(batch.placement_date);
  const fcrToneVal: KpiTone = fcrTone(fcr);
  const livabilityToneVal: KpiTone = livabilityTone(livability);
  const pnlPositive = (pnl?.netPnl ?? 0) >= 0;

  return (
    <View style={styles.root}>
      <Stack.Screen options={{ title: batch.batch_code }} />

      <ScrollView contentContainerStyle={styles.content}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.batchCode}>{batch.batch_code}</Text>
          <Text style={styles.meta}>
            {batch.breed_name} · {batch.poultry_type}
          </Text>
          <Text style={styles.meta}>
            {t('batch_detail.age_days', { count: ageDays, date: formatDDMMMYYYY(batch.placement_date) })}
          </Text>
          {batch.source_supplier ? (
            <Text style={styles.meta}>{t('batch_detail.supplier', { name: batch.source_supplier })}</Text>
          ) : null}
          <View style={styles.statusPill}>
            <Text style={styles.statusPillText}>{t(`batch_detail.status.${batch.status}`)}</Text>
          </View>
        </View>

        {/* KPI grid — benchmark-aware tones override basic band tones when
            we know the breed standard for this batch */}
        {(() => {
          const bench = findBenchmark(batch.breed_name, batch.poultry_type);
          const mortalityPct = livability === null ? null : 100 - livability;
          const fcrBenchTone: BenchmarkTone | null = bench
            ? fcrAgainstBenchmark(fcr, bench.targetFcr)
            : null;
          const mortBenchTone: BenchmarkTone | null = bench
            ? mortalityAgainstBenchmark(mortalityPct, bench.targetMortalityPct)
            : null;
          const targetWeightKg = bench?.targetWeightKg ?? null;
          const actualWeightKg = latestWeightG !== null ? latestWeightG / 1000 : null;
          const weightBenchTone: BenchmarkTone | null =
            bench && targetWeightKg !== null && actualWeightKg !== null
              ? actualWeightKg >= targetWeightKg
                ? 'success'
                : actualWeightKg >= targetWeightKg * 0.9
                  ? 'warning'
                  : 'danger'
              : null;

          return (
            <View style={styles.kpiGrid}>
              <KpiTile
                label={t('batch_detail.kpi.current_birds')}
                value={batch.current_bird_count.toLocaleString('en-IN')}
                tone="neutral"
                style={styles.kpiTile}
              />
              <KpiTile
                label={t('batch_detail.kpi.cumulative_fcr')}
                value={fcr === null ? '—' : fcr.toFixed(2)}
                tone={fcrBenchTone ? benchToneToKpiTone(fcrBenchTone) : fcrToneVal}
                caption={
                  bench
                    ? t('batch_detail.target_fcr', { fcr: bench.targetFcr.toFixed(2), breed: bench.breed })
                    : undefined
                }
                style={styles.kpiTile}
              />
              <KpiTile
                label={t('batch_detail.kpi.livability')}
                value={livability === null ? '—' : livability.toFixed(1)}
                unit={livability === null ? undefined : '%'}
                tone={
                  mortBenchTone ? benchToneToKpiTone(mortBenchTone) : livabilityToneVal
                }
                caption={
                  bench
                    ? t('batch_detail.target_livability', { pct: (100 - bench.targetMortalityPct).toFixed(1) })
                    : undefined
                }
                style={styles.kpiTile}
              />
              <KpiTile
                label={t('batch_detail.kpi.avg_weight')}
                value={
                  latestWeightG === null ? '—' : (latestWeightG / 1000).toFixed(2)
                }
                unit={latestWeightG === null ? undefined : 'kg'}
                tone={weightBenchTone ? benchToneToKpiTone(weightBenchTone) : 'neutral'}
                caption={
                  bench && targetWeightKg !== null
                    ? t('batch_detail.target_weight', { kg: targetWeightKg.toFixed(1), days: bench.cycleDays })
                    : undefined
                }
                style={styles.kpiTile}
              />
            </View>
          );
        })()}

        {/* P&L card */}
        <Text style={styles.sectionLabel}>{t('batch_detail.pnl_title')}</Text>
        {pnl ? (
          <Card style={styles.pnlCard}>
            <View style={styles.pnlRow}>
              <Text style={styles.pnlLabel}>{t('batch_detail.pnl.chick_cost')}</Text>
              <Text style={styles.pnlValue}>{formatINR(pnl.chickCost)}</Text>
            </View>
            <View style={styles.pnlRow}>
              <Text style={styles.pnlLabel}>{t('batch_detail.pnl.feed_cost')}</Text>
              <Text style={styles.pnlValue}>{formatINR(pnl.feedCost)}</Text>
            </View>
            <View style={styles.pnlRow}>
              <Text style={styles.pnlLabel}>{t('batch_detail.pnl.other_expenses')}</Text>
              <Text style={styles.pnlValue}>{formatINR(pnl.otherExpenseCost)}</Text>
            </View>
            <View style={[styles.pnlRow, styles.pnlSubtotal]}>
              <Text style={styles.pnlLabelStrong}>{t('batch_detail.pnl.total_cost')}</Text>
              <Text style={styles.pnlValueStrong}>{formatINR(pnl.totalCost)}</Text>
            </View>

            <View style={styles.pnlDivider} />

            <View style={styles.pnlRow}>
              <Text style={styles.pnlLabel}>{t('batch_detail.pnl.harvest_sale')}</Text>
              <Text style={styles.pnlValue}>{formatINR(pnl.saleRevenue)}</Text>
            </View>
            <View style={styles.pnlRow}>
              <Text style={styles.pnlLabel}>{t('batch_detail.pnl.other_income')}</Text>
              <Text style={styles.pnlValue}>{formatINR(pnl.otherIncome)}</Text>
            </View>
            <View style={[styles.pnlRow, styles.pnlSubtotal]}>
              <Text style={styles.pnlLabelStrong}>{t('batch_detail.pnl.total_income')}</Text>
              <Text style={styles.pnlValueStrong}>{formatINR(pnl.totalIncome)}</Text>
            </View>

            <View style={styles.pnlDivider} />

            <View style={styles.pnlRow}>
              <Text style={styles.pnlLabelStrong}>{t('batch_detail.pnl.net')}</Text>
              <Text style={[styles.pnlNet, pnlPositive ? styles.netPos : styles.netNeg]}>
                {formatINR(pnl.netPnl)}
              </Text>
            </View>
            <View style={styles.pnlRow}>
              <Text style={styles.pnlSub}>{t('batch_detail.pnl.per_bird')}</Text>
              <Text style={styles.pnlSub}>
                {pnl.pnlPerBird === null ? '—' : formatINR(pnl.pnlPerBird)}
              </Text>
            </View>
            {pnl.realisedIncome !== pnl.otherIncome ? (
              <View style={styles.pnlRow}>
                <Text style={styles.pnlSub}>{t('batch_detail.pnl.realised')}</Text>
                <Text style={styles.pnlSub}>{formatINR(pnl.realisedNetPnl)}</Text>
              </View>
            ) : null}
          </Card>
        ) : (
          <EmptyState
            title={t('batch_detail.no_pnl.title')}
            description={t('batch_detail.no_pnl.description')}
          />
        )}

        {/* Layer HDEP curve — production over the lay cycle vs breed peak */}
        {hdepSeries.length > 0 ? (
          <HdepCurveCard
            series={hdepSeries}
            peakHdepPct={findBenchmark(batch.breed_name, batch.poultry_type)?.peakHdepPct ?? null}
          />
        ) : null}

        {/* Broiler sell-timing — sell now vs grow another day */}
        {sellTiming ? <SellTimingCard result={sellTiming} /> : null}

        {/* Location history — batch keeps its identity across shed moves */}
        <Text style={styles.sectionLabel}>{t('batch_detail.location_history')}</Text>
        <Card style={styles.historyCard}>
          <View style={styles.historyRow}>
            <View style={[styles.historyDot, { backgroundColor: colors.primary }]} />
            <View style={styles.historyBody}>
              <Text style={styles.historyTitle}>
                {t('batch_detail.placed_in', { date: formatDDMMMYYYY(batch.placement_date) })}
              </Text>
              <Text style={styles.historyMeta}>
                {batch.opening_bird_count.toLocaleString('en-IN')} birds
              </Text>
            </View>
          </View>
          {transfers.map((tr) => (
            <View key={tr.id} style={styles.historyRow}>
              <View style={[styles.historyDot, { backgroundColor: colors.success }]} />
              <View style={styles.historyBody}>
                <Text style={styles.historyTitle}>
                  {(tr.from_shed?.shed_name ?? '—')} → {(tr.to_shed?.shed_name ?? '—')}
                </Text>
                <Text style={styles.historyMeta}>
                  {formatDDMMMYYYY(tr.transfer_date)} · {Number(tr.bird_count).toLocaleString('en-IN')} birds
                  {tr.notes ? ` · ${tr.notes}` : ''}
                </Text>
              </View>
            </View>
          ))}
          {transfers.length === 0 ? (
            <Text style={styles.historyMeta}>{t('batch_detail.no_transfers')}</Text>
          ) : null}
        </Card>

        {/* CTAs */}
        <View style={styles.actions}>
          <Button
            variant="primary"
            label={t('batch_detail.add_transaction')}
            onPress={() => router.push('/transactions/new')}
            fullWidth
          />
          <Button
            variant="outlineDark"
            label={t('batch_detail.view_vaccinations')}
            onPress={() => router.push(`/vaccinations?batchId=${batch.id}`)}
            fullWidth
          />
          <Button
            variant="outlineDark"
            label={t('batch_detail.view_health')}
            onPress={() => router.push(`/health?batchId=${batch.id}`)}
            fullWidth
          />
          {batch.status === 'active' ? (
            <Button
              variant="outlineDark"
              label={t('batch_detail.record_harvest')}
              onPress={() => setHarvestModalOpen(true)}
              fullWidth
            />
          ) : null}
          {batch.status === 'active' ? (
            <Button
              variant="outlineDark"
              label={t('batch_detail.transfer_batch')}
              onPress={() => setTransferModalOpen(true)}
              fullWidth
            />
          ) : null}
          {batch.status === 'active' ? (
            <Button
              variant="outlineRed"
              label={t('batch_detail.close_batch')}
              onPress={() => setCloseModalOpen(true)}
              fullWidth
            />
          ) : null}
          {batch.status === 'harvested' || batch.status === 'closed' ? (
            traceRecord ? (
              <Button
                variant="primary"
                label={t('batch_detail.view_certificate')}
                onPress={() => setTraceModalOpen(true)}
                fullWidth
              />
            ) : traceGate.allowed ? (
              <Button
                variant="primary"
                label={traceLoading ? t('batch_detail.generating') : t('batch_detail.generate_certificate')}
                onPress={generateTraceability}
                disabled={traceLoading}
                fullWidth
              />
            ) : (
              <UpgradeBanner reason={traceGate.reason ?? t('batch_detail.trace_gate_reason')} />
            )
          ) : null}
        </View>
      </ScrollView>

      <TraceabilityModal
        visible={traceModalOpen}
        onDismiss={() => setTraceModalOpen(false)}
        record={traceRecord}
        batchCode={batch.batch_code}
        farmName={currentFarm?.farm_name ?? 'PoultryOS'}
      />

      <TransferBatchModal
        visible={transferModalOpen}
        onDismiss={() => setTransferModalOpen(false)}
        batch={{
          id: batch.id,
          batch_code: batch.batch_code,
          shed_id: batch.shed_id,
          poultry_type: batch.poultry_type,
          placement_date: batch.placement_date,
        }}
        sheds={farmSheds}
        onSuccess={() => {
          setSnackbar(t('batch_detail.batch_transferred'));
          load();
        }}
      />

      <HarvestBatchModal
        visible={harvestModalOpen}
        onDismiss={() => setHarvestModalOpen(false)}
        batch={{
          id: batch.id,
          batch_code: batch.batch_code,
          current_bird_count: batch.current_bird_count,
          placement_date: batch.placement_date,
        }}
        buyers={buyers}
        onSuccess={() => {
          setSnackbar(t('harvest.success'));
          load();
        }}
      />

      <CloseBatchModal
        visible={closeModalOpen}
        onDismiss={() => setCloseModalOpen(false)}
        batch={{
          id: batch.id,
          batch_code: batch.batch_code,
          current_bird_count: batch.current_bird_count,
          placement_date: batch.placement_date,
        }}
        onSuccess={(updated: ClosedBatch) => {
          setBatch((prev) =>
            prev
              ? {
                  ...prev,
                  status: updated.status as BatchRow['status'],
                  harvest_date: updated.harvest_date,
                  sale_weight_kg: updated.sale_weight_kg,
                  sale_price_per_kg: updated.sale_price_per_kg,
                  total_sale_revenue: updated.total_sale_revenue,
                }
              : prev,
          );
          setSnackbar(t('batch_detail.batch_closed'));
          load();
        }}
      />

      <Snackbar visible={!!snackbar} onDismiss={() => setSnackbar(null)}>
        {snackbar ?? ''}
      </Snackbar>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.canvasSoft },
  loadingWrap: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  muted: { ...typography.bodyMd, color: colors.body },
  content: { padding: spacing.lg, gap: spacing.lg, paddingBottom: spacing['3xl'] },
  header: {
    backgroundColor: colors.canvas,
    borderColor: colors.mute,
    borderWidth: 1,
    borderRadius: radius.card,
    padding: spacing.lg,
    gap: spacing.xs,
  },
  batchCode: {
    ...typography.displaySm,
    color: colors.ink,
  },
  meta: {
    ...typography.bodySm,
    color: colors.body,
  },
  statusPill: {
    alignSelf: 'flex-start',
    backgroundColor: colors.canvasSoft,
    borderRadius: radius.full,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    marginTop: spacing.sm,
  },
  statusPillText: {
    ...typography.captionUppercase,
    color: colors.ink,
  },
  kpiGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
  },
  kpiTile: {
    flexGrow: 1,
    flexBasis: '46%',
  },
  sectionLabel: {
    ...typography.captionUppercase,
    color: colors.body,
  },
  pnlCard: {
    gap: spacing.sm,
  },
  pnlRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  pnlSubtotal: {
    paddingTop: spacing.xs,
  },
  pnlDivider: {
    height: 1,
    backgroundColor: colors.mute,
    marginVertical: spacing.xs,
  },
  pnlLabel: { ...typography.bodySm, color: colors.body },
  pnlLabelStrong: { ...typography.bodyMdStrong, color: colors.ink },
  pnlValue: { ...typography.bodySm, color: colors.ink },
  pnlValueStrong: { ...typography.bodyMdStrong, color: colors.ink },
  pnlNet: { ...typography.displayXs },
  netPos: { color: colors.ink },
  netNeg: { color: colors.primary },
  pnlSub: { ...typography.captionStrong, color: colors.body },
  actions: { gap: spacing.sm },
  historyCard: { gap: spacing.md },
  historyRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
  historyDot: { width: 10, height: 10, borderRadius: radius.full, marginTop: spacing.xs },
  historyBody: { flex: 1 },
  historyTitle: { ...typography.bodyMdStrong, color: colors.ink },
  historyMeta: { ...typography.bodySm, color: colors.body },
});
