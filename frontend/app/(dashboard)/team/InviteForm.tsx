'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import { PhoneInput } from '@/components/PhoneInput';
import { isValidPhoneString } from '@/lib/constants/countries';
import { sendInvitationEmail } from './actions';

const schema = z.object({
  farm_id: z.string().uuid(),
  phone: z.string().refine((v) => isValidPhoneString(v, { optional: false }), 'Enter a valid phone number'),
  email: z.string().email('Enter a valid email').optional().or(z.literal('')),
  role: z.enum(['worker', 'vet']),
});
type Form = z.infer<typeof schema>;

interface Shed { id: string; shed_name: string; farm_id: string; }

export function InviteForm({ farms, sheds }: { farms: { id: string; farm_name: string }[]; sheds: Shed[] }) {
  const router = useRouter();
  const supabase = createSupabaseBrowserClient();
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [assignedShedIds, setAssignedShedIds] = useState<string[]>([]);

  const { register, control, watch, handleSubmit, reset, formState: { errors } } = useForm<Form>({
    resolver: zodResolver(schema),
    defaultValues: { farm_id: farms[0]?.id, role: 'worker', phone: '' },
  });

  const selectedFarm = watch('farm_id');
  const selectedRole = watch('role');
  const farmSheds = sheds.filter((s) => s.farm_id === selectedFarm);

  function toggleShed(id: string) {
    setAssignedShedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  async function onSubmit(data: Form) {
    setError(null);
    setSent(false);

    // A worker can only log for sheds assigned to them (RLS gates daily_logs on
    // user_assigned_sheds). Inviting a worker with no sheds leaves them unable to
    // do their core job, so require at least one.
    if (data.role === 'worker' && assignedShedIds.length === 0) {
      setError('Assign at least one shed — a worker can only log for sheds assigned to them.');
      return;
    }

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

    const nowIso = new Date().toISOString();
    const { error } = await supabase.from('farm_users').insert({
      farm_id: data.farm_id,
      user_id: profile.id,
      role: data.role,
      // Workers are scoped to their assigned sheds; vets see the whole farm.
      assigned_shed_ids: data.role === 'worker' ? assignedShedIds : null,
      invited_at: nowIso,
      // Access is granted immediately (RLS gates on row existence), so mark the
      // member Active rather than leaving them "Pending" forever.
      accepted_at: nowIso,
    });

    if (error) {
      setLoading(false);
      return setError(error.message);
    }

    // Optional invitation email (best-effort — the invite is already recorded).
    if (data.email) {
      await sendInvitationEmail({ email: data.email, farmId: data.farm_id, role: data.role }).catch(() => {});
    }

    setLoading(false);
    setSent(true);
    setAssignedShedIds([]);
    reset({ farm_id: data.farm_id, phone: '', email: '', role: data.role });
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
        <Field label="Email (optional)" error={errors.email?.message}>
          <input type="email" className="input" placeholder="them@example.com" {...register('email')} />
        </Field>
        <Field label="Role">
          <select className="input" {...register('role')}>
            <option value="worker">Worker (daily logs)</option>
            <option value="vet">Vet (treatment notes)</option>
          </select>
        </Field>
      </div>

      {selectedRole === 'worker' && (
        <div>
          <label className="label">Assigned sheds <span className="text-danger">*</span></label>
          {farmSheds.length === 0 ? (
            <p className="text-sm text-body">This farm has no active sheds yet — create one before inviting a worker.</p>
          ) : (
            <div className="flex flex-wrap gap-sm">
              {farmSheds.map((s) => (
                <label key={s.id} className={`flex items-center gap-xs rounded-md border px-md py-xs cursor-pointer text-sm ${assignedShedIds.includes(s.id) ? 'border-primary bg-primary-subtle text-ink' : 'border-mute text-body'}`}>
                  <input type="checkbox" className="size-4" checked={assignedShedIds.includes(s.id)} onChange={() => toggleShed(s.id)} />
                  {s.shed_name}
                </label>
              ))}
            </div>
          )}
          <p className="text-xs text-body-soft mt-xs">A worker can only enter daily logs for the sheds you assign here.</p>
        </div>
      )}

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
