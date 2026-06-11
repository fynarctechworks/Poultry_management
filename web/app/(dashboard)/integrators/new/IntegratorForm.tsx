'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';

const schema = z.object({
  name: z.string().min(2),
  state_presence: z.string().optional(),
  base_growing_charge_per_kg: z.coerce.number().positive(),
  weight_target_kg: z.coerce.number().positive(),
  cycle_days: z.coerce.number().int().positive(),
  fcr_threshold: z.coerce.number().positive().optional(),
  fcr_bonus_per_kg: z.coerce.number().min(0).optional(),
  mortality_threshold_pct: z.coerce.number().min(0).max(100).optional(),
  mortality_bonus_per_kg: z.coerce.number().min(0).optional(),
});
type Form = z.infer<typeof schema>;

export function IntegratorForm() {
  const router = useRouter();
  const supabase = createSupabaseBrowserClient();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const { register, handleSubmit, formState: { errors } } = useForm<Form>({
    resolver: zodResolver(schema),
    defaultValues: { weight_target_kg: 2.0, cycle_days: 42 },
  });

  async function onSubmit(data: Form) {
    setError(null);
    setLoading(true);
    const tariff = {
      base_growing_charge_per_kg: data.base_growing_charge_per_kg,
      weight_target_kg: data.weight_target_kg,
      cycle_days: data.cycle_days,
      fcr_bonus: data.fcr_threshold && data.fcr_bonus_per_kg
        ? { threshold: data.fcr_threshold, bonus_per_kg: data.fcr_bonus_per_kg }
        : null,
      mortality_bonus: data.mortality_threshold_pct && data.mortality_bonus_per_kg
        ? { threshold_pct: data.mortality_threshold_pct, bonus_per_kg: data.mortality_bonus_per_kg }
        : null,
    };
    const states = data.state_presence
      ? data.state_presence.split(',').map((s) => s.trim()).filter(Boolean)
      : [];
    const { error } = await supabase.from('integrators').insert({
      name: data.name,
      state_presence: states,
      tariff_card_json: tariff,
      is_pre_loaded: false,
    });
    setLoading(false);
    if (error) return setError(error.message);
    router.push('/integrators');
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="card space-y-md">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-md">
        <Field label="Name" error={errors.name?.message}><input className="input" {...register('name')} /></Field>
        <Field label="States (comma-separated)"><input className="input" placeholder="Telangana, AP" {...register('state_presence')} /></Field>
      </div>

      <h3 className="font-bold text-ink pt-md">Tariff card</h3>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-md">
        <Field label="Base ₹ / kg *" error={errors.base_growing_charge_per_kg?.message}>
          <input type="number" step="0.01" className="input" {...register('base_growing_charge_per_kg')} />
        </Field>
        <Field label="Weight target (kg) *" error={errors.weight_target_kg?.message}>
          <input type="number" step="0.01" className="input" {...register('weight_target_kg')} />
        </Field>
        <Field label="Cycle days *" error={errors.cycle_days?.message}>
          <input type="number" className="input" {...register('cycle_days')} />
        </Field>
      </div>

      <h3 className="font-bold text-ink pt-md">FCR bonus (optional)</h3>
      <div className="grid grid-cols-2 gap-md">
        <Field label="If FCR ≤"><input type="number" step="0.001" className="input" {...register('fcr_threshold')} /></Field>
        <Field label="Bonus ₹/kg"><input type="number" step="0.01" className="input" {...register('fcr_bonus_per_kg')} /></Field>
      </div>

      <h3 className="font-bold text-ink pt-md">Mortality bonus (optional)</h3>
      <div className="grid grid-cols-2 gap-md">
        <Field label="If mortality ≤ %"><input type="number" step="0.01" className="input" {...register('mortality_threshold_pct')} /></Field>
        <Field label="Bonus ₹/kg"><input type="number" step="0.01" className="input" {...register('mortality_bonus_per_kg')} /></Field>
      </div>

      <button type="submit" disabled={loading} className="btn-primary w-full">{loading ? 'Saving…' : 'Save integrator'}</button>
      {error && <p className="text-sm text-danger">{error}</p>}
    </form>
  );
}

function Field({ label, error, children }: { label: string; error?: string; children: React.ReactNode }) {
  return <div><label className="label">{label}</label>{children}{error && <p className="text-sm text-danger mt-xs">{error}</p>}</div>;
}
