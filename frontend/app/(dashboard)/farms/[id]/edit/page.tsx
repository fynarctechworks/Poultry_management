import Link from 'next/link';
import { notFound } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { EditFarmForm } from './EditFarmForm';

export default async function EditFarmPage({ params }: { params: { id: string } }) {
  const supabase = createSupabaseServerClient();

  const { data: farm } = await supabase
    .from('farms')
    .select('id, farm_name, owner_name, state, district, phone, gstin, farm_type, upi_id, latitude, longitude, heat_stress_threshold_celsius, mortality_alert_threshold_pct, necc_zone')
    .eq('id', params.id)
    .maybeSingle();

  if (!farm) notFound();

  return (
    <div className="max-w-[720px] mx-auto">
      <Link href={`/farms/${farm.id}`} className="text-sm text-primary-dark font-semibold">&larr; Farm</Link>
      <h1 className="text-3xl font-bold text-ink mt-md mb-2xl">Edit farm</h1>
      <EditFarmForm farm={farm as any} />
    </div>
  );
}
