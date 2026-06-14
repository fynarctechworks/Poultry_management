import { getPlatformContext } from '@/lib/control/guard';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { AdminShell } from '@/components/control/AdminShell';
import { NoAccess } from '@/components/control/NoAccess';
import { MfaGate } from '@/components/control/MfaGate';
import { ServiceConfigBanner } from '@/components/control/ServiceConfigBanner';

// Hard gate on the whole Control Center route group: only active platform
// admins may enter. A signed-in non-operator gets a terminal no-access screen
// (the customer app is a separate deployment; redirecting would loop through
// middleware). Unauthenticated users never reach here — middleware → /login.
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const ctx = await getPlatformContext();
  if (!ctx) return <NoAccess />;

  // 2FA is mandatory for operators. Until a verified factor exists, the whole
  // surface is replaced by the enrollment gate (checked via the operator's own
  // session so auth.uid() resolves to them).
  const { data: hasMfa } = await createSupabaseServerClient().rpc('platform_operator_has_mfa');
  if (!hasMfa) return <MfaGate />;

  return (
    <AdminShell
      operatorName={ctx.email ?? 'Operator'}
      roleName={ctx.roleName}
      permissions={ctx.permissions}
    >
      <ServiceConfigBanner />
      {children}
    </AdminShell>
  );
}
