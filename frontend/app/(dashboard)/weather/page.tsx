import { createSupabaseServerClient } from '@/lib/supabase/server';
import { formatDateDDMonYYYY } from '@/lib/utils';
import { PageHeader } from '@/components/ui/PageHeader';

export default async function WeatherPage() {
  const supabase = createSupabaseServerClient();

  const { data: farms } = await supabase
    .from('farms')
    .select('id, farm_name, state, district, latitude, longitude, heat_stress_threshold_celsius')
    .order('farm_name');

  const farmIds = (farms ?? []).map((f) => f.id);
  const [{ data: weather }, { data: alerts }] = await Promise.all([
    farmIds.length
      ? supabase.from('weather_data').select('farm_id, current_temp_c, current_humidity, max_temp_today, heat_stress_alert_triggered, forecast_json, fetched_at').in('farm_id', farmIds).order('fetched_at', { ascending: false })
      : Promise.resolve({ data: null }),
    farmIds.length
      ? supabase.from('weather_alerts').select('farm_id, alert_type, alert_date, severity, max_temp_forecast, mitigation_actions_json, acknowledged_at').in('farm_id', farmIds).order('alert_date', { ascending: false }).limit(20)
      : Promise.resolve({ data: null }),
  ]);

  const latest = new Map<string, any>();
  for (const w of (weather ?? [])) if (!latest.has(w.farm_id)) latest.set(w.farm_id, w);

  return (
    <div className="max-w-[1200px] mx-auto">
      <PageHeader
        eyebrow="Insights"
        title="Weather"
        subtitle="Per-farm conditions, 3-day forecast, and heat-stress mitigation tips."
        orbs={['sky', 'mint']}
      />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-lg mb-2xl">
        {(farms ?? []).map((f) => {
          const w = latest.get(f.id);
          const threshold = Number(f.heat_stress_threshold_celsius ?? 35);
          const hot = w && Number(w.current_temp_c) >= threshold;
          const forecast: any[] = Array.isArray(w?.forecast_json) ? w.forecast_json.slice(0, 24) : [];
          return (
            <div key={f.id} className={`card ${hot ? 'border-heat' : ''}`}>
              <div className="flex items-baseline justify-between">
                <div>
                  <h2 className="text-lg font-bold text-ink">{f.farm_name}</h2>
                  <p className="text-xs text-body-soft">{[f.district, f.state].filter(Boolean).join(', ') || '—'}</p>
                </div>
                {hot && <span className="px-sm py-xxs rounded-md text-xs font-semibold bg-heat text-white">Heat alert</span>}
              </div>

              {!w ? (
                <p className="text-sm text-body mt-md">No weather data yet. Set lat/long in farm settings.</p>
              ) : (
                <>
                  <div className="grid grid-cols-3 gap-md mt-md text-center">
                    <div>
                      <p className="text-xs uppercase tracking-wider text-body-soft">Now</p>
                      <p className={`text-3xl font-bold ${hot ? 'text-heat' : 'text-ink'}`}>{Number(w.current_temp_c).toFixed(0)}°C</p>
                    </div>
                    <div>
                      <p className="text-xs uppercase tracking-wider text-body-soft">Max today</p>
                      <p className="text-2xl font-medium text-ink tabular-nums">{Number(w.max_temp_today ?? w.current_temp_c).toFixed(0)}°C</p>
                    </div>
                    <div>
                      <p className="text-xs uppercase tracking-wider text-body-soft">Humidity</p>
                      <p className="text-2xl font-medium text-ink tabular-nums">{Number(w.current_humidity).toFixed(0)}%</p>
                    </div>
                  </div>

                  {forecast.length > 0 && (
                    <div className="mt-md overflow-x-auto">
                      <p className="text-xs uppercase tracking-wider text-body-soft mb-sm">Next 24 hours</p>
                      <div className="flex gap-sm">
                        {forecast.filter((_, i) => i % 3 === 0).map((h, i) => (
                          <div key={i} className="text-center px-sm py-xs rounded-md bg-canvas-soft border border-mute min-w-[64px]">
                            <p className="text-xs text-body-soft">{h.time ?? h.dt_txt?.slice(11, 13) ?? ''}</p>
                            <p className="text-sm font-bold">{Math.round(h.temp ?? h.main?.temp ?? 0)}°</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  <p className="text-xs text-body-soft mt-md">Threshold {threshold}°C · updated {new Date(w.fetched_at).toLocaleTimeString('en-IN')}</p>
                </>
              )}
            </div>
          );
        })}
      </div>

      <section>
        <h2 className="text-lg font-bold text-ink mb-md">Recent alerts</h2>
        <div className="card p-0 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-canvas-soft border-b border-mute">
              <tr className="text-left text-xs uppercase tracking-wider text-body-soft">
                <th className="px-md py-sm">Date</th>
                <th className="px-md py-sm">Type</th>
                <th className="px-md py-sm">Severity</th>
                <th className="px-md py-sm text-right">Forecast (°C)</th>
                <th className="px-md py-sm">Acknowledged</th>
              </tr>
            </thead>
            <tbody>
              {(alerts ?? []).map((a: any, i: number) => (
                <tr key={i} className="border-b border-mute last:border-0">
                  <td className="px-md py-md">{formatDateDDMonYYYY(a.alert_date)}</td>
                  <td className="px-md py-md text-body">{a.alert_type}</td>
                  <td className="px-md py-md">
                    <span className={`px-sm py-xxs rounded-md text-xs font-semibold ${a.severity === 'critical' ? 'bg-danger text-white' : 'bg-warning-soft text-warning-ink'}`}>
                      {a.severity}
                    </span>
                  </td>
                  <td className="px-md py-md text-right tabular-nums">{a.max_temp_forecast ? Number(a.max_temp_forecast).toFixed(0) : '—'}</td>
                  <td className="px-md py-md text-body">{a.acknowledged_at ? 'Yes' : '—'}</td>
                </tr>
              ))}
              {(!alerts || alerts.length === 0) && (
                <tr><td colSpan={5} className="py-2xl text-center text-body">No alerts.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
