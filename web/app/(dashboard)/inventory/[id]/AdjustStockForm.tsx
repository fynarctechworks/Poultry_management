'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';

const schema = z.object({
  new_stock: z.coerce.number().min(0),
  notes: z.string().optional(),
});
type Form = z.infer<typeof schema>;

interface Props {
  itemId: string;
  farmId: string;
  unit: string;
  currentStock: number;
}

export function AdjustStockForm({ itemId, farmId, unit, currentStock }: Props) {
  const router = useRouter();
  const supabase = createSupabaseBrowserClient();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const { register, handleSubmit, watch, formState: { errors } } = useForm<Form>({
    resolver: zodResolver(schema),
    defaultValues: { new_stock: currentStock },
  });

  const newStock = Number(watch('new_stock'));
  const delta = Number.isFinite(newStock) ? newStock - currentStock : 0;

  async function onSubmit(data: Form) {
    setError(null);
    setLoading(true);
    const change = data.new_stock - currentStock;

    // The tg_inventory_movements_apply trigger applies this signed delta to
    // current_stock — do not update the item here or it will double-count.
    const { error: moveErr } = await supabase.from('inventory_movements').insert({
      item_id: itemId,
      farm_id: farmId,
      movement_type: 'adjustment',
      quantity: change,
      movement_date: new Date().toISOString().slice(0, 10),
      notes: data.notes || `Stock corrected from ${currentStock} to ${data.new_stock}`,
    });
    setLoading(false);
    if (moveErr) return setError(moveErr.message);

    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="card space-y-md">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-md">
        <Field label={`Corrected stock count (${unit})`} error={errors.new_stock?.message}>
          <input type="number" step="0.001" className="input" {...register('new_stock')} />
        </Field>
        <div className="flex items-end">
          <p className="text-sm text-body">
            Adjustment:{' '}
            <span className={`font-semibold ${delta > 0 ? 'text-success-ink' : delta < 0 ? 'text-danger' : 'text-body'}`}>
              {delta > 0 ? '+' : ''}{delta} {unit}
            </span>
          </p>
        </div>
      </div>
      <Field label="Reason / notes">
        <textarea rows={2} className="input h-auto py-sm" placeholder="Physical count correction, spoilage, etc." {...register('notes')} />
      </Field>
      <button type="submit" disabled={loading || delta === 0} className="btn-primary">{loading ? 'Saving…' : 'Apply adjustment'}</button>
      {error && <p className="text-sm text-danger">{error}</p>}
    </form>
  );
}

function Field({ label, error, children }: { label: string; error?: string; children: React.ReactNode }) {
  return <div><label className="label">{label}</label>{children}{error && <p className="text-sm text-danger mt-xs">{error}</p>}</div>;
}
