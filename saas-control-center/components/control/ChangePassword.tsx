'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { KeyRound } from 'lucide-react';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import { PasswordInput } from './PasswordInput';

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

export function ChangePassword() {
  const supabase = createSupabaseBrowserClient();
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [loading, setLoading] = useState(false);

  const form = useForm<Form>({ resolver: zodResolver(schema) });

  async function onSubmit(data: Form) {
    setError(null);
    setDone(false);
    setLoading(true);

    // Updates the password directly in Supabase Auth (GoTrue hashes it).
    // Requires a valid signed-in session — no current password needed.
    const { error: pwErr } = await supabase.auth.updateUser({ password: data.password });
    setLoading(false);
    if (pwErr) return setError(pwErr.message);

    form.reset();
    setDone(true);
  }

  return (
    <div className="card shadow-subtle">
      <div className="flex items-center gap-md mb-lg">
        <span className="grid place-items-center w-9 h-9 rounded-lg bg-primary-subtle text-primary">
          <KeyRound size={18} />
        </span>
        <div>
          <h2 className="text-base font-semibold text-ink">Change password</h2>
          <p className="text-sm text-body-soft">Update the password for your operator account.</p>
        </div>
      </div>

      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-md">
        <div>
          <label className="label">New password</label>
          <PasswordInput
            placeholder="At least 12 characters"
            autoComplete="new-password"
            {...form.register('password')}
          />
          {form.formState.errors.password && (
            <p className="text-sm text-danger mt-xs">{form.formState.errors.password.message}</p>
          )}
        </div>
        <div>
          <label className="label">Confirm new password</label>
          <PasswordInput
            placeholder="Re-enter new password"
            autoComplete="new-password"
            {...form.register('confirm')}
          />
          {form.formState.errors.confirm && (
            <p className="text-sm text-danger mt-xs">{form.formState.errors.confirm.message}</p>
          )}
        </div>
        <button type="submit" className="btn-primary" disabled={loading}>
          {loading ? 'Saving…' : 'Update password'}
        </button>
      </form>

      {error && <p className="text-sm text-danger mt-md">{error}</p>}
      {done && <p className="text-sm text-success mt-md">Password updated.</p>}
    </div>
  );
}
