'use client';

import { useState } from 'react';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';

type Cycle = 'monthly' | 'yearly';

export function UpgradeButton() {
  const supabase = createSupabaseBrowserClient();
  const [loading, setLoading] = useState(false);
  const [cycle, setCycle] = useState<Cycle>('monthly');
  const [error, setError] = useState<string | null>(null);

  async function upgrade() {
    setError(null);
    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        throw new Error('You need to be signed in to upgrade.');
      }
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
      if (!supabaseUrl) {
        throw new Error('NEXT_PUBLIC_SUPABASE_URL is not configured');
      }
      const res = await fetch(
        `${supabaseUrl}/functions/v1/create-razorpay-subscription`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${session.access_token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ plan_code: 'pro', billing_cycle: cycle }),
        },
      );
      const body = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(body?.error?.message ?? body?.error ?? `Upgrade failed (HTTP ${res.status})`);
      }
      if (body?.ok === false) {
        if (body.reason === 'not_configured') {
          throw new Error('Billing is not yet configured. Try again later or contact support.');
        }
        if (body.reason === 'plan_not_configured') {
          throw new Error('The selected plan is not active. Please refresh and try again.');
        }
        throw new Error(`Upgrade failed: ${body.reason ?? 'unknown'}`);
      }
      if (body?.short_url) {
        window.location.href = body.short_url;
        return;
      }
      throw new Error('Subscription created but no checkout URL returned. Refresh to see updated status.');
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Unexpected error');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="text-right">
      <div className="inline-flex bg-canvas-soft rounded-md p-xxs mb-sm" role="radiogroup" aria-label="Billing cycle">
        <button
          type="button"
          role="radio"
          aria-checked={cycle === 'monthly'}
          onClick={() => setCycle('monthly')}
          className={`px-md py-xs text-sm font-semibold rounded-sm ${cycle === 'monthly' ? 'bg-canvas text-ink shadow-sm' : 'text-body'}`}
        >
          Monthly
        </button>
        <button
          type="button"
          role="radio"
          aria-checked={cycle === 'yearly'}
          onClick={() => setCycle('yearly')}
          className={`px-md py-xs text-sm font-semibold rounded-sm ${cycle === 'yearly' ? 'bg-canvas text-ink shadow-sm' : 'text-body'}`}
        >
          Yearly
        </button>
      </div>
      <div>
        <button onClick={upgrade} disabled={loading} className="btn-primary">
          {loading ? 'Redirecting…' : `Upgrade to Pro (${cycle})`}
        </button>
      </div>
      {error && <p className="text-xs text-danger mt-xs max-w-[320px]">{error}</p>}
    </div>
  );
}
