import Link from 'next/link';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { formatCurrencyINR, formatDateDDMonYYYY } from '@/lib/utils';
import { Sparkline } from '@/components/Sparkline';
import { UpgradeGate } from '@/components/UpgradeGate';
import { colors } from '@/lib/theme/tokens';

type FarmSummary = {
  farm_id: string;
  farm_name: string;
  state: string | null;
  district: string | null;
  farm_type: 'independent' | 'contract';
  active_batches: number;
  total_birds: number;
  mortality_count_month: number;
  mortality_pct_month: number | null;
  feed_used_kg_month: number;
  eggs_collected_month: number;
  income_month: number;
  expense_month: number;
  net_pnl_month: number;
  pending_receivables: number;
  last_log_date: string | null;
};

export default async function MultiFarmPage() {
  return (
    <UpgradeGate
      feature="Multi-farm consolidated dashboard"
      description="See KPIs, P&L and receivables across every farm you own or manage in one screen — a paid plan feature."
    >
      <MultiFarmContent />
    </UpgradeGate>
  );
}

async function MultiFarmContent() {
  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase.rpc('get_multi_farm_summary');

  const rows = (data ?? []) as FarmSummary[];

  const farmIds = rows.map((r) => r.farm_id);
  const states = Array.from(new Set(rows.map((r) => r.state).filter(Boolean))) as string[];

  const [{ data: weather }, { data: prices }] = await Promise.all([
    farmIds.length
      ? supabase
          .from('weather_data')
          .select('farm_id, current_temp_c, current_humidity, max_temp_today, heat_stress_alert_triggered, fetched_at')
          .in('farm_id', farmIds)
          .order('fetched_at', { ascending: false })
      : Promise.resolve({ data: null }),
    states.length
      ? supabase
          .from('market_prices')
          .select('state, price_date, broiler_price_per_kg, egg_price_per_100')
          .in('state', states)
          .order('price_date', { ascending: false })
          .limit(50)
      : Promise.resolve({ data: null }),
  ]);

  const latestWeather = new Map<string, any>();
  for (const w of (weather ?? [])) {
    if (!latestWeather.has(w.farm_id)) latestWeather.set(w.farm_id, w);
  }
  const latestPrice = new Map<string, any>();
  for (const p of (prices ?? [])) {
    if (!latestPrice.has(p.state)) latestPrice.set(p.state, p);
  }

  const heatAlerts = rows.filter((r) => latestWeather.get(r.farm_id)?.heat_stress_alert_triggered);

  // 7-day mortality sparkline per farm
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 6);
  const { data: recentLogs } = farmIds.length
    ? await supabase
        .from('daily_logs')
        .select('farm_id, log_date, birds_dead')
        .in('farm_id', farmIds)
        .gte('log_date', sevenDaysAgo.toISOString().slice(0, 10))
    : { data: null };

  const sparkByFarm = new Map<string, { value: number }[]>();
  if (recentLogs) {
    const dailyMap = new Map<string, Map<string, number>>();
    for (const l of recentLogs) {
      if (!dailyMap.has(l.farm_id)) dailyMap.set(l.farm_id, new Map());
      const m = dailyMap.get(l.farm_id)!;
      m.set(l.log_date, (m.get(l.log_date) ?? 0) + (l.birds_dead ?? 0));
    }
    for (const farmId of farmIds) {
      const arr: { value: number }[] = [];
      for (let i = 6; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        const key = d.toISOString().slice(0, 10);
        arr.push({ value: dailyMap.get(farmId)?.get(key) ?? 0 });
      }
      sparkByFarm.set(farmId, arr);
    }
  }

  const totals = rows.reduce(
    (acc, r) => ({
      birds: acc.birds + (r.total_birds ?? 0),
      batches: acc.batches + (r.active_batches ?? 0),
      income: acc.income + Number(r.income_month ?? 0),
      expense: acc.expense + Number(r.expense_month ?? 0),
      pnl: acc.pnl + Number(r.net_pnl_month ?? 0),
      receivables: acc.receivables + Number(r.pending_receivables ?? 0),
    }),
    { birds: 0, batches: 0, income: 0, expense: 0, pnl: 0, receivables: 0 }
  );

  return (
    <div className="max-w-[1400px] mx-auto">
      <div className="mb-2xl">
        <h1 className="text-3xl font-bold text-ink">Multi-Farm Dashboard</h1>
        <p className="text-sm text-body mt-xs">Consolidated KPIs across all farms you own or manage — current month.</p>
      </div>

      {error && (
        <div className="card bg-warning-soft border-warning mb-lg">
          <p className="text-sm text-warning-ink font-semibold">Failed to load summary: {error.message}</p>
        </div>
      )}

      {heatAlerts.length > 0 && (
        <div className="rounded-card border border-heat bg-heat/10 px-lg py-md mb-lg flex items-start gap-md">
          <span className="text-heat text-xl">🔥</span>
          <div>
            <p className="font-semibold text-heat">Heat-stress alert active</p>
            <p className="text-sm text-body mt-xxs">
              {heatAlerts.map((r) => r.farm_name).join(', ')} — increase water, run foggers, reduce feed by 20%.
            </p>
          </div>
        </div>
      )}

      {latestPrice.size > 0 && (
        <div className="card mb-lg">
          <p className="text-xs uppercase tracking-wider text-body-soft mb-sm">Today's market prices</p>
          <div className="flex flex-wrap gap-lg">
            {Array.from(latestPrice.entries()).map(([state, p]) => (
              <div key={state} className="text-sm">
                <span className="font-semibold text-ink">{state}</span>
                <span className="text-body ml-sm">
                  Broiler {formatCurrencyINR(Number(p.broiler_price_per_kg))}/kg
                  {p.egg_price_per_100 ? ` · Egg ${formatCurrencyINR(Number(p.egg_price_per_100))}/100` : ''}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-md mb-2xl">
        <KpiCard label="Active farms" value={rows.length.toString()} />
        <KpiCard label="Active batches" value={totals.batches.toString()} />
        <KpiCard label="Total birds" value={totals.birds.toLocaleString('en-IN')} />
        <KpiCard label="Net P&L (month)" value={formatCurrencyINR(totals.pnl)} accent={totals.pnl >= 0 ? 'success' : 'danger'} />
        <KpiCard label="Income (month)" value={formatCurrencyINR(totals.income)} />
        <KpiCard label="Expense (month)" value={formatCurrencyINR(totals.expense)} />
        <KpiCard label="Receivables" value={formatCurrencyINR(totals.receivables)} accent="warning" />
      </div>

      <div className="card overflow-x-auto p-0">
        <table className="w-full text-sm">
          <thead className="bg-canvas-soft border-b border-mute">
            <tr className="text-left text-xs uppercase tracking-wider text-body-soft">
              <Th>Farm</Th>
              <Th>Type</Th>
              <Th align="right">Batches</Th>
              <Th align="right">Birds</Th>
              <Th align="right">Mortality %</Th>
              <Th>7d trend</Th>
              <Th align="right">Feed (kg)</Th>
              <Th align="right">Income</Th>
              <Th align="right">Expense</Th>
              <Th align="right">Net P&amp;L</Th>
              <Th align="right">Receivables</Th>
              <Th>Last log</Th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={11} className="py-2xl text-center text-body">
                  No farms yet. Create your first farm to populate the dashboard.
                </td>
              </tr>
            )}
            {rows.map((r) => {
              const w = latestWeather.get(r.farm_id);
              return (
              <tr key={r.farm_id} className="border-b border-mute last:border-0 hover:bg-canvas-soft">
                <Td>
                  <Link href={`/farms/${r.farm_id}`} className="font-semibold text-primary-dark">{r.farm_name}</Link>
                  <div className="text-xs text-body-soft">
                    {[r.district, r.state].filter(Boolean).join(', ') || '—'}
                    {w && (
                      <span className={`ml-sm ${w.heat_stress_alert_triggered ? 'text-heat font-semibold' : ''}`}>
                        · {Number(w.current_temp_c).toFixed(0)}°C
                      </span>
                    )}
                  </div>
                </Td>
                <Td>
                  <span className="inline-block px-sm py-xxs rounded-md text-xs font-semibold bg-mute-soft text-body">
                    {r.farm_type}
                  </span>
                </Td>
                <Td align="right">{r.active_batches}</Td>
                <Td align="right">{(r.total_birds ?? 0).toLocaleString('en-IN')}</Td>
                <Td align="right">
                  {r.mortality_pct_month == null ? '—' : `${Number(r.mortality_pct_month).toFixed(2)}%`}
                </Td>
                <Td>
                  <Sparkline data={sparkByFarm.get(r.farm_id) ?? []} color={colors.danger} />
                </Td>
                <Td align="right">{Number(r.feed_used_kg_month ?? 0).toLocaleString('en-IN')}</Td>
                <Td align="right">{formatCurrencyINR(Number(r.income_month))}</Td>
                <Td align="right">{formatCurrencyINR(Number(r.expense_month))}</Td>
                <Td align="right" className={Number(r.net_pnl_month) >= 0 ? 'text-success-ink font-semibold' : 'text-danger font-semibold'}>
                  {formatCurrencyINR(Number(r.net_pnl_month))}
                </Td>
                <Td align="right">{formatCurrencyINR(Number(r.pending_receivables))}</Td>
                <Td>{formatDateDDMonYYYY(r.last_log_date)}</Td>
              </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function KpiCard({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: 'success' | 'danger' | 'warning';
}) {
  const tone =
    accent === 'success' ? 'text-success-ink'
    : accent === 'danger' ? 'text-danger'
    : accent === 'warning' ? 'text-warning-ink'
    : 'text-ink';
  return (
    <div className="card">
      <p className="text-xs uppercase tracking-wider text-body-soft mb-xs">{label}</p>
      <p className={`text-2xl font-bold ${tone}`}>{value}</p>
    </div>
  );
}

function Th({ children, align }: { children: React.ReactNode; align?: 'right' }) {
  return (
    <th className={`px-md py-sm font-semibold ${align === 'right' ? 'text-right' : 'text-left'}`}>
      {children}
    </th>
  );
}

function Td({
  children,
  align,
  className = '',
}: {
  children: React.ReactNode;
  align?: 'right';
  className?: string;
}) {
  return (
    <td className={`px-md py-md ${align === 'right' ? 'text-right tabular-nums' : ''} ${className}`}>
      {children}
    </td>
  );
}
