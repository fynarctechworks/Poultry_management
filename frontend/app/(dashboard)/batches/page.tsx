import Link from 'next/link';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { formatDateDDMonYYYY, formatCurrencyINR } from '@/lib/utils';
import { InsightsPanel } from '@/components/InsightsPanel';
import {
  computeInsights,
  type Insight,
  type InsightBatchInput,
  type InsightLogRow,
} from '@poultryos/shared';

export default async function BatchesPage({
  searchParams,
}: {
  searchParams?: { status?: string; farm?: string };
}) {
  const supabase = createSupabaseServerClient();

  const statusFilter = searchParams?.status ?? 'active';
  const farmFilter = searchParams?.farm ?? '';

  const { data: farms } = await supabase.from('farms').select('id, farm_name').order('farm_name');

  let q = supabase
    .from('batches')
    .select('id, batch_code, breed_name, poultry_type, placement_date, opening_bird_count, current_bird_count, status, harvest_date, total_sale_revenue, sheds(shed_name), farms(farm_name)')
    .order('placement_date', { ascending: false })
    .limit(200);

  if (statusFilter && statusFilter !== 'all') q = q.eq('status', statusFilter);
  if (farmFilter) q = q.eq('farm_id', farmFilter);

  const { data: batches } = await q;

  // Smart Insights — always computed over ACTIVE batches in the current farm
  // scope (insights only make sense for live flocks, regardless of the table's
  // status filter). The engine self-windows to the last 2 weeks internally.
  let activeQ = supabase
    .from('batches')
    .select('id, batch_code, breed_name, poultry_type, opening_bird_count, current_bird_count, placement_date')
    .eq('status', 'active')
    .limit(200);
  if (farmFilter) activeQ = activeQ.eq('farm_id', farmFilter);
  const { data: activeBatches } = await activeQ;

  let insights: Insight[] = [];
  if (activeBatches && activeBatches.length > 0) {
    const ids = activeBatches.map((b) => b.id);
    const { data: logRows } = await supabase
      .from('daily_logs')
      .select('batch_id, log_date, birds_dead, feed_consumed_kg, feed_cost_per_kg, eggs_collected, avg_bird_weight_g')
      .in('batch_id', ids);
    const logs = (logRows ?? []) as (InsightLogRow & { batch_id: string })[];
    const inputs: InsightBatchInput[] = activeBatches.map((b: any) => ({
      batchId: b.id,
      batchCode: b.batch_code,
      breedName: b.breed_name ?? null,
      poultryType: b.poultry_type,
      openingBirdCount: b.opening_bird_count ?? 0,
      currentBirdCount: b.current_bird_count ?? 0,
      placementDate: b.placement_date,
      logs: logs.filter((l) => l.batch_id === b.id),
    }));
    insights = computeInsights(inputs);
  }

  return (
    <div className="max-w-[1400px] mx-auto">
      <div className="flex items-center justify-between mb-lg flex-wrap gap-md">
        <h1 className="text-3xl font-bold text-ink">Batches</h1>
        <Link href="/batches/new" className="btn-primary">New batch</Link>
      </div>

      <form className="card flex flex-wrap items-end gap-md mb-lg">
        <div>
          <label className="label">Status</label>
          <select name="status" defaultValue={statusFilter} className="input">
            <option value="active">Active</option>
            <option value="harvested">Harvested</option>
            <option value="closed">Closed</option>
            <option value="all">All</option>
          </select>
        </div>
        <div>
          <label className="label">Farm</label>
          <select name="farm" defaultValue={farmFilter} className="input">
            <option value="">All farms</option>
            {(farms ?? []).map((f) => <option key={f.id} value={f.id}>{f.farm_name}</option>)}
          </select>
        </div>
        <button type="submit" className="btn-outline">Apply</button>
      </form>

      <InsightsPanel insights={insights} />

      <div className="card p-0 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-canvas-soft border-b border-mute">
            <tr className="text-left text-xs uppercase tracking-wider text-body-soft">
              <th className="px-md py-sm">Batch</th>
              <th className="px-md py-sm">Farm / Shed</th>
              <th className="px-md py-sm">Breed</th>
              <th className="px-md py-sm">Placed</th>
              <th className="px-md py-sm text-right">Opening</th>
              <th className="px-md py-sm text-right">Current</th>
              <th className="px-md py-sm">Status</th>
              <th className="px-md py-sm text-right">Revenue</th>
            </tr>
          </thead>
          <tbody>
            {(batches ?? []).map((b: any) => (
              <tr key={b.id} className="border-b border-mute last:border-0 hover:bg-canvas-soft">
                <td className="px-md py-md">
                  <Link href={`/batches/${b.id}`} className="font-semibold text-primary-dark">{b.batch_code}</Link>
                  <div className="text-xs text-body-soft">{b.poultry_type}</div>
                </td>
                <td className="px-md py-md text-body">
                  {b.farms?.farm_name}
                  <div className="text-xs text-body-soft">{b.sheds?.shed_name}</div>
                </td>
                <td className="px-md py-md text-body">{b.breed_name}</td>
                <td className="px-md py-md text-body">{formatDateDDMonYYYY(b.placement_date)}</td>
                <td className="px-md py-md text-right tabular-nums">{b.opening_bird_count}</td>
                <td className="px-md py-md text-right tabular-nums">{b.current_bird_count}</td>
                <td className="px-md py-md">
                  <span className={`px-sm py-xxs rounded-md text-xs font-semibold ${
                    b.status === 'active' ? 'bg-success-soft text-success-ink' :
                    b.status === 'harvested' ? 'bg-primary-subtle text-primary' :
                    'bg-mute-soft text-body'
                  }`}>{b.status}</span>
                </td>
                <td className="px-md py-md text-right tabular-nums">{b.total_sale_revenue ? formatCurrencyINR(Number(b.total_sale_revenue)) : '—'}</td>
              </tr>
            ))}
            {(!batches || batches.length === 0) && (
              <tr><td colSpan={8} className="py-2xl text-center text-body">No batches match.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
