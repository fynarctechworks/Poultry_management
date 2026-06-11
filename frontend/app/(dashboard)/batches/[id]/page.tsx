import Link from 'next/link';
import { notFound } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { formatCurrencyINR, formatDateDDMonYYYY } from '@/lib/utils';
import { ProfitCalculator } from './ProfitCalculator';
import { CloseBatchForm } from './CloseBatchForm';
import { DeleteButton } from '@/components/DeleteButton';

export default async function BatchDetailPage({ params }: { params: { id: string } }) {
  const supabase = createSupabaseServerClient();

  const { data: batch } = await supabase
    .from('batches')
    .select('id, batch_code, breed_name, poultry_type, placement_date, opening_bird_count, current_bird_count, source_supplier, cost_per_bird, status, harvest_date, birds_sold, sale_weight_kg, sale_price_per_kg, total_sale_revenue, farm_id, sheds(shed_name, farm_id)')
    .eq('id', params.id)
    .maybeSingle();

  if (!batch) notFound();

  const [{ data: logs }, { data: vaccinations }, { data: incidents }] = await Promise.all([
    supabase
      .from('daily_logs')
      .select('id, log_date, birds_dead, feed_consumed_kg, eggs_collected, avg_bird_weight_g')
      .eq('batch_id', params.id)
      .order('log_date', { ascending: false })
      .limit(30),
    supabase
      .from('vaccinations')
      .select('id, vaccine_name, scheduled_date, administered_date, status')
      .eq('batch_id', params.id)
      .order('scheduled_date'),
    supabase
      .from('health_incidents')
      .select('id, incident_date, symptom_description, affected_bird_count, diagnosis, withdrawal_clearance_date')
      .eq('batch_id', params.id)
      .order('incident_date', { ascending: false })
      .limit(10),
  ]);

  const totalDeaths = (logs ?? []).reduce((s, l) => s + (l.birds_dead ?? 0), 0);
  const totalFeed = (logs ?? []).reduce((s, l) => s + Number(l.feed_consumed_kg ?? 0), 0);

  // Aggregate cost = expense transactions on this batch + chick cost (opening * cost_per_bird)
  const { data: expenses } = await supabase
    .from('financial_transactions')
    .select('amount')
    .eq('batch_id', params.id)
    .eq('transaction_type', 'expense');
  const expenseTotal = (expenses ?? []).reduce((s, e) => s + Number(e.amount ?? 0), 0);
  const chickCost = (batch.cost_per_bird ?? 0) * (batch.opening_bird_count ?? 0);
  const totalCostSoFar = expenseTotal + Number(chickCost);
  const livability = batch.opening_bird_count
    ? ((batch.current_bird_count / batch.opening_bird_count) * 100).toFixed(1)
    : '—';
  const ageDays = Math.max(0, Math.floor((Date.now() - new Date(batch.placement_date).getTime()) / 86400000));

  return (
    <div className="max-w-[1200px] mx-auto">
      <Link href={`/farms/${(batch.sheds as any)?.farm_id ?? batch.farm_id}`} className="text-sm text-primary-dark font-semibold">&larr; Farm</Link>
      <div className="flex items-baseline justify-between mt-md">
        <h1 className="text-3xl font-bold text-ink">{batch.batch_code}</h1>
        <span className={`px-md py-xs rounded-md text-sm font-semibold ${batch.status === 'active' ? 'bg-success-soft text-success-ink' : 'bg-mute-soft text-body'}`}>
          {batch.status}
        </span>
      </div>
      <p className="text-sm text-body mt-xs">{batch.breed_name} · {batch.poultry_type} · Shed: {(batch.sheds as any)?.shed_name ?? '—'}</p>
      <div className="flex gap-md mt-sm items-center">
        <Link href={`/batches/${batch.id}/pnl`} className="text-sm text-primary-dark font-semibold">View full P&amp;L statement &rarr;</Link>
        <Link href={`/batches/${batch.id}/edit`} className="text-sm text-primary-dark font-semibold">Edit batch</Link>
        <DeleteButton
          table="batches"
          id={batch.id}
          redirectTo={`/farms/${(batch.sheds as any)?.farm_id ?? batch.farm_id}`}
          variant="link"
          label="Delete batch"
          confirmText="— erases all logs, vaccinations & health records"
        />
      </div>

      {batch.status === 'active' && (
        <div className="mt-md">
          <CloseBatchForm batchId={batch.id} />
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-md mt-2xl">
        <Kpi label="Age (days)" value={ageDays.toString()} />
        <Kpi label="Opening" value={batch.opening_bird_count.toLocaleString('en-IN')} />
        <Kpi label="Current" value={batch.current_bird_count.toLocaleString('en-IN')} />
        <Kpi label="Livability" value={`${livability}%`} accent="success" />
        <Kpi label="Total deaths (30d)" value={totalDeaths.toString()} accent={totalDeaths > 0 ? 'danger' : undefined} />
        <Kpi label="Total feed (30d, kg)" value={totalFeed.toLocaleString('en-IN')} />
        <Kpi label="Placed" value={formatDateDDMonYYYY(batch.placement_date)} />
        <Kpi label="Cost/bird" value={batch.cost_per_bird ? formatCurrencyINR(Number(batch.cost_per_bird)) : '—'} />
      </div>

      {batch.status === 'active' && (
        <ProfitCalculator
          openingBirdCount={batch.opening_bird_count}
          currentBirdCount={batch.current_bird_count}
          totalCostSoFar={totalCostSoFar}
          defaultPricePerKg={120}
        />
      )}

      <section className="mt-2xl">
        <h2 className="text-lg font-bold text-ink mb-md">Recent daily logs</h2>
        <div className="card overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead className="bg-canvas-soft border-b border-mute">
              <tr className="text-left text-xs uppercase tracking-wider text-body-soft">
                <th className="px-md py-sm">Date</th>
                <th className="px-md py-sm text-right">Deaths</th>
                <th className="px-md py-sm text-right">Feed (kg)</th>
                <th className="px-md py-sm text-right">Eggs</th>
                <th className="px-md py-sm text-right">Avg weight (g)</th>
              </tr>
            </thead>
            <tbody>
              {(logs ?? []).map((l) => (
                <tr key={l.id} className="border-b border-mute last:border-0">
                  <td className="px-md py-md">{formatDateDDMonYYYY(l.log_date)}</td>
                  <td className="px-md py-md text-right tabular-nums">{l.birds_dead}</td>
                  <td className="px-md py-md text-right tabular-nums">{Number(l.feed_consumed_kg ?? 0)}</td>
                  <td className="px-md py-md text-right tabular-nums">{l.eggs_collected ?? '—'}</td>
                  <td className="px-md py-md text-right tabular-nums">{l.avg_bird_weight_g ?? '—'}</td>
                </tr>
              ))}
              {(!logs || logs.length === 0) && (
                <tr><td colSpan={5} className="py-2xl text-center text-body">No logs yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="mt-2xl grid grid-cols-1 lg:grid-cols-2 gap-lg">
        <div>
          <h2 className="text-lg font-bold text-ink mb-md">Vaccinations</h2>
          <div className="card space-y-sm">
            {(vaccinations ?? []).map((v) => (
              <div key={v.id} className="flex items-center justify-between text-sm border-b border-mute last:border-0 pb-sm last:pb-0">
                <div>
                  <p className="font-semibold text-ink">{v.vaccine_name}</p>
                  <p className="text-xs text-body-soft">Scheduled {formatDateDDMonYYYY(v.scheduled_date)}</p>
                </div>
                <span className={`px-sm py-xxs rounded-md text-xs font-semibold ${v.status === 'done' ? 'bg-success-soft text-success-ink' : v.status === 'overdue' ? 'bg-warning-soft text-warning-ink' : 'bg-mute-soft text-body'}`}>
                  {v.status}
                </span>
              </div>
            ))}
            {(!vaccinations || vaccinations.length === 0) && <p className="text-sm text-body">No vaccinations scheduled.</p>}
          </div>
        </div>
        <div>
          <h2 className="text-lg font-bold text-ink mb-md">Health incidents</h2>
          <div className="card space-y-sm">
            {(incidents ?? []).map((h) => (
              <div key={h.id} className="text-sm border-b border-mute last:border-0 pb-sm last:pb-0">
                <p className="font-semibold text-ink">{h.symptom_description}</p>
                <p className="text-xs text-body-soft mt-xxs">
                  {formatDateDDMonYYYY(h.incident_date)} · {h.affected_bird_count} birds
                  {h.withdrawal_clearance_date ? ` · withdrawal until ${formatDateDDMonYYYY(h.withdrawal_clearance_date)}` : ''}
                </p>
                {h.diagnosis && <p className="text-xs text-body mt-xxs">Dx: {h.diagnosis}</p>}
              </div>
            ))}
            {(!incidents || incidents.length === 0) && <p className="text-sm text-body">No incidents.</p>}
          </div>
        </div>
      </section>
    </div>
  );
}

function Kpi({ label, value, accent }: { label: string; value: string; accent?: 'success' | 'danger' }) {
  const tone = accent === 'success' ? 'text-success-ink' : accent === 'danger' ? 'text-danger' : 'text-ink';
  return (
    <div className="card">
      <p className="text-xs uppercase tracking-wider text-body-soft mb-xs">{label}</p>
      <p className={`text-xl font-bold ${tone}`}>{value}</p>
    </div>
  );
}
