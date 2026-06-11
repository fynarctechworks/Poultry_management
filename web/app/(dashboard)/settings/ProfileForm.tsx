'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';

const schema = z.object({
  full_name: z.string().min(2),
  phone: z.string().regex(/^\+?[\d\s-]{8,15}$/, 'Enter a valid phone').or(z.literal('')),
  whatsapp_phone: z.string().regex(/^\+?[\d\s-]{8,15}$/, 'Enter a valid phone').or(z.literal('')),
  whatsapp_opt_in: z.boolean(),
});
type Form = z.infer<typeof schema>;

interface Props {
  userId: string;
  initial: {
    full_name: string;
    phone: string;
    whatsapp_phone: string;
    whatsapp_opt_in: boolean;
  };
}

export function ProfileForm({ userId, initial }: Props) {
  const router = useRouter();
  const supabase = createSupabaseBrowserClient();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(false);

  const { register, handleSubmit, formState: { errors } } = useForm<Form>({
    resolver: zodResolver(schema),
    defaultValues: initial,
  });

  async function onSubmit(data: Form) {
    setError(null);
    setSaved(false);
    setLoading(true);
    const { error } = await supabase
      .from('profiles')
      .update({
        full_name: data.full_name,
        phone: data.phone || null,
        whatsapp_phone: data.whatsapp_phone || null,
        whatsapp_opt_in: data.whatsapp_opt_in,
      })
      .eq('id', userId);
    setLoading(false);
    if (error) return setError(error.message);
    setSaved(true);
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="card space-y-md">
      <Field label="Full name" error={errors.full_name?.message}>
        <input className="input" {...register('full_name')} />
      </Field>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-md">
        <Field label="Phone" error={errors.phone?.message}>
          <input className="input" placeholder="+91XXXXXXXXXX" {...register('phone')} />
        </Field>
        <Field label="WhatsApp number" error={errors.whatsapp_phone?.message}>
          <input className="input" placeholder="+91XXXXXXXXXX" {...register('whatsapp_phone')} />
        </Field>
      </div>
      <label className="flex items-center gap-sm text-sm text-body">
        <input type="checkbox" {...register('whatsapp_opt_in')} className="h-4 w-4" />
        Receive farm alerts and reports on WhatsApp
      </label>
      <div className="flex items-center gap-md">
        <button type="submit" disabled={loading} className="btn-primary">{loading ? 'Saving…' : 'Save changes'}</button>
        {saved && <span className="text-sm text-success-ink font-semibold">Saved.</span>}
        {error && <span className="text-sm text-danger">{error}</span>}
      </div>
    </form>
  );
}

function Field({ label, error, children }: { label: string; error?: string; children: React.ReactNode }) {
  return <div><label className="label">{label}</label>{children}{error && <p className="text-sm text-danger mt-xs">{error}</p>}</div>;
}
