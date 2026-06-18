import Link from 'next/link';
import { ArrowUpRight } from 'lucide-react';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { getBillingSummary } from '@/lib/subscription';
import { InvoiceDownloadButton } from './InvoiceDownloadButton';
import { CancelSubscriptionButton } from './CancelSubscriptionButton';
import { PageHeader } from '@/components/ui/PageHeader';

export const dynamic = 'force-dynamic';

const fmtDate = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';
const inr = (n: number | string | null) =>
  '₹' + Number(n ?? 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const STATUS_STYLES: Record<string, string> = {
  active: 'bg-success-soft text-success-ink',
  trial: 'bg-primary-subtle text-primary-dark',
  past_due: 'bg-warning-soft text-warning-ink',
  suspended: 'bg-danger/10 text-danger',
  cancelled: 'bg-mute-soft text-body',
};

export default async function BillingPage() {
  const supabase = createSupabaseServerClient();
  const summary = await getBillingSummary();

  const [{ data: invoices }, { data: payments }] = await Promise.all([
    supabase.rpc('my_invoices'),
    supabase.from('payments').select('id, amount_inr, method, status, captured_at, created_at, razorpay_payment_id').order('created_at', { ascending: false }).limit(50),
  ]);

  const status = summary?.status ?? 'trial';
  const planName = summary?.plan?.name ?? 'Free';
  const cycle = (summary?.billing_cycle ?? 'monthly') as 'monthly' | 'yearly';
  const renewalLabel = summary?.is_trial ? 'Trial ends' : 'Renews';
  const renewalDate = summary?.is_trial ? summary?.trial_ends_at : summary?.renewal_at;
  const planPrice = summary?.plan
    ? (cycle === 'monthly' ? summary.plan.monthly_price_inr : summary.plan.yearly_price_inr)
    : null;

  return (
    <div className="max-w-[1000px] mx-auto">
      <PageHeader
        eyebrow="Account"
        title="Billing"
        subtitle="Manage your subscription, plan and invoices."
        orbs={['peach', 'rose']}
      />

      {/* Current plan */}
      <div className="card mb-2xl">
        <div className="flex items-start justify-between flex-wrap gap-lg">
          <div className="min-w-[240px]">
            <p className="text-xs uppercase tracking-wider text-body-soft">Current plan</p>
            <div className="flex items-center gap-sm mt-xxs">
              <h2 className="font-display text-2xl text-ink">{planName}</h2>
              <span className={`px-sm py-xxs rounded-md text-xs font-semibold capitalize ${STATUS_STYLES[status] ?? 'bg-mute-soft text-body'}`}>
                {status.replace('_', ' ')}
              </span>
            </div>
            <p className="text-sm text-body mt-sm">
              {summary?.has_subscription ? (
                <>
                  Billed {cycle}
                  {planPrice ? <> · <strong>{inr(planPrice)}</strong></> : null}
                  . {renewalLabel} <strong>{fmtDate(renewalDate ?? null)}</strong>
                  {summary?.days_remaining !== null && summary?.days_remaining !== undefined && (
                    <> · {summary.days_remaining} day{summary.days_remaining === 1 ? '' : 's'} left</>
                  )}
                </>
              ) : (
                <>You&apos;re on the free tier. Upgrade to unlock unlimited farms, WhatsApp, contract farming and more.</>
              )}
            </p>
          </div>

          {/* Plan actions — owner only */}
          {summary?.is_owner && (
            <div className="flex flex-col items-end gap-sm">
              <Link href="/billing/upgrade" className="btn-primary inline-flex items-center gap-sm">
                {summary?.has_subscription ? 'Change plan' : 'Upgrade plan'}
                <ArrowUpRight size={16} />
              </Link>
              {summary?.cancellable && <CancelSubscriptionButton />}
            </div>
          )}
        </div>
      </div>

      {/* Invoice history */}
      <h2 className="text-lg font-bold text-ink mb-md">Invoices</h2>
      <div className="card p-0 overflow-x-auto mb-2xl">
        <table className="w-full text-sm">
          <thead className="bg-canvas-soft border-b border-mute">
            <tr className="text-left text-xs uppercase tracking-wider text-body-soft">
              <th className="px-md py-sm">Invoice</th>
              <th className="px-md py-sm">Date</th>
              <th className="px-md py-sm text-right">Amount</th>
              <th className="px-md py-sm text-center">Status</th>
              <th className="px-md py-sm text-right">PDF</th>
            </tr>
          </thead>
          <tbody>
            {(invoices ?? []).length === 0 && (
              <tr><td colSpan={5} className="px-md py-lg text-center text-body">No invoices yet.</td></tr>
            )}
            {(invoices ?? []).map((inv: Record<string, unknown>) => (
              <tr key={inv.id as string} className="border-b border-mute last:border-0">
                <td className="px-md py-md font-medium text-ink">{inv.invoice_number as string}</td>
                <td className="px-md py-md text-body">{fmtDate(inv.issued_at as string)}</td>
                <td className="px-md py-md text-right tabular-nums text-ink">{inr(inv.total_inr as number)}</td>
                <td className="px-md py-md text-center">
                  <span className={`px-sm py-xxs rounded-md text-xs font-semibold capitalize ${inv.status === 'paid' ? 'bg-success-soft text-success-ink' : inv.status === 'refunded' ? 'bg-mute-soft text-body' : 'bg-warning-soft text-warning-ink'}`}>
                    {inv.status as string}
                  </span>
                </td>
                <td className="px-md py-md text-right"><InvoiceDownloadButton invoiceId={inv.id as string} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Payment history */}
      <h2 className="text-lg font-bold text-ink mb-md">Payments</h2>
      <div className="card p-0 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-canvas-soft border-b border-mute">
            <tr className="text-left text-xs uppercase tracking-wider text-body-soft">
              <th className="px-md py-sm">Date</th>
              <th className="px-md py-sm">Method</th>
              <th className="px-md py-sm text-right">Amount</th>
              <th className="px-md py-sm text-center">Status</th>
              <th className="px-md py-sm">Reference</th>
            </tr>
          </thead>
          <tbody>
            {(payments ?? []).length === 0 && (
              <tr><td colSpan={5} className="px-md py-lg text-center text-body">No payments yet.</td></tr>
            )}
            {(payments ?? []).map((p) => (
              <tr key={p.id} className="border-b border-mute last:border-0">
                <td className="px-md py-md text-body">{fmtDate((p.captured_at ?? p.created_at) as string)}</td>
                <td className="px-md py-md text-body uppercase">{p.method ?? '—'}</td>
                <td className="px-md py-md text-right tabular-nums text-ink">{inr(p.amount_inr)}</td>
                <td className="px-md py-md text-center">
                  <span className={`px-sm py-xxs rounded-md text-xs font-semibold capitalize ${p.status === 'captured' ? 'bg-success-soft text-success-ink' : p.status === 'failed' ? 'bg-danger/10 text-danger' : 'bg-mute-soft text-body'}`}>
                    {p.status}
                  </span>
                </td>
                <td className="px-md py-md text-body-soft text-xs font-mono">{p.razorpay_payment_id ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
