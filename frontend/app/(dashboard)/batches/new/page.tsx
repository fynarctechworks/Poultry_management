import Link from 'next/link';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { BatchForm } from './BatchForm';

export default async function NewBatchPage() {
  const supabase = createSupabaseServerClient();
  const { data: sheds } = await supabase
    .from('sheds')
    .select('id, shed_name, capacity, poultry_type, farm_id, farms(farm_name)')
    .eq('status', 'active')
    .order('shed_name');

  return (
    <div className="max-w-[720px] mx-auto">
      <Link href="/batches" className="text-sm text-primary-dark font-semibold">&larr; Batches</Link>
      <h1 className="font-display text-3xl text-ink mt-md mb-2xl">New batch</h1>
      <BatchForm sheds={(sheds as any) ?? []} />
    </div>
  );
}
