'use client';

// Shown when a signed-in user reaches the Control Center but is not an active
// platform operator. We can't redirect to the customer app (it's a separate
// deployment) and bouncing to /login would loop — middleware sends authenticated
// users straight back to /admin. So we present a terminal screen with the one
// action that resolves it: sign out.
import { ShieldAlert, LogOut } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';

export function NoAccess() {
  const router = useRouter();
  const supabase = createSupabaseBrowserClient();

  async function signOut() {
    await supabase.auth.signOut();
    router.push('/login');
    router.refresh();
  }

  return (
    <div className="min-h-screen grid place-items-center bg-canvas-soft p-lg">
      <div className="max-w-[480px] w-full bg-canvas border border-mute rounded-card p-2xl text-center">
        <div className="grid place-items-center w-12 h-12 rounded-full bg-warning-soft text-warning-ink mx-auto mb-md">
          <ShieldAlert size={24} />
        </div>
        <h2 className="text-xl font-bold text-ink mb-xs">No Control Center access</h2>
        <p className="text-sm text-body-soft mb-xl">
          This account isn’t a platform operator. If you believe this is a mistake,
          contact a Control Center administrator.
        </p>
        <button
          onClick={signOut}
          className="inline-flex items-center gap-sm h-10 px-lg rounded-lg text-sm font-semibold bg-primary text-on-primary hover:bg-primary-dark"
        >
          <LogOut size={16} /> Sign out
        </button>
      </div>
    </div>
  );
}
