import Link from 'next/link';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { PriceTrend } from './PriceTrend';
import { formatCurrencyINR, formatDateDDMonYYYY } from '@/lib/utils';

export default async function MarketPricesPage() {
  const supabase = createSupabaseServerClient();

  const { data: farms } = await supabase.from('farms').select('state').not('state', 'is', null);
  const states = Array.from(new Set((farms ?? []).map((f) => f.state))).filter(Boolean) as string[];

  const since = new Date();
  since.setDate(since.getDate() - 30);

  const { data: prices } = states.length
    ? await supabase
        .from('market_prices')
        .select('state, price_date, broiler_price_per_kg, egg_price_per_100, source')
        .in('state', states)
        .gte('price_date', since.toISOString().slice(0, 10))
        .order('price_date', { ascending: true })
    : { data: [] };

  const byState = new Map<string, any[]>();
  for (const p of (prices ?? [])) {
    if (!byState.has(p.state)) byState.set(p.state, []);
    byState.get(p.state)!.push(p);
  }

  return (
    <div className="max-w-[1200px] mx-auto">
      <div className="flex items-center justify-between mb-xs">
        <h1 className="text-3xl font-bold text-ink">Market Prices</h1>
        <Link href="/market-prices/new" className="btn-outline">Manual entry</Link>
      </div>
      <p className="text-sm text-body mb-2xl">14-day broiler + egg price trend by state. Source: Agmarknet / NAFED.</p>

      {byState.size === 0 && (
        <div className="card text-center py-2xl">
          <p className="text-body">No price data yet. The fetch-market-prices cron runs at 08:00 IST.</p>
        </div>
      )}

      <div className="space-y-2xl">
        {Array.from(byState.entries()).map(([state, rows]) => {
          const latest = rows[rows.length - 1];
          return (
            <div key={state} className="card">
              <div className="flex items-baseline justify-between mb-md flex-wrap gap-sm">
                <h2 className="text-xl font-bold text-ink">{state}</h2>
                <p className="text-xs text-body-soft">
                  Latest {formatDateDDMonYYYY(latest.price_date)} · source: {latest.source}
                </p>
              </div>
              <div className="grid grid-cols-2 gap-md mb-md">
                <div>
                  <p className="text-xs uppercase tracking-wider text-body-soft">Broiler ₹/kg</p>
                  <p className="text-2xl font-bold text-primary">{formatCurrencyINR(Number(latest.broiler_price_per_kg))}</p>
                </div>
                {latest.egg_price_per_100 && (
                  <div>
                    <p className="text-xs uppercase tracking-wider text-body-soft">Egg ₹/100</p>
                    <p className="text-2xl font-bold text-primary">{formatCurrencyINR(Number(latest.egg_price_per_100))}</p>
                  </div>
                )}
              </div>
              <PriceTrend data={rows.map((r) => ({
                date: r.price_date,
                broiler: Number(r.broiler_price_per_kg ?? 0),
                egg: r.egg_price_per_100 ? Number(r.egg_price_per_100) : null,
              }))} />
            </div>
          );
        })}
      </div>
    </div>
  );
}
