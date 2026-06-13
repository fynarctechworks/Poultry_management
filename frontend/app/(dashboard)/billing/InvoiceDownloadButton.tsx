'use client';

import { useState } from 'react';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';

// Calls generate-invoice-pdf (renders + stores the PDF, returns a 1-hour signed
// URL) and opens it. RLS guarantees the owner can only fetch their own invoice.
export function InvoiceDownloadButton({ invoiceId }: { invoiceId: string }) {
  const supabase = createSupabaseBrowserClient();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function download() {
    setError(null);
    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error('Sign in again to download.');
      const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
      const res = await fetch(`${url}/functions/v1/generate-invoice-pdf`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${session.access_token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ invoice_id: invoiceId }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || !body?.signed_url) throw new Error(body?.error ?? `Download failed (HTTP ${res.status})`);
      window.open(body.signed_url, '_blank', 'noopener');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Download failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <span className="inline-flex flex-col items-end">
      <button
        type="button"
        onClick={download}
        disabled={loading}
        className="text-sm font-semibold text-primary-dark hover:underline disabled:opacity-50"
      >
        {loading ? 'Preparing…' : 'Download PDF'}
      </button>
      {error && <span className="text-xs text-danger mt-xxs max-w-[200px] text-right">{error}</span>}
    </span>
  );
}
