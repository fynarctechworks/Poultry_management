'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';

const todayISO = () => new Date().toISOString().slice(0, 10);

const schema = z.object({
  state: z.string().min(2),
  price_date: z.string().min(1).refine((v) => v <= todayISO(), 'Date cannot be in the future'),
  broiler_price_per_kg: z.coerce.number().positive(),
  egg_price_per_100: z.coerce.number().positive().optional().or(z.literal('')),
});
type Form = z.infer<typeof schema>;

export function PriceEntryForm() {
  const router = useRouter();
  const supabase = createSupabaseBrowserClient();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const { register, handleSubmit, formState: { errors } } = useForm<Form>({
    resolver: zodResolver(schema),
    defaultValues: { price_date: new Date().toISOString().slice(0, 10) },
  });

  async function onSubmit(data: Form) {
    setError(null);
    setLoading(true);
    // Go through the upsert_market_price RPC, not a direct table upsert: market_prices
    // has SELECT-only RLS (no INSERT policy), so a raw upsert is rejected. The RPC
    // (SECURITY DEFINER) enforces owner-in-state + price_date ≤ today server-side.
    const { error } = await supabase.rpc('upsert_market_price', {
      p_state: data.state,
      p_price_date: data.price_date,
      p_broiler_price_per_kg: data.broiler_price_per_kg,
      p_egg_price_per_100:
        data.egg_price_per_100 === '' || data.egg_price_per_100 == null ? null : data.egg_price_per_100,
    });
    setLoading(false);
    if (error) return setError(error.message);
    router.push('/market-prices');
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="card space-y-md">
      <Field label="State *" error={errors.state?.message}>
        <input className="input" placeholder="Telangana" {...register('state')} />
      </Field>
      <Field label="Price date *" error={errors.price_date?.message}>
        <input type="date" max={todayISO()} className="input" {...register('price_date')} />
      </Field>
      <div className="grid grid-cols-2 gap-md">
        <Field label="Broiler ₹/kg *" error={errors.broiler_price_per_kg?.message}>
          <input type="number" step="0.01" className="input" {...register('broiler_price_per_kg')} />
        </Field>
        <Field label="Egg ₹/100">
          <input type="number" step="0.01" className="input" {...register('egg_price_per_100')} />
        </Field>
      </div>
      <button type="submit" disabled={loading} className="btn-primary w-full">{loading ? 'Saving…' : 'Save price'}</button>
      {error && <p className="text-sm text-danger">{error}</p>}
    </form>
  );
}

function Field({ label, error, children }: { label: string; error?: string; children: React.ReactNode }) {
  return <div><label className="label">{label}</label>{children}{error && <p className="text-sm text-danger mt-xs">{error}</p>}</div>;
}
