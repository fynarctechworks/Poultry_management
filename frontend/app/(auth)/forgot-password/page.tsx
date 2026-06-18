'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { MailCheck } from 'lucide-react';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import { AuthHeader, AuthField, AuthButton, AuthFooter, AuthError } from '@/components/auth';

const schema = z.object({ email: z.string().email('Enter a valid email') });
type Form = z.infer<typeof schema>;

export default function ForgotPasswordPage() {
  const supabase = createSupabaseBrowserClient();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [sentTo, setSentTo] = useState('');

  const { register, handleSubmit, formState: { errors } } = useForm<Form>({
    resolver: zodResolver(schema),
  });

  async function onSubmit(data: Form) {
    setError(null);
    setLoading(true);
    const { error } = await supabase.auth.resetPasswordForEmail(data.email, {
      redirectTo: `${window.location.origin}/auth/callback?next=/reset-password`,
    });
    setLoading(false);
    if (error) return setError(error.message);
    setSentTo(data.email);
    setSent(true);
  }

  if (sent) {
    return (
      <div>
        <span className="mb-lg grid h-12 w-12 place-items-center rounded-full bg-success-soft text-success-ink">
          <MailCheck size={24} />
        </span>
        <AuthHeader
          title="Check your inbox"
          subtitle={`If an account exists for ${sentTo}, we've sent a link to reset your password.`}
        />
        <AuthFooter prompt="Remembered it?" linkLabel="Back to login" href="/login" />
      </div>
    );
  }

  return (
    <div>
      <AuthHeader
        title="Forgot password?"
        subtitle="Enter your email and we'll send you a link to reset it."
      />

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-md">
        <AuthField
          label="Your email"
          type="email"
          placeholder="you@example.com"
          error={errors.email?.message}
          {...register('email')}
        />
        <AuthButton loading={loading} loadingLabel="Sending…">Send reset link</AuthButton>
      </form>

      <AuthError message={error} />

      <AuthFooter prompt="Remembered it?" linkLabel="Back to login" href="/login" />
    </div>
  );
}
