'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import { AuthHeader, AuthField, AuthButton, AuthError } from '@/components/auth';
import { clearForcePasswordChange } from './actions';

const schema = z
  .object({
    password: z
      .string()
      .min(12, 'Use at least 12 characters')
      .regex(/[A-Z]/, 'Add an uppercase letter')
      .regex(/[a-z]/, 'Add a lowercase letter')
      .regex(/[0-9]/, 'Add a number'),
    confirm: z.string(),
  })
  .refine((v) => v.password === v.confirm, {
    path: ['confirm'],
    message: 'Passwords do not match',
  });
type Form = z.infer<typeof schema>;

export default function ChangePasswordPage() {
  const router = useRouter();
  const supabase = createSupabaseBrowserClient();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const form = useForm<Form>({ resolver: zodResolver(schema) });

  async function onSubmit(data: Form) {
    setError(null);
    setLoading(true);

    // 1. Set the new password (Supabase Auth hashes it; argon2).
    const { error: pwErr } = await supabase.auth.updateUser({ password: data.password });
    if (pwErr) {
      setLoading(false);
      return setError(pwErr.message);
    }

    // 2. Clear the admin-only force-change flag (server, service-role).
    const res = await clearForcePasswordChange();
    if (!res.ok) {
      setLoading(false);
      return setError(res.error ?? 'Could not finalise password change');
    }

    // 3. Refresh the session so the JWT no longer carries the flag, then enter.
    await supabase.auth.refreshSession();
    setLoading(false);
    router.push('/admin');
    router.refresh();
  }

  return (
    <div>
      <AuthHeader
        title="Set a new password"
        subtitle="Your account uses a temporary password. Choose a new one to continue."
      />

      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-md">
        <AuthField
          label="New password"
          type="password"
          placeholder="At least 12 characters"
          autoComplete="new-password"
          error={form.formState.errors.password?.message}
          {...form.register('password')}
        />
        <AuthField
          label="Confirm new password"
          type="password"
          placeholder="Re-enter new password"
          autoComplete="new-password"
          error={form.formState.errors.confirm?.message}
          {...form.register('confirm')}
        />
        <AuthButton loading={loading} loadingLabel="Saving…">Set password & continue</AuthButton>
      </form>

      <AuthError message={error} />
    </div>
  );
}
