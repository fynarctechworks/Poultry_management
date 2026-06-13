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
  farm_id: z.string().uuid(),
  phone: z.string().refine((v) => isValidPhoneString(v, { optional: false }), 'Enter a valid phone number'),
  role: z.enum(['worker', 'vet']),
});
type Form = z.infer<typeof schema>;

export function InviteForm({ farms }: { farms: { id: string; farm_name: string }[] }) {
  const router = useRouter();
  const supabase = createSupabaseBrowserClient();
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);

  const { register, control, handleSubmit, reset, formState: { errors } } = useForm<Form>({
    resolver: zodResolver(schema),
    defaultValues: { farm_id: farms[0]?.id, role: 'worker', phone: '' },
  });

  async function onSubmit(data: Form) {
    setError(null);
    setSent(false);
    setLoading(true);

    // Find existing profile by phone
    const { data: profile } = await supabase
      .from('profiles')
      .select('id')
      .eq('phone', data.phone)
      .maybeSingle();

    if (!profile) {
      setError('No PoultryOS account exists with that phone yet. Ask them to install the app and sign up first, then re-invite.');
      setLoading(false);
      return;
    }

    const { error } = await supabase.from('farm_users').insert({
      farm_id: data.farm_id,
      user_id: profile.id,
      role: data.role,
      invited_at: new Date().toISOString(),
    });

    setLoading(false);
    if (error) return setError(error.message);
    setSent(true);
    reset({ farm_id: data.farm_id, phone: '', role: data.role });
    router.refresh();
  }

  if (farms.length === 0) {
    return <div className="card text-center py-2xl"><p className="text-body">Create a farm first.</p></div>;
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="card space-y-md">
      <h2 className="text-lg font-bold text-ink">Invite a team member</h2>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-md">
        <Field label="Farm" error={errors.farm_id?.message}>
          <select className="input" {...register('farm_id')}>{farms.map((f) => <option key={f.id} value={f.id}>{f.farm_name}</option>)}</select>
        </Field>
        <Field label="Phone" error={errors.phone?.message}>
          <Controller control={control} name="phone" render={({ field }) => <PhoneInput value={field.value} onChange={field.onChange} />} />
        </Field>
        <Field label="Role">
          <select className="input" {...register('role')}>
            <option value="worker">Worker (daily logs)</option>
            <option value="vet">Vet (treatment notes)</option>
          </select>
        </Field>
      </div>
      <div className="flex items-center gap-md">
        <button type="submit" disabled={loading} className="btn-primary">{loading ? 'Inviting…' : 'Send invite'}</button>
        {sent && <span className="text-sm text-success-ink font-semibold">Invite recorded ✓</span>}
      </div>
      {error && <p className="text-sm text-danger">{error}</p>}
    </form>
  );
}

function Field({ label, error, children }: { label: string; error?: string; children: React.ReactNode }) {
  return <div><label className="label">{label}</label>{children}{error && <p className="text-sm text-danger mt-xs">{error}</p>}</div>;
}
