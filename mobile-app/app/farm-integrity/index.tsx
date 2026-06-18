import { useCallback, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { Stack, useFocusEffect } from 'expo-router';
import { Snackbar } from 'react-native-paper';
import { useTranslation } from 'react-i18next';
import {
  buildFarmIntegrityReport,
  findBenchmark,
  formatINR as sharedINR,
  type FarmIntegrityReport,
  type IntegrityFinding,
  type IntegritySeverity,
} from '@poultryos/shared';
import { supabase } from '../../lib/supabase';
import { useFarmStore } from '../../stores/farm';
import { Button, Card, EmptyState, Select, TextInput } from '../../components/ui';
import { colors, spacing, typography } from '../../theme/tokens';
import { todayISO, formatDDMMMYYYY } from '../../lib/format-date';

const WINDOW_DAYS = 14;

interface SpotTarget {
  id: string;
  name: string;
}

export default function FarmIntegrityScreen() {
  const { t } = useTranslation();
  const currentFarm = useFarmStore((s) => s.currentFarm);
  const farmId = currentFarm?.id ?? null;

  const [isOwner, setIsOwner] = useState<boolean | null>(null);
  const [report, setReport] = useState<FarmIntegrityReport | null>(null);
  const [feedItems, setFeedItems] = useState<SpotTarget[]>([]);
  const [batchTargets, setBatchTargets] = useState<SpotTarget[]>([]);
  const [recent, setRecent] = useState<{ id: string; count_type: string; counted_value: number; count_date: string }[]>([]);
  const [snackbar, setSnackbar] = useState<string | null>(null);

  // Spot-count form
  const [type, setType] = useState<'bird_count' | 'feed_stock'>('bird_count');
  const [targetId, setTargetId] = useState('');
  const [value, setValue] = useState('');
  const [date, setDate] = useState(todayISO());
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    if (!farmId) return;
    const { data: auth } = await supabase.auth.getUser();
    const uid = auth.user?.id;
    if (!uid) return;
    const { data: membership } = await supabase
      .from('farm_users')
      .select('role')
      .eq('farm_id', farmId)
      .eq('user_id', uid)
      .maybeSingle();
    const owner = (membership as { role?: string } | null)?.role === 'owner';
    setIsOwner(owner);
    if (!owner) return;

    const sinceIso = new Date(Date.now() - WINDOW_DAYS * 86400000).toISOString().slice(0, 10);
    const [{ data: batches }, { data: items }, { data: counts }] = await Promise.all([
      supabase
        .from('batches')
        .select('id, breed_name, poultry_type, opening_bird_count, current_bird_count, cost_per_bird')
        .eq('farm_id', farmId)
        .eq('status', 'active'),
      supabase.from('inventory_items').select('id, item_name, current_stock').eq('farm_id', farmId).eq('category', 'feed'),
      supabase
        .from('physical_counts')
        .select('id, batch_id, item_id, count_type, counted_value, count_date')
        .eq('farm_id', farmId)
        .order('count_date', { ascending: false }),
    ]);

    const activeBatches = (batches ?? []) as any[];
    const items2 = (items ?? []) as any[];
    const physical = (counts ?? []) as any[];

    const latestItemCount = new Map<string, number>();
    const latestBatchCount = new Map<string, number>();
    for (const c of physical) {
      if (c.count_type === 'feed_stock' && c.item_id && !latestItemCount.has(c.item_id))
        latestItemCount.set(c.item_id, Number(c.counted_value));
      if (c.count_type === 'bird_count' && c.batch_id && !latestBatchCount.has(c.batch_id))
        latestBatchCount.set(c.batch_id, Number(c.counted_value));
    }

    const batchIds = activeBatches.map((b) => b.id);
    const [{ data: windowLogs }, { data: allDeaths }, { data: harvests }] = await Promise.all([
      batchIds.length
        ? supabase
            .from('daily_logs')
            .select('batch_id, log_date, created_at, feed_consumed_kg, feed_cost_per_kg, avg_bird_weight_g')
            .in('batch_id', batchIds)
            .gte('log_date', sinceIso)
            .order('log_date', { ascending: true })
        : Promise.resolve({ data: [] as any[] }),
      batchIds.length
        ? supabase.from('daily_logs').select('batch_id, birds_dead').in('batch_id', batchIds)
        : Promise.resolve({ data: [] as any[] }),
      batchIds.length
        ? supabase.from('batch_harvests').select('batch_id, birds_harvested').in('batch_id', batchIds)
        : Promise.resolve({ data: [] as any[] }),
    ]);

    const logsByBatch = new Map<string, any[]>();
    for (const l of (windowLogs ?? []) as any[]) {
      const arr = logsByBatch.get(l.batch_id) ?? [];
      arr.push(l);
      logsByBatch.set(l.batch_id, arr);
    }
    const deathsByBatch = new Map<string, number>();
    for (const d of (allDeaths ?? []) as any[])
      deathsByBatch.set(d.batch_id, (deathsByBatch.get(d.batch_id) ?? 0) + Number(d.birds_dead ?? 0));
    const soldByBatch = new Map<string, number>();
    for (const h of (harvests ?? []) as any[])
      soldByBatch.set(h.batch_id, (soldByBatch.get(h.batch_id) ?? 0) + Number(h.birds_harvested ?? 0));

    const feedCost =
      ((windowLogs ?? []) as any[])
        .filter((l) => l.feed_cost_per_kg != null && Number(l.feed_cost_per_kg) > 0)
        .map((l) => Number(l.feed_cost_per_kg))
        .pop() ?? 30;

    // Merge all inputs into ONE report so severity/exposure aggregate per farm.
    const findings: IntegrityFinding[] = [];
    let exposure = 0;
    let overall: IntegritySeverity = 'ok';
    const rank = { ok: 0, review: 1, attention: 2 } as const;
    const merge = (r: FarmIntegrityReport) => {
      findings.push(...r.findings);
      exposure += r.totalExposureRupees;
      if (rank[r.overall] > rank[overall]) overall = r.overall;
    };

    for (const it of items2) {
      const phys = latestItemCount.get(it.id);
      if (phys == null) continue;
      merge(buildFarmIntegrityReport({ feed: { systemStockKg: Number(it.current_stock ?? 0), physicalStockKg: phys, feedCostPerKg: feedCost } }));
    }
    for (const b of activeBatches) {
      const logs = logsByBatch.get(b.id) ?? [];
      const bench = findBenchmark(b.breed_name, b.poultry_type);
      const weighed = logs.filter((l) => l.avg_bird_weight_g != null && Number(l.avg_bird_weight_g) > 0);
      const feedConsumedKg = logs.reduce((s, l) => s + Number(l.feed_consumed_kg ?? 0), 0);
      const weightGainKg =
        weighed.length >= 2
          ? ((Number(weighed[weighed.length - 1].avg_bird_weight_g) - Number(weighed[0].avg_bird_weight_g)) / 1000) *
            Number(b.current_bird_count ?? 0)
          : 0;
      merge(
        buildFarmIntegrityReport({
          feedGrowth: bench && weightGainKg > 0 ? { feedConsumedKg, weightGainKg, standardFcr: bench.targetFcr, feedCostPerKg: feedCost } : null,
          birdCount: {
            opening: Number(b.opening_bird_count ?? 0),
            cumulativeDeaths: deathsByBatch.get(b.id) ?? 0,
            soldOrTransferred: soldByBatch.get(b.id) ?? 0,
            systemCount: Number(b.current_bird_count ?? 0),
            physicalCount: latestBatchCount.get(b.id) ?? null,
            birdValue: Number(b.cost_per_bird ?? 0),
          },
          entryLogs: logs.map((l) => ({ log_date: l.log_date, created_at: l.created_at, feed_consumed_kg: l.feed_consumed_kg, avg_bird_weight_g: l.avg_bird_weight_g })),
        }),
      );
    }

    setReport({ findings, totalExposureRupees: exposure, overall });
    setFeedItems(items2.map((i) => ({ id: i.id, name: i.item_name })));
    setBatchTargets(activeBatches.map((b) => ({ id: b.id, name: b.breed_name ?? b.id.slice(0, 6) })));
    setRecent(physical.slice(0, 6));
  }, [farmId]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const options = type === 'feed_stock' ? feedItems : batchTargets;

  async function saveCount() {
    if (!farmId) return;
    const num = Number(value);
    if (!targetId || !Number.isFinite(num) || num < 0) {
      setSnackbar(t('farm_integrity.spot.invalid'));
      return;
    }
    setSubmitting(true);
    const { error } = await supabase.from('physical_counts').insert({
      farm_id: farmId,
      count_type: type,
      counted_value: num,
      count_date: date,
      item_id: type === 'feed_stock' ? targetId : null,
      batch_id: type === 'bird_count' ? targetId : null,
    });
    setSubmitting(false);
    if (error) {
      setSnackbar(error.message);
      return;
    }
    setValue('');
    setTargetId('');
    setSnackbar(t('farm_integrity.spot.saved'));
    load();
  }

  const exposureLabel = useMemo(
    () => (report && report.totalExposureRupees < 0 ? sharedINR(Math.abs(report.totalExposureRupees), { decimals: 0 }) : null),
    [report],
  );

  if (isOwner === false) {
    return (
      <View style={styles.root}>
        <Stack.Screen options={{ title: t('farm_integrity.title') }} />
        <EmptyState title={t('farm_integrity.owner_only.title')} description={t('farm_integrity.owner_only.description')} />
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <Stack.Screen options={{ title: t('farm_integrity.title') }} />
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.intro}>{t('farm_integrity.intro', { days: WINDOW_DAYS })}</Text>

        <Card>
          <Text style={styles.summaryLabel}>{t('farm_integrity.this_week')}</Text>
          <Text style={styles.summaryValue}>
            {!report || report.findings.length === 0
              ? t('farm_integrity.all_clear')
              : t('farm_integrity.areas', { count: report.findings.length })}
          </Text>
          {exposureLabel ? (
            <Text style={styles.exposure}>{t('farm_integrity.exposure', { amount: exposureLabel })}</Text>
          ) : null}
        </Card>

        {report?.findings.map((f, i) => (
          <Card key={i}>
            <View style={styles.findingRow}>
              <View style={[styles.dot, severityStyle(f.severity)]} />
              <View style={styles.findingBody}>
                <Text style={styles.findingText}>{describe(f, t)}</Text>
                {f.rupees != null && f.rupees < 0 ? (
                  <Text style={styles.findingRupees}>
                    {t('farm_integrity.to_account', { amount: sharedINR(Math.abs(f.rupees), { decimals: 0 }) })}
                  </Text>
                ) : null}
              </View>
            </View>
          </Card>
        ))}

        {/* Spot-count entry */}
        <Card>
          <Text style={styles.sectionTitle}>{t('farm_integrity.spot.title')}</Text>
          <Select
            label={t('farm_integrity.spot.what')}
            value={type}
            onChange={(v) => {
              setType(v as 'bird_count' | 'feed_stock');
              setTargetId('');
            }}
            options={[
              { label: t('farm_integrity.spot.bird_count'), value: 'bird_count' },
              { label: t('farm_integrity.spot.feed_stock'), value: 'feed_stock' },
            ]}
          />
          <Select
            label={type === 'feed_stock' ? t('farm_integrity.spot.feed_item') : t('farm_integrity.spot.batch')}
            value={targetId || null}
            onChange={setTargetId}
            options={options.map((o) => ({ label: o.name, value: o.id }))}
            placeholder={t('farm_integrity.spot.select')}
          />
          <TextInput
            label={type === 'feed_stock' ? t('farm_integrity.spot.counted_kg') : t('farm_integrity.spot.counted_birds')}
            value={value}
            onChangeText={setValue}
            keyboardType="numeric"
          />
          <TextInput label={t('farm_integrity.spot.date')} value={date} onChangeText={setDate} autoCapitalize="none" placeholder="YYYY-MM-DD" />
          <Button
            variant="primary"
            label={submitting ? t('farm_integrity.spot.saving') : t('farm_integrity.spot.save')}
            onPress={saveCount}
            disabled={submitting}
            fullWidth
          />
        </Card>

        {recent.length > 0 ? (
          <Card>
            <Text style={styles.sectionTitle}>{t('farm_integrity.recent')}</Text>
            {recent.map((c) => (
              <View key={c.id} style={styles.recentRow}>
                <Text style={styles.recentLabel}>
                  {(c.count_type === 'feed_stock' ? t('farm_integrity.spot.feed_stock') : t('farm_integrity.spot.bird_count'))} · {formatDDMMMYYYY(c.count_date)}
                </Text>
                <Text style={styles.recentValue}>{Number(c.counted_value).toLocaleString('en-IN')}</Text>
              </View>
            ))}
          </Card>
        ) : null}
      </ScrollView>

      <Snackbar visible={!!snackbar} onDismiss={() => setSnackbar(null)}>{snackbar ?? ''}</Snackbar>
    </View>
  );
}

