import { requirePlatformPermission, PlatformForbiddenError } from '@/lib/control/guard';
import { Forbidden } from '@/components/control/Forbidden';

export const dynamic = 'force-dynamic';

interface RoleRow { id: string; code: string; name: string; description: string | null }
interface AdminRow {
  id: string; user_id: string; status: string; last_active_at: string | null; created_at: string;
  platform_roles: { name: string } | null;
}

export default async function AccessPage() {
  let service;
  try {
    ({ service } = await requirePlatformPermission('access:read'));
  } catch (e) {
    if (e instanceof PlatformForbiddenError) return <Forbidden message={e.message} />;
    throw e;
  }

  const [{ data: roles }, { data: admins }, { count: permCount }] = await Promise.all([
    service.from('platform_roles').select('id, code, name, description').order('name'),
    service
      .from('platform_admins')
      .select('id, user_id, status, last_active_at, created_at, platform_roles(name)')
      .order('created_at'),
    service.from('platform_permissions').select('id', { count: 'exact', head: true }),
  ]);

  const roleRows = (roles ?? []) as RoleRow[];
  const adminRows = (admins ?? []) as unknown as AdminRow[];

  // Operator emails come from auth.users — resolve via the admin API.
  const emailById = new Map<string, string>();
  const { data: userList } = await service.auth.admin.listUsers({ perPage: 1000 });
  for (const u of userList?.users ?? []) if (u.email) emailById.set(u.id, u.email);

  return (
    <div className="max-w-[1100px]">
      <h2 className="text-2xl font-bold text-ink mb-xs">Access Control</h2>
      <p className="text-sm text-body-soft mb-xl">
        {roleRows.length} roles · {permCount ?? 0} permissions · {adminRows.length} operators.
        Role &amp; admin editing arrives with the access-management actions in a later pass.
      </p>

      <section className="mb-2xl">
        <h3 className="text-sm font-bold text-ink mb-md">Operators</h3>
        <div className="bg-canvas border border-mute rounded-card overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-body-soft border-b border-mute">
                <th className="px-md py-sm font-semibold">Operator</th>
                <th className="px-md py-sm font-semibold">Role</th>
                <th className="px-md py-sm font-semibold">Status</th>
                <th className="px-md py-sm font-semibold">Last active</th>
              </tr>
            </thead>
            <tbody>
              {adminRows.map((a) => (
                <tr key={a.id} className="border-b border-mute last:border-0">
                  <td className="px-md py-sm text-ink">{emailById.get(a.user_id) ?? a.user_id.slice(0, 8)}</td>
                  <td className="px-md py-sm font-semibold text-ink">{a.platform_roles?.name ?? '—'}</td>
                  <td className="px-md py-sm">
                    <span className={
                      a.status === 'active'
                        ? 'text-[11px] font-bold uppercase bg-success-soft text-success-ink rounded-sm px-xs py-px'
                        : 'text-[11px] font-bold uppercase bg-mute-soft text-body rounded-sm px-xs py-px'
                    }>
                      {a.status}
                    </span>
                  </td>
                  <td className="px-md py-sm text-body-soft">
                    {a.last_active_at ? new Date(a.last_active_at).toLocaleString() : 'never'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <h3 className="text-sm font-bold text-ink mb-md">Roles</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-lg">
          {roleRows.map((r) => (
            <div key={r.id} className="bg-canvas border border-mute rounded-card p-lg">
              <p className="text-sm font-bold text-ink">{r.name}</p>
              <p className="text-xs font-mono text-body-soft mb-xs">{r.code}</p>
              <p className="text-sm text-body">{r.description}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
