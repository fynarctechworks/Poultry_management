import { requirePlatformPermission, PlatformForbiddenError } from '@/lib/control/guard';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { Forbidden } from '@/components/control/Forbidden';
import { Pagination, parsePage } from '@/components/control/Pagination';
import { RefundButton } from './RefundButton';

export const dynamic = 'force-dynamic';
const PAGE_SIZE = 50;

const rupees = (n: number | string | null | undefined) =>
  n === null || n === undefined ? '—' : `₹${Number(n).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fmtDate = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

interface InvoiceRow {
  id: string; invoice_number: string; status: string; total_inr: number;
  billing_cycle: string; issued_at: string; tenant_id: string;
  tenants: { name: string } | null;
}
interface PaymentRow {
  id: string; amount_inr: number; refunded_amount_inr: number; method: string | null; status: string;
  captured_at: string | null; created_at: string; razorpay_payment_id: string | null; tenant_id: string;
  tenants: { name: string } | null;
}

export default async function AdminBillingPage({
  searchParams,
}: {
  searchParams: { ip?: string; pp?: string };
}) {
  let service;
  try {
    ({ service } = await requirePlatformPermission('billing:read'));
  } catch (e) {
    if (e instanceof PlatformForbiddenError) return <Forbidden message={e.message} />;
    throw e;
  }

  const invPage = parsePage(searchParams.ip);
  const payPage = parsePage(searchParams.pp);

  // Can this operator issue refunds?
  const supabase = createSupabaseServerClient();
  const { data: canManage } = await supabase.rpc('platform_has_permission', { p_perm: 'billing:manage' });

  const [{ data: invoices, count: invCount }, { data: payments, count: payCount }, { data: summaryRaw }] = await Promise.all([
    service.from('invoices').select('id, invoice_number, status, total_inr, billing_cycle, issued_at, tenant_id, tenants(name)', { count: 'exact' }).order('issued_at', { ascending: false }).range((invPage - 1) * PAGE_SIZE, invPage * PAGE_SIZE - 1),
    service.from('payments').select('id, amount_inr, refunded_amount_inr, method, status, captured_at, created_at, razorpay_payment_id, tenant_id, tenants(name)', { count: 'exact' }).order('created_at', { ascending: false }).range((payPage - 1) * PAGE_SIZE, payPage * PAGE_SIZE - 1),
    service.rpc('cc_billing_summary'),
  ]);

  const invRows = (invoices ?? []) as unknown as InvoiceRow[];
  const payRows = (payments ?? []) as unknown as PaymentRow[];
  const invTotal = invCount ?? 0;
  const payTotal = payCount ?? 0;

  // Summary tiles aggregate across the WHOLE ledger (not the current page).
  const summary = (summaryRaw ?? {}) as { collected_net?: number; outstanding?: number; refunded?: number; failed_count?: number };

  const tiles: [string, string][] = [
    ['Collected (net)', rupees(summary.collected_net ?? 0)],
    ['Outstanding', rupees(summary.outstanding ?? 0)],
    ['Refunded', rupees(summary.refunded ?? 0)],
    ['Failed payments', String(summary.failed_count ?? 0)],
  ];

  const badge = (status: string) => {
    const map: Record<string, string> = {
      paid: 'bg-success-soft text-success-ink', captured: 'bg-success-soft text-success-ink',
      issued: 'bg-warning-soft text-warning-ink', failed: 'bg-danger/10 text-danger',
      refunded: 'bg-mute-soft text-body', partially_refunded: 'bg-warning-soft text-warning-ink',
      void: 'bg-mute-soft text-body',
    };
    return map[status] ?? 'bg-mute-soft text-body';
  };

  return (
    <div className="max-w-[1200px]">
      <h2 className="text-2xl font-bold text-ink mb-xs">Billing</h2>
      <p className="text-sm text-body-soft mb-xl">
        Invoices, payments and refunds across all tenants — sourced from the Razorpay webhook ledger.
        {!canManage && ' You have read-only billing access; refunds require billing:manage.'}
      </p>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-lg mb-2xl">
        {tiles.map(([label, value]) => (
          <div key={label} className="bg-canvas border border-mute rounded-card p-lg">
            <p className="text-xs font-semibold uppercase tracking-wide text-body-soft mb-sm">{label}</p>
            <p className="text-2xl font-bold text-ink tabular-nums">{value}</p>
          </div>
        ))}
      </div>

      {/* Invoices */}
      <h3 className="text-sm font-bold text-ink mb-md">Invoices</h3>
      <div className="bg-canvas border border-mute rounded-card overflow-x-auto mb-2xl">
        <table className="w-full text-sm">
          <thead className="bg-canvas-soft border-b border-mute">
            <tr className="text-left text-xs uppercase tracking-wide text-body-soft">
              <th className="px-md py-sm">Invoice</th><th className="px-md py-sm">Tenant</th>
              <th className="px-md py-sm">Issued</th><th className="px-md py-sm">Cycle</th>
              <th className="px-md py-sm text-right">Total</th><th className="px-md py-sm text-center">Status</th>
            </tr>
          </thead>
          <tbody>
            {invRows.length === 0 && <tr><td colSpan={6} className="px-md py-lg text-center text-body-soft">No invoices.</td></tr>}
            {invRows.map((i) => (
              <tr key={i.id} className="border-b border-mute last:border-0">
                <td className="px-md py-sm font-medium text-ink">{i.invoice_number}</td>
                <td className="px-md py-sm text-body">{i.tenants?.name ?? '—'}</td>
                <td className="px-md py-sm text-body">{fmtDate(i.issued_at)}</td>
                <td className="px-md py-sm text-body capitalize">{i.billing_cycle}</td>
                <td className="px-md py-sm text-right tabular-nums text-ink">{rupees(i.total_inr)}</td>
                <td className="px-md py-sm text-center"><span className={`px-sm py-xxs rounded-md text-xs font-semibold capitalize ${badge(i.status)}`}>{i.status}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Pagination page={invPage} pageSize={PAGE_SIZE} total={invTotal} basePath="/admin/billing" params={{ pp: searchParams.pp }} pageKey="ip" />

      {/* Payments */}
      <h3 className="text-sm font-bold text-ink mb-md">Payments</h3>
      <div className="bg-canvas border border-mute rounded-card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-canvas-soft border-b border-mute">
            <tr className="text-left text-xs uppercase tracking-wide text-body-soft">
              <th className="px-md py-sm">Date</th><th className="px-md py-sm">Tenant</th>
              <th className="px-md py-sm">Method</th><th className="px-md py-sm text-right">Amount</th>
              <th className="px-md py-sm text-center">Status</th><th className="px-md py-sm">Reference</th>
              {canManage && <th className="px-md py-sm text-right">Action</th>}
            </tr>
          </thead>
          <tbody>
            {payRows.length === 0 && <tr><td colSpan={canManage ? 7 : 6} className="px-md py-lg text-center text-body-soft">No payments.</td></tr>}
            {payRows.map((p) => (
              <tr key={p.id} className="border-b border-mute last:border-0">
                <td className="px-md py-sm text-body">{fmtDate(p.captured_at ?? p.created_at)}</td>
                <td className="px-md py-sm text-body">{p.tenants?.name ?? '—'}</td>
                <td className="px-md py-sm text-body uppercase">{p.method ?? '—'}</td>
                <td className="px-md py-sm text-right tabular-nums text-ink">{rupees(p.amount_inr)}</td>
                <td className="px-md py-sm text-center"><span className={`px-sm py-xxs rounded-md text-xs font-semibold capitalize ${badge(p.status)}`}>{p.status.replace('_', ' ')}</span></td>
                <td className="px-md py-sm text-body-soft text-xs font-mono">{p.razorpay_payment_id ?? '—'}</td>
                {canManage && (
                  <td className="px-md py-sm text-right">
                    {p.status === 'captured' || p.status === 'partially_refunded'
                      ? <RefundButton paymentId={p.id} maxAmount={Number(p.amount_inr) - Number(p.refunded_amount_inr ?? 0)} />
                      : <span className="text-xs text-body-soft">—</span>}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Pagination page={payPage} pageSize={PAGE_SIZE} total={payTotal} basePath="/admin/billing" params={{ ip: searchParams.ip }} pageKey="pp" />
    </div>
  );
}
