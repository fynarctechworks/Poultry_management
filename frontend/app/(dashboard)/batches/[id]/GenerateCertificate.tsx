'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';

// Web parity with mobile (`mobile-app/app/batches/[id].tsx` generateTraceability):
// the web could list & share traceability records but had no way to *create* one,
// so a web-only owner could never issue a certificate. This calls the same
// owner-gated `create_traceability_record` RPC (which also flips a harvested batch
// to closed, firing lock_traceability_on_close).
export function GenerateCertificate({
  batchId,
  existingToken,
  isLocked,
}: {
  batchId: string;
  existingToken: string | null;
  isLocked: boolean;
}) {
  const router = useRouter();
  const supabase = createSupabaseBrowserClient();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function generate() {
    setError(null);
    setLoading(true);
    const { error } = await supabase.rpc('create_traceability_record', { p_batch_id: batchId });
    setLoading(false);
    if (error) return setError(error.message);
    router.refresh();
  }

  if (existingToken) {
    return (
      <div className="card space-y-sm">
        <h3 className="font-bold text-ink">Farm-to-plate certificate</h3>
        <p className="text-sm text-body">
          {isLocked
            ? 'Certificate issued and locked. Share the public provenance link with your buyer.'
            : 'Certificate issued. It locks automatically once the batch is closed.'}
        </p>
        <Link href={`/traceability/${existingToken}`} className="btn-outline inline-flex w-fit">
          View &amp; share certificate
        </Link>
      </div>
    );
  }

  return (
    <div className="card space-y-sm">
      <h3 className="font-bold text-ink">Farm-to-plate certificate</h3>
      <p className="text-sm text-body">
        Issue a public provenance certificate (supplier, vaccinations, withdrawal clearance) you can
        share with buyers via link or QR. Generating it closes this batch.
      </p>
      <button onClick={generate} disabled={loading} className="btn-primary w-fit">
        {loading ? 'Generating…' : 'Generate certificate'}
      </button>
      {error && <p className="text-sm text-danger">{error}</p>}
    </div>
  );
}
