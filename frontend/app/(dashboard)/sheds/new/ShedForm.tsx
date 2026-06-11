'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';

const schema = z.object({
  farm_id: z.string().uuid(),
  shed_name: z.string().min(1),
  capacity: z.coerce.number().int().positive(),
  poultry_type: z.enum(['broiler', 'layer', 'breeder']),
});
type Form = z.infer<typeof schema>;

export function ShedForm({ farms }: { farms: { id: string; farm_name: string }[] }) {
  const router = useRouter();
  const supabase = createSupabaseBrowserClient();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const { register, handleSubmit, formState: { errors } } = useForm<Form>({
    resolver: zodResolver(schema),
    defaultValues: { farm_id: farms[0]?.id, poultry_type: 'broiler', capacity: 1000 },
  });

  async function onSubmit(data: Form) {
    setError(null);
    setLoading(true);
    const { error } = await supabase.from('sheds').insert({ ...data, status: 'active' });
    setLoading(false);
    if (error) return setError(error.message);
    router.push(`/farms/${data.farm_id}`);
    router.refresh();
  }

  if (farms.length === 0) {
    return <div className="card text-center py-2xl"><p className="text-body">Create a farm first.</p></div>;
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="card space-y-md">
      <Field label="Farm" error={errors.farm_id?.message}>
        <select className="input" {...register('farm_id')}>{farms.map((f) => <option key={f.id} value={f.id}>{f.farm_name}</option>)}</select>
      </Field>
      <div className="grid grid-cols-2 gap-md">
        <Field label="Shed name" error={errors.shed_name?.message}><input className="input" {...register('shed_name')} /></Field>
        <Field label="Capacity" error={errors.capacity?.message}><input type="number" min={1} className="input" {...register('capacity')} /></Field>
        <Field label="Type">
          <select className="input" {...register('poultry_type')}>
            <option value="broiler">Broiler</option>
            <option value="layer">Layer</option>
            <option value="breeder">Breeder</option>
          </select>
        </Field>
      </div>
      <button type="submit" disabled={loading} className="btn-primary w-full">{loading ? 'Saving…' : 'Create shed'}</button>
      {error && <p className="text-sm text-danger">{error}</p>}
    </form>
  );
}

function Field({ label, error, children }: { label: string; error?: string; children: React.ReactNode }) {
  return <div><label className="label">{label}</label>{children}{error && <p className="text-sm text-danger mt-xs">{error}</p>}</div>;
}
