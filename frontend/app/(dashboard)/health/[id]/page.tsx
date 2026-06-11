import Link from 'next/link';
import { notFound } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { formatDateDDMonYYYY } from '@/lib/utils';
import { VetNoteForm } from './VetNoteForm';
import { DeleteButton } from '@/components/DeleteButton';

export default async function HealthIncidentDetailPage({ params }: { params: { id: string } }) {
  const supabase = createSupabaseServerClient();

  const { data: h } = await supabase
    .from('health_incidents')
    .select('id, incident_date, symptom_description, affected_bird_count, vet_consulted, diagnosis, treatment_given, medicine_name, dose, withdrawal_days, withdrawal_clearance_date, vet_note, batches(batch_code, breed_name, farms(farm_name))')
    .eq('id', params.id)
    .maybeSingle();

  if (!h) notFound();
  const incident = h as any;
  const inWithdrawal = incident.withdrawal_clearance_date && new Date(incident.withdrawal_clearance_date) > new Date();

  return (
    <div className="max-w-[820px] mx-auto">
      <Link href="/health" className="text-sm text-primary-dark font-semibold">&larr; Health incidents</Link>
      <div className="flex items-baseline justify-between mt-md mb-2xl flex-wrap gap-sm">
        <div>
          <h1 className="text-3xl font-bold text-ink">{incident.symptom_description}</h1>
          <p className="text-sm text-body mt-xs">
            {formatDateDDMonYYYY(incident.incident_date)} · {incident.batches?.batch_code} · {incident.batches?.farms?.farm_name} · {incident.affected_bird_count} birds affected
          </p>
        </div>
        <div className="flex items-center gap-md">
          {inWithdrawal && (
            <span className="px-md py-xs rounded-md text-sm font-semibold bg-warning-soft text-warning-ink">
              Withdrawal until {formatDateDDMonYYYY(incident.withdrawal_clearance_date)}
            </span>
          )}
          <Link href={`/health/${incident.id}/edit`} className="btn-outline shrink-0">Edit</Link>
          <DeleteButton table="health_incidents" id={incident.id} redirectTo="/health" />
        </div>
      </div>

      <div className="card mb-lg">
        <dl className="grid grid-cols-1 md:grid-cols-2 gap-md text-sm">
          <Item label="Vet consulted" value={incident.vet_consulted ? 'Yes' : 'No'} />
          <Item label="Diagnosis" value={incident.diagnosis || '—'} />
          <Item label="Treatment given" value={incident.treatment_given || '—'} />
          <Item label="Medicine" value={incident.medicine_name || '—'} />
          <Item label="Dose" value={incident.dose || '—'} />
          <Item label="Withdrawal days" value={incident.withdrawal_days != null ? `${incident.withdrawal_days} days` : '—'} />
        </dl>
      </div>

      <section>
        <h2 className="text-lg font-bold text-ink mb-md">Vet note</h2>
        <VetNoteForm incidentId={incident.id} initialNote={incident.vet_note ?? ''} />
      </section>
    </div>
  );
}

function Item({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wider text-body-soft">{label}</dt>
      <dd className="font-semibold text-ink mt-xxs">{value}</dd>
    </div>
  );
}
