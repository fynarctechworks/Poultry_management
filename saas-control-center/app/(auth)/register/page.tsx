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
    fullName: z.string().min(2, 'Enter your name'),
    email: z.string().email('Enter a valid email'),
    password: z.string().min(8, 'At least 8 characters'),
    confirm: z.string(),
  })
  .refine((v) => v.password === v.confirm, {
    path: ['confirm'],
    message: 'Passwords do not match',
  });
type Form = z.infer<typeof schema>;

export default function RegisterPage() {
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
    const { data: { user }, error } = await supabase.auth.signUp({
      email: data.email,
      password: data.password,
      options: {
        data: { full_name: data.fullName },
      },
    });
    if (error) {
      setLoading(false);
      return setError(error.message);
    }
    if (user) {
      await supabase.from('profiles').upsert({
        id: user.id,
        full_name: data.fullName,
      });
    }
    setLoading(false);
    router.push('/multi-farm');
    router.refresh();
  }

  return (
    <div>
      <AuthHeader title="Create account" subtitle="Get started with PoultryOS" />

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-md">
        <AuthField
          label="Full name"
          placeholder="e.g. Ramesh Kumar"
          error={errors.fullName?.message}
          {...register('fullName')}
        />
        <AuthField
          label="Email"
          type="email"
          placeholder="you@example.com"
          error={errors.email?.message}
          {...register('email')}
        />
        <AuthField
          label="Password"
          type="password"
          placeholder="At least 8 characters"
          autoComplete="new-password"
          error={errors.password?.message}
          {...register('password')}
        />
        <AuthField
          label="Confirm password"
          type="password"
          placeholder="Re-enter password"
          autoComplete="new-password"
          error={errors.confirm?.message}
          {...register('confirm')}
        />
        <AuthButton loading={loading} loadingLabel="Creating…">Create account</AuthButton>
      </form>

      <AuthError message={error} />

      <AuthFooter prompt="Already have an account?" linkLabel="Sign in" href="/login" />
    </div>
  );
}
