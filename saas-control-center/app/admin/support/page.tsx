import { requirePlatformPermission, PlatformForbiddenError } from '@/lib/control/guard';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { Forbidden } from '@/components/control/Forbidden';
import { SupportConsole, type TicketRow, type CallRow, type FollowupRow } from '@/components/control/SupportConsole';

export const dynamic = 'force-dynamic';

export default async function SupportPage() {
  let service;
  try {
    ({ service } = await requirePlatformPermission('support:read'));
  } catch (e) {
    if (e instanceof PlatformForbiddenError) return <Forbidden message={e.message} />;
    throw e;
  }

  const [tickets, calls, followups, canManageRes] = await Promise.all([
    service.from('support_tickets').select('id, subject, status, priority, created_at, tenants(name)').order('created_at', { ascending: false }).limit(100),
    service.from('support_calls').select('id, direction, phone, outcome, created_at, tenants(name)').order('created_at', { ascending: false }).limit(50),
    service.from('customer_followups').select('id, reason, due_at, status, tenants(name)').eq('status', 'open').order('due_at').limit(50),
    createSupabaseServerClient().rpc('platform_has_permission', { p_perm: 'support:manage' }),
  ]);

  return (
    <div className="max-w-[1100px]">
      <h2 className="text-2xl font-bold text-ink mb-xs">Support &amp; Call Center</h2>
      <p className="text-sm text-body-soft mb-xl">Tickets, calls and follow-ups. Every action lands on the tenant’s interaction timeline.</p>
      <SupportConsole
        tickets={(tickets.data ?? []) as unknown as TicketRow[]}
        calls={(calls.data ?? []) as unknown as CallRow[]}
        followups={(followups.data ?? []) as unknown as FollowupRow[]}
        canManage={!!canManageRes.data}
      />
    </div>
  );
}
