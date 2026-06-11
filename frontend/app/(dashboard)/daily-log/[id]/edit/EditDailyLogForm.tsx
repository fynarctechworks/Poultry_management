'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';

const schema = z.object({
  log_date: z.string().min(1),
  birds_dead: z.coerce.number().int().min(0),
  death_cause: z.enum(['disease', 'culled', 'injury', 'heat_stress', 'unknown']).optional().or(z.literal('')),
  eggs_collected: z.coerce.number().int().min(0).optional(),
  avg_bird_weight_g: z.coerce.number().min(0).optional(),
  notes: z.string().optional(),
});
type Form = z.infer<typeof schema>;

interface LogRow {
  id: string;
  batch_id: string;
  log_date: string;
  birds_dead: number;
  death_cause: 'disease' | 'culled' | 'injury' | 'heat_stress' | 'unknown' | null;
  feed_consumed_kg: number | null;
  feed_type: string | null;
  eggs_collected: number | null;
  avg_bird_weight_g: number | null;
  notes: string | null;
}

export function EditDailyLogForm({ log }: { log: LogRow }) {
  const router = useRouter();
  const supabase = createSupabaseBrowserClient();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const { register, handleSubmit, formState: { errors } } = useForm<Form>({
    resolver: zodResolver(schema),
    defaultValues: {
      log_date: log.log_date,
      birds_dead: log.birds_dead,
      death_cause: log.death_cause ?? '',
      eggs_collected: log.eggs_collected ?? undefined,
      avg_bird_weight_g: log.avg_bird_weight_g ?? undefined,
      notes: log.notes ?? '',
    },
  });

  async function onSubmit(data: Form) {
    setError(null);
    setLoading(true);
    // birds_dead edits are reconciled into batches.current_bird_count by the
    // tg_daily_logs_update_bird_count_edit trigger (signed delta).
    const { error } = await supabase.from('daily_logs').update({
      log_date: data.log_date,
      birds_dead: data.birds_dead,
      death_cause: data.death_cause || null,
      eggs_collected: data.eggs_collected ?? null,
      avg_bird_weight_g: data.avg_bird_weight_g ?? null,
      notes: data.notes || null,
    }).eq('id', log.id);
    setLoading(false);
    if (error) return setError(error.message);
    router.push(`/batches/${log.batch_id}`);
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="card space-y-md">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-md">
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
        <Field label="Eggs collected">
          <input type="number" min={0} className="input" {...register('eggs_collected')} />
        </Field>
        <Field label="Avg bird weight (g)">
          <input type="number" min={0} className="input" {...register('avg_bird_weight_g')} />
        </Field>
        <Field label="Feed (recorded)">
          <input className="input bg-canvas-soft" disabled value={`${log.feed_consumed_kg ?? 0} kg${log.feed_type ? ` · ${log.feed_type}` : ''}`} />
        </Field>
      </div>
      <p className="text-xs text-body-soft">
        Feed quantity can&apos;t be edited here — the inventory deduction is already recorded. Correct stock via an
        adjustment movement on the inventory item instead.
      </p>
      <Field label="Notes">
        <textarea rows={2} className="input h-auto py-sm" {...register('notes')} />
      </Field>
      <button type="submit" disabled={loading} className="btn-primary w-full">{loading ? 'Saving…' : 'Save changes'}</button>
      {error && <p className="text-sm text-danger">{error}</p>}
    </form>
  );
}

function Field({ label, error, children }: { label: string; error?: string; children: React.ReactNode }) {
  return <div><label className="label">{label}</label>{children}{error && <p className="text-sm text-danger mt-xs">{error}</p>}</div>;
}
