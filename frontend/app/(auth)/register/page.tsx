'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import { GoogleButton } from '@/components/GoogleButton';
import { PhoneInput } from '@/components/PhoneInput';
import { isValidPhoneString } from '@/lib/constants/countries';
import { AuthHeader, AuthField, AuthButton, AuthDivider, AuthFooter, AuthError } from '@/components/auth';

const schema = z
  .object({
    fullName: z.string().min(2, 'Enter your name'),
    email: z.string().email('Enter a valid email'),
    phone: z
      .string()
      .min(1, 'Enter your mobile number')
      .refine((v) => isValidPhoneString(v, { optional: false }), 'Enter a valid mobile number for the selected country'),
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

  const { register, control, handleSubmit, formState: { errors } } = useForm<Form>({
    resolver: zodResolver(schema),
    defaultValues: { phone: '' },
  });

  async function onSubmit(data: Form) {
    setError(null);
    setLoading(true);
    const emailRedirectTo =
      typeof window !== 'undefined' ? `${window.location.origin}/auth/callback?next=/onboarding` : undefined;
    const { data: signUpData, error } = await supabase.auth.signUp({
      email: data.email,
      password: data.password,
      options: {
        data: { full_name: data.fullName, phone: data.phone },
        emailRedirectTo,
      },
    });
    if (error) {
      setLoading(false);
      return setError(error.message);
    }
    setLoading(false);

    // Email-verification gating: when confirmation is required Supabase returns
    // NO session — the tenant is NOT created until the user verifies. Send them
    // to the verify screen. (handle_new_user trigger has already created the
    // profile row server-side, so no client write is needed here.)
    if (!signUpData.session) {
      router.push(`/verify-email?email=${encodeURIComponent(data.email)}`);
      return;
    }
    // Confirmation disabled (e.g. dev) → straight into the onboarding wizard.
    router.push('/onboarding');
    router.refresh();
  }

  return (
    <div>
      <AuthHeader
        title="Create an account"
        subtitle="Manage your flocks, finances, and alerts — all in one place."
      />

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-md">
        <AuthField
          label="Full name"
          placeholder="e.g. Ramesh Kumar"
          error={errors.fullName?.message}
          {...register('fullName')}
        />
        <AuthField
          label="Your email"
          type="email"
          placeholder="you@example.com"
          error={errors.email?.message}
          {...register('email')}
        />
        <div>
          <label className="label">Mobile number</label>
          <Controller
            control={control}
            name="phone"
            render={({ field }) => (
              <PhoneInput id="phone" value={field.value} onChange={field.onChange} />
            )}
          />
          {errors.phone?.message && <p className="mt-xs text-sm text-danger">{errors.phone.message}</p>}
        </div>
        <AuthField
          label="Create password"
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

      <AuthDivider label="or continue with" />

      <GoogleButton onError={(m) => setError(m || null)} />

      <AuthFooter prompt="Already have an account?" linkLabel="Sign in" href="/login" />
    </div>
  );
}
