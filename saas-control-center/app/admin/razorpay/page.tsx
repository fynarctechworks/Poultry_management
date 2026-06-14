import Link from 'next/link';
import { requirePlatformPermission, PlatformForbiddenError } from '@/lib/control/guard';
import { Forbidden } from '@/components/control/Forbidden';

export const dynamic = 'force-dynamic';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface RazorpayMetrics {
  generated_at: string;
  gross_captured_30d: number;
  fee_total_30d: number;
  tax_total_30d: number;
  net_captured_30d: number;
  captured_count_30d: number;
  failed_count_30d: number;
  failed_amount_30d: number;
  total_count_30d: number;
  success_rate_30d: number;
  refunded_amount_30d: number;
  refunded_count_30d: number;
  method_distribution: Record<string, number>;
  webhook_total_7d: number;
  webhook_failed_7d: number;
  webhook_failed_24h: number;
  webhook_pending: number;
  active_subscriptions: number;
  attempts_failed_7d: number;
  attempts_failed_amount_7d: number;
  attempts_total_7d: number;
}

interface PaymentRow {
  id: string;
  tenant_id: string;
  razorpay_payment_id: string | null;
  amount_inr: number;
  currency: string | null;
  method: string | null;
  status: string;
  refunded_amount_inr: number | null;
  fee_inr: number | null;
  captured_at: string | null;
  created_at: string;
  tenants: { name: string } | { name: string }[] | null;
}

interface WebhookRow {
  razorpay_event_id: string;
  event_type: string;
  status: string;
  error: string | null;
  processed_at: string | null;
  created_at: string;
}

interface FailedAttemptRow {
  tenant_id: string;
  amount_inr: number;
  status: string;
  failure_reason: string | null;
  attempt_no: number | null;
  created_at: string;
  tenants: { name: string } | { name: string }[] | null;
}

// ---------------------------------------------------------------------------
// Formatting helpers
// ---------------------------------------------------------------------------

function inr(n: number | null | undefined): string {
  if (n === null || n === undefined) return '—';
  return `₹${Number(n).toLocaleString('en-IN')}`;
}

function pct(fraction: number | null | undefined, decimals = 1): string {
  if (fraction === null || fraction === undefined) return '—';
  return `${(fraction * 100).toFixed(decimals)}%`;
}

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
  } catch {
    return iso;
  }
}

/**
 * Resolve the tenant name defensively — `tenants(name)` can come back as a
 * single object, an array (when Supabase infers a 1-to-many), or null.
 */
function resolveTenantName(
  tenants: { name: string } | { name: string }[] | null
): string | null {
  if (!tenants) return null;
  if (Array.isArray(tenants)) return tenants[0]?.name ?? null;
  return tenants.name ?? null;
}

// ---------------------------------------------------------------------------
// Status badge colour maps
// ---------------------------------------------------------------------------

const PAYMENT_STATUS_CLASS: Record<string, string> = {
  captured: 'bg-success-soft text-success-ink',
  paid: 'bg-success-soft text-success-ink',
  authorized: 'bg-pending-soft text-pending-ink',
  created: 'bg-pending-soft text-pending-ink',
  refunded: 'bg-pending-soft text-pending-ink',
  partially_refunded: 'bg-pending-soft text-pending-ink',
  failed: 'bg-warning-soft text-warning-ink',
};

