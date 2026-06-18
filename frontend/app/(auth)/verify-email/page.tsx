'use client';

import { Suspense, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { MailCheck } from '@/components/icons';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import { AuthHeader, AuthButton, AuthFooter, AuthError } from '@/components/auth';

function VerifyEmailInner() {
  const supabase = createSupabaseBrowserClient();
  const email = useSearchParams().get('email') ?? '';
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [resent, setResent] = useState(false);

  async function onResend() {
    if (!email) return setError('No email address to resend to.');
    setError(null);
    setLoading(true);
    const { error } = await supabase.auth.resend({ type: 'signup', email });
    setLoading(false);
    if (error) return setError(error.message);
    setResent(true);
  }

  return (
    <div>
      <span className="mb-lg grid h-12 w-12 place-items-center rounded-full bg-success-soft text-success-ink">
        <MailCheck size={24} />
      </span>
      <AuthHeader
        title="Verify your email"
        subtitle={
          email
            ? `We sent a verification link to ${email}. Click it to activate your account.`
            : 'We sent you a verification link. Click it to activate your account.'
        }
      />

      <AuthButton onClick={onResend} loading={loading} loadingLabel="Sending…" disabled={resent}>
        {resent ? 'Email sent' : 'Resend email'}
      </AuthButton>

      <AuthError message={error} />

      <AuthFooter prompt="Already verified?" linkLabel="Back to login" href="/login" />
    </div>
  );
}

export default function VerifyEmailPage() {
  return (
    <Suspense fallback={null}>
      <VerifyEmailInner />
    </Suspense>
  );
}
