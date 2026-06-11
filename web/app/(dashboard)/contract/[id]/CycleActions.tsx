'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';

const harvestSchema = z.object({
  actual_harvest_date: z.string().min(1),
  birds_delivered: z.coerce.number().int().min(0),
  avg_weight_kg: z.coerce.number().positive(),
  actual_fcr: z.coerce.number().positive().optional(),
  actual_mortality_pct: z.coerce.number().min(0).max(100).optional(),
  expected_settlement_amount: z.coerce.number().min(0).optional(),
});
type HarvestForm = z.infer<typeof harvestSchema>;

const settleSchema = z.object({
  actual_settlement_amount: z.coerce.number().min(0),
  settlement_received_date: z.string().min(1),
  dispute_notes: z.string().optional(),
  mark_disputed: z.boolean().optional(),
});
type SettleForm = z.infer<typeof settleSchema>;

interface Props {
  cycleId: string;
  status: string;
  initial: {
    actual_harvest_date: string | null;
    birds_delivered: number | null;
    avg_weight_kg: number | null;
    actual_fcr: number | null;
    actual_mortality_pct: number | null;
    expected_settlement_amount: number | null;
  };
}

export function CycleActions({ cycleId, status, initial }: Props) {
  const router = useRouter();
  const supabase = createSupabaseBrowserClient();
  const [mode, setMode] = useState<'idle' | 'harvest' | 'settle'>('idle');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const harvestForm = useForm<HarvestForm>({
    resolver: zodResolver(harvestSchema),
    defaultValues: {
      actual_harvest_date: initial.actual_harvest_date ?? new Date().toISOString().slice(0, 10),
      birds_delivered: initial.birds_delivered ?? 0,
      avg_weight_kg: initial.avg_weight_kg ?? 2,
      actual_fcr: initial.actual_fcr ?? undefined,
      actual_mortality_pct: initial.actual_mortality_pct ?? undefined,
      expected_settlement_amount: initial.expected_settlement_amount ?? undefined,
    },
  });
  const settleForm = useForm<SettleForm>({
    resolver: zodResolver(settleSchema),
    defaultValues: { settlement_received_date: new Date().toISOString().slice(0, 10) },
  });

  async function saveHarvest(data: HarvestForm) {
    setError(null);
    setLoading(true);
    const { error } = await supabase.from('contract_cycles').update({
      actual_harvest_date: data.actual_harvest_date,
      birds_delivered: data.birds_delivered,
      avg_weight_kg: data.avg_weight_kg,
      actual_fcr: data.actual_fcr || null,
      actual_mortality_pct: data.actual_mortality_pct || null,
      expected_settlement_amount: data.expected_settlement_amount || null,
      status: 'harvest_complete',
    }).eq('id', cycleId);
    setLoading(false);
    if (error) return setError(error.message);
    setMode('idle');
    router.refresh();
  }

  async function saveSettle(data: SettleForm) {
    setError(null);
    setLoading(true);
    const { error } = await supabase.from('contract_cycles').update({
      actual_settlement_amount: data.actual_settlement_amount,
      settlement_received_date: data.settlement_received_date,
      dispute_notes: data.dispute_notes || null,
      status: data.mark_disputed ? 'disputed' : 'settled',
    }).eq('id', cycleId);
    setLoading(false);
    if (error) return setError(error.message);
    setMode('idle');
    router.refresh();
  }

  if (status === 'settled') {
    return <p className="text-xs text-body-soft mt-md">Cycle is settled and locked — no further edits.</p>;
  }

  return (
    <div className="card mt-lg">
      {mode === 'idle' && (
        <div className="flex flex-wrap gap-sm">
          {status === 'active' && (
            <button onClick={() => setMode('harvest')} className="btn-primary">Record harvest</button>
          )}
          {(status === 'harvest_complete' || status === 'disputed') && (
            <button onClick={() => setMode('settle')} className="btn-primary">Record settlement</button>
          )}
          {status === 'harvest_complete' && (
            <button onClick={() => setMode('harvest')} className="btn-outline">Edit harvest</button>
          )}
        </div>
      )}

      {mode === 'harvest' && (
        <form onSubmit={harvestForm.handleSubmit(saveHarvest)} className="space-y-md">
          <h3 className="font-bold text-ink">Record harvest</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-md">
            <SimpleField label="Harvest date" error={harvestForm.formState.errors.actual_harvest_date?.message}><input type="date" className="input" {...harvestForm.register('actual_harvest_date')} /></SimpleField>
            <SimpleField label="Birds delivered" error={harvestForm.formState.errors.birds_delivered?.message}><input type="number" min={0} className="input" {...harvestForm.register('birds_delivered')} /></SimpleField>
            <SimpleField label="Avg weight (kg)" error={harvestForm.formState.errors.avg_weight_kg?.message}><input type="number" step="0.001" className="input" {...harvestForm.register('avg_weight_kg')} /></SimpleField>
            <SimpleField label="Actual FCR"><input type="number" step="0.001" className="input" {...harvestForm.register('actual_fcr')} /></SimpleField>
            <SimpleField label="Mortality %"><input type="number" step="0.01" className="input" {...harvestForm.register('actual_mortality_pct')} /></SimpleField>
            <SimpleField label="Expected settlement (₹)"><input type="number" step="0.01" className="input" {...harvestForm.register('expected_settlement_amount')} /></SimpleField>
          </div>
          <div className="flex gap-sm">
            <button type="submit" disabled={loading} className="btn-primary flex-1">{loading ? 'Saving…' : 'Save harvest'}</button>
            <button type="button" onClick={() => setMode('idle')} className="btn-subtle">Cancel</button>
          </div>
        </form>
      )}

      {mode === 'settle' && (
        <form onSubmit={settleForm.handleSubmit(saveSettle)} className="space-y-md">
          <h3 className="font-bold text-ink">Record settlement</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-md">
            <SimpleField label="Actual settlement (₹)" error={settleForm.formState.errors.actual_settlement_amount?.message}><input type="number" step="0.01" className="input" {...settleForm.register('actual_settlement_amount')} /></SimpleField>
            <SimpleField label="Received date" error={settleForm.formState.errors.settlement_received_date?.message}><input type="date" className="input" {...settleForm.register('settlement_received_date')} /></SimpleField>
          </div>
          <SimpleField label="Dispute notes (if any)"><textarea rows={2} className="input h-auto py-sm" {...settleForm.register('dispute_notes')} /></SimpleField>
          <label className="flex items-center gap-sm text-sm">
            <input type="checkbox" className="size-4" {...settleForm.register('mark_disputed')} />
            <span>Mark as disputed (instead of settled)</span>
          </label>
          <div className="flex gap-sm">
            <button type="submit" disabled={loading} className="btn-primary flex-1">{loading ? 'Saving…' : 'Save'}</button>
            <button type="button" onClick={() => setMode('idle')} className="btn-subtle">Cancel</button>
          </div>
        </form>
      )}

      {error && <p className="text-sm text-danger mt-md">{error}</p>}
    </div>
  );
}

function SimpleField({ label, error, children }: { label: string; error?: string; children: React.ReactNode }) {
  return <div><label className="label">{label}</label>{children}{error && <p className="text-sm text-danger mt-xs">{error}</p>}</div>;
}
