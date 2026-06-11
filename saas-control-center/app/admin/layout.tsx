import { redirect } from 'next/navigation';
import { getPlatformContext } from '@/lib/control/guard';
import { AdminShell } from '@/components/control/AdminShell';

// Hard gate on the whole Control Center route group: only active platform
// admins may enter. Non-operators are bounced to the customer dashboard.
// (Unauthenticated users never reach here — middleware redirects to /login.)
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const ctx = await getPlatformContext();
  if (!ctx) redirect('/multi-farm');

  return (
    <AdminShell operatorName={ctx.email ?? 'Operator'} roleName={ctx.roleName}>
      {children}
    </AdminShell>
  );
}
