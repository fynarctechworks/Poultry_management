import Link from 'next/link';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { DailyLogForm } from './DailyLogForm';

export default async function NewDailyLogPage() {
  const supabase = createSupabaseServerClient();
  const { data: batches } = await supabase
    .from('batches')
    .select('id, batch_code, breed_name, poultry_type, farm_id, farms(farm_name)')
    .eq('status', 'active')
    .order('batch_code');

  return (
    <div className="max-w-[720px] mx-auto">
      <Link href="/multi-farm" className="text-sm text-primary-dark font-semibold">&larr; Back</Link>
      <h1 className="text-3xl font-bold text-ink mt-md mb-2xl">Daily log entry</h1>
      <DailyLogForm batches={(batches as any) ?? []} />
    </div>
  );
}
