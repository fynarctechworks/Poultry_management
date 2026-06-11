'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';

const schema = z.object({
  harvest_date: z.string().min(1),
  birds_sold: z.coerce.number().int().positive(),
  sale_weight_kg: z.coerce.number().positive(),
  sale_price_per_kg: z.coerce.number().positive(),
});
type Form = z.infer<typeof schema>;

export function CloseBatchForm({ batchId }: { batchId: string }) {
  const router = useRouter();
  const supabase = createSupabaseBrowserClient();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const { register, handleSubmit, formState: { errors } } = useForm<Form>({
    resolver: zodResolver(schema),
    defaultValues: { harvest_date: new Date().toISOString().slice(0, 10) },
  });

  async function onSubmit(data: Form) {
    setError(null);
    setLoading(true);
    const { error } = await supabase.from('batches').update({
      status: 'harvested',
      harvest_date: data.harvest_date,
      birds_sold: data.birds_sold,
      sale_weight_kg: data.sale_weight_kg,
      sale_price_per_kg: data.sale_price_per_kg,
    }).eq('id', batchId);
    setLoading(false);
    if (error) return setError(error.message);
    setOpen(false);
    router.refresh();
  }

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="btn-outline">Close batch (harvest)</button>
    );
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="card mt-md space-y-md">
      <h3 className="font-bold text-ink">Record harvest & close batch</h3>
      <div className="grid grid-cols-2 gap-md">
        <Field label="Harvest date" error={errors.harvest_date?.message}><input type="date" className="input" {...register('harvest_date')} /></Field>
        <Field label="Birds sold" error={errors.birds_sold?.message}><input type="number" min={1} className="input" {...register('birds_sold')} /></Field>
        <Field label="Total weight (kg)" error={errors.sale_weight_kg?.message}><input type="number" step="0.01" className="input" {...register('sale_weight_kg')} /></Field>
        <Field label="Price per kg (₹)" error={errors.sale_price_per_kg?.message}><input type="number" step="0.01" className="input" {...register('sale_price_per_kg')} /></Field>
      </div>
      <div className="flex gap-sm">
        <button type="submit" disabled={loading} className="btn-primary flex-1">{loading ? 'Closing…' : 'Close batch'}</button>
        <button type="button" onClick={() => setOpen(false)} className="btn-subtle">Cancel</button>
      </div>
      {error && <p className="text-sm text-danger">{error}</p>}
    </form>
  );
}

function Field({ label, error, children }: { label: string; error?: string; children: React.ReactNode }) {
  return <div><label className="label">{label}</label>{children}{error && <p className="text-sm text-danger mt-xs">{error}</p>}</div>;
}
