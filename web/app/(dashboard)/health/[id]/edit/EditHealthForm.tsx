'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';

const schema = z.object({
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

interface IncidentRow {
  id: string;
  incident_date: string;
  symptom_description: string;
  affected_bird_count: number;
  vet_consulted: boolean;
  diagnosis: string | null;
  treatment_given: string | null;
  medicine_name: string | null;
  dose: string | null;
  withdrawal_days: number | null;
}

export function EditHealthForm({ incident }: { incident: IncidentRow }) {
  const router = useRouter();
  const supabase = createSupabaseBrowserClient();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const { register, handleSubmit, formState: { errors } } = useForm<Form>({
    resolver: zodResolver(schema),
    defaultValues: {
      incident_date: incident.incident_date,
      symptom_description: incident.symptom_description,
      affected_bird_count: incident.affected_bird_count,
      vet_consulted: incident.vet_consulted,
      diagnosis: incident.diagnosis ?? '',
      treatment_given: incident.treatment_given ?? '',
      medicine_name: incident.medicine_name ?? '',
      dose: incident.dose ?? '',
      withdrawal_days: incident.withdrawal_days ?? undefined,
    },
  });

  async function onSubmit(data: Form) {
    setError(null);
    setLoading(true);
    const { error } = await supabase.from('health_incidents').update({
      incident_date: data.incident_date,
      symptom_description: data.symptom_description,
      affected_bird_count: data.affected_bird_count,
      vet_consulted: !!data.vet_consulted,
      diagnosis: data.diagnosis || null,
      treatment_given: data.treatment_given || null,
      medicine_name: data.medicine_name || null,
      dose: data.dose || null,
      withdrawal_days: data.withdrawal_days ?? null,
    }).eq('id', incident.id);
    setLoading(false);
    if (error) return setError(error.message);
    router.push(`/health/${incident.id}`);
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="card space-y-md">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-md">
        <Field label="Incident date" error={errors.incident_date?.message}>
          <input type="date" className="input" {...register('incident_date')} />
        </Field>
        <Field label="Affected birds" error={errors.affected_bird_count?.message}>
          <input type="number" min={1} className="input" {...register('affected_bird_count')} />
        </Field>
        <Field label="Medicine"><input className="input" {...register('medicine_name')} /></Field>
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
      <button type="submit" disabled={loading} className="btn-primary w-full">{loading ? 'Saving…' : 'Save changes'}</button>
      {error && <p className="text-sm text-danger">{error}</p>}
    </form>
  );
}

function Field({ label, error, children }: { label: string; error?: string; children: React.ReactNode }) {
  return <div><label className="label">{label}</label>{children}{error && <p className="text-sm text-danger mt-xs">{error}</p>}</div>;
}
