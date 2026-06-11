'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';

const schema = z.object({
  item_id: z.string().uuid(),
  quantity: z.coerce.number().positive(),
  cost_per_unit: z.coerce.number().min(0),
  supplier: z.string().optional(),
  movement_date: z.string().min(1),
  notes: z.string().optional(),
});
type Form = z.infer<typeof schema>;

interface Item { id: string; item_name: string; unit: string; farm_id: string; farms: { farm_name: string } | null; }

export function PurchaseForm({ items }: { items: Item[] }) {
  const router = useRouter();
  const supabase = createSupabaseBrowserClient();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const { register, handleSubmit, formState: { errors } } = useForm<Form>({
    resolver: zodResolver(schema),
    defaultValues: { movement_date: new Date().toISOString().slice(0, 10), item_id: items[0]?.id },
  });

  async function onSubmit(data: Form) {
    setError(null);
    setLoading(true);
    const item = items.find((i) => i.id === data.item_id);
    if (!item) { setError('Pick an item'); setLoading(false); return; }
    const { error } = await supabase.from('inventory_movements').insert({
      item_id: data.item_id,
      farm_id: item.farm_id,
      movement_type: 'purchase',
      quantity: data.quantity,
      cost_per_unit: data.cost_per_unit,
      supplier: data.supplier || null,
      movement_date: data.movement_date,
      notes: data.notes || null,
    });
    setLoading(false);
    if (error) return setError(error.message);
    router.push('/inventory');
    router.refresh();
  }

  if (items.length === 0) {
    return <div className="card text-center py-2xl"><p className="text-body">No inventory items yet.</p></div>;
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="card space-y-md">
      <Field label="Item" error={errors.item_id?.message}>
        <select className="input" {...register('item_id')}>
          {items.map((i) => <option key={i.id} value={i.id}>{i.item_name} ({i.unit}) · {i.farms?.farm_name}</option>)}
        </select>
      </Field>
      <div className="grid grid-cols-2 gap-md">
        <Field label="Quantity" error={errors.quantity?.message}><input type="number" step="0.001" className="input" {...register('quantity')} /></Field>
        <Field label="Cost / unit (₹)" error={errors.cost_per_unit?.message}><input type="number" step="0.01" className="input" {...register('cost_per_unit')} /></Field>
        <Field label="Supplier"><input className="input" {...register('supplier')} /></Field>
        <Field label="Date" error={errors.movement_date?.message}><input type="date" className="input" {...register('movement_date')} /></Field>
      </div>
      <Field label="Notes"><textarea rows={2} className="input h-auto py-sm" {...register('notes')} /></Field>
      <button type="submit" disabled={loading} className="btn-primary w-full">{loading ? 'Saving…' : 'Record purchase'}</button>
      {error && <p className="text-sm text-danger">{error}</p>}
    </form>
  );
}

function Field({ label, error, children }: { label: string; error?: string; children: React.ReactNode }) {
  return <div><label className="label">{label}</label>{children}{error && <p className="text-sm text-danger mt-xs">{error}</p>}</div>;
}
