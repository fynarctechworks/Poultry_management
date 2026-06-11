'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';

const emailSchema = z.object({
  email: z.string().email('Enter a valid email'),
  password: z.string().min(6, 'At least 6 characters'),
});
type EmailForm = z.infer<typeof emailSchema>;

const phoneSchema = z.object({
  phone: z.string().regex(/^\+91[0-9]{10}$/, 'Format: +91XXXXXXXXXX'),
});
type PhoneForm = z.infer<typeof phoneSchema>;

const otpSchema = z.object({ otp: z.string().length(6, '6-digit code') });
type OtpForm = z.infer<typeof otpSchema>;

export default function LoginPage() {
  const router = useRouter();
  const supabase = createSupabaseBrowserClient();
  const [mode, setMode] = useState<'phone' | 'email'>('phone');
  const [phoneStep, setPhoneStep] = useState<'enter' | 'verify'>('enter');
  const [pendingPhone, setPendingPhone] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const emailForm = useForm<EmailForm>({ resolver: zodResolver(emailSchema) });
  const phoneForm = useForm<PhoneForm>({ resolver: zodResolver(phoneSchema) });
  const otpForm = useForm<OtpForm>({ resolver: zodResolver(otpSchema) });

  async function onEmail(data: EmailForm) {
    setError(null);
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword(data);
    setLoading(false);
    if (error) return setError(error.message);
    router.push('/multi-farm');
    router.refresh();
  }

  async function onPhone(data: PhoneForm) {
    setError(null);
    setLoading(true);
    const { error } = await supabase.auth.signInWithOtp({ phone: data.phone });
    setLoading(false);
    if (error) return setError(error.message);
    setPendingPhone(data.phone);
    setPhoneStep('verify');
  }

  async function onOtp(data: OtpForm) {
    setError(null);
    setLoading(true);
    const { error } = await supabase.auth.verifyOtp({
      phone: pendingPhone,
      token: data.otp,
      type: 'sms',
    });
    setLoading(false);
    if (error) return setError(error.message);
    router.push('/multi-farm');
    router.refresh();
  }

  return (
    <div className="card shadow-subtle">
      <h1 className="text-2xl font-bold text-ink mb-xs">Welcome back</h1>
      <p className="text-sm text-body mb-lg">Sign in to your PoultryOS account</p>

      <div className="flex gap-sm mb-lg" role="tablist">
        <button
          type="button"
          onClick={() => { setMode('phone'); setError(null); }}
          className={`flex-1 py-sm rounded-md text-sm font-semibold ${mode === 'phone' ? 'bg-primary text-on-primary' : 'bg-mute-soft text-body'}`}
        >
          Mobile OTP
        </button>
        <button
          type="button"
          onClick={() => { setMode('email'); setError(null); }}
          className={`flex-1 py-sm rounded-md text-sm font-semibold ${mode === 'email' ? 'bg-primary text-on-primary' : 'bg-mute-soft text-body'}`}
        >
          Email
        </button>
      </div>

      {mode === 'phone' && phoneStep === 'enter' && (
        <form onSubmit={phoneForm.handleSubmit(onPhone)} className="space-y-md">
          <div>
            <label className="label">Mobile number</label>
            <input className="input" placeholder="+91XXXXXXXXXX" {...phoneForm.register('phone')} />
            {phoneForm.formState.errors.phone && (
              <p className="text-sm text-danger mt-xs">{phoneForm.formState.errors.phone.message}</p>
            )}
          </div>
          <button type="submit" className="btn-primary w-full" disabled={loading}>
            {loading ? 'Sending…' : 'Send OTP'}
          </button>
        </form>
      )}

      {mode === 'phone' && phoneStep === 'verify' && (
        <form onSubmit={otpForm.handleSubmit(onOtp)} className="space-y-md">
          <div>
            <label className="label">Enter 6-digit OTP sent to {pendingPhone}</label>
            <input className="input tracking-[0.5em] text-center" maxLength={6} {...otpForm.register('otp')} />
            {otpForm.formState.errors.otp && (
              <p className="text-sm text-danger mt-xs">{otpForm.formState.errors.otp.message}</p>
            )}
          </div>
          <button type="submit" className="btn-primary w-full" disabled={loading}>
            {loading ? 'Verifying…' : 'Verify & sign in'}
          </button>
          <button type="button" onClick={() => setPhoneStep('enter')} className="btn-subtle w-full">
            Change number
          </button>
        </form>
      )}

      {mode === 'email' && (
        <form onSubmit={emailForm.handleSubmit(onEmail)} className="space-y-md">
          <div>
            <label className="label">Email</label>
            <input type="email" className="input" {...emailForm.register('email')} />
            {emailForm.formState.errors.email && (
              <p className="text-sm text-danger mt-xs">{emailForm.formState.errors.email.message}</p>
            )}
          </div>
          <div>
            <label className="label">Password</label>
            <input type="password" className="input" {...emailForm.register('password')} />
            {emailForm.formState.errors.password && (
              <p className="text-sm text-danger mt-xs">{emailForm.formState.errors.password.message}</p>
            )}
          </div>
          <button type="submit" className="btn-primary w-full" disabled={loading}>
            {loading ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
      )}

      {error && <p className="text-sm text-danger mt-md">{error}</p>}

      <p className="text-sm text-body mt-lg text-center">
        New to PoultryOS?{' '}
        <Link href="/register" className="text-primary-dark font-semibold">Create account</Link>
      </p>
    </div>
  );
}
