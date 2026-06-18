import Link from 'next/link';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { HealthForm } from './HealthForm';

export default async function NewHealthPage() {
  const supabase = createSupabaseServerClient();
  const { data: batches } = await supabase
    .from('batches')
    .select('id, batch_code, farm_id, current_bird_count, farms(farm_name)')
    .eq('status', 'active')
    .order('batch_code');

  return (
    <div className="max-w-[720px] mx-auto">
      <Link href="/health" className="text-sm text-primary-dark font-semibold">&larr; Health incidents</Link>
      <h1 className="font-display text-3xl text-ink mt-md mb-2xl">Report health incident</h1>
      <HealthForm batches={(batches as any) ?? []} />
    </div>
  );
}
