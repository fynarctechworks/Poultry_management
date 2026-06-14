'use client';

// Hard gate shown when an operator has no verified 2FA factor. The Control Center
// manages thousands of tenants and money movement, so MFA is mandatory: until a
// factor is enrolled, no module is reachable. On successful enrollment we refresh
// the route so the server layout re-checks and lets the operator in.
import { useRouter } from 'next/navigation';
import { ShieldAlert, LogOut } from 'lucide-react';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import { MfaEnrollment } from './MfaEnrollment';

export function MfaGate() {
  const router = useRouter();
  const supabase = createSupabaseBrowserClient();

  async function signOut() {
    await supabase.auth.signOut();
    router.push('/login');
    router.refresh();
  }

  return (
    <div className="min-h-screen bg-canvas-soft px-lg py-2xl">
      <div className="max-w-[560px] mx-auto">
        <div className="flex items-center gap-md mb-xl">
          <span className="grid place-items-center w-10 h-10 rounded-full bg-warning-soft text-warning-ink shrink-0">
            <ShieldAlert size={22} />
          </span>
          <div>
            <h1 className="text-xl font-bold text-ink">Set up two-factor authentication</h1>
            <p className="text-sm text-body-soft">
              2FA is required for every Control Center operator. Enroll an authenticator to continue.
            </p>
          </div>
        </div>

        <MfaEnrollment onVerified={() => router.refresh()} />

        <button
          onClick={signOut}
          className="mt-xl inline-flex items-center gap-sm text-sm font-semibold text-body hover:text-ink"
        >
          <LogOut size={16} /> Sign out
        </button>
      </div>
    </div>
  );
}
