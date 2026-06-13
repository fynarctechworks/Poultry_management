'use client';

import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { MailCheck } from 'lucide-react';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import { AuthHeader, AuthButton, AuthFooter, AuthError } from '@/components/auth';

// DEV-ONLY: skip the (currently unwired) email link and confirm directly.
// Flip off in production by leaving NEXT_PUBLIC_DEV_EMAIL_VERIFY unset.
const DEV_VERIFY = process.env.NEXT_PUBLIC_DEV_EMAIL_VERIFY === 'true';

function VerifyEmailInner() {
  const router = useRouter();
  const supabase = createSupabaseBrowserClient();
  const email = useSearchParams().get('email') ?? '';
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [resent, setResent] = useState(false);
  const [devLoading, setDevLoading] = useState(false);

  async function onResend() {
    if (!email) return setError('No email address to resend to.');
    setError(null);
    setLoading(true);
    const { error } = await supabase.auth.resend({ type: 'signup', email });
    setLoading(false);
    if (error) return setError(error.message);
    setResent(true);
  }

  async function onDevVerify() {
    if (!email) return setError('No email address to verify.');
    setError(null);
    setDevLoading(true);
    try {
      const res = await fetch('/auth/dev-verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setDevLoading(false);
        return setError(body.error ?? 'Could not verify email.');
      }
      // Email is now confirmed but this page has no session — send them to
      // login to sign in with the password they just set.
      router.push(`/login?verified=1&email=${encodeURIComponent(email)}`);
    } catch {
      setDevLoading(false);
      setError('Could not reach the server.');
    }
  }

  return (
    <div>
      <span className="mb-lg grid h-12 w-12 place-items-center rounded-full bg-primary-subtle text-primary">
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

      {DEV_VERIFY && (
        <div className="mt-sm">
          <AuthButton
            variant="subtle"
            onClick={onDevVerify}
            loading={devLoading}
            loadingLabel="Verifying…"
          >
            Verify now (dev)
          </AuthButton>
          <p className="mt-xs text-center text-xs text-body-soft">
            Development shortcut — skips the email link.
          </p>
        </div>
      )}

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
