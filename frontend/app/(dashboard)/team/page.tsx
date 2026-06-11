import { createSupabaseServerClient } from '@/lib/supabase/server';
import { InviteForm } from './InviteForm';
import { formatDateDDMonYYYY } from '@/lib/utils';

export default async function TeamPage() {
  const supabase = createSupabaseServerClient();

  const [{ data: farms }, { data: members }] = await Promise.all([
    supabase.from('farms').select('id, farm_name').order('farm_name'),
    supabase
      .from('farm_users')
      .select('id, role, invited_at, accepted_at, assigned_shed_ids, farms(farm_name), profiles(full_name, phone)')
      .order('invited_at', { ascending: false }),
  ]);

  return (
    <div className="max-w-[1100px] mx-auto">
      <h1 className="text-3xl font-bold text-ink mb-xs">Team</h1>
      <p className="text-sm text-body mb-2xl">Invite workers (daily log entry on assigned sheds) and vets (read + treatment notes).</p>

      <InviteForm farms={farms ?? []} />

      <h2 className="text-lg font-bold text-ink mt-2xl mb-md">Members</h2>
      <div className="card p-0 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-canvas-soft border-b border-mute">
            <tr className="text-left text-xs uppercase tracking-wider text-body-soft">
              <th className="px-md py-sm">Name</th>
              <th className="px-md py-sm">Phone</th>
              <th className="px-md py-sm">Farm</th>
              <th className="px-md py-sm">Role</th>
              <th className="px-md py-sm">Invited</th>
              <th className="px-md py-sm">Status</th>
            </tr>
          </thead>
          <tbody>
            {(members ?? []).map((m: any) => (
              <tr key={m.id} className="border-b border-mute last:border-0">
                <td className="px-md py-md font-semibold text-ink">{m.profiles?.full_name ?? '—'}</td>
                <td className="px-md py-md text-body">{m.profiles?.phone ?? '—'}</td>
                <td className="px-md py-md text-body">{m.farms?.farm_name}</td>
                <td className="px-md py-md text-body">{m.role}</td>
                <td className="px-md py-md text-body">{formatDateDDMonYYYY(m.invited_at)}</td>
                <td className="px-md py-md">
                  {m.accepted_at ? (
                    <span className="px-sm py-xxs rounded-md text-xs font-semibold bg-success-soft text-success-ink">Active</span>
                  ) : (
                    <span className="px-sm py-xxs rounded-md text-xs font-semibold bg-mute-soft text-body">Pending</span>
                  )}
                </td>
              </tr>
            ))}
            {(!members || members.length === 0) && (
              <tr><td colSpan={6} className="py-2xl text-center text-body">No team members yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
