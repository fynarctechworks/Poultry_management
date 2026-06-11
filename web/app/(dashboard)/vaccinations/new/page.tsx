import Link from 'next/link';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { VaccinationForm } from './VaccinationForm';

export default async function NewVaccinationPage() {
  const supabase = createSupabaseServerClient();
  const { data: batches } = await supabase
    .from('batches')
    .select('id, batch_code, breed_name, farm_id, current_bird_count, farms(farm_name)')
    .eq('status', 'active')
    .order('batch_code');

  return (
    <div className="max-w-[720px] mx-auto">
      <Link href="/vaccinations" className="text-sm text-primary-dark font-semibold">&larr; Vaccinations</Link>
      <h1 className="text-3xl font-bold text-ink mt-md mb-2xl">Schedule vaccination</h1>
      <VaccinationForm batches={(batches as any) ?? []} />
    </div>
  );
}
