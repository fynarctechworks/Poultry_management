'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';

const schema = z.object({
  vaccine_name: z.string().min(2),
  scheduled_date: z.string().min(1),
  administered_date: z.string().optional(),
  dose: z.string().optional(),
  route: z.enum(['oral', 'injection', 'spray']).optional().or(z.literal('')),
  birds_vaccinated: z.coerce.number().int().min(0).optional(),
  status: z.enum(['scheduled', 'done', 'overdue']),
});
type Form = z.infer<typeof schema>;

interface VaccinationRow {
  id: string;
  vaccine_name: string;
  scheduled_date: string;
  administered_date: string | null;
  dose: string | null;
  route: 'oral' | 'injection' | 'spray' | null;
  birds_vaccinated: number | null;
  status: 'scheduled' | 'done' | 'overdue';
}

export function EditVaccinationForm({ vaccination }: { vaccination: VaccinationRow }) {
  const router = useRouter();
  const supabase = createSupabaseBrowserClient();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const { register, handleSubmit, formState: { errors } } = useForm<Form>({
    resolver: zodResolver(schema),
    defaultValues: {
      vaccine_name: vaccination.vaccine_name,
      scheduled_date: vaccination.scheduled_date,
      administered_date: vaccination.administered_date ?? '',
      dose: vaccination.dose ?? '',
      route: vaccination.route ?? '',
      birds_vaccinated: vaccination.birds_vaccinated ?? undefined,
      status: vaccination.status,
    },
  });

  async function onSubmit(data: Form) {
    setError(null);
    setLoading(true);
    const { error } = await supabase.from('vaccinations').update({
      vaccine_name: data.vaccine_name,
      scheduled_date: data.scheduled_date,
      administered_date: data.administered_date || null,
      dose: data.dose || null,
      route: data.route || null,
      birds_vaccinated: data.birds_vaccinated ?? null,
      status: data.status,
    }).eq('id', vaccination.id);
    setLoading(false);
    if (error) return setError(error.message);
    router.push('/vaccinations');
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="card space-y-md">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-md">
        <Field label="Vaccine name" error={errors.vaccine_name?.message}><input className="input" {...register('vaccine_name')} /></Field>
        <Field label="Status">
          <select className="input" {...register('status')}>
            <option value="scheduled">Scheduled</option>
            <option value="done">Done</option>
            <option value="overdue">Overdue</option>
          </select>
        </Field>
        <Field label="Scheduled date" error={errors.scheduled_date?.message}><input type="date" className="input" {...register('scheduled_date')} /></Field>
        <Field label="Administered date"><input type="date" className="input" {...register('administered_date')} /></Field>
        <Field label="Route">
          <select className="input" {...register('route')}>
            <option value="">—</option>
            <option value="oral">Oral</option>
            <option value="injection">Injection</option>
            <option value="spray">Spray</option>
          </select>
        </Field>
        <Field label="Dose"><input className="input" placeholder="1 ml / 1 drop" {...register('dose')} /></Field>
        <Field label="Birds vaccinated"><input type="number" min={0} className="input" {...register('birds_vaccinated')} /></Field>
      </div>
      <button type="submit" disabled={loading} className="btn-primary w-full">{loading ? 'Saving…' : 'Save changes'}</button>
      {error && <p className="text-sm text-danger">{error}</p>}
    </form>
  );
}

function Field({ label, error, children }: { label: string; error?: string; children: React.ReactNode }) {
  return <div><label className="label">{label}</label>{children}{error && <p className="text-sm text-danger mt-xs">{error}</p>}</div>;
}
