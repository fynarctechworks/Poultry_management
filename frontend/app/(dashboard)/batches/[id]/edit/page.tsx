import Link from 'next/link';
import { notFound } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { EditBatchForm } from './EditBatchForm';

export default async function EditBatchPage({ params }: { params: { id: string } }) {
  const supabase = createSupabaseServerClient();

  const { data: batch } = await supabase
    .from('batches')
    .select('id, batch_code, breed_name, poultry_type, placement_date, source_supplier, cost_per_bird')
    .eq('id', params.id)
    .maybeSingle();

  if (!batch) notFound();

  return (
    <div className="max-w-[560px] mx-auto">
      <Link href={`/batches/${batch.id}`} className="text-sm text-primary-dark font-semibold">&larr; {batch.batch_code}</Link>
      <h1 className="font-display text-3xl text-ink mt-md mb-2xl">Edit batch</h1>
      <EditBatchForm batch={batch as any} />
    </div>
  );
}