function severityStyle(s: IntegritySeverity) {
  return s === 'attention' ? styles.dotAttention : s === 'review' ? styles.dotReview : styles.dotOk;
}

function describe(f: IntegrityFinding, t: (k: string, o?: Record<string, unknown>) => string): string {
  return t(`farm_integrity.finding.${f.key}`, f.params as Record<string, unknown>);
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.canvasSoft },
  content: { padding: spacing.lg, gap: spacing.lg, paddingBottom: spacing['3xl'] },
  intro: { ...typography.bodySm, color: colors.body },
  summaryLabel: { ...typography.captionUppercase, color: colors.bodySoft },
  summaryValue: { ...typography.bodyMdStrong, color: colors.ink, marginTop: spacing.xxs },
  exposure: { ...typography.bodySmStrong, color: colors.danger, marginTop: spacing.xs },
  sectionTitle: { ...typography.bodyMdStrong, color: colors.ink, marginBottom: spacing.sm },
  findingRow: { flexDirection: 'row', gap: spacing.sm },
  findingBody: { flex: 1 },
  findingText: { ...typography.bodySm, color: colors.ink },
  findingRupees: { ...typography.captionStrong, color: colors.danger, marginTop: spacing.xxs },
  dot: { width: 8, height: 8, borderRadius: 4, marginTop: 6 },
  dotAttention: { backgroundColor: colors.danger },
  dotReview: { backgroundColor: colors.warning },
  dotOk: { backgroundColor: colors.success },
  recentRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: spacing.xs, borderBottomWidth: 1, borderBottomColor: colors.mute },
  recentLabel: { ...typography.bodySm, color: colors.body },
  recentValue: { ...typography.bodySmStrong, color: colors.ink },
});
