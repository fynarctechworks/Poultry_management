import Link from 'next/link';
import { notFound } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { EditVaccinationForm } from './EditVaccinationForm';

export default async function EditVaccinationPage({ params }: { params: { id: string } }) {
  const supabase = createSupabaseServerClient();

  const { data: vaccination } = await supabase
    .from('vaccinations')
    .select('id, vaccine_name, scheduled_date, administered_date, dose, route, birds_vaccinated, status')
    .eq('id', params.id)
    .maybeSingle();

  if (!vaccination) notFound();

  return (
    <div className="max-w-[560px] mx-auto">
      <Link href="/vaccinations" className="text-sm text-primary-dark font-semibold">&larr; Vaccinations</Link>
      <h1 className="text-3xl font-bold text-ink mt-md mb-2xl">Edit vaccination</h1>
      <EditVaccinationForm vaccination={vaccination as any} />
    </div>
  );
}
