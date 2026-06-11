'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';

const schema = z.object({
  item_name: z.string().min(2),
  category: z.enum(['feed', 'medicine', 'vaccine', 'equipment']),
  unit: z.enum(['kg', 'litres', 'units']),
  low_stock_threshold: z.coerce.number().min(0),
});
type Form = z.infer<typeof schema>;

interface ItemRow {
  id: string;
  item_name: string;
  category: 'feed' | 'medicine' | 'vaccine' | 'equipment';
  unit: 'kg' | 'litres' | 'units';
  low_stock_threshold: number;
}

export function EditInventoryItemForm({ item }: { item: ItemRow }) {
  const router = useRouter();
  const supabase = createSupabaseBrowserClient();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const { register, handleSubmit, formState: { errors } } = useForm<Form>({
    resolver: zodResolver(schema),
    defaultValues: {
      item_name: item.item_name,
      category: item.category,
      unit: item.unit,
      low_stock_threshold: item.low_stock_threshold,
    },
  });

  async function onSubmit(data: Form) {
    setError(null);
    setLoading(true);
    const { error } = await supabase.from('inventory_items').update(data).eq('id', item.id);
    setLoading(false);
    if (error) return setError(error.message);
    router.push(`/inventory/${item.id}`);
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="card space-y-md">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-md">
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
        <Field label="Low stock threshold"><input type="number" step="0.01" className="input" {...register('low_stock_threshold')} /></Field>
      </div>
      <p className="text-xs text-body-soft">
        Current stock is not editable here — use the stock-adjustment form on the item page so the change is recorded as an auditable movement.
      </p>
      <button type="submit" disabled={loading} className="btn-primary w-full">{loading ? 'Saving…' : 'Save changes'}</button>
      {error && <p className="text-sm text-danger">{error}</p>}
    </form>
  );
}

function Field({ label, error, children }: { label: string; error?: string; children: React.ReactNode }) {
  return <div><label className="label">{label}</label>{children}{error && <p className="text-sm text-danger mt-xs">{error}</p>}</div>;
}
