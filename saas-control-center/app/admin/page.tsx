import { getPlatformContext } from '@/lib/control/guard';
import { NoAccess } from '@/components/control/NoAccess';
import { StatTile } from '@/components/control/dashboard/StatTile';
import { HealthCard } from '@/components/control/dashboard/HealthCard';
import type { HealthStat } from '@/components/control/dashboard/HealthCard';
import { Sparkline } from '@/components/control/dashboard/Sparkline';
import {
  TrendingUp,
  Users,
  CreditCard,
  Receipt,
  Headphones,
  Bug,
  ShieldCheck,
  Activity,
  HeartPulse,
  AlertTriangle,
} from 'lucide-react';

export const dynamic = 'force-dynamic';

// ---------------------------------------------------------------------------
// Types matching the exact shape of compute_platform_dashboard() RPC
// ---------------------------------------------------------------------------

interface TrendPoint {
  date: string;
  mrr_inr: number;
  active_count: number;
  trial_count: number;
}

interface DashboardPayload {
  generated_at: string;
  revenue: {
    mrr_inr: number;
    arr_inr: number;
    arpu_inr: number;
    ltv_inr: number | null;
    cac_inr: number | null;
    churn_rate: number;
    active: number;
    trial: number;
    past_due: number;
    cancelled: number;
    mrr_change_pct: number;
    plan_distribution: Record<string, number>;
  };
  customers: {
    total: number;
    active: number;
    trial: number;
    suspended: number;
    new_30d: number;
    at_risk: number;
    health_green: number;
    health_yellow: number;
    health_red: number;
    avg_health_score: number;
  };
  subscriptions: {
    active: number;
    trialing: number;
    expiring_7d: number;
    trials_ending_7d: number;
    trial_conversion_rate: number;
    cancelled_30d: number;
  };
  payments: {
    failed_7d: number;
    failed_amount_inr: number;
    success_rate_30d: number;
    webhook_failures_24h: number;
  };
  support: {
    open: number;
    escalated: number;
    new_24h: number;
    unassigned: number;
    resolved_7d: number;
  };
  errors: {
    critical_open: number;
    open_total: number;
    new_24h: number;
    affected_tenants: number;
  };
  security: {
    failed_logins_24h: number;
    suspicious_24h: number;
    admin_actions_24h: number;
  };
  platform_health: {
    score: number;
    status: 'healthy' | 'degraded' | 'critical';
  };
  trend: TrendPoint[];
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

function fmtTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    });
  } catch {
    return iso;
  }
}

// ---------------------------------------------------------------------------
// Platform Health hero helpers
// ---------------------------------------------------------------------------

