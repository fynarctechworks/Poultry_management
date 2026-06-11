import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requirePlatformPermission, PlatformForbiddenError } from '@/lib/control/guard';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { Forbidden } from '@/components/control/Forbidden';
import { TenantStatusBadge } from '@/components/control/TenantStatusBadge';
import { TenantActions } from '@/components/control/TenantActions';

export const dynamic = 'force-dynamic';

const TABS = ['overview', 'subscription', 'users', 'farms', 'activity'] as const;
type Tab = (typeof TABS)[number];

export default async function TenantDetailPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { tab?: string };
}) {
  let service;
  try {
    ({ service } = await requirePlatformPermission('tenant:read'));
  } catch (e) {
    if (e instanceof PlatformForbiddenError) return <Forbidden message={e.message} />;
    throw e;
  }

  const id = params.id;
  const tab: Tab = (TABS as readonly string[]).includes(searchParams.tab ?? '')
    ? (searchParams.tab as Tab)
    : 'overview';

  const { data: tenant } = await service
    .from('tenants')
    .select(`
      id, name, status, business_type, country, timezone, currency,
      created_at, deleted_at, suspended_at, suspended_reason, owner_id,
      tenant_subscriptions ( status, billing_cycle, trial_ends_at, current_period_end, razorpay_subscription_id,
        subscription_plans ( code, name, tier, monthly_price_inr, yearly_price_inr ) )
    `)
    .eq('id', id)
    .maybeSingle();

  if (!tenant) notFound();

  const subRaw = (tenant as any).tenant_subscriptions;
  const sub = Array.isArray(subRaw) ? subRaw[0] ?? null : subRaw;

  // Owner identity + can-manage flag (manage gates the action buttons).
  const [{ data: ownerProfile }, ownerUser, canManageRes, plansRes] = await Promise.all([
    service.from('profiles').select('full_name, phone').eq('id', tenant.owner_id).maybeSingle(),
    service.auth.admin.getUserById(tenant.owner_id as string),
    createSupabaseServerClient().rpc('platform_has_permission', { p_perm: 'tenant:manage' }),
    service.from('subscription_plans').select('code, name').eq('is_active', true).order('sort_order'),
  ]);
  const ownerEmail = ownerUser?.data?.user?.email ?? '—';
  const canManage = !!canManageRes.data;
  const plans = (plansRes.data ?? []) as { code: string; name: string }[];

  // Tab data (cheap counts + lists).
  const [farmsRes, membersRes, shedCount, batchCount, activityRes, interactionsRes] = await Promise.all([
    service.from('farms').select('id, farm_name, state, district, status').eq('tenant_id', id),
    service.from('tenant_users').select('user_id, role, accepted_at, created_at').eq('tenant_id', id),
    service.from('sheds').select('id', { count: 'exact', head: true }).eq('tenant_id', id),
    service.from('batches').select('id', { count: 'exact', head: true }).eq('tenant_id', id),
    service.from('platform_audit_events')
      .select('action, actor_email, status, reason, created_at')
      .eq('target_tenant_id', id).order('created_at', { ascending: false }).limit(50),
    service.from('customer_interactions')
      .select('interaction_type, summary, created_at')
      .eq('tenant_id', id).order('created_at', { ascending: false }).limit(50),
  ]);

  const farms = farmsRes.data ?? [];
  const members = membersRes.data ?? [];
  const memberNames = new Map<string, { name: string }>();
  if (members.length) {
    const { data: profs } = await service
      .from('profiles').select('id, full_name').in('id', members.map((m) => m.user_id));
    for (const p of profs ?? []) memberNames.set(p.id as string, { name: (p.full_name as string) ?? '' });
  }

  return (
    <div className="max-w-[1100px]">
      <Link href="/admin/tenants" className="text-sm text-body-soft hover:text-ink">← All tenants</Link>

      <div className="flex items-start justify-between mt-sm mb-lg">
        <div>
          <div className="flex items-center gap-md">
            <h2 className="text-2xl font-bold text-ink">{tenant.name}</h2>
            <TenantStatusBadge status={tenant.status} deleted={!!tenant.deleted_at} />
          </div>
          <p className="text-sm text-body-soft mt-xxs">
            {ownerProfile?.full_name ?? '—'} · {ownerEmail} · {ownerProfile?.phone ?? 'no phone'}
          </p>
          {tenant.suspended_reason && tenant.status === 'suspended' && (
            <p className="text-sm text-warning-ink mt-xs">Suspended: {tenant.suspended_reason}</p>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-xs border-b border-mute mb-lg">
        {TABS.map((t) => (
          <Link
            key={t}
            href={`/admin/tenants/${id}?tab=${t}`}
            className={`px-md py-sm text-sm font-semibold capitalize border-b-2 -mb-px ${
              tab === t ? 'border-primary text-primary' : 'border-transparent text-body hover:text-ink'
            }`}
          >
            {t}
          </Link>
        ))}
      </div>

      {tab === 'overview' && (
        <div className="grid gap-lg">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-lg">
            {[
              ['Farms', farms.length],
              ['Sheds', shedCount.count ?? 0],
              ['Batches', batchCount.count ?? 0],
              ['Members', members.length],
            ].map(([label, value]) => (
              <div key={label as string} className="bg-canvas border border-mute rounded-card p-lg">
                <p className="text-xs font-semibold uppercase tracking-wide text-body-soft mb-sm">{label}</p>
                <p className="text-2xl font-bold text-ink tabular-nums">{value}</p>
              </div>
            ))}
          </div>
          <div className="bg-canvas border border-mute rounded-card p-lg text-sm text-body grid grid-cols-2 gap-sm">
            <span className="text-body-soft">Business type</span><span>{tenant.business_type ?? '—'}</span>
            <span className="text-body-soft">Country / TZ</span><span>{tenant.country} · {tenant.timezone}</span>
            <span className="text-body-soft">Currency</span><span>{tenant.currency}</span>
            <span className="text-body-soft">Created</span><span>{new Date(tenant.created_at).toLocaleString('en-IN')}</span>
          </div>
          {canManage ? (
            <TenantActions tenantId={id} status={tenant.status} deleted={!!tenant.deleted_at} plans={plans} />
          ) : (
            <p className="text-sm text-body-soft">You have read-only access; tenant actions are hidden.</p>
          )}
        </div>
      )}

      {tab === 'subscription' && (
        <div className="bg-canvas border border-mute rounded-card p-lg text-sm grid grid-cols-2 gap-sm max-w-[560px]">
          <span className="text-body-soft">Plan</span><span className="text-ink font-semibold">{sub?.subscription_plans?.name ?? '—'} ({sub?.subscription_plans?.tier ?? '—'})</span>
          <span className="text-body-soft">Subscription status</span><span className="text-ink">{sub?.status ?? '—'}</span>
          <span className="text-body-soft">Billing cycle</span><span className="text-ink">{sub?.billing_cycle ?? '—'}</span>
          <span className="text-body-soft">Monthly / Yearly</span><span className="text-ink">₹{sub?.subscription_plans?.monthly_price_inr ?? 0} / ₹{sub?.subscription_plans?.yearly_price_inr ?? 0}</span>
          <span className="text-body-soft">Trial ends</span><span className="text-ink">{sub?.trial_ends_at ? new Date(sub.trial_ends_at).toLocaleDateString('en-IN') : '—'}</span>
          <span className="text-body-soft">Renews</span><span className="text-ink">{sub?.current_period_end ? new Date(sub.current_period_end).toLocaleDateString('en-IN') : '—'}</span>
          <span className="text-body-soft">Razorpay sub</span><span className="text-ink break-all">{sub?.razorpay_subscription_id ?? '—'}</span>
        </div>
      )}

      {tab === 'users' && (
        <div className="bg-canvas border border-mute rounded-card overflow-hidden">
          <table className="w-full text-sm">
            <thead><tr className="text-left text-body-soft border-b border-mute">
              <th className="px-md py-sm font-semibold">Member</th>
              <th className="px-md py-sm font-semibold">Role</th>
              <th className="px-md py-sm font-semibold">Joined</th>
            </tr></thead>
            <tbody>
              {members.map((m) => (
                <tr key={m.user_id} className="border-b border-mute last:border-0">
                  <td className="px-md py-sm text-ink">{memberNames.get(m.user_id)?.name || m.user_id.slice(0, 8)}</td>
                  <td className="px-md py-sm text-body capitalize">{m.role.replace('_', ' ')}</td>
                  <td className="px-md py-sm text-body-soft">{new Date(m.created_at).toLocaleDateString('en-IN')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'farms' && (
        <div className="bg-canvas border border-mute rounded-card overflow-hidden">
          <table className="w-full text-sm">
            <thead><tr className="text-left text-body-soft border-b border-mute">
              <th className="px-md py-sm font-semibold">Farm</th>
              <th className="px-md py-sm font-semibold">Location</th>
              <th className="px-md py-sm font-semibold">Status</th>
            </tr></thead>
            <tbody>
              {farms.length === 0 ? (
                <tr><td colSpan={3} className="px-md py-xl text-center text-body-soft">No farms.</td></tr>
              ) : farms.map((f) => (
                <tr key={f.id} className="border-b border-mute last:border-0">
                  <td className="px-md py-sm text-ink font-semibold">{f.farm_name}</td>
                  <td className="px-md py-sm text-body">{[f.district, f.state].filter(Boolean).join(', ') || '—'}</td>
                  <td className="px-md py-sm text-body capitalize">{f.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'activity' && (
       <div className="grid gap-lg">
        {(interactionsRes.data?.length ?? 0) > 0 && (
          <div className="bg-canvas border border-mute rounded-card p-lg">
            <h3 className="text-sm font-bold text-ink mb-md">Interaction timeline</h3>
            <ul className="text-sm divide-y divide-mute">
              {interactionsRes.data!.map((it, i) => (
                <li key={i} className="flex justify-between py-sm gap-md">
                  <span className="text-ink">{it.summary}</span>
                  <span className="text-body-soft whitespace-nowrap">{new Date(it.created_at).toLocaleString('en-IN')}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
        <div className="bg-canvas border border-mute rounded-card overflow-hidden">
          <table className="w-full text-sm">
            <thead><tr className="text-left text-body-soft border-b border-mute">
              <th className="px-md py-sm font-semibold">When</th>
              <th className="px-md py-sm font-semibold">Action</th>
              <th className="px-md py-sm font-semibold">Operator</th>
              <th className="px-md py-sm font-semibold">Reason</th>
            </tr></thead>
            <tbody>
              {(activityRes.data?.length ?? 0) === 0 ? (
                <tr><td colSpan={4} className="px-md py-xl text-center text-body-soft">No operator activity for this tenant.</td></tr>
              ) : activityRes.data!.map((a, i) => (
                <tr key={i} className="border-b border-mute last:border-0">
                  <td className="px-md py-sm text-body-soft whitespace-nowrap">{new Date(a.created_at).toLocaleString('en-IN')}</td>
                  <td className="px-md py-sm text-ink font-semibold">{a.action}</td>
                  <td className="px-md py-sm text-body">{a.actor_email ?? 'system'}</td>
                  <td className="px-md py-sm text-body-soft">{a.reason ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
       </div>
      )}
    </div>
  );
}
