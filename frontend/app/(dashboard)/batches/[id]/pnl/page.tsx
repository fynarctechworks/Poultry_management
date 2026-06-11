import Link from 'next/link';
import { notFound } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { formatCurrencyINR, formatDateDDMonYYYY } from '@/lib/utils';

export default async function BatchPnlPage({ params }: { params: { id: string } }) {
  const supabase = createSupabaseServerClient();

  const { data: batch } = await supabase
    .from('batches')
    .select('id, batch_code, breed_name, poultry_type, placement_date, harvest_date, opening_bird_count, current_bird_count, cost_per_bird, status, birds_sold, sale_weight_kg, sale_price_per_kg, total_sale_revenue, farm_id')
    .eq('id', params.id)
    .maybeSingle();

  if (!batch) notFound();

  const [{ data: logs }, { data: txns }] = await Promise.all([
    supabase
      .from('daily_logs')
      .select('birds_dead, feed_consumed_kg, avg_bird_weight_g, log_date')
      .eq('batch_id', params.id),
    supabase
      .from('financial_transactions')
      .select('transaction_type, category, amount, transaction_date, notes')
      .eq('batch_id', params.id)
      .order('transaction_date', { ascending: false }),
  ]);

  const allLogs = logs ?? [];
  const allTxns = txns ?? [];

  const totalFeedKg = allLogs.reduce((s, l) => s + Number(l.feed_consumed_kg ?? 0), 0);
  const totalDeaths = allLogs.reduce((s, l) => s + (l.birds_dead ?? 0), 0);
  const latestWeightG = allLogs
    .filter((l) => l.avg_bird_weight_g != null)
    .sort((a, b) => (a.log_date < b.log_date ? 1 : -1))[0]?.avg_bird_weight_g ?? null;

  // Cost grouping
  const chickCost = Number(batch.cost_per_bird ?? 0) * (batch.opening_bird_count ?? 0);
  const expenseTxns = allTxns.filter((t) => t.transaction_type === 'expense');
  const incomeTxns = allTxns.filter((t) => t.transaction_type === 'income');

  const expenseByCategory = new Map<string, number>();
  for (const t of expenseTxns) {
    const k = t.category || 'other';
    expenseByCategory.set(k, (expenseByCategory.get(k) ?? 0) + Number(t.amount ?? 0));
  }
  const expenseTotal = expenseTxns.reduce((s, t) => s + Number(t.amount ?? 0), 0);
  const totalCost = expenseTotal + chickCost;

  // Revenue: prefer realised sale revenue, fall back to recorded income txns
  const saleRevenue = Number(batch.total_sale_revenue ?? 0);
  const incomeTxnTotal = incomeTxns.reduce((s, t) => s + Number(t.amount ?? 0), 0);
  const totalRevenue = saleRevenue > 0 ? saleRevenue : incomeTxnTotal;

  const netPnl = totalRevenue - totalCost;
  const livability = batch.opening_bird_count
    ? (batch.current_bird_count / batch.opening_bird_count) * 100
    : null;
  const mortalityPct = batch.opening_bird_count
    ? (totalDeaths / batch.opening_bird_count) * 100
    : null;

  // FCR = feed consumed / total live weight gain. Use sale weight if harvested, else current birds * latest weight.
  const liveWeightKg = batch.sale_weight_kg
    ? Number(batch.sale_weight_kg)
    : latestWeightG != null
      ? (batch.current_bird_count * Number(latestWeightG)) / 1000
      : null;
  const fcr = liveWeightKg && liveWeightKg > 0 ? totalFeedKg / liveWeightKg : null;

  const perBirdPnl = batch.opening_bird_count ? netPnl / batch.opening_bird_count : null;
  const costPerKg = liveWeightKg && liveWeightKg > 0 ? totalCost / liveWeightKg : null;

  return (
    <div className="max-w-[900px] mx-auto">
      <Link href={`/batches/${batch.id}`} className="text-sm text-primary-dark font-semibold">&larr; {batch.batch_code}</Link>
      <div className="flex items-baseline justify-between mt-md mb-2xl">
        <div>
          <h1 className="text-3xl font-bold text-ink">P&amp;L Statement</h1>
          <p className="text-sm text-body mt-xs">{batch.batch_code} · {batch.breed_name} · {batch.poultry_type}</p>
        </div>
        <span className={`px-md py-xs rounded-md text-sm font-semibold ${batch.status === 'active' ? 'bg-success-soft text-success-ink' : 'bg-mute-soft text-body'}`}>
          {batch.status}
        </span>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-md mb-2xl">
        <Kpi label="Net P&L" value={formatCurrencyINR(netPnl)} accent={netPnl >= 0 ? 'success' : 'danger'} />
        <Kpi label="Per bird" value={perBirdPnl != null ? formatCurrencyINR(perBirdPnl) : '—'} accent={perBirdPnl != null && perBirdPnl >= 0 ? 'success' : 'danger'} />
        <Kpi label="FCR" value={fcr != null ? fcr.toFixed(3) : '—'} />
        <Kpi label="Livability" value={livability != null ? `${livability.toFixed(1)}%` : '—'} accent="success" />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-lg">
        <section className="card">
          <h2 className="text-lg font-bold text-ink mb-md">Revenue</h2>
          <Line label={saleRevenue > 0 ? 'Bird sale revenue' : 'Recorded income'} value={totalRevenue} />
          {batch.sale_price_per_kg != null && (
            <p className="text-xs text-body-soft mt-xs">
              {batch.birds_sold ?? '—'} birds · {batch.sale_weight_kg ?? '—'} kg @ {formatCurrencyINR(Number(batch.sale_price_per_kg))}/kg
            </p>
          )}
          <div className="border-t border-mute mt-md pt-md flex items-center justify-between">
            <span className="font-bold text-ink">Total revenue</span>
            <span className="font-bold text-ink tabular-nums">{formatCurrencyINR(totalRevenue)}</span>
          </div>
        </section>

        <section className="card">
          <h2 className="text-lg font-bold text-ink mb-md">Costs</h2>
          <Line label="Chick cost" value={chickCost} />
          {Array.from(expenseByCategory.entries()).map(([cat, amt]) => (
            <Line key={cat} label={cat} value={amt} />
          ))}
          <div className="border-t border-mute mt-md pt-md flex items-center justify-between">
            <span className="font-bold text-ink">Total cost</span>
            <span className="font-bold text-ink tabular-nums">{formatCurrencyINR(totalCost)}</span>
          </div>
        </section>
      </div>

      <section className="card mt-lg">
        <h2 className="text-lg font-bold text-ink mb-md">Unit economics</h2>
        <dl className="grid grid-cols-2 md:grid-cols-4 gap-md text-sm">
          <Metric label="Feed consumed" value={`${totalFeedKg.toLocaleString('en-IN')} kg`} />
          <Metric label="Live weight" value={liveWeightKg != null ? `${liveWeightKg.toFixed(1)} kg` : '—'} />
          <Metric label="Cost / kg" value={costPerKg != null ? formatCurrencyINR(costPerKg) : '—'} />
          <Metric label="Mortality" value={mortalityPct != null ? `${mortalityPct.toFixed(2)}%` : '—'} />
          <Metric label="Opening birds" value={(batch.opening_bird_count ?? 0).toLocaleString('en-IN')} />
          <Metric label="Current birds" value={(batch.current_bird_count ?? 0).toLocaleString('en-IN')} />
          <Metric label="Placed" value={formatDateDDMonYYYY(batch.placement_date)} />
          <Metric label="Harvested" value={batch.harvest_date ? formatDateDDMonYYYY(batch.harvest_date) : '—'} />
        </dl>
      </section>

      <section className="mt-2xl">
        <h2 className="text-lg font-bold text-ink mb-md">Transaction ledger</h2>
        <div className="card overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead className="bg-canvas-soft border-b border-mute">
              <tr className="text-left text-xs uppercase tracking-wider text-body-soft">
                <th className="px-md py-sm">Date</th>
                <th className="px-md py-sm">Type</th>
                <th className="px-md py-sm">Category</th>
                <th className="px-md py-sm">Notes</th>
                <th className="px-md py-sm text-right">Amount</th>
              </tr>
            </thead>
            <tbody>
              {allTxns.map((t, i) => (
                <tr key={i} className="border-b border-mute last:border-0">
                  <td className="px-md py-md">{formatDateDDMonYYYY(t.transaction_date)}</td>
                  <td className="px-md py-md">
                    <span className={`px-sm py-xxs rounded-md text-xs font-semibold ${t.transaction_type === 'income' ? 'bg-success-soft text-success-ink' : 'bg-mute-soft text-body'}`}>
                      {t.transaction_type}
                    </span>
                  </td>
                  <td className="px-md py-md">{t.category || '—'}</td>
                  <td className="px-md py-md text-body-soft">{t.notes || '—'}</td>
                  <td className={`px-md py-md text-right tabular-nums font-semibold ${t.transaction_type === 'income' ? 'text-success-ink' : 'text-ink'}`}>
                    {formatCurrencyINR(Number(t.amount ?? 0))}
                  </td>
                </tr>
              ))}
              {allTxns.length === 0 && (
                <tr><td colSpan={5} className="py-2xl text-center text-body">No transactions recorded for this batch.</td></tr>
              )}
            </tbody>
          </table>
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

function Line({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center justify-between py-xs text-sm">
      <span className="text-body capitalize">{label}</span>
      <span className="tabular-nums text-ink">{formatCurrencyINR(value)}</span>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wider text-body-soft">{label}</dt>
      <dd className="font-semibold text-ink mt-xxs">{value}</dd>
    </div>
  );
}
