'use client';

// =============================================================================
// Phase D — global subscription banners (read-only / grace / renewal reminder).
// Rendered once at the top of the dashboard shell from the server layout, which
// passes the already-fetched billing summary. Client-side only for the dismiss
// affordance on the soft renewal reminder; the hard read-only/grace banners are
// not dismissible.
// =============================================================================

import { useState } from 'react';
import Link from 'next/link';

interface Props {
  status: string;
  isPaid: boolean;
  canWrite: boolean;
  daysRemaining: number | null;
  renewalAt: string | null;
  planName: string | null;
}

function fmtDate(iso: string | null): string {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

export function SubscriptionBanners({ status, isPaid, canWrite, daysRemaining, renewalAt, planName }: Props) {
  const [dismissed, setDismissed] = useState(false);

  // 1. HARD: app is view-only (expired / suspended / past grace). Not dismissible.
  if (!canWrite) {
    return (
      <div className="mb-lg rounded-card border border-danger/30 bg-danger/5 px-lg py-md flex items-start gap-md" role="alert">
        <span aria-hidden className="text-xl leading-none">🔒</span>
        <div className="flex-1">
          <p className="font-semibold text-danger">View-only mode — your subscription has ended</p>
          <p className="text-sm text-body mt-xxs">
            Your data is safe and fully visible, but creating or editing is paused until you renew.
          </p>
        </div>
        <Link href="/billing" className="btn-primary !min-h-[36px] !py-xs whitespace-nowrap">Renew now</Link>
      </div>
    );
  }

  // 2. WARNING: payment failed, in grace window (still paid, status past_due).
  if (isPaid && status === 'past_due') {
    return (
      <div className="mb-lg rounded-card border border-warning/40 bg-warning-soft px-lg py-md flex items-start gap-md" role="alert">
        <span aria-hidden className="text-xl leading-none">⚠️</span>
        <div className="flex-1">
          <p className="font-semibold text-warning-ink">Payment failed — grace period active</p>
          <p className="text-sm text-warning-ink/80 mt-xxs">
            We couldn&apos;t charge your last renewal. Update your payment method before the grace period ends to avoid losing edit access.
          </p>
        </div>
        <Link href="/billing" className="btn-primary !min-h-[36px] !py-xs whitespace-nowrap">Fix payment</Link>
      </div>
    );
  }

  // 3. SOFT: renewal reminder at 7 / 3 / 1 / expiry-day. Dismissible.
  if (isPaid && daysRemaining !== null && daysRemaining <= 7 && !dismissed) {
    const urgent = daysRemaining <= 1;
    const dayLabel = daysRemaining <= 0 ? 'today' : daysRemaining === 1 ? 'in 1 day' : `in ${daysRemaining} days`;
    return (
      <div
        className={`mb-lg rounded-card border px-lg py-sm flex items-center gap-md ${
          urgent ? 'border-warning/40 bg-warning-soft' : 'border-primary/20 bg-primary-subtle'
        }`}
        role="status"
      >
        <span aria-hidden>{urgent ? '⏰' : '🔔'}</span>
        <p className={`flex-1 text-sm ${urgent ? 'text-warning-ink' : 'text-ink'}`}>
          Your <strong>{planName ?? 'subscription'}</strong> renews {dayLabel}
          {renewalAt ? ` (${fmtDate(renewalAt)})` : ''}. Keep your farm running without interruption.
        </p>
        <Link href="/billing" className="text-sm font-semibold text-primary-dark hover:underline whitespace-nowrap">Manage</Link>
        <button
          type="button"
          onClick={() => setDismissed(true)}
          className="text-body-soft hover:text-ink text-lg leading-none px-xs"
          aria-label="Dismiss"
        >
          ×
        </button>
      </div>
    );
  }

  return null;
}
