'use client';

import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import { GoogleButton } from '@/components/GoogleButton';
import { AuthHeader, AuthField, AuthButton, AuthDivider, AuthFooter, AuthError } from '@/components/auth';

const emailSchema = z.object({
  email: z.string().email('Enter a valid email'),
  password: z.string().min(6, 'At least 6 characters'),
});
type EmailForm = z.infer<typeof emailSchema>;

function LoginInner() {
  const router = useRouter();
  const supabase = createSupabaseBrowserClient();
  const params = useSearchParams();
  const justVerified = params.get('verified') === '1';
  const prefillEmail = params.get('email') ?? '';
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const emailForm = useForm<EmailForm>({
    resolver: zodResolver(emailSchema),
    defaultValues: { email: prefillEmail },
  });

  async function onEmail(data: EmailForm) {
    setError(null);
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword(data);
    setLoading(false);
    if (error) return setError(error.message);
    router.push('/multi-farm');
    router.refresh();
  }

  return (
    <div>
      <AuthHeader title="Welcome back" subtitle="Sign in to your PoultryOS account" />

      {justVerified && (
        <p className="mb-md rounded-md bg-success-soft px-md py-sm text-sm text-success-ink">
          Email verified. Sign in to continue.
        </p>
      )}

      <form onSubmit={emailForm.handleSubmit(onEmail)} className="space-y-md">
        <AuthField
          label="Your email"
          type="email"
          placeholder="you@example.com"
          error={emailForm.formState.errors.email?.message}
          {...emailForm.register('email')}
        />
        <AuthField
          label="Password"
          type="password"
          placeholder="Enter your password"
          error={emailForm.formState.errors.password?.message}
          {...emailForm.register('password')}
        />
        <div className="flex items-center justify-between">
          <label className="flex items-center gap-xs text-sm text-body">
            <input
              type="checkbox"
              defaultChecked
              className="h-4 w-4 rounded border-mute text-primary focus:ring-primary"
            />
            Remember me
          </label>
          <Link href="/forgot-password" className="text-sm font-semibold text-primary-dark hover:underline">
            Forgot password?
          </Link>
        </div>
        <AuthButton loading={loading} loadingLabel="Signing in…">Sign in</AuthButton>
      </form>

      <AuthError message={error} />

      <AuthDivider label="or continue with" />

      <GoogleButton onError={(m) => setError(m || null)} />

      <AuthFooter prompt="New to PoultryOS?" linkLabel="Create account" href="/register" />
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginInner />
    </Suspense>
  );
}
