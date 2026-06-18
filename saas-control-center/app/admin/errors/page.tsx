import Link from 'next/link';
import { requirePlatformPermission, PlatformForbiddenError } from '@/lib/control/guard';
import { Forbidden } from '@/components/control/Forbidden';
import { Pagination, parsePage } from '@/components/control/Pagination';

const PAGE_SIZE = 50;

export const dynamic = 'force-dynamic';

const SEV: Record<string, string> = {
  info: 'bg-info-soft text-info', warning: 'bg-pending-soft text-pending-ink',
  error: 'bg-warning-soft text-warning-ink', critical: 'bg-danger/10 text-danger',
};

export default async function ErrorsPage({ searchParams }: { searchParams: { status?: string; severity?: string; page?: string } }) {
  let service;
  try {
    ({ service } = await requirePlatformPermission('error:read'));
  } catch (e) {
    if (e instanceof PlatformForbiddenError) return <Forbidden message={e.message} />;
    throw e;
  }

  const status = ['open', 'investigating', 'resolved', 'ignored'].includes(searchParams.status ?? '') ? searchParams.status : 'open';
  const page = parsePage(searchParams.page);

  let q = service
    .from('platform_errors')
    .select('id, source, module, route, message, severity, status, occurrence_count, last_seen_at, tenant_id', { count: 'exact' })
    .order('last_seen_at', { ascending: false })
    .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);
  if (status) q = q.eq('status', status);
  if (searchParams.severity) q = q.eq('severity', searchParams.severity);

  const { data, count } = await q;
  const errors = data ?? [];
  const total = count ?? 0;

  const tab = (label: string, value: string) =>
    `px-md py-xs rounded-lg text-sm font-semibold border ${
      (searchParams.status ?? 'open') === value ? 'border-primary-dark text-primary bg-primary-subtle' : 'border-mute text-body hover:bg-mute-soft'
    }`;

  return (
    <div className="max-w-[1100px]">
      <h2 className="font-display text-[2rem] text-ink mb-xs">Error Monitoring</h2>
      <p className="text-sm text-body-soft mb-lg">Centralized errors across frontend, API, RPC, edge, webhook, payment and jobs. Repeats are grouped by fingerprint.</p>

      <div className="flex gap-sm mb-lg">
        {(['open', 'investigating', 'resolved', 'ignored'] as const).map((s) => (
          <Link key={s} href={`/admin/errors?status=${s}`} className={tab(s, s)}>{s}</Link>
        ))}
      </div>

      <div className="bg-canvas border border-mute rounded-card overflow-hidden">
        <table className="w-full text-sm">
          <thead><tr className="text-left text-body-soft border-b border-mute">
            <th className="px-md py-sm font-semibold">Message</th>
            <th className="px-md py-sm font-semibold">Source</th>
            <th className="px-md py-sm font-semibold">Severity</th>
            <th className="px-md py-sm font-semibold text-right">Count</th>
            <th className="px-md py-sm font-semibold">Last seen</th>
          </tr></thead>
          <tbody>
            {errors.length === 0 ? (
              <tr><td colSpan={5} className="px-md py-2xl text-center text-body-soft">No {status} errors.</td></tr>
            ) : errors.map((e) => (
              <tr key={e.id} className="border-b border-mute last:border-0 hover:bg-mute-soft">
                <td className="px-md py-sm">
                  <Link href={`/admin/errors/${e.id}`} className="font-semibold text-primary hover:underline">{e.message}</Link>
                  <span className="block text-xs text-body-soft">{e.module ?? '—'}{e.route ? ` · ${e.route}` : ''}</span>
                </td>
                <td className="px-md py-sm text-body">{e.source}</td>
                <td className="px-md py-sm"><span className={`text-[11px] font-bold uppercase rounded-sm px-xs py-px ${SEV[e.severity] ?? ''}`}>{e.severity}</span></td>
                <td className="px-md py-sm text-right tabular-nums text-ink">{e.occurrence_count}</td>
                <td className="px-md py-sm text-body-soft whitespace-nowrap">{new Date(e.last_seen_at).toLocaleString('en-IN')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Pagination
        page={page}
        pageSize={PAGE_SIZE}
        total={total}
        basePath="/admin/errors"
        params={{ status: status || undefined, severity: searchParams.severity }}
      />
    </div>
  );
}
