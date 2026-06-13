'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import { PhoneInput } from '@/components/PhoneInput';
import { isValidPhoneString } from '@/lib/constants/countries';

const schema = z.object({
  farm_name: z.string().min(2),
  owner_name: z.string().optional(),
  state: z.string().min(2),
  district: z.string().min(2),
  phone: z.string().refine((v) => isValidPhoneString(v), 'Enter a valid phone number'),
  gstin: z.string().optional(),
  farm_type: z.enum(['independent', 'contract']),
  upi_id: z.string().regex(/^[\w.\-]+@[\w.\-]+$/, 'Format: name@bank').or(z.literal('')),
  latitude: z.coerce.number().optional().or(z.literal('')),
  longitude: z.coerce.number().optional().or(z.literal('')),
  heat_stress_threshold_celsius: z.coerce.number().min(20).max(50).optional(),
});
type Form = z.infer<typeof schema>;

interface FarmRow {
  id: string;
  farm_name: string;
  owner_name: string | null;
  state: string | null;
  district: string | null;
  phone: string | null;
  gstin: string | null;
  farm_type: 'independent' | 'contract';
  upi_id: string | null;
  latitude: number | null;
  longitude: number | null;
  heat_stress_threshold_celsius: number | null;
}

export function EditFarmForm({ farm }: { farm: FarmRow }) {
  const router = useRouter();
  const supabase = createSupabaseBrowserClient();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const { register, control, handleSubmit, formState: { errors } } = useForm<Form>({
    resolver: zodResolver(schema),
    defaultValues: {
      farm_name: farm.farm_name ?? '',
      owner_name: farm.owner_name ?? '',
      state: farm.state ?? '',
      district: farm.district ?? '',
      phone: farm.phone ?? '',
      gstin: farm.gstin ?? '',
      farm_type: farm.farm_type ?? 'independent',
      upi_id: farm.upi_id ?? '',
      latitude: (farm.latitude as any) ?? '',
      longitude: (farm.longitude as any) ?? '',
      heat_stress_threshold_celsius: farm.heat_stress_threshold_celsius ?? 35,
    },
  });

  async function onSubmit(data: Form) {
    setError(null);
    setLoading(true);
    const { error } = await supabase.from('farms').update({
      farm_name: data.farm_name,
      owner_name: data.owner_name || null,
      state: data.state,
      district: data.district,
      phone: data.phone || null,
      gstin: data.gstin || null,
      farm_type: data.farm_type,
      upi_id: data.upi_id || null,
      latitude: data.latitude === '' ? null : data.latitude,
      longitude: data.longitude === '' ? null : data.longitude,
      heat_stress_threshold_celsius: data.heat_stress_threshold_celsius || 35,
    }).eq('id', farm.id);
    setLoading(false);
    if (error) return setError(error.message);
    router.push(`/farms/${farm.id}`);
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="card space-y-md">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-md">
        <Field label="Farm name *" error={errors.farm_name?.message}><input className="input" {...register('farm_name')} /></Field>
        <Field label="Owner name"><input className="input" {...register('owner_name')} /></Field>
        <Field label="State *" error={errors.state?.message}><input className="input" {...register('state')} /></Field>
        <Field label="District *" error={errors.district?.message}><input className="input" {...register('district')} /></Field>
        <Field label="Phone" error={errors.phone?.message}>
          <Controller control={control} name="phone" render={({ field }) => <PhoneInput value={field.value} onChange={field.onChange} />} />
        </Field>
        <Field label="GSTIN"><input className="input" {...register('gstin')} /></Field>
        <Field label="Farm type">
          <select className="input" {...register('farm_type')}>
            <option value="independent">Independent</option>
            <option value="contract">Contract</option>
          </select>
        </Field>
        <Field label="UPI ID" error={errors.upi_id?.message}><input className="input" placeholder="name@okhdfcbank" {...register('upi_id')} /></Field>
        <Field label="Latitude"><input type="number" step="any" className="input" {...register('latitude')} /></Field>
        <Field label="Longitude"><input type="number" step="any" className="input" {...register('longitude')} /></Field>
        <Field label="Heat-stress threshold (°C)"><input type="number" step="0.1" className="input" {...register('heat_stress_threshold_celsius')} /></Field>
      </div>
      <button type="submit" disabled={loading} className="btn-primary w-full">{loading ? 'Saving…' : 'Save changes'}</button>
      {error && <p className="text-sm text-danger">{error}</p>}
    </form>
  );
}

function Field({ label, error, children }: { label: string; error?: string; children: React.ReactNode }) {
  return <div><label className="label">{label}</label>{children}{error && <p className="text-sm text-danger mt-xs">{error}</p>}</div>;
}
