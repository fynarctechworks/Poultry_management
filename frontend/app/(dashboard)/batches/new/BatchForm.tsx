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

  const { register, handleSubmit, formState: { errors } } = useForm<Form>({
    resolver: zodResolver(schema),
    defaultValues: {
      shed_id: sheds[0]?.id,
      poultry_type: (sheds[0]?.poultry_type as any) ?? 'broiler',
      placement_date: new Date().toISOString().slice(0, 10),
    },
  });

  async function onSubmit(data: Form) {
    setError(null);
    setLoading(true);
    const shed = sheds.find((s) => s.id === data.shed_id);
    if (!shed) { setError('Pick a shed'); setLoading(false); return; }
    const { data: row, error } = await supabase.from('batches').insert({
      shed_id: data.shed_id,
      farm_id: shed.farm_id,
      breed_name: data.breed_name,
      poultry_type: data.poultry_type,
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
        <Field label="Type">
          <select className="input" {...register('poultry_type')}>
            <option value="broiler">Broiler</option>
            <option value="layer">Layer</option>
            <option value="breeder">Breeder</option>
          </select>
        </Field>
        <Field label="Breed" error={errors.breed_name?.message}><input className="input" placeholder="Cobb 500 / Vencobb" {...register('breed_name')} /></Field>
        <Field label="Placement date" error={errors.placement_date?.message}><input type="date" className="input" {...register('placement_date')} /></Field>
        <Field label="Opening bird count" error={errors.opening_bird_count?.message}>
          <input type="number" min={1} className="input" {...register('opening_bird_count')} />
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
