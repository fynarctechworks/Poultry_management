'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import { PhoneInput } from '@/components/PhoneInput';
import { isValidPhoneString } from '@/lib/constants/countries';

const phoneField = z.string().refine((v) => isValidPhoneString(v), 'Enter a valid phone number');
const schema = z.object({
  full_name: z.string().min(2),
  phone: phoneField,
  whatsapp_phone: phoneField,
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

  const { register, control, handleSubmit, formState: { errors } } = useForm<Form>({
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
          <Controller control={control} name="phone" render={({ field }) => <PhoneInput value={field.value} onChange={field.onChange} />} />
        </Field>
        <Field label="WhatsApp number" error={errors.whatsapp_phone?.message}>
          <Controller control={control} name="whatsapp_phone" render={({ field }) => <PhoneInput value={field.value} onChange={field.onChange} />} />
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
