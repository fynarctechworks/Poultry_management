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
  buyer_name: z.string().min(2),
  phone: phoneField,
  whatsapp_phone: phoneField,
  address: z.string().optional(),
  gstin: z.string().optional(),
  credit_limit: z.coerce.number().min(0).optional().or(z.literal('')),
});
type Form = z.infer<typeof schema>;

interface BuyerRow {
  id: string;
  buyer_name: string;
  phone: string | null;
  whatsapp_phone: string | null;
  address: string | null;
  gstin: string | null;
  credit_limit: number | null;
}

export function EditBuyerForm({ buyer }: { buyer: BuyerRow }) {
  const router = useRouter();
  const supabase = createSupabaseBrowserClient();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const { register, control, handleSubmit, formState: { errors } } = useForm<Form>({
    resolver: zodResolver(schema),
    defaultValues: {
      buyer_name: buyer.buyer_name ?? '',
      phone: buyer.phone ?? '',
      whatsapp_phone: buyer.whatsapp_phone ?? '',
      address: buyer.address ?? '',
      gstin: buyer.gstin ?? '',
      credit_limit: (buyer.credit_limit as any) ?? '',
    },
  });

  async function onSubmit(data: Form) {
    setError(null);
    setLoading(true);
    const { error } = await supabase.from('buyers').update({
      buyer_name: data.buyer_name,
      phone: data.phone || null,
      whatsapp_phone: data.whatsapp_phone || null,
      address: data.address || null,
      gstin: data.gstin || null,
      credit_limit: data.credit_limit === '' ? null : data.credit_limit,
    }).eq('id', buyer.id);
    setLoading(false);
    if (error) return setError(error.message);
    router.push(`/khata/${buyer.id}`);
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="card space-y-md">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-md">
        <Field label="Buyer name" error={errors.buyer_name?.message}><input className="input" {...register('buyer_name')} /></Field>
        <Field label="Phone" error={errors.phone?.message}>
          <Controller control={control} name="phone" render={({ field }) => <PhoneInput value={field.value} onChange={field.onChange} />} />
        </Field>
        <Field label="WhatsApp" error={errors.whatsapp_phone?.message}>
          <Controller control={control} name="whatsapp_phone" render={({ field }) => <PhoneInput value={field.value} onChange={field.onChange} />} />
        </Field>
        <Field label="GSTIN"><input className="input" {...register('gstin')} /></Field>
        <Field label="Credit limit (₹)"><input type="number" step="0.01" className="input" {...register('credit_limit')} /></Field>
      </div>
      <Field label="Address"><textarea rows={2} className="input h-auto py-sm" {...register('address')} /></Field>
      <button type="submit" disabled={loading} className="btn-primary w-full">{loading ? 'Saving…' : 'Save changes'}</button>
      {error && <p className="text-sm text-danger">{error}</p>}
    </form>
  );
}

function Field({ label, error, children }: { label: string; error?: string; children: React.ReactNode }) {
  return <div><label className="label">{label}</label>{children}{error && <p className="text-sm text-danger mt-xs">{error}</p>}</div>;
}
