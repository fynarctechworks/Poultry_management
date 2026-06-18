import Link from 'next/link';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { formatDateDDMonYYYY } from '@/lib/utils';
import { PageHeader } from '@/components/ui/PageHeader';

export default async function HealthPage() {
  const supabase = createSupabaseServerClient();

  const { data: incidents } = await supabase
    .from('health_incidents')
    .select('id, incident_date, symptom_description, affected_bird_count, vet_consulted, diagnosis, medicine_name, withdrawal_days, withdrawal_clearance_date, batches(batch_code, farms(farm_name))')
    .order('incident_date', { ascending: false })
    .limit(100);

  return (
    <div className="max-w-[1200px] mx-auto">
      <PageHeader
        eyebrow="Operations"
        title="Health incidents"
        subtitle="Symptoms, treatments and withdrawal tracking per batch."
        actions={<Link href="/health/new" className="btn-primary">Report incident</Link>}
      />

      <div className="space-y-md">
        {(incidents ?? []).map((h: any) => {
          const inWithdrawal = h.withdrawal_clearance_date && new Date(h.withdrawal_clearance_date) > new Date();
          return (
            <Link key={h.id} href={`/health/${h.id}`} className="card block hover:border-primary transition-colors">
              <div className="flex items-baseline justify-between mb-sm flex-wrap gap-sm">
                <div>
                  <h2 className="font-bold text-ink">{h.symptom_description}</h2>
                  <p className="text-xs text-body-soft">
                    {formatDateDDMonYYYY(h.incident_date)} · {h.batches?.batch_code} · {h.batches?.farms?.farm_name} · {h.affected_bird_count} birds
                  </p>
                </div>
                {inWithdrawal && (
                  <span className="px-sm py-xxs rounded-md text-xs font-semibold bg-warning-soft text-warning-ink">
                    Withdrawal until {formatDateDDMonYYYY(h.withdrawal_clearance_date)}
                  </span>
                )}
                {h.vet_consulted && (
                  <span className="px-sm py-xxs rounded-md text-xs font-semibold bg-primary-subtle text-primary">Vet consulted</span>
                )}
              </div>
              {h.diagnosis && <p className="text-sm text-body"><strong>Dx:</strong> {h.diagnosis}</p>}
              {h.medicine_name && (
                <p className="text-sm text-body mt-xxs"><strong>Tx:</strong> {h.medicine_name} {h.withdrawal_days ? `(${h.withdrawal_days}d withdrawal)` : ''}</p>
              )}
            </Link>
          );
        })}
        {(!incidents || incidents.length === 0) && (
          <div className="card text-center py-2xl"><p className="text-body">No incidents recorded.</p></div>
        )}
      </div>
    </div>
  );
}