const WEBHOOK_STATUS_CLASS: Record<string, string> = {
  processed: 'bg-success-soft text-success-ink',
  failed: 'bg-warning-soft text-warning-ink',
  received: 'bg-pending-soft text-pending-ink',
  ignored: 'bg-canvas-soft text-body-soft',
};

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default async function RazorpayCommandCenterPage() {
  let service;
  try {
    ({ service } = await requirePlatformPermission('revenue:read'));
  } catch (e) {
    if (e instanceof PlatformForbiddenError) return <Forbidden message={e.message} />;
    throw e;
  }

  const [{ data: mRaw }, { data: payments }, { data: webhooks }, { data: failedAttempts }] =
    await Promise.all([
      service.rpc('compute_razorpay_metrics'),
      service
        .from('payments')
        .select(
          'id, tenant_id, razorpay_payment_id, amount_inr, currency, method, status, refunded_amount_inr, fee_inr, captured_at, created_at, tenants(name)'
        )
        .order('created_at', { ascending: false })
        .limit(25),
      service
        .from('razorpay_webhook_events')
        .select('razorpay_event_id, event_type, status, error, processed_at, created_at')
        .order('created_at', { ascending: false })
        .limit(20),
      service
        .from('payment_attempts')
        .select('tenant_id, amount_inr, status, failure_reason, attempt_no, created_at, tenants(name)')
        .eq('status', 'failed')
        .order('created_at', { ascending: false })
        .limit(15),
    ]);

  const m = (mRaw ?? {}) as RazorpayMetrics;
  const paymentRows = (payments ?? []) as unknown as PaymentRow[];
  const webhookRows = (webhooks ?? []) as unknown as WebhookRow[];
  const failedRows = (failedAttempts ?? []) as unknown as FailedAttemptRow[];

  // Method distribution breakdown
  const methodDist = m.method_distribution ?? {};
  const methodEntries = Object.entries(methodDist);
  const methodTotal = methodEntries.reduce((sum, [, c]) => sum + c, 0);

  const successRateWarn = (m.success_rate_30d ?? 1) < 0.9;
  const hasFailedPayments = (m.failed_count_30d ?? 0) > 0;
  const hasWebhookFailures = (m.webhook_failed_7d ?? 0) > 0;

  return (
    <div className="max-w-[1100px]">
      {/* ------------------------------------------------------------------ */}
      {/* Header                                                               */}
      {/* ------------------------------------------------------------------ */}
      <div className="mb-2xl">
        <h2 className="text-2xl font-bold text-ink mb-xxs">Razorpay Command Center</h2>
        <p className="text-sm text-body-soft">
          Transactions, settlements, refunds and webhook health across all tenants.
        </p>
        {m.generated_at && (
          <p className="text-xs text-body-soft mt-xs">
            Updated {fmtDate(m.generated_at)}
          </p>
        )}
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Row 1 — Primary KPI tiles (4 across)                                */}
      {/* ------------------------------------------------------------------ */}
      <p className="text-xs font-bold uppercase tracking-widest text-body-soft mb-lg">
        30-day overview
      </p>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-lg mb-lg">
        {/* Gross captured */}
        <div className="bg-canvas border border-mute rounded-card p-lg">
          <p className="text-xs font-bold uppercase tracking-widest text-body-soft mb-sm">
            Gross Captured
          </p>
          <p className="text-2xl font-bold text-ink tabular-nums">{inr(m.gross_captured_30d)}</p>
          <p className="text-xs text-body-soft mt-xs tabular-nums">
            Net {inr(m.net_captured_30d)} after fees
          </p>
        </div>

        {/* Success rate */}
        <div className="bg-canvas border border-mute rounded-card p-lg">
          <p className="text-xs font-bold uppercase tracking-widest text-body-soft mb-sm">
            Success Rate
          </p>
          <p
            className={`text-2xl font-bold tabular-nums ${
              successRateWarn ? 'text-warning-ink' : 'text-ink'
            }`}
          >
            {pct(m.success_rate_30d)}
          </p>
          <p className="text-xs text-body-soft mt-xs tabular-nums">
            {m.captured_count_30d ?? 0}/{m.total_count_30d ?? 0} captured
          </p>
        </div>

        {/* Failed payments */}
        <div className="bg-canvas border border-mute rounded-card p-lg">
          <p className="text-xs font-bold uppercase tracking-widest text-body-soft mb-sm">
            Failed Payments
          </p>
          <p
            className={`text-2xl font-bold tabular-nums ${
              hasFailedPayments ? 'text-danger' : 'text-ink'
            }`}
          >
            {m.failed_count_30d ?? 0}
          </p>
          <p className="text-xs text-body-soft mt-xs tabular-nums">
            {inr(m.failed_amount_30d)} lost
          </p>
        </div>

        {/* Refunds */}
        <div className="bg-canvas border border-mute rounded-card p-lg">
          <p className="text-xs font-bold uppercase tracking-widest text-body-soft mb-sm">
            Refunds
          </p>
          <p className="text-2xl font-bold text-ink tabular-nums">
            {inr(m.refunded_amount_30d)}
          </p>
          <p className="text-xs text-body-soft mt-xs tabular-nums">
            {m.refunded_count_30d ?? 0} payment{(m.refunded_count_30d ?? 0) !== 1 ? 's' : ''}
          </p>
        </div>
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Row 1b — Secondary KPI tiles (4 across)                             */}
      {/* ------------------------------------------------------------------ */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-lg mb-2xl">
        {/* Fees paid */}
        <div className="bg-canvas border border-mute rounded-card p-lg">
          <p className="text-xs font-bold uppercase tracking-widest text-body-soft mb-sm">
            Fees Paid
          </p>
          <p className="text-2xl font-bold text-ink tabular-nums">{inr(m.fee_total_30d)}</p>
          <p className="text-xs text-body-soft mt-xs tabular-nums">
            Tax {inr(m.tax_total_30d)}
          </p>
        </div>

        {/* Active subscriptions */}
        <div className="bg-canvas border border-mute rounded-card p-lg">
          <p className="text-xs font-bold uppercase tracking-widest text-body-soft mb-sm">
            Active Subscriptions
          </p>
          <p className="text-2xl font-bold text-ink tabular-nums">
            {m.active_subscriptions ?? 0}
          </p>
          <p className="text-xs text-body-soft mt-xs">Razorpay recurring</p>
        </div>

        {/* Webhook failures */}
        <div className="bg-canvas border border-mute rounded-card p-lg">
          <p className="text-xs font-bold uppercase tracking-widest text-body-soft mb-sm">
            Webhook Failures (7d)
          </p>
          <p
            className={`text-2xl font-bold tabular-nums ${
              hasWebhookFailures ? 'text-danger' : 'text-ink'
            }`}
          >
            {m.webhook_failed_7d ?? 0}
          </p>
          <p className="text-xs text-body-soft mt-xs tabular-nums">
            {m.webhook_pending ?? 0} pending
          </p>
        </div>

        {/* Failed retries */}
        <div className="bg-canvas border border-mute rounded-card p-lg">
          <p className="text-xs font-bold uppercase tracking-widest text-body-soft mb-sm">
            Failed Retries (7d)
          </p>
          <p
            className={`text-2xl font-bold tabular-nums ${
              (m.attempts_failed_7d ?? 0) > 0 ? 'text-warning-ink' : 'text-ink'
            }`}
          >
            {m.attempts_failed_7d ?? 0}
          </p>
          <p className="text-xs text-body-soft mt-xs tabular-nums">
            {inr(m.attempts_failed_amount_7d)} unrecovered
          </p>
        </div>
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Row 2 — Payment method distribution                                 */}
      {/* ------------------------------------------------------------------ */}
      <p className="text-xs font-bold uppercase tracking-widest text-body-soft mb-lg">
        Payment methods (30d)
      </p>
      <div className="bg-canvas border border-mute rounded-card p-lg mb-2xl">
        {methodEntries.length === 0 ? (
          <p className="text-sm text-body-soft">No payment method data available.</p>
        ) : (
          <div className="space-y-md">
            {methodEntries
              .sort(([, a], [, b]) => b - a)
              .map(([method, count]) => {
                const share = methodTotal > 0 ? (count / methodTotal) * 100 : 0;
                return (
                  <div key={method}>
                    <div className="flex items-center justify-between mb-xs">
                      <span className="text-sm font-semibold text-ink capitalize">{method}</span>
                      <span className="text-sm tabular-nums text-body-soft">
                        {count} &middot; {share.toFixed(1)}%
                      </span>
                    </div>
                    <div className="w-full h-2 bg-canvas-soft rounded-full overflow-hidden">
                      <div
                        className="h-full bg-primary rounded-full"
                        style={{ width: `${share}%` }}
                      />
                    </div>
                  </div>
                );
              })}
          </div>
        )}
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Row 3 — Recent transactions table                                   */}
      {/* ------------------------------------------------------------------ */}
      <p className="text-xs font-bold uppercase tracking-widest text-body-soft mb-lg">
        Recent transactions
      </p>
      <div className="bg-canvas border border-mute rounded-card overflow-hidden mb-2xl">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-body-soft border-b border-mute">
              <th className="px-md py-sm font-semibold">Payment ID</th>
              <th className="px-md py-sm font-semibold">Tenant</th>
              <th className="px-md py-sm font-semibold text-right">Amount</th>
              <th className="px-md py-sm font-semibold">Method</th>
              <th className="px-md py-sm font-semibold">Status</th>
              <th className="px-md py-sm font-semibold">Date</th>
            </tr>
          </thead>
          <tbody>
            {paymentRows.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-md py-2xl text-center text-body-soft">
                  No recent transactions.
                </td>
              </tr>
            ) : (
              paymentRows.map((p) => {
                const tenantName = resolveTenantName(p.tenants);
                const statusClass =
                  PAYMENT_STATUS_CLASS[p.status] ?? 'bg-canvas-soft text-body-soft';
                const hasRefund =
                  p.refunded_amount_inr !== null &&
                  p.refunded_amount_inr !== undefined &&
                  p.refunded_amount_inr > 0;
                return (
                  <tr
                    key={p.id}
                    className="border-b border-mute last:border-0 hover:bg-mute-soft"
                  >
                    <td className="px-md py-sm">
                      <span className="font-mono text-xs text-body-soft">
                        {p.razorpay_payment_id ?? p.id.slice(0, 12) + '…'}
                      </span>
                    </td>
                    <td className="px-md py-sm">
                      <Link
                        href={`/admin/tenants/${p.tenant_id}`}
                        className="font-semibold text-primary hover:underline"
                      >
                        {tenantName ?? p.tenant_id.slice(0, 8) + '…'}
                      </Link>
                    </td>
                    <td className="px-md py-sm text-right">
                      <span className="font-semibold text-ink tabular-nums">
                        {inr(p.amount_inr)}
                      </span>
                      {hasRefund && (
                        <span className="ml-sm text-xs bg-pending-soft text-pending-ink rounded-xs px-xs py-px tabular-nums">
                          &#x21A9; {inr(p.refunded_amount_inr)}
                        </span>
                      )}
                    </td>
                    <td className="px-md py-sm capitalize text-body">
                      {p.method ?? '—'}
                    </td>
                    <td className="px-md py-sm">
                      <span
                        className={`text-[11px] font-bold uppercase rounded-xs px-xs py-px ${statusClass}`}
                      >
                        {p.status}
                      </span>
                    </td>
                    <td className="px-md py-sm text-body-soft tabular-nums">
                      {fmtDate(p.created_at)}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Row 4 — Two side-by-side panels                                     */}
      {/* ------------------------------------------------------------------ */}
      <div className="grid md:grid-cols-2 gap-lg mb-2xl">
        {/* Webhook monitoring */}
        <div className="bg-canvas border border-mute rounded-card p-lg">
          <div className="flex items-center justify-between mb-md">
            <p className="text-xs font-bold uppercase tracking-widest text-body-soft">
              Webhook Monitoring
            </p>
            <div className="flex items-center gap-sm">
              {(m.webhook_failed_7d ?? 0) > 0 && (
                <span className="text-[11px] font-bold uppercase bg-warning-soft text-warning-ink rounded-xs px-xs py-px tabular-nums">
                  {m.webhook_failed_7d} failed 7d
                </span>
              )}
              {(m.webhook_pending ?? 0) > 0 && (
                <span className="text-[11px] font-bold uppercase bg-pending-soft text-pending-ink rounded-xs px-xs py-px tabular-nums">
                  {m.webhook_pending} pending
                </span>
              )}
            </div>
          </div>

          {webhookRows.length === 0 ? (
            <p className="text-sm text-body-soft">No recent webhook events.</p>
          ) : (
            <ul className="divide-y divide-mute">
              {webhookRows.map((w) => {
                const statusClass =
                  WEBHOOK_STATUS_CLASS[w.status] ?? 'bg-canvas-soft text-body-soft';
                return (
                  <li key={w.razorpay_event_id} className="py-sm first:pt-0 last:pb-0">
                    <div className="flex items-start justify-between gap-sm">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold text-ink truncate">
                          {w.event_type}
                        </p>
                        {w.status === 'failed' && w.error && (
                          <p className="text-xs text-danger mt-xxs truncate">{w.error}</p>
                        )}
                        <p className="text-xs text-body-soft mt-xxs tabular-nums">
                          {fmtDate(w.created_at)}
                        </p>
                      </div>
                      <span
                        className={`shrink-0 text-[11px] font-bold uppercase rounded-xs px-xs py-px ${statusClass}`}
                      >
                        {w.status}
                      </span>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* Failed payment retries */}
        <div className="bg-canvas border border-mute rounded-card p-lg">
          <div className="flex items-center justify-between mb-md">
            <p className="text-xs font-bold uppercase tracking-widest text-body-soft">
              Failed Payment Retries
            </p>
            {(m.attempts_failed_7d ?? 0) > 0 && (
              <span className="text-[11px] font-bold uppercase bg-warning-soft text-warning-ink rounded-xs px-xs py-px tabular-nums">
                {m.attempts_failed_7d} in 7d
              </span>
            )}
          </div>

          {failedRows.length === 0 ? (
            <p className="text-sm text-body-soft">No failed retries in this window.</p>
          ) : (
            <ul className="divide-y divide-mute">
              {failedRows.map((a, idx) => {
                const tenantName = resolveTenantName(a.tenants);
                return (
                  <li key={`${a.tenant_id}-${idx}`} className="py-sm first:pt-0 last:pb-0">
                    <div className="flex items-start justify-between gap-sm">
                      <div className="min-w-0 flex-1">
                        <Link
                          href={`/admin/tenants/${a.tenant_id}`}
                          className="text-sm font-semibold text-primary hover:underline truncate block"
                        >
                          {tenantName ?? a.tenant_id.slice(0, 8) + '…'}
                        </Link>
                        {a.failure_reason && (
                          <p className="text-xs text-danger mt-xxs truncate">
                            {a.failure_reason}
                          </p>
                        )}
                        <p className="text-xs text-body-soft mt-xxs tabular-nums">
                          Attempt #{a.attempt_no ?? '?'} &middot; {fmtDate(a.created_at)}
                        </p>
                      </div>
                      <span className="shrink-0 font-semibold tabular-nums text-sm text-ink">
                        {inr(a.amount_inr)}
                      </span>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
