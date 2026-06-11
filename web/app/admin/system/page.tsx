import { requirePlatformPermission, PlatformForbiddenError } from '@/lib/control/guard';
import { Forbidden } from '@/components/control/Forbidden';

export const dynamic = 'force-dynamic';

interface Health {
  db_size_bytes: number; active_connections: number; max_connections: number;
  cache_hit_ratio: number; open_errors: number; critical_errors: number;
  audit_events_24h: number; tenants: number; suspended_tenants: number;
  cron_jobs: number | null; cron_failures_24h: number | null;
}

function mb(bytes: number) {
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export default async function SystemPage() {
  let service;
  try {
    ({ service } = await requirePlatformPermission('system:read'));
  } catch (e) {
    if (e instanceof PlatformForbiddenError) return <Forbidden message={e.message} />;
    throw e;
  }

  const [{ data: hRaw }, { data: cron }] = await Promise.all([
    service.rpc('system_health'),
    service.rpc('system_cron_runs'),
  ]);
  const h = (hRaw ?? {}) as Health;

  const tiles: [string, string | number, boolean?][] = [
    ['Database size', mb(h.db_size_bytes ?? 0)],
    ['Connections', `${h.active_connections ?? 0} / ${h.max_connections ?? 0}`],
    ['Cache hit ratio', `${h.cache_hit_ratio ?? 0}%`],
    ['Open errors', h.open_errors ?? 0, (h.open_errors ?? 0) > 0],
    ['Critical errors', h.critical_errors ?? 0, (h.critical_errors ?? 0) > 0],
    ['Audit events (24h)', h.audit_events_24h ?? 0],
    ['Live tenants', h.tenants ?? 0],
    ['Suspended', h.suspended_tenants ?? 0],
    ['Cron jobs', h.cron_jobs ?? '—'],
    ['Cron failures (24h)', h.cron_failures_24h ?? '—', (h.cron_failures_24h ?? 0) > 0],
  ];

  return (
    <div className="max-w-[1000px]">
      <h2 className="text-2xl font-bold text-ink mb-xs">System</h2>
      <p className="text-sm text-body-soft mb-xl">Live database, error, audit and scheduled-job health.</p>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-lg mb-2xl">
        {tiles.map(([label, value, alert]) => (
          <div key={label as string} className="bg-canvas border border-mute rounded-card p-lg">
            <p className="text-xs font-semibold uppercase tracking-wide text-body-soft mb-sm">{label}</p>
            <p className={`text-2xl font-bold tabular-nums ${alert ? 'text-warning-ink' : 'text-ink'}`}>{value}</p>
          </div>
        ))}
      </div>

      <div className="bg-canvas border border-mute rounded-card p-lg">
        <h3 className="text-sm font-bold text-ink mb-md">Recent scheduled jobs</h3>
        {(cron?.length ?? 0) === 0 ? (
          <p className="text-sm text-body-soft">No cron run history available.</p>
        ) : (
          <table className="w-full text-sm">
            <thead><tr className="text-left text-body-soft border-b border-mute">
              <th className="py-sm font-semibold">Job</th>
              <th className="py-sm font-semibold">Status</th>
              <th className="py-sm font-semibold">Started</th>
            </tr></thead>
            <tbody>
              {(cron as any[]).map((r, i) => (
                <tr key={i} className="border-b border-mute last:border-0">
                  <td className="py-sm text-ink">{r.jobname}</td>
                  <td className="py-sm">
                    <span className={`text-[11px] font-bold uppercase rounded-sm px-xs py-px ${r.status === 'succeeded' ? 'bg-success-soft text-success-ink' : 'bg-warning-soft text-warning-ink'}`}>{r.status}</span>
                  </td>
                  <td className="py-sm text-body-soft">{r.start_time ? new Date(r.start_time).toLocaleString('en-IN') : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
