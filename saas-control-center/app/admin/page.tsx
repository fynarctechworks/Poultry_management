import { redirect } from 'next/navigation';
import { getPlatformContext } from '@/lib/control/guard';
import { Building2, ShieldCheck, ScrollText, Clock } from 'lucide-react';

export const dynamic = 'force-dynamic';

export default async function AdminOverviewPage() {
  const ctx = await getPlatformContext();
  if (!ctx) redirect('/multi-farm');
  const { service } = ctx;

  // Robust, certain counts only (Increment 1). Revenue/health land later.
  const [total, trial, active, suspended, operators, auditTotal, recent] = await Promise.all([
    service.from('tenants').select('id', { count: 'exact', head: true }),
    service.from('tenants').select('id', { count: 'exact', head: true }).eq('status', 'trial'),
    service.from('tenants').select('id', { count: 'exact', head: true }).eq('status', 'active'),
    service.from('tenants').select('id', { count: 'exact', head: true }).eq('status', 'suspended'),
    service.from('platform_admins').select('id', { count: 'exact', head: true }).eq('status', 'active'),
    service.from('platform_audit_events').select('id', { count: 'exact', head: true }),
    service
      .from('platform_audit_events')
      .select('action, actor_email, target_type, created_at, status')
      .order('created_at', { ascending: false })
      .limit(8),
  ]);

  const kpis = [
    { label: 'Total tenants', value: total.count ?? 0, icon: Building2 },
    { label: 'On trial', value: trial.count ?? 0, icon: Clock },
    { label: 'Active', value: active.count ?? 0, icon: Building2 },
    { label: 'Suspended', value: suspended.count ?? 0, icon: Building2 },
    { label: 'Active operators', value: operators.count ?? 0, icon: ShieldCheck },
    { label: 'Audit events', value: auditTotal.count ?? 0, icon: ScrollText },
  ];

  return (
    <div className="max-w-[1100px]">
      <h2 className="text-2xl font-bold text-ink mb-xs">Operations Overview</h2>
      <p className="text-sm text-body-soft mb-xl">
        Welcome, {ctx.email}. Revenue, health and support metrics arrive in later increments.
      </p>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-lg mb-2xl">
        {kpis.map(({ label, value, icon: Icon }) => (
          <div key={label} className="bg-canvas border border-mute rounded-card p-lg">
            <div className="flex items-center gap-sm text-body-soft mb-sm">
              <Icon size={16} />
              <span className="text-xs font-semibold uppercase tracking-wide">{label}</span>
            </div>
            <p className="text-3xl font-bold text-ink tabular-nums">{value}</p>
          </div>
        ))}
      </div>

      <div className="bg-canvas border border-mute rounded-card p-lg">
        <h3 className="text-sm font-bold text-ink mb-md">Recent operator activity</h3>
        {(recent.data?.length ?? 0) === 0 ? (
          <p className="text-sm text-body-soft">No operator actions recorded yet.</p>
        ) : (
          <ul className="divide-y divide-mute">
            {recent.data!.map((r, i) => (
              <li key={i} className="flex items-center justify-between py-sm text-sm">
                <span className="font-semibold text-ink">{r.action}</span>
                <span className="text-body-soft">
                  {r.actor_email ?? 'system'} · {new Date(r.created_at).toLocaleString()}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
