'use client';

import { useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';

const schema = z.object({
  batch_id: z.string().uuid(),
  integrator_id: z.string().uuid(),
  chicks_supplied: z.coerce.number().int().positive(),
  chicks_supplied_date: z.string().min(1),
  total_feed_supplied_kg: z.coerce.number().min(0),
  expected_harvest_date: z.string().optional(),
});
type Form = z.infer<typeof schema>;

interface Integrator { id: string; name: string; tariff_card_json: any; }
interface Batch { id: string; batch_code: string; breed_name: string; opening_bird_count: number; placement_date: string; farm_id: string; farms: { farm_name: string; farm_type: string } | null; }

export function ContractCycleForm({ integrators, batches }: { integrators: Integrator[]; batches: Batch[] }) {
  const router = useRouter();
  const supabase = createSupabaseBrowserClient();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const { register, handleSubmit, watch, formState: { errors } } = useForm<Form>({
    resolver: zodResolver(schema),
    defaultValues: {
      batch_id: batches[0]?.id,
      integrator_id: integrators[0]?.id,
      chicks_supplied: batches[0]?.opening_bird_count ?? 0,
      chicks_supplied_date: batches[0]?.placement_date ?? new Date().toISOString().slice(0, 10),
    },
  });

  const selectedIntegrator = integrators.find((i) => i.id === watch('integrator_id'));
  const cycleDays = selectedIntegrator?.tariff_card_json?.cycle_days;

  const expectedHarvest = useMemo(() => {
    const placement = watch('chicks_supplied_date');
    if (!placement || !cycleDays) return '';
    const d = new Date(placement);
    d.setDate(d.getDate() + cycleDays);
    return d.toISOString().slice(0, 10);
  }, [watch('chicks_supplied_date'), cycleDays]);

  async function onSubmit(data: Form) {
    setError(null);
    setLoading(true);
    const batch = batches.find((b) => b.id === data.batch_id);
    if (!batch) { setError('Pick a batch'); setLoading(false); return; }
    const { data: row, error } = await supabase.from('contract_cycles').insert({
      farm_id: batch.farm_id,
      batch_id: data.batch_id,
      integrator_id: data.integrator_id,
      chicks_supplied: data.chicks_supplied,
      chicks_supplied_date: data.chicks_supplied_date,
      total_feed_supplied_kg: data.total_feed_supplied_kg,
      expected_harvest_date: data.expected_harvest_date || expectedHarvest || null,
      status: 'active',
    }).select('id').single();
    setLoading(false);
    if (error) return setError(error.message);
    router.push(`/contract/${row!.id}`);
    router.refresh();
  }

  if (batches.length === 0) {
    return <div className="card text-center py-2xl"><p className="text-body">No eligible batches. Mark a farm as 'contract' and create an active batch first.</p></div>;
  }
  if (integrators.length === 0) {
    return <div className="card text-center py-2xl"><p className="text-body">No integrators seeded. Run the contract farming migration.</p></div>;
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="card space-y-md">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-md">
        <Field label="Batch" error={errors.batch_id?.message}>
          <select className="input" {...register('batch_id')}>
            {batches.map((b) => (
              <option key={b.id} value={b.id}>{b.batch_code} · {b.farms?.farm_name} ({b.opening_bird_count} birds)</option>
            ))}
          </select>
        </Field>
        <Field label="Integrator" error={errors.integrator_id?.message}>
          <select className="input" {...register('integrator_id')}>
            {integrators.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
          </select>
        </Field>
        <Field label="Chicks supplied" error={errors.chicks_supplied?.message}>
          <input type="number" min={1} className="input" {...register('chicks_supplied')} />
        </Field>
        <Field label="Supply date" error={errors.chicks_supplied_date?.message}>
          <input type="date" className="input" {...register('chicks_supplied_date')} />
        </Field>
        <Field label="Feed supplied so far (kg)">
          <input type="number" step="0.01" min={0} className="input" {...register('total_feed_supplied_kg')} />
        </Field>
        <Field label="Expected harvest">
          <input type="date" className="input" defaultValue={expectedHarvest} {...register('expected_harvest_date')} />
        </Field>
      </div>

      {selectedIntegrator && (
        <div className="rounded-md bg-mute-soft p-md text-sm">
          <p className="font-semibold text-ink mb-xs">Tariff card · {selectedIntegrator.name}</p>
          <p className="text-body">
            Base ₹{selectedIntegrator.tariff_card_json?.base_growing_charge_per_kg}/kg · Target {selectedIntegrator.tariff_card_json?.weight_target_kg} kg · {selectedIntegrator.tariff_card_json?.cycle_days} days
          </p>
        </div>
      )}

      <button type="submit" disabled={loading} className="btn-primary w-full">{loading ? 'Creating…' : 'Create cycle'}</button>
      {error && <p className="text-sm text-danger">{error}</p>}
    </form>
  );
}

function Field({ label, error, children }: { label: string; error?: string; children: React.ReactNode }) {
  return <div><label className="label">{label}</label>{children}{error && <p className="text-sm text-danger mt-xs">{error}</p>}</div>;
}
