'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import { AuthHeader, AuthField, AuthButton, AuthFooter, AuthError } from '@/components/auth';

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

export default function ResetPasswordPage() {
  const router = useRouter();
  const supabase = createSupabaseBrowserClient();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const { register, handleSubmit, formState: { errors } } = useForm<Form>({
    resolver: zodResolver(schema),
  });

  async function onSubmit(data: Form) {
    setError(null);
    setLoading(true);
    // The recovery link landed here with an authenticated session (exchanged in
    // /auth/callback), so updateUser sets the new password for the current user.
    const { error } = await supabase.auth.updateUser({ password: data.password });
    setLoading(false);
    if (error) return setError(error.message);
    router.push('/admin');
    router.refresh();
  }

  return (
    <div>
      <AuthHeader title="Set a new password" subtitle="Choose a new password for your account." />

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-md">
        <AuthField
          label="New password"
          type="password"
          placeholder="At least 12 characters"
          autoComplete="new-password"
          error={errors.password?.message}
          {...register('password')}
        />
        <AuthField
          label="Confirm new password"
          type="password"
          placeholder="Re-enter new password"
          autoComplete="new-password"
          error={errors.confirm?.message}
          {...register('confirm')}
        />
        <AuthButton loading={loading} loadingLabel="Saving…">Reset password</AuthButton>
      </form>

      <AuthError message={error} />

      <AuthFooter prompt="Back to" linkLabel="Sign in" href="/login" />
    </div>
  );
}
