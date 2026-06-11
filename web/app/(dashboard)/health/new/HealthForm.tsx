'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';

const schema = z.object({
  batch_id: z.string().uuid(),
  incident_date: z.string().min(1),
  symptom_description: z.string().min(3),
  affected_bird_count: z.coerce.number().int().min(1),
  vet_consulted: z.boolean().optional(),
  diagnosis: z.string().optional(),
  treatment_given: z.string().optional(),
  medicine_name: z.string().optional(),
  dose: z.string().optional(),
  withdrawal_days: z.coerce.number().int().min(0).optional(),
});
type Form = z.infer<typeof schema>;

interface Batch { id: string; batch_code: string; farm_id: string; current_bird_count: number; farms: { farm_name: string } | null; }

export function HealthForm({ batches }: { batches: Batch[] }) {
  const router = useRouter();
  const supabase = createSupabaseBrowserClient();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const { register, handleSubmit, formState: { errors } } = useForm<Form>({
    resolver: zodResolver(schema),
    defaultValues: { incident_date: new Date().toISOString().slice(0, 10), batch_id: batches[0]?.id, vet_consulted: false },
  });

  async function onSubmit(data: Form) {
    setError(null);
    setLoading(true);
    const batch = batches.find((b) => b.id === data.batch_id);
    if (!batch) { setError('Pick a batch'); setLoading(false); return; }
    const { error } = await supabase.from('health_incidents').insert({
      ...data,
      farm_id: batch.farm_id,
      vet_consulted: !!data.vet_consulted,
      diagnosis: data.diagnosis || null,
      treatment_given: data.treatment_given || null,
      medicine_name: data.medicine_name || null,
      dose: data.dose || null,
      withdrawal_days: data.withdrawal_days || null,
    });
    setLoading(false);
    if (error) return setError(error.message);
    router.push('/health');
    router.refresh();
  }

  if (batches.length === 0) {
    return <div className="card text-center py-2xl"><p className="text-body">No active batches.</p></div>;
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="card space-y-md">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-md">
        <Field label="Batch" error={errors.batch_id?.message}>
          <select className="input" {...register('batch_id')}>
            {batches.map((b) => <option key={b.id} value={b.id}>{b.batch_code} · {b.farms?.farm_name}</option>)}
          </select>
        </Field>
        <Field label="Incident date" error={errors.incident_date?.message}>
          <input type="date" className="input" {...register('incident_date')} />
        </Field>
        <Field label="Affected birds" error={errors.affected_bird_count?.message}>
          <input type="number" min={1} className="input" {...register('affected_bird_count')} />
        </Field>
        <Field label="Medicine">
          <input className="input" {...register('medicine_name')} />
        </Field>
        <Field label="Dose"><input className="input" {...register('dose')} /></Field>
        <Field label="Withdrawal days">
          <input type="number" min={0} className="input" {...register('withdrawal_days')} />
        </Field>
      </div>
      <Field label="Symptoms" error={errors.symptom_description?.message}>
        <textarea rows={2} className="input h-auto py-sm" {...register('symptom_description')} />
      </Field>
      <Field label="Diagnosis"><textarea rows={2} className="input h-auto py-sm" {...register('diagnosis')} /></Field>
      <Field label="Treatment given"><textarea rows={2} className="input h-auto py-sm" {...register('treatment_given')} /></Field>
      <label className="flex items-center gap-sm text-sm">
        <input type="checkbox" {...register('vet_consulted')} className="size-4" />
        <span>Vet consulted</span>
      </label>
      <button type="submit" disabled={loading} className="btn-primary w-full">{loading ? 'Saving…' : 'Save incident'}</button>
      {error && <p className="text-sm text-danger">{error}</p>}
    </form>
  );
}

function Field({ label, error, children }: { label: string; error?: string; children: React.ReactNode }) {
  return <div><label className="label">{label}</label>{children}{error && <p className="text-sm text-danger mt-xs">{error}</p>}</div>;
}
