import { requirePlatformPermission, PlatformForbiddenError } from '@/lib/control/guard';
import { Forbidden } from '@/components/control/Forbidden';
import { Pagination, parsePage } from '@/components/control/Pagination';

export const dynamic = 'force-dynamic';
const PAGE_SIZE = 50;

export default async function AuditPage({ searchParams }: { searchParams: { page?: string } }) {
  let service;
  try {
    ({ service } = await requirePlatformPermission('audit:read'));
  } catch (e) {
    if (e instanceof PlatformForbiddenError) return <Forbidden message={e.message} />;
    throw e;
  }

  const page = parsePage(searchParams.page);
  const { data: events, count } = await service
    .from('platform_audit_events')
    .select('id, action, actor_email, permission, target_type, target_tenant_id, status, reason, created_at', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);
  const total = count ?? 0;

  return (
    <div className="max-w-[1100px]">
      <h2 className="font-display text-[2rem] text-ink mb-xs">Audit Log</h2>
      <p className="text-sm text-body-soft mb-xl">
        Immutable, append-only record of every operator action. {total.toLocaleString('en-IN')} total.
      </p>

      <div className="bg-canvas border border-mute rounded-card overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-body-soft border-b border-mute">
              <th className="px-md py-sm font-semibold">When</th>
              <th className="px-md py-sm font-semibold">Actor</th>
              <th className="px-md py-sm font-semibold">Action</th>
              <th className="px-md py-sm font-semibold">Target</th>
              <th className="px-md py-sm font-semibold">Status</th>
            </tr>
          </thead>
          <tbody>
            {(events?.length ?? 0) === 0 ? (
              <tr>
                <td colSpan={5} className="px-md py-xl text-center text-body-soft">
                  No audit events yet.
                </td>
              </tr>
            ) : (
              events!.map((e) => (
                <tr key={e.id} className="border-b border-mute last:border-0">
                  <td className="px-md py-sm text-body-soft whitespace-nowrap">
                    {new Date(e.created_at).toLocaleString()}
                  </td>
                  <td className="px-md py-sm text-ink">{e.actor_email ?? 'system'}</td>
                  <td className="px-md py-sm font-semibold text-ink">{e.action}</td>
                  <td className="px-md py-sm text-body-soft">{e.target_type ?? '—'}</td>
                  <td className="px-md py-sm">
                    <span
                      className={
                        e.status === 'failure'
                          ? 'text-[11px] font-bold uppercase bg-warning-soft text-warning-ink rounded-sm px-xs py-px'
                          : 'text-[11px] font-bold uppercase bg-success-soft text-success-ink rounded-sm px-xs py-px'
                      }
                    >
                      {e.status}
                    </span>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <Pagination page={page} pageSize={PAGE_SIZE} total={total} basePath="/admin/audit" params={{}} />
    </div>
  );
}
