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
  integrator_birds_lifted: z.coerce.number().int().min(0).optional(),
  integrator_avg_weight_kg: z.coerce.number().min(0).optional(),
  integrator_fcr: z.coerce.number().min(0).optional(),
  integrator_mortality_pct: z.coerce.number().min(0).max(100).optional(),
  dispute_notes: z.string().optional(),
  mark_disputed: z.boolean().optional(),
});
type SettleForm = z.infer<typeof settleSchema>;

const tariffSchema = z.object({
  base_growing_charge_per_kg: z.coerce.number().min(0),
  fcr_threshold: z.coerce.number().min(0).optional(),
  fcr_bonus_per_kg: z.coerce.number().min(0).optional(),
  mortality_threshold_pct: z.coerce.number().min(0).max(100).optional(),
  mortality_bonus_per_kg: z.coerce.number().min(0).optional(),
});
type TariffForm = z.infer<typeof tariffSchema>;

interface TariffDefaults {
  base_growing_charge_per_kg: number;
  fcr_threshold: number | null;
  fcr_bonus_per_kg: number | null;
  mortality_threshold_pct: number | null;
  mortality_bonus_per_kg: number | null;
}

interface Props {
  cycleId: string;
  status: string;
  tariffConfirmed: boolean;
  tariffDefaults: TariffDefaults;
  initial: {
    actual_harvest_date: string | null;
    birds_delivered: number | null;
    avg_weight_kg: number | null;
    actual_fcr: number | null;
    actual_mortality_pct: number | null;
    expected_settlement_amount: number | null;
    integrator_birds_lifted: number | null;
    integrator_avg_weight_kg: number | null;
    integrator_fcr: number | null;
    integrator_mortality_pct: number | null;
    actual_settlement_amount: number | null;
  };
}

