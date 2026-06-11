'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';

const schema = z.object({
  batch_id: z.string().uuid('Pick a batch'),
  log_date: z.string().min(1),
  birds_dead: z.coerce.number().int().min(0),
  death_cause: z.enum(['disease', 'culled', 'injury', 'heat_stress', 'unknown']).optional(),
  feed_consumed_kg: z.coerce.number().min(0),
  feed_type: z.enum(['starter', 'grower', 'finisher', 'layer', 'custom']).optional(),
  feed_cost_per_kg: z.coerce.number().optional(),
  eggs_collected: z.coerce.number().int().min(0).optional(),
  avg_bird_weight_g: z.coerce.number().min(0).optional(),
  notes: z.string().optional(),
});
type Form = z.infer<typeof schema>;

interface Batch { id: string; batch_code: string; breed_name: string; poultry_type: 'broiler' | 'layer' | 'breeder'; farm_id: string; farms: { farm_name: string } | null; }

export function DailyLogForm({ batches }: { batches: Batch[] }) {
  const router = useRouter();
  const supabase = createSupabaseBrowserClient();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const { register, handleSubmit, watch, formState: { errors } } = useForm<Form>({
    resolver: zodResolver(schema),
    defaultValues: {
      log_date: new Date().toISOString().slice(0, 10),
      birds_dead: 0,
      feed_consumed_kg: 0,
      batch_id: batches[0]?.id,
    },
  });

  const selectedBatch = batches.find((b) => b.id === watch('batch_id'));
  const isLayer = selectedBatch?.poultry_type === 'layer' || selectedBatch?.poultry_type === 'breeder';

  async function onSubmit(data: Form) {
    setError(null);
    setLoading(true);
    const batch = batches.find((b) => b.id === data.batch_id);
    if (!batch) {
      setError('Pick a batch');
      setLoading(false);
      return;
    }
    const payload = {
      batch_id: data.batch_id,
      farm_id: batch.farm_id,
      log_date: data.log_date,
      birds_dead: data.birds_dead,
      death_cause: data.death_cause || null,
      feed_consumed_kg: data.feed_consumed_kg,
      feed_type: data.feed_type || null,
      feed_cost_per_kg: data.feed_cost_per_kg || null,
      eggs_collected: data.eggs_collected || null,
      avg_bird_weight_g: data.avg_bird_weight_g || null,
      notes: data.notes || null,
      is_synced: true,
    };
    const { error } = await supabase.from('daily_logs').insert(payload);
    setLoading(false);
    if (error) return setError(error.message);
    router.push(`/batches/${data.batch_id}`);
    router.refresh();
  }

  if (batches.length === 0) {
    return (
      <div className="card text-center py-2xl">
        <p className="text-body">No active batches yet. Create one from the mobile app.</p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="card space-y-md">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-md">
        <Field label="Batch" error={errors.batch_id?.message}>
          <select className="input" {...register('batch_id')}>
            {batches.map((b) => (
              <option key={b.id} value={b.id}>
                {b.batch_code} · {b.breed_name} · {b.farms?.farm_name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Log date" error={errors.log_date?.message}>
          <input type="date" className="input" {...register('log_date')} />
        </Field>
        <Field label="Birds dead" error={errors.birds_dead?.message}>
          <input type="number" min={0} className="input" {...register('birds_dead')} />
        </Field>
        <Field label="Death cause">
          <select className="input" {...register('death_cause')}>
            <option value="">—</option>
            <option value="disease">Disease</option>
            <option value="culled">Culled</option>
            <option value="injury">Injury</option>
            <option value="heat_stress">Heat stress</option>
            <option value="unknown">Unknown</option>
          </select>
        </Field>
        <Field label="Feed consumed (kg)" error={errors.feed_consumed_kg?.message}>
          <input type="number" step="0.01" min={0} className="input" {...register('feed_consumed_kg')} />
        </Field>
        <Field label="Feed type">
          <select className="input" {...register('feed_type')}>
            <option value="">—</option>
            <option value="starter">Starter</option>
            <option value="grower">Grower</option>
            <option value="finisher">Finisher</option>
            <option value="layer">Layer</option>
            <option value="custom">Custom</option>
          </select>
        </Field>
        <Field label="Feed cost / kg (₹)">
          <input type="number" step="0.01" className="input" {...register('feed_cost_per_kg')} />
        </Field>
        {isLayer && (
          <Field label="Eggs collected">
            <input type="number" min={0} className="input" {...register('eggs_collected')} />
          </Field>
        )}
        <Field label="Avg bird weight (g)">
          <input type="number" min={0} className="input" {...register('avg_bird_weight_g')} />
        </Field>
      </div>

      <Field label="Notes">
        <textarea rows={2} className="input h-auto py-sm" {...register('notes')} />
      </Field>

      <button type="submit" disabled={loading} className="btn-primary w-full">
        {loading ? 'Saving…' : 'Save daily log'}
      </button>

      {error && <p className="text-sm text-danger">{error}</p>}
    </form>
  );
}

function Field({ label, error, children }: { label: string; error?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="label">{label}</label>
      {children}
      {error && <p className="text-sm text-danger mt-xs">{error}</p>}
    </div>
  );
}
