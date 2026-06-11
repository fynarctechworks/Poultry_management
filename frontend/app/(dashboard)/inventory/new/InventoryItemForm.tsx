'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';

const schema = z.object({
  farm_id: z.string().uuid(),
  item_name: z.string().min(2),
  category: z.enum(['feed', 'medicine', 'vaccine', 'equipment']),
  unit: z.enum(['kg', 'litres', 'units']),
  current_stock: z.coerce.number().min(0),
  low_stock_threshold: z.coerce.number().min(0),
});
type Form = z.infer<typeof schema>;

export function InventoryItemForm({ farms }: { farms: { id: string; farm_name: string }[] }) {
  const router = useRouter();
  const supabase = createSupabaseBrowserClient();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const { register, handleSubmit, formState: { errors } } = useForm<Form>({
    resolver: zodResolver(schema),
    defaultValues: { category: 'feed', unit: 'kg', current_stock: 0, low_stock_threshold: 0, farm_id: farms[0]?.id },
  });

  async function onSubmit(data: Form) {
    setError(null);
    setLoading(true);
    const { error } = await supabase.from('inventory_items').insert(data);
    setLoading(false);
    if (error) return setError(error.message);
    router.push('/inventory');
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="card space-y-md">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-md">
        <Field label="Farm" error={errors.farm_id?.message}>
          <select className="input" {...register('farm_id')}>{farms.map((f) => <option key={f.id} value={f.id}>{f.farm_name}</option>)}</select>
        </Field>
        <Field label="Item name" error={errors.item_name?.message}><input className="input" {...register('item_name')} /></Field>
        <Field label="Category">
          <select className="input" {...register('category')}>
            <option value="feed">Feed</option><option value="medicine">Medicine</option>
            <option value="vaccine">Vaccine</option><option value="equipment">Equipment</option>
          </select>
        </Field>
        <Field label="Unit">
          <select className="input" {...register('unit')}>
            <option value="kg">kg</option><option value="litres">litres</option><option value="units">units</option>
          </select>
        </Field>
        <Field label="Current stock"><input type="number" step="0.01" className="input" {...register('current_stock')} /></Field>
        <Field label="Low stock threshold"><input type="number" step="0.01" className="input" {...register('low_stock_threshold')} /></Field>
      </div>
      <button type="submit" disabled={loading} className="btn-primary w-full">{loading ? 'Saving…' : 'Create item'}</button>
      {error && <p className="text-sm text-danger">{error}</p>}
    </form>
  );
}

function Field({ label, error, children }: { label: string; error?: string; children: React.ReactNode }) {
  return <div><label className="label">{label}</label>{children}{error && <p className="text-sm text-danger mt-xs">{error}</p>}</div>;
}
