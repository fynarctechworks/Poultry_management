'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import { AuthHeader, AuthField, AuthButton, AuthFooter, AuthError } from '@/components/auth';

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
    const { error } = await supabase.auth.signInWithPassword(data);
    setLoading(false);
    if (error) return setError(error.message);
    router.push('/multi-farm');
    router.refresh();
  }

  return (
    <div>
      <AuthHeader title="Welcome back" subtitle="Sign in to your PoultryOS account" />

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

      <AuthFooter prompt="New to PoultryOS?" linkLabel="Create account" href="/register" />
    </div>
  );
}
