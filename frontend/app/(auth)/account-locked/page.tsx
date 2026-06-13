import Link from 'next/link';
import { Lock } from 'lucide-react';
import { AuthHeader } from '@/components/auth';

/**
 * Static security screen shown when an account is locked (e.g. too many failed
 * attempts). No client logic — just guidance and the two recovery actions.
 */
export default function AccountLockedPage() {
  return (
    <div>
      <span className="mb-lg grid h-12 w-12 place-items-center rounded-full bg-danger/10 text-danger">
        <Lock size={24} />
      </span>
      <AuthHeader
        title="Account locked"
        subtitle="For your security, this account has been temporarily locked after multiple failed sign-in attempts. Please try again later or contact support."
      />

      <div className="space-y-md">
        <a href="mailto:support@poultryos.app" className="btn-primary w-full">
          Contact support
        </a>
        <Link href="/login" className="btn-subtle w-full">
          Back to login
        </Link>
      </div>
    </div>
  );
}
