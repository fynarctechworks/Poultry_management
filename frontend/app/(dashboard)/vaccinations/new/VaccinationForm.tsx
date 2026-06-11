'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';

const schema = z.object({
  batch_id: z.string().uuid(),
  vaccine_name: z.string().min(2),
  scheduled_date: z.string().min(1),
  dose: z.string().optional(),
  route: z.enum(['oral', 'injection', 'spray']).optional(),
  birds_vaccinated: z.coerce.number().int().min(0).optional(),
});
type Form = z.infer<typeof schema>;

interface Batch { id: string; batch_code: string; breed_name: string; farm_id: string; current_bird_count: number; farms: { farm_name: string } | null; }

export function VaccinationForm({ batches }: { batches: Batch[] }) {
  const router = useRouter();
  const supabase = createSupabaseBrowserClient();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const { register, handleSubmit, formState: { errors } } = useForm<Form>({
    resolver: zodResolver(schema),
    defaultValues: {
      scheduled_date: new Date().toISOString().slice(0, 10),
      batch_id: batches[0]?.id,
    },
  });

  async function onSubmit(data: Form) {
    setError(null);
    setLoading(true);
    const batch = batches.find((b) => b.id === data.batch_id);
    if (!batch) {
      setError('Pick a batch');
      setLoading(false);
      return;
    }
    const { error } = await supabase.from('vaccinations').insert({
      ...data,
      farm_id: batch.farm_id,
      status: 'scheduled',
      birds_vaccinated: data.birds_vaccinated || null,
      dose: data.dose || null,
      route: data.route || null,
    });
    setLoading(false);
    if (error) return setError(error.message);
    router.push('/vaccinations');
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
            {batches.map((b) => (
              <option key={b.id} value={b.id}>
                {b.batch_code} · {b.farms?.farm_name} ({b.current_bird_count} birds)
              </option>
            ))}
          </select>
        </Field>
        <Field label="Vaccine name" error={errors.vaccine_name?.message}>
          <input className="input" placeholder="Newcastle, IBD, IB…" {...register('vaccine_name')} />
        </Field>
        <Field label="Scheduled date" error={errors.scheduled_date?.message}>
          <input type="date" className="input" {...register('scheduled_date')} />
        </Field>
        <Field label="Route">
          <select className="input" {...register('route')}>
            <option value="">—</option>
            <option value="oral">Oral</option>
            <option value="injection">Injection</option>
            <option value="spray">Spray</option>
          </select>
        </Field>
        <Field label="Dose">
          <input className="input" placeholder="1 ml / 1 drop" {...register('dose')} />
        </Field>
        <Field label="Birds to vaccinate">
          <input type="number" min={0} className="input" {...register('birds_vaccinated')} />
        </Field>
      </div>
      <button type="submit" disabled={loading} className="btn-primary w-full">{loading ? 'Saving…' : 'Schedule'}</button>
      {error && <p className="text-sm text-danger">{error}</p>}
    </form>
  );
}

function Field({ label, error, children }: { label: string; error?: string; children: React.ReactNode }) {
  return <div><label className="label">{label}</label>{children}{error && <p className="text-sm text-danger mt-xs">{error}</p>}</div>;
}
