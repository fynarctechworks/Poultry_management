import Link from 'next/link';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { PriceTrend } from './PriceTrend';
import { formatCurrencyINR, formatDateDDMonYYYY } from '@/lib/utils';
import { stateDefaultZone, eggRatePerPiece, eggRatePerTray } from '@poultryos/shared';

export default async function MarketPricesPage() {
  const supabase = createSupabaseServerClient();

  const { data: farms } = await supabase.from('farms').select('state, necc_zone').not('state', 'is', null);
  const states = Array.from(new Set((farms ?? []).map((f) => f.state))).filter(Boolean) as string[];

  // NECC zonal egg rates: the zone each farm tracks (explicit, else state default).
  const zones = Array.from(
    new Set(
      (farms ?? [])
        .map((f) => (f as any).necc_zone ?? stateDefaultZone(f.state))
        .filter(Boolean) as string[],
    ),
  );
  const { data: neccRows } = zones.length
    ? await supabase
        .from('necc_egg_rates')
        .select('zone, rate_per_100, price_date')
        .in('zone', zones)
        .order('price_date', { ascending: false })
    : { data: [] };
  const latestByZone = new Map<string, { rate_per_100: number; price_date: string }>();
  for (const r of (neccRows ?? []) as any[]) {
    if (!latestByZone.has(r.zone)) latestByZone.set(r.zone, r);
  }

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
      <p className="text-sm text-body mb-2xl">NECC zonal egg rates + 14-day broiler/egg trend by state. Set a farm&apos;s NECC zone in farm settings.</p>

      {zones.length > 0 && (
        <section className="mb-2xl">
          <h2 className="text-lg font-bold text-ink mb-md">NECC egg rates</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-md">
            {zones.map((zone) => {
              const r = latestByZone.get(zone);
              return (
                <div key={zone} className="card">
                  <p className="text-sm font-semibold text-ink">{zone}</p>
                  {r ? (
                    <>
                      <p className="text-2xl font-bold text-primary mt-xs">
                        {formatCurrencyINR(Number(r.rate_per_100))}
                        <span className="text-sm font-normal text-body"> / 100 eggs</span>
                      </p>
                      <p className="text-sm text-body mt-xxs">
                        {formatCurrencyINR(eggRatePerPiece(Number(r.rate_per_100)) ?? 0)} / egg
                        {'  ·  '}
                        {formatCurrencyINR(eggRatePerTray(Number(r.rate_per_100)) ?? 0)} / tray (30)
                      </p>
                      <p className="text-xs text-body-soft mt-xxs">As of {formatDateDDMonYYYY(r.price_date)}</p>
                    </>
                  ) : (
                    <p className="text-sm text-body mt-xs">Rate unavailable — updates daily after 8 AM IST.</p>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      )}

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
