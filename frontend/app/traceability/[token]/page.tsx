import { notFound } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { formatDateDDMonYYYY } from '@/lib/utils';
import { DownloadCertificate } from './DownloadCertificate';

export const dynamic = 'force-dynamic';

// Shape returned by the get_traceability_by_token() RPC. The generated client
// types the SECURITY DEFINER RPC result as `{}`, so we narrow it here.
interface TraceRecord {
  qr_token: string;
  supplier_name: string;
  breed_name: string;
  placement_date: string;
  harvest_date: string | null;
  total_vaccinations: number | null;
  health_incidents_count: number | null;
  withdrawal_cleared: boolean;
  buyer_name: string | null;
  is_locked: boolean;
  certificate_pdf_url: string | null;
}

export default async function TraceabilityPage({ params }: { params: { token: string } }) {
  const supabase = createSupabaseServerClient();

  // Token-scoped accessor (SECURITY DEFINER). The anon role has no direct read
  // on traceability_records — this RPC returns at most one row for an exact
  // token, so records cannot be enumerated.
  const { data } = await supabase
    .rpc('get_traceability_by_token', { p_token: params.token })
    .maybeSingle();

  const rec = data as TraceRecord | null;
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
