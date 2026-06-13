'use client';

// Control Center refund action. Calls the razorpay-refund edge function with the
// operator's JWT; the function itself re-checks billing:manage and writes a
// platform audit entry. Full refund by default; amount field allows partial.
import { useState } from 'react';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';

export function RefundButton({ paymentId, maxAmount }: { paymentId: string; maxAmount: number }) {
  const supabase = createSupabaseBrowserClient();
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState(String(maxAmount));
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function submit() {
    setBusy(true); setMsg(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error('Sign in again.');
      const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
      const res = await fetch(`${url}/functions/v1/razorpay-refund`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${session.access_token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ payment_id: paymentId, amount_inr: Number(amount), reason: reason || undefined }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || body?.ok === false) {
        if (body?.reason === 'not_configured') throw new Error('Razorpay keys not configured in this environment.');
        throw new Error(body?.reason ?? body?.error ?? `Refund failed (HTTP ${res.status})`);
      }
      setMsg(`Refunded ₹${body.refunded_amount_inr}.`);
      setTimeout(() => window.location.reload(), 1200);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Refund failed');
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="text-xs font-semibold text-primary-dark hover:underline">
        Refund
      </button>
    );
  }
  return (
    <div className="flex flex-col gap-xs items-end">
      <input
        type="number" value={amount} max={maxAmount} min={1} onChange={(e) => setAmount(e.target.value)}
        className="w-24 h-8 px-xs border border-mute rounded-md text-xs text-right"
        aria-label="Refund amount"
      />
      <input
        type="text" value={reason} placeholder="Reason" onChange={(e) => setReason(e.target.value)}
        className="w-32 h-8 px-xs border border-mute rounded-md text-xs"
        aria-label="Refund reason"
      />
      <div className="flex gap-xs">
        <button type="button" onClick={submit} disabled={busy} className="text-xs font-semibold text-danger hover:underline disabled:opacity-50">
          {busy ? '…' : 'Confirm'}
        </button>
        <button type="button" onClick={() => setOpen(false)} className="text-xs text-body-soft hover:underline">Cancel</button>
      </div>
      {msg && <span className="text-xs text-body max-w-[160px] text-right">{msg}</span>}
    </div>
  );
}
