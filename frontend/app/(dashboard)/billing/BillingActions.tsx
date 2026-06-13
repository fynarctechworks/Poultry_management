'use client';

// =============================================================================
// Phase E — plan change / upgrade + cancel-in-trial.
//   * No live Razorpay subscription yet  -> create-razorpay-subscription (opens
//     Razorpay-hosted checkout via short_url).
//   * Live subscription exists           -> change-plan (prorated switch).
//   * In trial                           -> cancel-subscription is offered.
// =============================================================================

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';

type Cycle = 'monthly' | 'yearly';

export interface PlanOption {
  code: string;
  name: string;
  monthly_price_inr: number;
  yearly_price_inr: number;
}

interface Props {
  plans: PlanOption[];
  currentPlanCode: string | null;
  currentCycle: Cycle;
  hasRazorpaySub: boolean;
  cancellable: boolean;
}

const inr = (n: number) => '₹' + Number(n).toLocaleString('en-IN');

export function BillingActions({ plans, currentPlanCode, currentCycle, hasRazorpaySub, cancellable }: Props) {
  const supabase = createSupabaseBrowserClient();
  const router = useRouter();
  const [cycle, setCycle] = useState<Cycle>(currentCycle);
  const [selected, setSelected] = useState<string>(
    currentPlanCode && plans.some((p) => p.code === currentPlanCode) ? currentPlanCode : plans[0]?.code ?? '',
  );
  const [busy, setBusy] = useState<null | 'change' | 'cancel'>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function token(): Promise<string> {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) throw new Error('Sign in again to continue.');
    return session.access_token;
  }
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';

  async function changeOrUpgrade() {
    setError(null); setNotice(null); setBusy('change');
    try {
      const t = await token();
      const fn = hasRazorpaySub ? 'change-plan' : 'create-razorpay-subscription';
      const res = await fetch(`${base}/functions/v1/${fn}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${t}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan_code: selected, billing_cycle: cycle }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || body?.ok === false) {
        const reason = body?.reason ?? body?.error?.message ?? body?.error;
        if (reason === 'not_configured') throw new Error('Billing is not configured yet. Please try again later.');
        throw new Error(typeof reason === 'string' ? reason : `Request failed (HTTP ${res.status})`);
      }
      if (body?.short_url) { window.location.href = body.short_url; return; }
      setNotice(hasRazorpaySub ? 'Plan updated. The change applies on your next charge.' : 'Subscription created.');
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unexpected error');
    } finally {
      setBusy(null);
    }
  }

  async function cancel() {
    if (!confirm('Cancel your subscription? This is only possible during the trial and cannot be undone.')) return;
    setError(null); setNotice(null); setBusy('cancel');
    try {
      const t = await token();
      const res = await fetch(`${base}/functions/v1/cancel-subscription`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${t}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.reason ?? body?.error ?? `Cancel failed (HTTP ${res.status})`);
      setNotice('Subscription cancelled.');
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unexpected error');
    } finally {
      setBusy(null);
    }
  }

  const price = (p: PlanOption) => (cycle === 'monthly' ? p.monthly_price_inr : p.yearly_price_inr);

  return (
    <div className="card">
      <h2 className="text-lg font-bold text-ink mb-md">{hasRazorpaySub ? 'Change plan' : 'Choose a plan'}</h2>

      <div className="inline-flex bg-canvas-soft rounded-md p-xxs mb-lg" role="radiogroup" aria-label="Billing cycle">
        {(['monthly', 'yearly'] as Cycle[]).map((c) => (
          <button
            key={c}
            type="button"
            role="radio"
            aria-checked={cycle === c}
            onClick={() => setCycle(c)}
            className={`px-md py-xs text-sm font-semibold rounded-sm capitalize ${cycle === c ? 'bg-canvas text-ink shadow-sm' : 'text-body'}`}
          >
            {c}{c === 'yearly' ? ' · save ~17%' : ''}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-md mb-lg">
        {plans.map((p) => {
          const active = selected === p.code;
          const isCurrent = p.code === currentPlanCode;
          return (
            <button
              key={p.code}
              type="button"
              onClick={() => setSelected(p.code)}
              className={`text-left rounded-card border p-md transition-colors ${active ? 'border-primary bg-primary-subtle' : 'border-mute hover:border-primary-dark'}`}
            >
              <div className="flex items-center justify-between">
                <p className="font-semibold text-ink">{p.name}</p>
                {isCurrent && <span className="text-xs px-xs py-xxs rounded-sm bg-success-soft text-success-ink">current</span>}
              </div>
              <p className="text-2xl font-bold text-ink mt-xs">
                {inr(price(p))}<span className="text-sm font-normal text-body">/{cycle === 'monthly' ? 'mo' : 'yr'}</span>
              </p>
            </button>
          );
        })}
      </div>

      <div className="flex items-center gap-md flex-wrap">
        <button onClick={changeOrUpgrade} disabled={busy !== null || !selected} className="btn-primary">
          {busy === 'change' ? 'Working…' : hasRazorpaySub ? 'Update plan' : 'Continue to payment'}
        </button>
        {cancellable && (
          <button onClick={cancel} disabled={busy !== null} className="text-sm font-semibold text-danger hover:underline disabled:opacity-50">
            {busy === 'cancel' ? 'Cancelling…' : 'Cancel subscription'}
          </button>
        )}
      </div>

      {error && <p className="text-sm text-danger mt-md">{error}</p>}
      {notice && <p className="text-sm text-success-ink mt-md">{notice}</p>}
    </div>
  );
}
