import Link from 'next/link';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { formatCurrencyINR, formatDateDDMonYYYY } from '@/lib/utils';
import { UpgradeGate } from '@/components/UpgradeGate';
import { PageHeader } from '@/components/ui/PageHeader';
import {
  buildFarmIntegrityReport,
  findBenchmark,
  type IntegrityFinding,
  type IntegritySeverity,
} from '@poultryos/shared';
import { SpotCountForm } from './SpotCountForm';

export const dynamic = 'force-dynamic';

export default async function FarmIntegrityPage() {
  return (
    <UpgradeGate
      feature="Farm Integrity report"
      description="Reconcile logged feed, growth and mortality against physical spot-counts to catch variances. Paid plan, owner-only."
    >
      <FarmIntegrityContent />
    </UpgradeGate>
  );
}

const WINDOW_DAYS = 14;

async function FarmIntegrityContent() {
  const supabase = createSupabaseServerClient();
  const sinceIso = new Date(Date.now() - WINDOW_DAYS * 86400000).toISOString().slice(0, 10);

  // RLS scopes all of this to the owner's farms; physical_counts is owner-only.
  const [{ data: batches }, { data: items }, { data: counts }] = await Promise.all([
    supabase
      .from('batches')
      .select('id, farm_id, breed_name, poultry_type, opening_bird_count, current_bird_count, cost_per_bird, status, farms(farm_name)')
      .eq('status', 'active'),
    supabase
      .from('inventory_items')
      .select('id, farm_id, item_name, category, unit, current_stock')
      .eq('category', 'feed'),
    supabase
      .from('physical_counts')
      .select('id, farm_id, batch_id, item_id, count_type, counted_value, count_date')
      .order('count_date', { ascending: false }),
  ]);

  const activeBatches = (batches ?? []) as any[];
  const feedItems = (items ?? []) as any[];
  const physical = (counts ?? []) as any[];

  // Latest physical count per item / per batch.
  const latestItemCount = new Map<string, number>();
  const latestBatchCount = new Map<string, number>();
  for (const c of physical) {
    if (c.count_type === 'feed_stock' && c.item_id && !latestItemCount.has(c.item_id))
      latestItemCount.set(c.item_id, Number(c.counted_value));
    if (c.count_type === 'bird_count' && c.batch_id && !latestBatchCount.has(c.batch_id))
      latestBatchCount.set(c.batch_id, Number(c.counted_value));
  }

  const batchIds = activeBatches.map((b) => b.id);
  // Window logs (feed-growth + entry behaviour) and all-time deaths (bird recon).
  const [{ data: windowLogs }, { data: allDeaths }, { data: harvests }] = await Promise.all([
    batchIds.length
      ? supabase
          .from('daily_logs')
          .select('batch_id, log_date, created_at, birds_dead, feed_consumed_kg, feed_cost_per_kg, avg_bird_weight_g')
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
  for (const d of (allDeaths ?? []) as any[]) {
    deathsByBatch.set(d.batch_id, (deathsByBatch.get(d.batch_id) ?? 0) + Number(d.birds_dead ?? 0));
  }
  const soldByBatch = new Map<string, number>();
  for (const h of (harvests ?? []) as any[]) {
    soldByBatch.set(h.batch_id, (soldByBatch.get(h.batch_id) ?? 0) + Number(h.birds_harvested ?? 0));
  }

  // Feed cost per kg: most recent non-null across window logs (farm-agnostic proxy).
  const feedCost =
    ((windowLogs ?? []) as any[])
      .filter((l) => l.feed_cost_per_kg != null && Number(l.feed_cost_per_kg) > 0)
      .map((l) => Number(l.feed_cost_per_kg))
      .pop() ?? 30;

  // ── Assemble report inputs ──────────────────────────────────────────────────
  type Section = { title: string; findings: IntegrityFinding[]; exposure: number; overall: IntegritySeverity };
  const sections: Section[] = [];

  // Feed stock recon — per feed item that has a physical count.
  for (const it of feedItems) {
    const phys = latestItemCount.get(it.id);
    if (phys == null) continue;
    const report = buildFarmIntegrityReport({
      feed: { systemStockKg: Number(it.current_stock ?? 0), physicalStockKg: phys, feedCostPerKg: feedCost },
    });
    if (report.findings.length)
      sections.push({ title: `Feed — ${it.item_name}`, findings: report.findings, exposure: report.totalExposureRupees, overall: report.overall });
  }

  // Per active batch: feed-growth + bird-count + entry behaviour.
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

    const report = buildFarmIntegrityReport({
      feedGrowth:
        bench && weightGainKg > 0
          ? { feedConsumedKg, weightGainKg, standardFcr: bench.targetFcr, feedCostPerKg: feedCost }
          : null,
      birdCount: {
        opening: Number(b.opening_bird_count ?? 0),
        cumulativeDeaths: deathsByBatch.get(b.id) ?? 0,
        soldOrTransferred: soldByBatch.get(b.id) ?? 0,
        systemCount: Number(b.current_bird_count ?? 0),
        physicalCount: latestBatchCount.get(b.id) ?? null,
        birdValue: Number(b.cost_per_bird ?? 0),
      },
      entryLogs: logs.map((l) => ({
        log_date: l.log_date,
        created_at: l.created_at,
        feed_consumed_kg: l.feed_consumed_kg,
        avg_bird_weight_g: l.avg_bird_weight_g,
      })),
    });
    if (report.findings.length)
      sections.push({
        title: `Batch — ${b.breed_name ?? b.id.slice(0, 6)}`,
        findings: report.findings,
        exposure: report.totalExposureRupees,
        overall: report.overall,
      });
  }

  const totalExposure = sections.reduce((s, x) => s + x.exposure, 0);
  const worst: IntegritySeverity = sections.some((s) => s.overall === 'attention')
    ? 'attention'
    : sections.some((s) => s.overall === 'review')
      ? 'review'
      : 'ok';

  const spotItems = feedItems.map((i) => ({ id: i.id, name: i.item_name, farm_id: i.farm_id }));
  const spotBatches = activeBatches.map((b) => ({ id: b.id, name: b.breed_name ?? b.id.slice(0, 6), farm_id: b.farm_id }));

  return (
    <div className="max-w-[1100px] mx-auto">
      <PageHeader
        eyebrow="Insights"
        title="Farm Integrity"
        subtitle={`Variances between what was logged and physical reality, over the last ${WINDOW_DAYS} days. These are items to review — not conclusions. Enter a quick physical count to sharpen the check.`}
        orbs={['sky', 'lavender']}
      />

      <div className={`card mb-2xl ${worst === 'attention' ? 'border-danger' : worst === 'review' ? 'border-warning' : ''}`}>
        <div className="flex items-center justify-between flex-wrap gap-md">
          <div>
            <p className="text-xs uppercase tracking-wider text-body-soft">This week</p>
            <p className="text-xl font-bold text-ink">
              {sections.length === 0 ? 'Everything reconciles ✓' : `${sections.length} area(s) to review`}
            </p>
          </div>
          {totalExposure < 0 && (
            <div className="text-right">
              <p className="text-xs uppercase tracking-wider text-body-soft">Value to account for</p>
              <p className="text-2xl font-bold text-danger">{formatCurrencyINR(Math.abs(totalExposure))}</p>
            </div>
          )}
        </div>
      </div>

      {sections.map((s, i) => (
        <div key={i} className="card mb-lg">
          <h2 className="text-lg font-bold text-ink mb-md">{s.title}</h2>
          <ul className="space-y-sm">
            {s.findings.map((f, j) => (
              <li key={j} className="flex items-start gap-sm">
                <Sev severity={f.severity} />
                <div className="text-sm">
                  <p className="text-ink">{describe(f)}</p>
                  {f.rupees != null && f.rupees < 0 && (
                    <p className="text-xs text-danger font-semibold">{formatCurrencyINR(Math.abs(f.rupees))} to account for</p>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </div>
      ))}

      <SpotCountForm items={spotItems} batches={spotBatches} />

      {physical.length > 0 && (
        <div className="card mt-lg">
          <h2 className="text-lg font-bold text-ink mb-md">Recent spot-counts</h2>
          <ul className="space-y-xs text-sm">
            {physical.slice(0, 8).map((c) => (
              <li key={c.id} className="flex justify-between border-b border-mute last:border-0 pb-xs">
                <span className="text-body">{c.count_type === 'feed_stock' ? 'Feed stock' : 'Bird count'} · {formatDateDDMonYYYY(c.count_date)}</span>
                <span className="font-semibold text-ink tabular-nums">{Number(c.counted_value).toLocaleString('en-IN')}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function Sev({ severity }: { severity: IntegritySeverity }) {
  const tone = severity === 'attention' ? 'bg-danger' : severity === 'review' ? 'bg-warning' : 'bg-success';
  return <span className={`mt-1 inline-block size-2 rounded-full ${tone}`} aria-hidden />;
}

function describe(f: IntegrityFinding): string {
  const p = f.params;
  switch (f.key) {
    case 'feed_variance':
      return `Physical feed stock is ${Math.abs(Number(p.varianceKg))} kg ${Number(p.varianceKg) < 0 ? 'below' : 'above'} the ${p.systemKg} kg the system shows.`;
    case 'feed_growth':
      return `Feed-to-growth FCR ${p.actualFcr} vs standard ${p.standardFcr} — about ${p.excessKg} kg of feed beyond what the weight gain explains.`;
    case 'bird_variance':
      return `Physical bird count differs from the system by ${Number(p.varianceBirds)} (system ${p.systemCount}, counted ${p.physicalCount}).`;
    case 'entry_backfill':
      return `${p.count} log(s) entered well after their date — backfilled in bulk.`;
    case 'entry_repeated':
      return `Feed quantity identical for ${p.run} days in a row — worth a glance.`;
    case 'entry_odd_hours':
      return `${p.count} log(s) entered outside normal working hours.`;
    case 'entry_weight_jump':
      return `${p.count} biologically implausible weight change(s) between weighings.`;
    default:
      return '';
  }
}