const HEALTH_STATUS_CONFIG = {
  healthy: {
    label: 'Healthy',
    summary: 'All systems operational. No critical issues detected.',
    bannerClass: 'bg-success-soft border-success',
    scoreClass: 'text-success-ink',
    badgeClass: 'bg-success-soft text-success-ink',
    dotClass: 'bg-success',
  },
  degraded: {
    label: 'Degraded',
    summary: 'Some systems are experiencing issues. Investigate open incidents.',
    bannerClass: 'bg-pending-soft border-warning',
    scoreClass: 'text-pending-ink',
    badgeClass: 'bg-pending-soft text-pending-ink',
    dotClass: 'bg-warning',
  },
  critical: {
    label: 'Critical',
    summary: 'Critical systems are impacted. Immediate attention required.',
    bannerClass: 'bg-warning-soft border-danger',
    scoreClass: 'text-danger',
    badgeClass: 'bg-warning-soft text-warning-ink',
    dotClass: 'bg-danger',
  },
} as const;

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default async function AdminOverviewPage() {
  const ctx = await getPlatformContext();
  if (!ctx) return <NoAccess />;

  const { service } = ctx;
  const { data: raw } = await service.rpc('compute_platform_dashboard');

  // Guard: if the RPC returns nothing (e.g. function not yet deployed), show
  // a graceful empty state rather than crashing.
  if (!raw) {
    return (
      <div className="max-w-[1100px]">
        <h2 className="text-2xl font-bold text-ink mb-xs">Command Center</h2>
        <p className="text-sm text-body-soft mb-xl">
          Real-time platform health across revenue, customers, subscriptions, support, security and infrastructure.
        </p>
        <div className="bg-canvas border border-mute rounded-card p-2xl text-center">
          <AlertTriangle size={32} className="mx-auto mb-md text-body-soft" />
          <p className="text-sm font-semibold text-ink mb-xs">Dashboard data unavailable</p>
          <p className="text-sm text-body-soft">
            The <code className="font-mono bg-canvas-soft px-xs py-xxs rounded-xs">compute_platform_dashboard</code> RPC
            returned no data. Ensure the database function is deployed and this operator has execute permission.
          </p>
        </div>
      </div>
    );
  }

  const d = raw as unknown as DashboardPayload;

  // Safely destructure with fallbacks so partial payloads don't crash the page
  const revenue = d.revenue ?? {} as DashboardPayload['revenue'];
  const customers = d.customers ?? {} as DashboardPayload['customers'];
  const subscriptions = d.subscriptions ?? {} as DashboardPayload['subscriptions'];
  const payments = d.payments ?? {} as DashboardPayload['payments'];
  const support = d.support ?? {} as DashboardPayload['support'];
  const errors = d.errors ?? {} as DashboardPayload['errors'];
  const security = d.security ?? {} as DashboardPayload['security'];
  const health = d.platform_health ?? { score: 0, status: 'degraded' as const };
  const trend: TrendPoint[] = Array.isArray(d.trend) ? d.trend : [];

  const healthCfg = HEALTH_STATUS_CONFIG[health.status] ?? HEALTH_STATUS_CONFIG.degraded;

  // ---------------------------------------------------------------------------
  // Health card data
  // ---------------------------------------------------------------------------

  const revenueStats: HealthStat[] = [
    { label: 'MRR', value: inr(revenue.mrr_inr) },
    { label: 'ARR', value: inr(revenue.arr_inr) },
    { label: 'ARPU', value: inr(revenue.arpu_inr) },
    { label: 'Churn', value: pct(revenue.churn_rate), warn: (revenue.churn_rate ?? 0) > 0.05 },
  ];

  const customerStats: HealthStat[] = [
    { label: 'Total', value: customers.total ?? 0 },
    { label: 'At risk', value: customers.at_risk ?? 0, alert: (customers.at_risk ?? 0) > 0 },
    { label: 'Avg health', value: `${customers.avg_health_score ?? 0}/100` },
    { label: 'New (30d)', value: customers.new_30d ?? 0 },
  ];

  const subscriptionStats: HealthStat[] = [
    { label: 'Active', value: subscriptions.active ?? 0 },
    { label: 'Trialing', value: subscriptions.trialing ?? 0 },
    {
      label: 'Expiring 7d',
      value: subscriptions.expiring_7d ?? 0,
      warn: (subscriptions.expiring_7d ?? 0) > 0,
    },
    { label: 'Conversion', value: pct(subscriptions.trial_conversion_rate) },
  ];

  const paymentStats: HealthStat[] = [
    {
      label: 'Failed (7d)',
      value: payments.failed_7d ?? 0,
      alert: (payments.failed_7d ?? 0) > 0,
    },
    { label: 'Failed ₹ (7d)', value: inr(payments.failed_amount_inr), warn: (payments.failed_amount_inr ?? 0) > 0 },
    { label: 'Success rate', value: pct(payments.success_rate_30d) },
    {
      label: 'Webhook fail 24h',
      value: payments.webhook_failures_24h ?? 0,
      alert: (payments.webhook_failures_24h ?? 0) > 0,
    },
  ];

  const supportStats: HealthStat[] = [
    { label: 'Open', value: support.open ?? 0, warn: (support.open ?? 0) > 10 },
    { label: 'Escalated', value: support.escalated ?? 0, alert: (support.escalated ?? 0) > 0 },
    { label: 'Unassigned', value: support.unassigned ?? 0, warn: (support.unassigned ?? 0) > 0 },
    { label: 'Resolved 7d', value: support.resolved_7d ?? 0 },
  ];

  const errorStats: HealthStat[] = [
    {
      label: 'Critical open',
      value: errors.critical_open ?? 0,
      alert: (errors.critical_open ?? 0) > 0,
    },
    { label: 'Total open', value: errors.open_total ?? 0, warn: (errors.open_total ?? 0) > 0 },
    { label: 'New 24h', value: errors.new_24h ?? 0, warn: (errors.new_24h ?? 0) > 0 },
    {
      label: 'Tenants affected',
      value: errors.affected_tenants ?? 0,
      alert: (errors.affected_tenants ?? 0) > 0,
    },
  ];

  const securityStats: HealthStat[] = [
    {
      label: 'Failed logins 24h',
      value: security.failed_logins_24h ?? 0,
      alert: (security.failed_logins_24h ?? 0) > 20,
      warn: (security.failed_logins_24h ?? 0) > 5 && (security.failed_logins_24h ?? 0) <= 20,
    },
    {
      label: 'Suspicious 24h',
      value: security.suspicious_24h ?? 0,
      alert: (security.suspicious_24h ?? 0) > 0,
    },
    { label: 'Admin actions 24h', value: security.admin_actions_24h ?? 0 },
  ];

  // Determine danger / warning accent for each health card
  const hasDangerRevenue = (revenue.churn_rate ?? 0) > 0.1;
  const hasWarnRevenue = !hasDangerRevenue && (revenue.churn_rate ?? 0) > 0.05;

  const hasDangerCustomer = (customers.at_risk ?? 0) > 0;

  const hasWarnSubscription = (subscriptions.expiring_7d ?? 0) > 0 || (subscriptions.trials_ending_7d ?? 0) > 0;

  const hasDangerPayments = (payments.failed_7d ?? 0) > 0 || (payments.webhook_failures_24h ?? 0) > 0;

  const hasDangerSupport = (support.escalated ?? 0) > 0;
  const hasWarnSupport = !hasDangerSupport && (support.open ?? 0) > 5;

  const hasDangerErrors = (errors.critical_open ?? 0) > 0 || (errors.affected_tenants ?? 0) > 0;
  const hasWarnErrors = !hasDangerErrors && (errors.open_total ?? 0) > 0;

  const hasDangerSecurity =
    (security.failed_logins_24h ?? 0) > 20 || (security.suspicious_24h ?? 0) > 0;
  const hasWarnSecurity = !hasDangerSecurity && (security.failed_logins_24h ?? 0) > 5;

  return (
    <div className="max-w-[1200px]">
      {/* ------------------------------------------------------------------ */}
      {/* Page header                                                          */}
      {/* ------------------------------------------------------------------ */}
      <div className="mb-2xl">
        <h2 className="text-2xl font-bold text-ink mb-xxs">Command Center</h2>
        <p className="text-sm text-body-soft">
          Real-time platform health across revenue, customers, subscriptions, support, security and infrastructure.
        </p>
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Row 1 — Platform Health hero banner                                 */}
      {/* ------------------------------------------------------------------ */}
      <div
        className={`border rounded-card p-lg mb-2xl ${healthCfg.bannerClass}`}
      >
        <div className="flex flex-col sm:flex-row sm:items-center gap-md">
          {/* Status indicator + score */}
          <div className="flex items-center gap-md shrink-0">
            <span className={`inline-flex h-3 w-3 rounded-full ${healthCfg.dotClass}`} />
            <span
              className={`text-xs font-bold uppercase tracking-widest px-sm py-xxs rounded-xs ${healthCfg.badgeClass}`}
            >
              {healthCfg.label}
            </span>
            <span className={`text-4xl font-bold tabular-nums leading-none ${healthCfg.scoreClass}`}>
              {health.score}
              <span className="text-lg font-semibold ml-xxs text-body-soft">/100</span>
            </span>
          </div>

          {/* Summary text */}
          <div className="flex-1">
            <p className="text-sm font-semibold text-ink">{healthCfg.summary}</p>
            <p className="text-xs text-body-soft mt-xxs">
              Updated {fmtTime(d.generated_at ?? new Date().toISOString())}
            </p>
          </div>

          {/* Quick distribution chips */}
          <div className="flex flex-wrap gap-sm shrink-0">
            <Chip label="Active" value={customers.active ?? 0} variant="success" />
            <Chip label="Trial" value={customers.trial ?? 0} variant="pending" />
            {(customers.at_risk ?? 0) > 0 && (
              <Chip label="At risk" value={customers.at_risk} variant="danger" />
            )}
          </div>
        </div>
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Row 2 — Top-line KPI tiles                                          */}
      {/* ------------------------------------------------------------------ */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-lg mb-2xl">
        <StatTile
          label="MRR"
          value={inr(revenue.mrr_inr)}
          href="/admin/revenue"
          delta={revenue.mrr_change_pct ?? null}
          icon={TrendingUp}
          subtext="Monthly recurring revenue"
        />
        <StatTile
          label="ARR"
          value={inr(revenue.arr_inr)}
          href="/admin/revenue"
          icon={TrendingUp}
          subtext="Annual run rate"
        />
        <StatTile
          label="Active customers"
          value={customers.active ?? 0}
          href="/admin/tenants"
          icon={Users}
          subtext={`${customers.trial ?? 0} on trial`}
        />
        <StatTile
          label="Trials"
          value={customers.trial ?? 0}
          href="/admin/tenants"
          icon={Users}
          subtext={
            (subscriptions.trials_ending_7d ?? 0) > 0
              ? `${subscriptions.trials_ending_7d} ending in 7d`
              : 'Conversion funnel'
          }
          valueClass={
            (subscriptions.trials_ending_7d ?? 0) > 0 ? 'text-warning-ink' : 'text-ink'
          }
        />
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Row 3 — 8 Health section cards in 2×4 grid                         */}
      {/* ------------------------------------------------------------------ */}
      <div className="mb-xl">
        <p className="text-xs font-bold uppercase tracking-widest text-body-soft mb-lg">
          Module health
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-lg">
          <HealthCard
            title="Revenue"
            href="/admin/revenue"
            icon={TrendingUp}
            stats={revenueStats}
            hasDanger={hasDangerRevenue}
            hasWarning={hasWarnRevenue}
          />
          <HealthCard
            title="Customers"
            href="/admin/success"
            icon={HeartPulse}
            stats={customerStats}
            hasDanger={hasDangerCustomer}
          />
          <HealthCard
            title="Subscriptions"
            href="/admin/subscriptions"
            icon={CreditCard}
            stats={subscriptionStats}
            hasWarning={hasWarnSubscription}
          />
          <HealthCard
            title="Payments"
            href="/admin/billing"
            icon={Receipt}
            stats={paymentStats}
            hasDanger={hasDangerPayments}
          />
          <HealthCard
            title="Support"
            href="/admin/support"
            icon={Headphones}
            stats={supportStats}
            hasDanger={hasDangerSupport}
            hasWarning={hasWarnSupport}
          />
          <HealthCard
            title="Errors"
            href="/admin/errors"
            icon={Bug}
            stats={errorStats}
            hasDanger={hasDangerErrors}
            hasWarning={hasWarnErrors}
          />
          <HealthCard
            title="Security"
            href="/admin/security"
            icon={ShieldCheck}
            stats={securityStats}
            hasDanger={hasDangerSecurity}
            hasWarning={hasWarnSecurity}
          />

          {/* Growth trend sparkline card */}
          <div className="bg-canvas border border-mute rounded-card p-lg flex flex-col gap-md">
            <div className="flex items-center gap-sm">
              <div className="grid place-items-center w-8 h-8 rounded-md bg-primary-subtle text-primary shrink-0">
                <Activity size={16} />
              </div>
              <p className="text-xs font-bold uppercase tracking-wide text-body-soft">
                MRR Trend
              </p>
            </div>

            <Sparkline trend={trend} />

            {trend.length >= 2 && (
              <div className="flex justify-between text-[10px] text-body-soft tabular-nums pt-xs border-t border-mute">
                <span>
                  Active: {trend[trend.length - 1]?.active_count ?? 0}
                </span>
                <span>
                  Trial: {trend[trend.length - 1]?.trial_count ?? 0}
                </span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Footer: meta info                                                   */}
      {/* ------------------------------------------------------------------ */}
      <p className="text-xs text-body-soft text-right mt-2xl">
        Viewing as {ctx.email} &middot; {ctx.roleName} &middot; data via{' '}
        <code className="font-mono bg-canvas-soft px-xs py-xxs rounded-xs text-[10px]">
          compute_platform_dashboard()
        </code>
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Small inline helper — status distribution chips in the hero banner
// ---------------------------------------------------------------------------
function Chip({
  label,
  value,
  variant,
}: {
  label: string;
  value: number;
  variant: 'success' | 'pending' | 'danger';
}) {
  const cls =
    variant === 'success'
      ? 'bg-success-soft text-success-ink'
      : variant === 'danger'
      ? 'bg-warning-soft text-warning-ink'
      : 'bg-pending-soft text-pending-ink';

  return (
    <span className={`inline-flex items-center gap-xxs px-sm py-xxs rounded-xs text-xs font-bold tabular-nums ${cls}`}>
      {value} {label}
    </span>
  );
}
