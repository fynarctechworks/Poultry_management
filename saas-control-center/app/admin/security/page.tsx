import { getPlatformContext } from '@/lib/control/guard';
import { NoAccess } from '@/components/control/NoAccess';
import { MfaEnrollment } from '@/components/control/MfaEnrollment';
import { ChangePassword } from '@/components/control/ChangePassword';

// Operator security self-service. Any signed-in platform admin may manage their
// own MFA. (TOTP enrol/verify/unenrol happens on the client against the
// operator's own session — no service-role needed.)
export default async function SecurityPage() {
  const ctx = await getPlatformContext();
  if (!ctx) return <NoAccess />;

  return (
    <div className="max-w-[640px]">
      <h1 className="font-display text-[2rem] text-ink mb-xs">Security</h1>
      <p className="text-sm text-body mb-xl">
        Protect your operator account with two-factor authentication.
      </p>
      <div className="space-y-xl">
        <MfaEnrollment />
        <ChangePassword />
      </div>
    </div>
  );
}
