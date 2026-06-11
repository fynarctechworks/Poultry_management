import { requirePlatformPermission, PlatformForbiddenError } from '@/lib/control/guard';
import { Forbidden } from '@/components/control/Forbidden';

export const dynamic = 'force-dynamic';

interface Metrics {
  mrr_inr: number; arr_inr: number; arpu_inr: number;
  active: number; trial: number; past_due: number; cancelled: number;
  churn_rate: number; ltv_inr: number | null; cac_inr: number | null;
  plan_distribution: Record<string, number>;
}

function rupees(n: number | null | undefined) {
  if (n === null || n === undefined) return '—';
  return `₹${Number(n).toLocaleString('en-IN')}`;
}

export default async function RevenuePage() {
  let service;
  try {
    ({ service } = await requirePlatformPermission('revenue:read'));
  } catch (e) {
    if (e instanceof PlatformForbiddenError) return <Forbidden message={e.message} />;
    throw e;
  }

  const [{ data: mRaw }, { data: snaps }] = await Promise.all([
    service.rpc('compute_revenue_metrics'),
    service.from('revenue_snapshots').select('*').order('snapshot_date', { ascending: false }).limit(30),
  ]);
  const m = (mRaw ?? {}) as Metrics;
  const dist = Object.entries(m.plan_distribution ?? {});

  const tiles = [
    ['MRR', rupees(m.mrr_inr)],
    ['ARR', rupees(m.arr_inr)],
    ['ARPU', rupees(m.arpu_inr)],
    ['LTV', rupees(m.ltv_inr)],
    ['Active', m.active ?? 0],
    ['Trials', m.trial ?? 0],
    ['Past due', m.past_due ?? 0],
    ['Churn', `${((m.churn_rate ?? 0) * 100).toFixed(1)}%`],
  ];

  return (
    <div className="max-w-[1100px]">
      <h2 className="text-2xl font-bold text-ink mb-xs">Revenue</h2>
      <p className="text-sm text-body-soft mb-xl">
        Live SaaS metrics. CAC is not shown — marketing spend isn’t tracked in-app yet. Trends build from daily snapshots.
      </p>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-lg mb-2xl">
        {tiles.map(([label, value]) => (
          <div key={label as string} className="bg-canvas border border-mute rounded-card p-lg">
            <p className="text-xs font-semibold uppercase tracking-wide text-body-soft mb-sm">{label}</p>
            <p className="text-2xl font-bold text-ink tabular-nums">{value}</p>
          </div>
        ))}
      </div>

      <div className="grid md:grid-cols-2 gap-lg">
        <div className="bg-canvas border border-mute rounded-card p-lg">
          <h3 className="text-sm font-bold text-ink mb-md">Plan distribution (active)</h3>
          {dist.length === 0 ? (
            <p className="text-sm text-body-soft">No active subscriptions.</p>
          ) : (
            <ul className="text-sm divide-y divide-mute">
              {dist.map(([name, count]) => (
                <li key={name} className="flex justify-between py-xs">
                  <span className="text-ink">{name}</span><span className="text-body-soft tabular-nums">{count}</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="bg-canvas border border-mute rounded-card p-lg">
          <h3 className="text-sm font-bold text-ink mb-md">Recent snapshots</h3>
          {(snaps?.length ?? 0) === 0 ? (
            <p className="text-sm text-body-soft">No snapshots yet.</p>
          ) : (
            <table className="w-full text-sm">
              <thead><tr className="text-left text-body-soft">
                <th className="py-xs font-semibold">Date</th>
                <th className="py-xs font-semibold text-right">MRR</th>
                <th className="py-xs font-semibold text-right">Active</th>
                <th className="py-xs font-semibold text-right">Trials</th>
              </tr></thead>
              <tbody>
                {snaps!.map((s) => (
                  <tr key={s.snapshot_date} className="border-t border-mute">
                    <td className="py-xs text-body-soft">{new Date(s.snapshot_date).toLocaleDateString('en-IN')}</td>
                    <td className="py-xs text-right tabular-nums text-ink">{rupees(s.mrr_inr)}</td>
                    <td className="py-xs text-right tabular-nums text-body">{s.active_count}</td>
                    <td className="py-xs text-right tabular-nums text-body">{s.trial_count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
