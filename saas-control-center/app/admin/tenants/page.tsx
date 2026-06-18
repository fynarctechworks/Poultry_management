import Link from 'next/link';
import { requirePlatformPermission, PlatformForbiddenError } from '@/lib/control/guard';
import { Forbidden } from '@/components/control/Forbidden';
import { TenantStatusBadge } from '@/components/control/TenantStatusBadge';
import { Pagination, parsePage } from '@/components/control/Pagination';
import { Download } from 'lucide-react';

export const dynamic = 'force-dynamic';
const PAGE_SIZE = 50;

interface PlanRow { name: string; monthly_price_inr: number | null; yearly_price_inr: number | null }
interface SubRow { status: string; billing_cycle: string; subscription_plans: PlanRow | null }
interface TenantRow {
  id: string; name: string; status: string; created_at: string;
  deleted_at: string | null; owner_id: string;
  tenant_subscriptions: SubRow[] | SubRow | null;
}

function firstSub(s: TenantRow['tenant_subscriptions']): SubRow | null {
  if (!s) return null;
  return Array.isArray(s) ? s[0] ?? null : s;
}

function mrrInr(sub: SubRow | null): number {
  if (!sub || !sub.subscription_plans) return 0;
  if (sub.status !== 'active') return 0;
  const p = sub.subscription_plans;
  if (sub.billing_cycle === 'yearly') return Math.round((p.yearly_price_inr ?? 0) / 12);
  return p.monthly_price_inr ?? 0;
}

export default async function TenantsPage({
  searchParams,
}: {
  searchParams: { q?: string; page?: string };
}) {
  let service;
  try {
    ({ service } = await requirePlatformPermission('tenant:read'));
  } catch (e) {
    if (e instanceof PlatformForbiddenError) return <Forbidden message={e.message} />;
    throw e;
  }

  const q = (searchParams.q ?? '').trim();
  const page = parsePage(searchParams.page);

  let query = service
    .from('tenants')
    .select(
      `
      id, name, status, created_at, deleted_at, owner_id,
      tenant_subscriptions ( status, billing_cycle,
        subscription_plans ( name, monthly_price_inr, yearly_price_inr ) )
    `,
      { count: 'exact' }
    )
    .order('created_at', { ascending: false })
    .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);
  if (q) query = query.ilike('name', `%${q}%`);

  // MRR is computed server-side across ALL matching tenants (not just the loaded
  // page) so the headline figure is correct even when the list is paginated.
  const [{ data, count }, { data: mrrData }] = await Promise.all([
    query,
    service.rpc('cc_tenants_mrr', { p_search: q || null }),
  ]);
  const tenants = (data ?? []) as unknown as TenantRow[];
  const total = count ?? 0;

  // Resolve owner names in one batch (no FK path tenants→profiles).
  const ownerIds = Array.from(new Set(tenants.map((t) => t.owner_id))).filter(Boolean);
  const ownerName = new Map<string, string>();
  if (ownerIds.length) {
    const { data: profiles } = await service
      .from('profiles')
      .select('id, full_name')
      .in('id', ownerIds);
    for (const p of profiles ?? []) ownerName.set(p.id as string, (p.full_name as string) ?? '');
  }

  const totalMrr = Number(mrrData ?? 0);

  return (
    <div className="max-w-[1200px]">
      <div className="flex items-end justify-between mb-xl">
        <div>
          <h2 className="font-display text-[2rem] text-ink mb-xs">Tenants</h2>
          <p className="text-sm text-body-soft">
            {total.toLocaleString('en-IN')} tenant{total === 1 ? '' : 's'}{q ? ` for “${q}”` : ''} · MRR ₹{totalMrr.toLocaleString('en-IN')}
          </p>
        </div>
        <div className="flex items-center gap-sm">
          <form className="relative" action="/admin/tenants" method="get">
            <input
              name="q"
              defaultValue={q}
              placeholder="Search by tenant name…"
              className="h-9 w-[220px] sm:w-[280px] px-md rounded-lg border border-mute bg-canvas text-sm text-ink placeholder:text-body-soft focus:outline-none focus:border-primary-dark"
            />
          </form>
          <a
            href={`/admin/tenants/export${q ? `?q=${encodeURIComponent(q)}` : ''}`}
            className="inline-flex items-center gap-xs h-9 px-md rounded-lg text-sm font-semibold border border-mute text-body hover:bg-mute-soft whitespace-nowrap"
            title="Export the matching tenants as CSV"
          >
            <Download size={16} /> Export
          </a>
        </div>
      </div>

      <div className="bg-canvas border border-mute rounded-card overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-body-soft border-b border-mute">
              <th className="px-md py-sm font-semibold">Tenant</th>
              <th className="px-md py-sm font-semibold">Owner</th>
              <th className="px-md py-sm font-semibold">Plan</th>
              <th className="px-md py-sm font-semibold">Status</th>
              <th className="px-md py-sm font-semibold text-right">MRR</th>
              <th className="px-md py-sm font-semibold">Created</th>
            </tr>
          </thead>
          <tbody>
            {tenants.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-md py-2xl text-center text-body-soft">
                  No tenants found.
                </td>
              </tr>
            ) : (
              tenants.map((t) => {
                const sub = firstSub(t.tenant_subscriptions);
                return (
                  <tr key={t.id} className="border-b border-mute last:border-0 hover:bg-mute-soft">
                    <td className="px-md py-sm">
                      <Link href={`/admin/tenants/${t.id}`} className="font-semibold text-primary hover:underline">
                        {t.name}
                      </Link>
                    </td>
                    <td className="px-md py-sm text-body">{ownerName.get(t.owner_id) || '—'}</td>
                    <td className="px-md py-sm text-body">{sub?.subscription_plans?.name ?? '—'}</td>
                    <td className="px-md py-sm">
                      <TenantStatusBadge status={t.status} deleted={!!t.deleted_at} />
                    </td>
                    <td className="px-md py-sm text-right tabular-nums text-ink">
                      ₹{mrrInr(sub).toLocaleString('en-IN')}
                    </td>
                    <td className="px-md py-sm text-body-soft whitespace-nowrap">
                      {new Date(t.created_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <Pagination
        page={page}
        pageSize={PAGE_SIZE}
        total={total}
        basePath="/admin/tenants"
        params={{ q: q || undefined }}
      />
    </div>
  );
}