export function CycleActions({ cycleId, status, tariffConfirmed, tariffDefaults, initial }: Props) {
  const router = useRouter();
  const supabase = createSupabaseBrowserClient();
  const [mode, setMode] = useState<'idle' | 'harvest' | 'settle' | 'tariff'>('idle');
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
    defaultValues: {
      settlement_received_date: new Date().toISOString().slice(0, 10),
      actual_settlement_amount: initial.actual_settlement_amount ?? undefined,
      integrator_birds_lifted: initial.integrator_birds_lifted ?? undefined,
      integrator_avg_weight_kg: initial.integrator_avg_weight_kg ?? undefined,
      integrator_fcr: initial.integrator_fcr ?? undefined,
      integrator_mortality_pct: initial.integrator_mortality_pct ?? undefined,
    },
  });
  const tariffForm = useForm<TariffForm>({
    resolver: zodResolver(tariffSchema),
    defaultValues: {
      base_growing_charge_per_kg: tariffDefaults.base_growing_charge_per_kg,
      fcr_threshold: tariffDefaults.fcr_threshold ?? undefined,
      fcr_bonus_per_kg: tariffDefaults.fcr_bonus_per_kg ?? undefined,
      mortality_threshold_pct: tariffDefaults.mortality_threshold_pct ?? undefined,
      mortality_bonus_per_kg: tariffDefaults.mortality_bonus_per_kg ?? undefined,
    },
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
      integrator_birds_lifted: data.integrator_birds_lifted ?? null,
      integrator_avg_weight_kg: data.integrator_avg_weight_kg ?? null,
      integrator_fcr: data.integrator_fcr ?? null,
      integrator_mortality_pct: data.integrator_mortality_pct ?? null,
      dispute_notes: data.dispute_notes || null,
      status: data.mark_disputed ? 'disputed' : 'settled',
    }).eq('id', cycleId);
    setLoading(false);
    if (error) return setError(error.message);
    setMode('idle');
    router.refresh();
  }

  async function saveTariff(data: TariffForm) {
    setError(null);
    setLoading(true);
    const snapshot: Record<string, unknown> = {
      base_growing_charge_per_kg: data.base_growing_charge_per_kg,
    };
    if (data.fcr_threshold != null && data.fcr_bonus_per_kg != null) {
      snapshot.fcr_bonus = { threshold: data.fcr_threshold, bonus_per_kg: data.fcr_bonus_per_kg };
    }
    if (data.mortality_threshold_pct != null && data.mortality_bonus_per_kg != null) {
      snapshot.mortality_bonus = {
        threshold_pct: data.mortality_threshold_pct,
        bonus_per_kg: data.mortality_bonus_per_kg,
      };
    }
    const { error } = await supabase.from('contract_cycles').update({
      tariff_card_snapshot: snapshot,
      tariff_confirmed_at: new Date().toISOString(),
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
        <div className="flex flex-wrap gap-sm items-center">
          <button onClick={() => setMode('tariff')} className={tariffConfirmed ? 'btn-outline' : 'btn-primary'}>
            {tariffConfirmed ? 'Edit tariff terms' : 'Confirm tariff terms'}
          </button>
          {!tariffConfirmed && (
            <span className="text-xs text-warning-ink">Confirm your actual contract terms before reconciling.</span>
          )}
          {status === 'active' && (
            <button onClick={() => setMode('harvest')} className="btn-primary">Record harvest</button>
          )}
          {(status === 'harvest_complete' || status === 'disputed') && (
            <button onClick={() => setMode('settle')} disabled={!tariffConfirmed} className="btn-primary disabled:opacity-50">Record settlement</button>
          )}
          {status === 'harvest_complete' && (
            <button onClick={() => setMode('harvest')} className="btn-outline">Edit harvest</button>
          )}
        </div>
      )}

      {mode === 'tariff' && (
        <form onSubmit={tariffForm.handleSubmit(saveTariff)} className="space-y-md">
          <h3 className="font-bold text-ink">Confirm contract terms for this cycle</h3>
          <p className="text-sm text-body">These default from the integrator&apos;s reference card. Edit them to match your actual contract — a wrong rate gives a wrong expected settlement.</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-md">
            <SimpleField label="Base growing charge (₹/kg)" error={tariffForm.formState.errors.base_growing_charge_per_kg?.message}><input type="number" step="0.01" className="input" {...tariffForm.register('base_growing_charge_per_kg')} /></SimpleField>
            <div />
            <SimpleField label="FCR bonus threshold (≤)"><input type="number" step="0.001" className="input" {...tariffForm.register('fcr_threshold')} /></SimpleField>
            <SimpleField label="FCR bonus (₹/kg)"><input type="number" step="0.01" className="input" {...tariffForm.register('fcr_bonus_per_kg')} /></SimpleField>
            <SimpleField label="Mortality bonus threshold (% ≤)"><input type="number" step="0.01" className="input" {...tariffForm.register('mortality_threshold_pct')} /></SimpleField>
            <SimpleField label="Mortality bonus (₹/kg)"><input type="number" step="0.01" className="input" {...tariffForm.register('mortality_bonus_per_kg')} /></SimpleField>
          </div>
          <div className="flex gap-sm">
            <button type="submit" disabled={loading} className="btn-primary flex-1">{loading ? 'Saving…' : 'Confirm terms'}</button>
            <button type="button" onClick={() => setMode('idle')} className="btn-subtle">Cancel</button>
          </div>
        </form>
      )}

      {mode === 'harvest' && (
        <form onSubmit={harvestForm.handleSubmit(saveHarvest)} className="space-y-md">
          <h3 className="font-bold text-ink">Record harvest — your data</h3>
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
          <h3 className="font-bold text-ink">Record settlement — integrator&apos;s statement</h3>
          <p className="text-sm text-body">Enter the figures from the integrator&apos;s settlement statement. We compare them to your data and show the ₹ impact of each gap.</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-md">
            <SimpleField label="Settlement amount (₹)" error={settleForm.formState.errors.actual_settlement_amount?.message}><input type="number" step="0.01" className="input" {...settleForm.register('actual_settlement_amount')} /></SimpleField>
            <SimpleField label="Received date" error={settleForm.formState.errors.settlement_received_date?.message}><input type="date" className="input" {...settleForm.register('settlement_received_date')} /></SimpleField>
            <SimpleField label="Integrator birds lifted"><input type="number" min={0} className="input" {...settleForm.register('integrator_birds_lifted')} /></SimpleField>
            <SimpleField label="Integrator avg weight (kg)"><input type="number" step="0.001" className="input" {...settleForm.register('integrator_avg_weight_kg')} /></SimpleField>
            <SimpleField label="Integrator FCR"><input type="number" step="0.001" className="input" {...settleForm.register('integrator_fcr')} /></SimpleField>
            <SimpleField label="Integrator mortality %"><input type="number" step="0.01" className="input" {...settleForm.register('integrator_mortality_pct')} /></SimpleField>
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
