'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';

const schema = z.object({
  to_shed_id: z.string().uuid({ message: 'Pick a destination shed' }),
  transfer_date: z.string().min(1),
  notes: z.string().max(500).optional(),
});
type Form = z.infer<typeof schema>;

export type ShedOption = {
  id: string;
  shed_name: string;
  capacity: number;
  poultry_type: string;
  status: string;
};

export function TransferBatchForm({
  batchId,
  currentShedId,
  poultryType,
  sheds,
}: {
  batchId: string;
  currentShedId: string;
  poultryType: string;
  sheds: ShedOption[];
}) {
  const router = useRouter();
  const supabase = createSupabaseBrowserClient();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Only valid destinations: same farm, active, matching poultry type, not the
  // shed the batch already sits in. (The DB RPC re-validates all of this.)
  const candidates = sheds.filter(
    (s) => s.id !== currentShedId && s.status === 'active' && s.poultry_type === poultryType,
  );

  const { register, handleSubmit, formState: { errors } } = useForm<Form>({
    resolver: zodResolver(schema),
    defaultValues: { transfer_date: new Date().toISOString().slice(0, 10) },
  });

  async function onSubmit(data: Form) {
    setError(null);
    setLoading(true);
    const { error } = await supabase.rpc('transfer_batch', {
      p_batch_id: batchId,
      p_to_shed_id: data.to_shed_id,
      p_transfer_date: data.transfer_date,
      p_notes: data.notes?.trim() || null,
    });
    setLoading(false);
    if (error) return setError(error.message);
    setOpen(false);
    router.refresh();
  }

  if (!open) {
    return <button onClick={() => setOpen(true)} className="btn-outline">Transfer to another shed</button>;
  }

  if (candidates.length === 0) {
    return (
      <div className="card mt-md space-y-sm">
        <h3 className="font-bold text-ink">Transfer to another shed</h3>
        <p className="text-sm text-body">
          No eligible destination shed. You need another <strong>active {poultryType}</strong> shed
          on this farm with enough free capacity.
        </p>
        <button type="button" onClick={() => setOpen(false)} className="btn-subtle">Close</button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="card mt-md space-y-md">
      <h3 className="font-bold text-ink">Transfer batch to another shed</h3>
      <p className="text-xs text-body-soft">The batch keeps its identity and history — only its location changes.</p>
      <div className="grid grid-cols-2 gap-md">
        <Field label="Destination shed" error={errors.to_shed_id?.message}>
          <select className="input" defaultValue="" {...register('to_shed_id')}>
            <option value="" disabled>Select a shed…</option>
            {candidates.map((s) => (
              <option key={s.id} value={s.id}>{s.shed_name} (cap. {s.capacity.toLocaleString('en-IN')})</option>
            ))}
          </select>
        </Field>
        <Field label="Transfer date" error={errors.transfer_date?.message}>
          <input type="date" className="input" {...register('transfer_date')} />
        </Field>
      </div>
      <Field label="Notes (optional)" error={errors.notes?.message}>
        <input type="text" className="input" placeholder="Reason for the move" {...register('notes')} />
      </Field>
      <div className="flex gap-sm">
        <button type="submit" disabled={loading} className="btn-primary flex-1">{loading ? 'Transferring…' : 'Transfer batch'}</button>
        <button type="button" onClick={() => setOpen(false)} className="btn-subtle">Cancel</button>
      </div>
      {error && <p className="text-sm text-danger">{error}</p>}
    </form>
  );
}

function Field({ label, error, children }: { label: string; error?: string; children: React.ReactNode }) {
  return <div><label className="label">{label}</label>{children}{error && <p className="text-sm text-danger mt-xs">{error}</p>}</div>;
}
