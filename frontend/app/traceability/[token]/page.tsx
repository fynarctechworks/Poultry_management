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
      <div className="mx-auto max-w-[640px]">
        <div className="card shadow-subtle">
          {/* Certificate header band — atmospheric orbs + editorial display headline */}
          <div className="relative overflow-hidden rounded-xl pb-lg text-center">
            {/* Atmospheric orbs — decoration only, never content */}
            <div aria-hidden className="orb-mint pointer-events-none absolute -right-10 -top-10 h-[180px] w-[180px] opacity-40 blur-2xl" />
            <div aria-hidden className="orb-peach pointer-events-none absolute -left-10 top-4 h-[140px] w-[140px] opacity-30 blur-2xl" />

            <div className="relative z-10 border-b border-mute pb-lg">
              <p className="text-xs font-semibold uppercase tracking-widest text-muted">
                PoultryOS Traceability
              </p>
              <h1 className="font-display mt-xs text-4xl leading-tight text-ink">
                Farm-to-Plate Certificate
              </h1>
              {rec.withdrawal_cleared && (
                <span className="mt-md inline-block rounded-md bg-success-soft px-md py-xs text-xs font-semibold text-success-ink">
                  Antibiotic withdrawal cleared
                </span>
              )}
            </div>
          </div>

          <dl className="mt-lg grid grid-cols-1 gap-lg text-sm md:grid-cols-2">
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
              className="btn-primary mt-2xl w-full"
            >
              Download full certificate (PDF)
            </a>
          )}
          <DownloadCertificate record={rec} />

          <p className="mt-2xl text-center text-xs text-body-soft">
            Token: <span className="font-mono">{rec.qr_token}</span>
          </p>
        </div>

        <p className="mt-lg text-center text-xs text-body-soft">
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
      <dd className="mt-xxs text-base font-semibold text-ink">{value}</dd>
    </div>
  );
}
