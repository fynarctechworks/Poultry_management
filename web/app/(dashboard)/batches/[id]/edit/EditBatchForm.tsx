'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';

const schema = z.object({
  breed_name: z.string().min(2),
  poultry_type: z.enum(['broiler', 'layer', 'breeder']),
  placement_date: z.string().min(1),
  source_supplier: z.string().optional(),
  cost_per_bird: z.coerce.number().min(0).optional(),
});
type Form = z.infer<typeof schema>;

interface BatchRow {
  id: string;
  breed_name: string;
  poultry_type: 'broiler' | 'layer' | 'breeder';
  placement_date: string;
  source_supplier: string | null;
  cost_per_bird: number | null;
}

export function EditBatchForm({ batch }: { batch: BatchRow }) {
  const router = useRouter();
  const supabase = createSupabaseBrowserClient();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const { register, handleSubmit, formState: { errors } } = useForm<Form>({
    resolver: zodResolver(schema),
    defaultValues: {
      breed_name: batch.breed_name,
      poultry_type: batch.poultry_type,
      placement_date: batch.placement_date,
      source_supplier: batch.source_supplier ?? '',
      cost_per_bird: batch.cost_per_bird ?? undefined,
    },
  });

  async function onSubmit(data: Form) {
    setError(null);
    setLoading(true);
    const { error } = await supabase.from('batches').update({
      breed_name: data.breed_name,
      poultry_type: data.poultry_type,
      placement_date: data.placement_date,
      source_supplier: data.source_supplier || null,
      cost_per_bird: data.cost_per_bird || null,
    }).eq('id', batch.id);
    setLoading(false);
    if (error) return setError(error.message);
    router.push(`/batches/${batch.id}`);
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="card space-y-md">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-md">
        <Field label="Breed" error={errors.breed_name?.message}><input className="input" {...register('breed_name')} /></Field>
        <Field label="Type">
          <select className="input" {...register('poultry_type')}>
            <option value="broiler">Broiler</option>
            <option value="layer">Layer</option>
            <option value="breeder">Breeder</option>
          </select>
        </Field>
        <Field label="Placement date" error={errors.placement_date?.message}><input type="date" className="input" {...register('placement_date')} /></Field>
        <Field label="Cost per bird (₹)"><input type="number" step="0.01" className="input" {...register('cost_per_bird')} /></Field>
      </div>
      <Field label="Source / supplier"><input className="input" {...register('source_supplier')} /></Field>
      <button type="submit" disabled={loading} className="btn-primary w-full">{loading ? 'Saving…' : 'Save changes'}</button>
      {error && <p className="text-sm text-danger">{error}</p>}
    </form>
  );
}

function Field({ label, error, children }: { label: string; error?: string; children: React.ReactNode }) {
  return <div><label className="label">{label}</label>{children}{error && <p className="text-sm text-danger mt-xs">{error}</p>}</div>;
}
