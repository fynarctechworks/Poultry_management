'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import { AuthHeader, AuthField, AuthButton, AuthError } from '@/components/auth';

const emailSchema = z.object({
  email: z.string().email('Enter a valid email'),
  password: z.string().min(6, 'At least 6 characters'),
});
type EmailForm = z.infer<typeof emailSchema>;

export default function LoginPage() {
  const router = useRouter();
  const supabase = createSupabaseBrowserClient();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const emailForm = useForm<EmailForm>({ resolver: zodResolver(emailSchema) });

  async function onEmail(data: EmailForm) {
    setError(null);
    setLoading(true);
    const { error: signInError } = await supabase.auth.signInWithPassword(data);
    if (signInError) {
      setLoading(false);
      return setError(signInError.message);
    }

    // Operator-only boundary: the Control Center shares Supabase Auth with the
    // tenant app, so a valid tenant credential WILL authenticate here. Before
    // letting the session stand, confirm the user is an active platform
    // operator. If not, tear the session down immediately so no Control Center
    // session ever exists for a tenant. (The /admin layout re-checks server-side
    // as the authoritative gate; this is the entry-point enforcement + UX.)
    const { data: isOperator, error: rpcError } = await supabase.rpc('is_platform_admin');
    if (rpcError || !isOperator) {
      await supabase.auth.signOut();
      setLoading(false);
      return setError(
        'This account is not authorized for the Control Center. Operator access is granted by a platform administrator.'
      );
    }

    setLoading(false);
    router.push('/admin');
    router.refresh();
  }

  return (
    <div>
      <AuthHeader title="Operator sign in" subtitle="Restricted to PoultryOS Control Center operators" />

      <form onSubmit={emailForm.handleSubmit(onEmail)} className="space-y-md">
        <AuthField
          label="Email"
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
        <div className="flex justify-end">
          <Link href="/forgot-password" className="text-sm font-semibold text-primary-dark hover:underline">
            Forgot password?
          </Link>
        </div>
        <AuthButton loading={loading} loadingLabel="Signing in…">Sign in</AuthButton>
      </form>

      <AuthError message={error} />
    </div>
  );
}
