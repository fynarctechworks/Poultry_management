'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';

const schema = z.object({
  shed_name: z.string().min(1),
  capacity: z.coerce.number().int().positive(),
  poultry_type: z.enum(['broiler', 'layer', 'breeder']),
  status: z.enum(['active', 'inactive']),
});
type Form = z.infer<typeof schema>;

interface ShedRow {
  id: string;
  farm_id: string;
  shed_name: string;
  capacity: number;
  poultry_type: 'broiler' | 'layer' | 'breeder';
  status: 'active' | 'inactive';
}

export function EditShedForm({ shed }: { shed: ShedRow }) {
  const router = useRouter();
  const supabase = createSupabaseBrowserClient();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const { register, handleSubmit, formState: { errors } } = useForm<Form>({
    resolver: zodResolver(schema),
    defaultValues: {
      shed_name: shed.shed_name,
      capacity: shed.capacity,
      poultry_type: shed.poultry_type,
      status: shed.status,
    },
  });

  async function onSubmit(data: Form) {
    setError(null);
    setLoading(true);
    const { error } = await supabase.from('sheds').update(data).eq('id', shed.id);
    setLoading(false);
    if (error) return setError(error.message);
    router.push(`/farms/${shed.farm_id}`);
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="card space-y-md">
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
        <Field label="Status">
          <select className="input" {...register('status')}>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
        </Field>
      </div>
      <button type="submit" disabled={loading} className="btn-primary w-full">{loading ? 'Saving…' : 'Save changes'}</button>
      {error && <p className="text-sm text-danger">{error}</p>}
    </form>
  );
}

function Field({ label, error, children }: { label: string; error?: string; children: React.ReactNode }) {
  return <div><label className="label">{label}</label>{children}{error && <p className="text-sm text-danger mt-xs">{error}</p>}</div>;
}
