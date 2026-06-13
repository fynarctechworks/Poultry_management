'use client';

// Cancel-in-trial action. Cancelling is only allowed while the subscription is
// still in its trial window (the server RPC enforces this too).

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';

export function CancelSubscriptionButton() {
  const supabase = createSupabaseBrowserClient();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function cancel() {
    if (!confirm('Cancel your subscription? This is only possible during the trial and cannot be undone.')) return;
    setError(null);
    setBusy(true);
    try {
      const { data, error: fnErr } = await supabase.functions.invoke('cancel-subscription', { body: {} });
      if (fnErr) throw fnErr;
      if (data?.ok === false || data?.error) throw new Error(data?.reason ?? data?.error ?? 'Cancel failed.');
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unexpected error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <button onClick={cancel} disabled={busy} className="text-sm font-semibold text-danger hover:underline disabled:opacity-50">
        {busy ? 'Cancelling…' : 'Cancel subscription'}
      </button>
      {error && <p className="text-xs text-danger mt-xs">{error}</p>}
    </div>
  );
}
