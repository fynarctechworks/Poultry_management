import { notFound } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { formatDateDDMonYYYY } from '@/lib/utils';
import { DownloadCertificate } from './DownloadCertificate';

export const dynamic = 'force-dynamic';

export default async function TraceabilityPage({ params }: { params: { token: string } }) {
  const supabase = createSupabaseServerClient();

  const { data: rec } = await supabase
    .from('traceability_records')
    .select('batch_id, supplier_name, placement_date, breed_name, total_vaccinations, health_incidents_count, withdrawal_cleared, harvest_date, buyer_name, certificate_pdf_url, is_locked, qr_token')
    .eq('qr_token', params.token)
    .maybeSingle();

  if (!rec) notFound();

  return (
    <main className="min-h-screen bg-canvas-soft px-lg py-3xl">
      <div className="max-w-[640px] mx-auto">
        <div className="card shadow-subtle">
          <div className="text-center pb-lg border-b border-mute">
            <p className="text-xs uppercase tracking-wider text-body-soft">PoultryOS Traceability</p>
            <h1 className="text-2xl font-bold text-ink mt-xs">Farm-to-Plate Certificate</h1>
            {rec.withdrawal_cleared && (
              <span className="inline-block mt-md px-md py-xs rounded-md text-xs font-semibold bg-success-soft text-success-ink">
                Antibiotic withdrawal cleared
              </span>
            )}
          </div>

          <dl className="grid grid-cols-1 md:grid-cols-2 gap-lg mt-lg text-sm">
            <Field label="Breed" value={rec.breed_name} />
            <Field label="Supplier" value={rec.supplier_name} />
            <Field label="Placed" value={formatDateDDMonYYYY(rec.placement_date)} />
            <Field label="Harvested" value={formatDateDDMonYYYY(rec.harvest_date)} />
            <Field label="Vaccinations" value={String(rec.total_vaccinations ?? 0)} />
            <Field label="Health incidents" value={String(rec.health_incidents_count ?? 0)} />
            <Field label="Buyer" value={rec.buyer_name ?? '—'} />
            <Field label="Verified" value={rec.is_locked ? 'Yes' : 'In progress'} />
          </dl>

          {rec.certificate_pdf_url && (
            <a
              href={rec.certificate_pdf_url}
              target="_blank"
              rel="noopener noreferrer"
              className="btn-primary w-full mt-2xl"
            >
              Download full certificate (PDF)
            </a>
          )}
          <DownloadCertificate record={rec} />

          <p className="text-xs text-body-soft text-center mt-2xl">
            Token: <span className="font-mono">{rec.qr_token}</span>
          </p>
        </div>

        <p className="text-xs text-body-soft text-center mt-lg">
          Powered by PoultryOS · Source of truth for Indian poultry farms
        </p>
      </div>
    </main>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wider text-body-soft">{label}</dt>
      <dd className="text-base font-semibold text-ink mt-xxs">{value}</dd>
    </div>
  );
}
