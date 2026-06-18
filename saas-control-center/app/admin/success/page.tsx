import Link from 'next/link';
import { requirePlatformPermission, PlatformForbiddenError } from '@/lib/control/guard';
import { Forbidden } from '@/components/control/Forbidden';
import { Pagination, parsePage } from '@/components/control/Pagination';

const PAGE_SIZE = 50;

export const dynamic = 'force-dynamic';

const BAND: Record<string, string> = {
  green: 'bg-success-soft text-success-ink',
  yellow: 'bg-pending-soft text-pending-ink',
  red: 'bg-warning-soft text-warning-ink',
};

interface HealthRow {
  tenant_id: string; score: number; risk_band: string; churn_risk: boolean;
  payment_score: number; usage_score: number; login_score: number; setup_score: number;
  computed_at: string; tenants: { name: string; status: string } | null;
}

export default async function SuccessPage({ searchParams }: { searchParams: { risk?: string; page?: string } }) {
  let service;
  try {
    ({ service } = await requirePlatformPermission('success:read'));
  } catch (e) {
    if (e instanceof PlatformForbiddenError) return <Forbidden message={e.message} />;
    throw e;
  }

  const risk = ['green', 'yellow', 'red'].includes(searchParams.risk ?? '') ? searchParams.risk : undefined;
  const page = parsePage(searchParams.page);

  let q = service
    .from('customer_health')
    .select('tenant_id, score, risk_band, churn_risk, payment_score, usage_score, login_score, setup_score, computed_at, tenants(name, status)', { count: 'exact' })
    .order('score', { ascending: true })
    .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);
  if (risk) q = q.eq('risk_band', risk);

  const [{ data, count }, redRes, yellowRes, openFuRes, overdueFuRes] = await Promise.all([
    q,
    service.from('customer_health').select('tenant_id', { count: 'exact', head: true }).eq('risk_band', 'red'),
    service.from('customer_health').select('tenant_id', { count: 'exact', head: true }).eq('risk_band', 'yellow'),
    service.from('customer_followups').select('id', { count: 'exact', head: true }).eq('status', 'open'),
    service.from('customer_followups').select('id', { count: 'exact', head: true }).eq('status', 'open').lt('due_at', new Date().toISOString()),
  ]);
  const rows = (data ?? []) as unknown as HealthRow[];
  const total = count ?? 0;
  const churnCount = rows.filter((r) => r.churn_risk).length;

  const chip = (label: string, value?: string) =>
    `px-md py-xs rounded-lg text-sm font-semibold border ${
      (searchParams.risk ?? '') === (value ?? '') ? 'border-primary-dark text-primary bg-primary-subtle' : 'border-mute text-body hover:bg-mute-soft'
    }`;

  return (
    <div className="max-w-[1100px]">
      <h2 className="font-display text-[2rem] text-ink mb-xs">Customer Success</h2>
      <p className="text-sm text-body-soft mb-lg">
        Health 0–100 from payment, usage, login &amp; setup signals. {churnCount} churn-risk tenant{churnCount === 1 ? '' : 's'} in view.
      </p>

      {/* Summary KPI tiles */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-md mb-lg">
        {([
          { label: 'Scored', value: total, cls: '' },
          { label: 'Red band', value: redRes.count ?? 0, cls: 'text-warning-ink' },
          { label: 'Yellow band', value: yellowRes.count ?? 0, cls: 'text-pending-ink' },
          { label: 'Open follow-ups', value: openFuRes.count ?? 0, cls: '' },
          { label: 'Overdue', value: overdueFuRes.count ?? 0, cls: (overdueFuRes.count ?? 0) > 0 ? 'text-danger' : '' },
        ] as { label: string; value: number; cls: string }[]).map(({ label, value, cls }) => (
          <div key={label} className="bg-canvas border border-mute rounded-card p-lg">
            <p className="text-xs font-semibold uppercase tracking-wide text-body-soft mb-sm">{label}</p>
            <p className={`text-2xl font-bold tabular-nums ${cls || 'text-ink'}`}>{value}</p>
          </div>
        ))}
      </div>

      <div className="flex gap-sm mb-lg">
        <Link href="/admin/success" className={chip('All')}>All</Link>
        <Link href="/admin/success?risk=red" className={chip('Red', 'red')}>Red</Link>
        <Link href="/admin/success?risk=yellow" className={chip('Yellow', 'yellow')}>Yellow</Link>
        <Link href="/admin/success?risk=green" className={chip('Green', 'green')}>Green</Link>
      </div>

      <div className="bg-canvas border border-mute rounded-card overflow-hidden">
        <table className="w-full text-sm">
          <thead><tr className="text-left text-body-soft border-b border-mute">
            <th className="px-md py-sm font-semibold">Tenant</th>
            <th className="px-md py-sm font-semibold">Score</th>
            <th className="px-md py-sm font-semibold">Band</th>
            <th className="px-md py-sm font-semibold">Pay / Use / Login / Setup</th>
            <th className="px-md py-sm font-semibold">Churn</th>
          </tr></thead>
          <tbody>
            {rows.length === 0 ? (
              <tr><td colSpan={5} className="px-md py-2xl text-center text-body-soft">No tenants in this band.</td></tr>
            ) : rows.map((r) => (
              <tr key={r.tenant_id} className="border-b border-mute last:border-0 hover:bg-mute-soft">
                <td className="px-md py-sm">
                  <Link href={`/admin/success/${r.tenant_id}`} className="font-semibold text-primary hover:underline">
                    {r.tenants?.name ?? r.tenant_id.slice(0, 8)}
                  </Link>
                </td>
                <td className="px-md py-sm font-bold tabular-nums text-ink">{r.score}</td>
                <td className="px-md py-sm">
                  <span className={`text-[11px] font-bold uppercase rounded-sm px-xs py-px ${BAND[r.risk_band] ?? ''}`}>{r.risk_band}</span>
                </td>
                <td className="px-md py-sm text-body-soft tabular-nums">{r.payment_score} / {r.usage_score} / {r.login_score} / {r.setup_score}</td>
                <td className="px-md py-sm">
                  {r.churn_risk
                    ? <span className="text-[11px] font-bold uppercase bg-warning-soft text-warning-ink rounded-sm px-xs py-px">at risk</span>
                    : <span className="text-body-soft">—</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Pagination
        page={page}
        pageSize={PAGE_SIZE}
        total={total}
        basePath="/admin/success"
        params={{ risk: risk || undefined }}
      />
    </div>
  );
}
