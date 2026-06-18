'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';

const schema = z.object({
  shed_id: z.string().uuid(),
  breed_name: z.string().min(2),
  poultry_type: z.enum(['broiler', 'layer', 'breeder']),
  placement_date: z.string().min(1),
  opening_bird_count: z.coerce.number().int().positive(),
  source_supplier: z.string().optional(),
  cost_per_bird: z.coerce.number().min(0).optional(),
});
type Form = z.infer<typeof schema>;

interface Shed { id: string; shed_name: string; capacity: number; poultry_type: string; farm_id: string; farms: { farm_name: string } | null; }

export function BatchForm({ sheds }: { sheds: Shed[] }) {
  const router = useRouter();
  const supabase = createSupabaseBrowserClient();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const { register, handleSubmit, watch, formState: { errors } } = useForm<Form>({
    resolver: zodResolver(schema),
    defaultValues: {
      shed_id: sheds[0]?.id,
      poultry_type: (sheds[0]?.poultry_type as any) ?? 'broiler',
      placement_date: new Date().toISOString().slice(0, 10),
    },
  });

  // A batch always inherits its shed's poultry type (mirrors the transfer_batch
  // rule, which refuses a destination shed of a different type).
  const selectedShed = sheds.find((s) => s.id === watch('shed_id')) ?? sheds[0];

  async function onSubmit(data: Form) {
    setError(null);
    const shed = sheds.find((s) => s.id === data.shed_id);
    if (!shed) { setError('Pick a shed'); return; }
    // Placement must respect shed capacity — transfer_batch enforces this, so
    // placement must too, otherwise a batch can be created over capacity.
    if (data.opening_bird_count > shed.capacity) {
      return setError(`Opening count (${data.opening_bird_count.toLocaleString('en-IN')}) exceeds shed capacity (${shed.capacity.toLocaleString('en-IN')}).`);
    }
    setLoading(true);
    const { data: row, error } = await supabase.from('batches').insert({
      shed_id: data.shed_id,
      farm_id: shed.farm_id,
      breed_name: data.breed_name,
      poultry_type: shed.poultry_type, // inherit from shed, never the stale form value
      placement_date: data.placement_date,
      opening_bird_count: data.opening_bird_count,
      current_bird_count: data.opening_bird_count,
      source_supplier: data.source_supplier || null,
      cost_per_bird: data.cost_per_bird || null,
      status: 'active',
    }).select('id').single();
    setLoading(false);
    if (error) return setError(error.message);
    router.push(`/batches/${row!.id}`);
    router.refresh();
  }

  if (sheds.length === 0) {
    return <div className="card text-center py-2xl"><p className="text-body">No active sheds. <a href="/sheds/new" className="text-primary-dark font-semibold">Add one</a> first.</p></div>;
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="card space-y-md">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-md">
        <Field label="Shed" error={errors.shed_id?.message}>
          <select className="input" {...register('shed_id')}>
            {sheds.map((s) => (
              <option key={s.id} value={s.id}>
                {s.shed_name} · {s.farms?.farm_name} (cap {s.capacity})
              </option>
            ))}
          </select>
        </Field>
        <Field label="Type (from shed)">
          <input className="input capitalize bg-canvas-soft" value={selectedShed?.poultry_type ?? ''} disabled readOnly />
        </Field>
        <Field label="Breed" error={errors.breed_name?.message}><input className="input" placeholder="Cobb 500 / Vencobb" {...register('breed_name')} /></Field>
        <Field label="Placement date" error={errors.placement_date?.message}><input type="date" className="input" {...register('placement_date')} /></Field>
        <Field label={`Opening bird count${selectedShed ? ` (max ${selectedShed.capacity.toLocaleString('en-IN')})` : ''}`} error={errors.opening_bird_count?.message}>
          <input type="number" min={1} max={selectedShed?.capacity} className="input" {...register('opening_bird_count')} />
        </Field>
        <Field label="Cost per bird (₹)"><input type="number" step="0.01" className="input" {...register('cost_per_bird')} /></Field>
      </div>
      <Field label="Source / supplier"><input className="input" {...register('source_supplier')} /></Field>
      <button type="submit" disabled={loading} className="btn-primary w-full">{loading ? 'Creating…' : 'Create batch'}</button>
      {error && <p className="text-sm text-danger">{error}</p>}
    </form>
  );
}

function Field({ label, error, children }: { label: string; error?: string; children: React.ReactNode }) {
  return <div><label className="label">{label}</label>{children}{error && <p className="text-sm text-danger mt-xs">{error}</p>}</div>;
}
