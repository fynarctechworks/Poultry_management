import Link from 'next/link';
import { notFound } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { EditHealthForm } from './EditHealthForm';

export default async function EditHealthIncidentPage({ params }: { params: { id: string } }) {
  const supabase = createSupabaseServerClient();

  const { data: incident } = await supabase
    .from('health_incidents')
    .select('id, incident_date, symptom_description, affected_bird_count, vet_consulted, diagnosis, treatment_given, medicine_name, dose, withdrawal_days')
    .eq('id', params.id)
    .maybeSingle();

  if (!incident) notFound();

  return (
    <div className="max-w-[820px] mx-auto">
      <Link href={`/health/${incident.id}`} className="text-sm text-primary-dark font-semibold">&larr; Incident</Link>
      <h1 className="font-display text-3xl text-ink mt-md mb-2xl">Edit health incident</h1>
      <EditHealthForm incident={incident as any} />
    </div>
  );
}
