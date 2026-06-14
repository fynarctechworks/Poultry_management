import { NextRequest, NextResponse } from 'next/server';
import { requirePlatformPermission, PlatformForbiddenError } from '@/lib/control/guard';

export const dynamic = 'force-dynamic';

interface PlanRow { name: string | null; monthly_price_inr: number | null; yearly_price_inr: number | null }
interface SubRow { status: string; billing_cycle: string; subscription_plans: PlanRow | null }
interface Row {
  id: string; name: string; status: string; created_at: string; owner_id: string;
  tenant_subscriptions: SubRow[] | SubRow | null;
}

const firstSub = (s: Row['tenant_subscriptions']): SubRow | null =>
  !s ? null : Array.isArray(s) ? s[0] ?? null : s;

function mrr(sub: SubRow | null): number {
  if (!sub?.subscription_plans || sub.status !== 'active') return 0;
  const p = sub.subscription_plans;
  return sub.billing_cycle === 'yearly' ? Math.round((p.yearly_price_inr ?? 0) / 12) : p.monthly_price_inr ?? 0;
}

// RFC-4180 cell escaping.
const cell = (v: unknown): string => {
  const s = v == null ? '' : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

// Guarded CSV export of ALL matching tenants (respects ?q=, not paginated).
export async function GET(req: NextRequest) {
  let service;
  try {
    ({ service } = await requirePlatformPermission('tenant:read'));
  } catch (e) {
    if (e instanceof PlatformForbiddenError) return new NextResponse(e.message, { status: 403 });
    throw e;
  }

  const q = (req.nextUrl.searchParams.get('q') ?? '').trim();

  let query = service
    .from('tenants')
    .select(`
      id, name, status, created_at, owner_id,
      tenant_subscriptions ( status, billing_cycle,
        subscription_plans ( name, monthly_price_inr, yearly_price_inr ) )
    `)
    .order('created_at', { ascending: false })
    .limit(10000); // hard ceiling to bound memory; refine to streaming if it's ever hit
  if (q) query = query.ilike('name', `%${q}%`);

  const { data, error } = await query;
  if (error) return new NextResponse(error.message, { status: 500 });
  const rows = (data ?? []) as unknown as Row[];

  // Resolve owner names in one batch.
  const ownerIds = Array.from(new Set(rows.map((r) => r.owner_id))).filter(Boolean);
  const ownerName = new Map<string, string>();
  if (ownerIds.length) {
    const { data: profs } = await service.from('profiles').select('id, full_name').in('id', ownerIds);
    for (const p of profs ?? []) ownerName.set(p.id as string, (p.full_name as string) ?? '');
  }

  const header = ['Tenant', 'Owner', 'Status', 'Plan', 'Billing cycle', 'MRR (INR)', 'Created'];
  const lines = [header.join(',')];
  for (const r of rows) {
    const sub = firstSub(r.tenant_subscriptions);
    lines.push([
      cell(r.name),
      cell(ownerName.get(r.owner_id) || ''),
      cell(r.status),
      cell(sub?.subscription_plans?.name ?? ''),
      cell(sub?.billing_cycle ?? ''),
      cell(mrr(sub)),
      cell(new Date(r.created_at).toISOString().slice(0, 10)),
    ].join(','));
  }

  const today = new Date().toISOString().slice(0, 10);
  return new NextResponse(lines.join('\n'), {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="tenants-${today}.csv"`,
      'Cache-Control': 'no-store',
    },
  });
}
