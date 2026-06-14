import { requirePlatformPermission, PlatformForbiddenError } from '@/lib/control/guard';
import { Forbidden } from '@/components/control/Forbidden';
import { BarSeries } from '@/components/control/analytics/BarSeries';
import { FunnelBars } from '@/components/control/analytics/FunnelBars';
import { CohortGrid } from '@/components/control/analytics/CohortGrid';
import { ActivityTrend } from '@/components/control/analytics/ActivityTrend';

export const dynamic = 'force-dynamic';

// ---------------------------------------------------------------------------
// Types — exact contract from compute_analytics_overview()
// ---------------------------------------------------------------------------

interface GrowthPoint {
  month: string;        // "2026-01"
  signups: number;
  cumulative: number;
}

interface FunnelData {
  signups: number;
  trial_started: number;
  trial_converted: number;
  active: number;
  conversion_rate: number;  // fraction 0–1
}

interface CohortRow {
  cohort: string;           // "2026-01"
  size: number;
  active: number;
  retention_pct: number;    // 0–100 integer
}

interface PlanMixRow {
  plan: string;
  count: number;
  mrr: number;
}

interface RevenueData {
  mrr_first: number;
  mrr_last: number;
  arr_last: number;
  growth_pct: number;   // already a percent (e.g. 133.2)
}

interface EngagementData {
  events_30d: number;
  events_7d: number;
  active_tenants_30d: number;
  active_tenants_24h: number;
  avg_events_per_active_tenant: number;
}

interface TopEventRow {
  event_name: string;
  count: number;
  tenants: number;
}

interface ActivityPoint {
  date: string;         // "2026-06-14"
  events: number;
  active_tenants: number;
}

interface AnalyticsOverview {
  generated_at: string;
  growth: GrowthPoint[];
  funnel: FunnelData;
  cohorts: CohortRow[];
  plan_mix: PlanMixRow[];
  revenue: RevenueData;
  engagement: EngagementData;
  top_events: TopEventRow[];
  activity_trend: ActivityPoint[];
}

// ---------------------------------------------------------------------------
// Formatting helpers
// ---------------------------------------------------------------------------

function inr(n: number | null | undefined): string {
  if (n === null || n === undefined) return '—';
  return `₹${Number(n).toLocaleString('en-IN')}`;
}

/** fraction × 100 → "69.0%" */
function pct(fraction: number | null | undefined, decimals = 1): string {
  if (fraction === null || fraction === undefined) return '—';
  return `${(fraction * 100).toFixed(decimals)}%`;
}

/** Already-a-percent value → "133.2%" */
function pctRaw(value: number | null | undefined, decimals = 1): string {
  if (value === null || value === undefined) return '—';
  return `${Number(value).toFixed(decimals)}%`;
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

function num(n: number | null | undefined): string {
  if (n === null || n === undefined) return '—';
  return Number(n).toLocaleString('en-IN');
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default async function AnalyticsCommandCenterPage() {
  let service;
  try {
    ({ service } = await requirePlatformPermission('revenue:read'));
  } catch (e) {
    if (e instanceof PlatformForbiddenError) return <Forbidden message={e.message} />;
    throw e;
  }

  const { data: raw } = await service.rpc('compute_analytics_overview');

  // Guard: graceful empty state when RPC returns null
  if (!raw) {
    return (
      <div className="max-w-[1100px]">
        <div className="mb-2xl">
          <h2 className="text-2xl font-bold text-ink mb-xxs">Analytics Command Center</h2>
          <p className="text-sm text-body-soft">
            Growth, conversion, retention and product engagement across the platform.
          </p>
        </div>
        <div className="bg-canvas border border-mute rounded-card p-2xl text-center">
          <p className="text-sm font-semibold text-ink mb-xs">Analytics data unavailable</p>
          <p className="text-sm text-body-soft">
            The{' '}
            <code className="font-mono bg-canvas-soft px-xs py-xxs rounded-xs">
              compute_analytics_overview
            </code>{' '}
            RPC returned no data. Ensure the database function is deployed and this operator
            has execute permission.
          </p>
        </div>
      </div>
    );
  }

  const d = raw as unknown as AnalyticsOverview;

  // Safe destructuring with fallbacks
  const growth: GrowthPoint[]     = Array.isArray(d.growth) ? d.growth : [];
  const funnel: FunnelData        = d.funnel ?? { signups: 0, trial_started: 0, trial_converted: 0, active: 0, conversion_rate: 0 };
  const cohorts: CohortRow[]      = Array.isArray(d.cohorts) ? d.cohorts : [];
  const planMix: PlanMixRow[]     = Array.isArray(d.plan_mix) ? d.plan_mix : [];
  const revenue: RevenueData      = d.revenue ?? { mrr_first: 0, mrr_last: 0, arr_last: 0, growth_pct: 0 };
  const eng: EngagementData       = d.engagement ?? { events_30d: 0, events_7d: 0, active_tenants_30d: 0, active_tenants_24h: 0, avg_events_per_active_tenant: 0 };
  const topEvents: TopEventRow[]  = Array.isArray(d.top_events) ? d.top_events : [];
  const actTrend: ActivityPoint[] = Array.isArray(d.activity_trend) ? d.activity_trend : [];

  // Derived values
  const mrrGrowthUp = (revenue.growth_pct ?? 0) >= 0;
  const maxEventCount = topEvents.length > 0 ? Math.max(...topEvents.map((e) => e.count), 1) : 1;
  const maxPlanCount  = planMix.length > 0   ? Math.max(...planMix.map((p) => p.count), 1)  : 1;

  return (
    <div className="max-w-[1100px]">
      {/* ------------------------------------------------------------------ */}
      {/* Header                                                               */}
      {/* ------------------------------------------------------------------ */}
      <div className="mb-2xl">
        <h2 className="text-2xl font-bold text-ink mb-xxs">Analytics Command Center</h2>
        <p className="text-sm text-body-soft">
          Growth, conversion, retention and product engagement across the platform.
        </p>
        {d.generated_at && (
          <p className="text-xs text-body-soft mt-xs">
            Updated {fmtDate(d.generated_at)}
          </p>
        )}
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Row 1 — KPI tiles                                                   */}
      {/* ------------------------------------------------------------------ */}
      <p className="text-xs font-bold uppercase tracking-widest text-body-soft mb-lg">
        Platform overview
      </p>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-lg mb-2xl">
        {/* Total signups */}
        <div className="bg-canvas border border-mute rounded-card p-lg">
          <p className="text-xs font-bold uppercase tracking-widest text-body-soft mb-sm">
            Total Signups
          </p>
          <p className="text-2xl font-bold text-ink tabular-nums">
            {num(funnel.signups)}
          </p>
          <p className="text-xs text-body-soft mt-xs">All-time registrations</p>
        </div>

        {/* Active customers */}
        <div className="bg-canvas border border-mute rounded-card p-lg">
          <p className="text-xs font-bold uppercase tracking-widest text-body-soft mb-sm">
            Active Customers
          </p>
          <p className="text-2xl font-bold text-success-ink tabular-nums">
            {num(funnel.active)}
          </p>
          <p className="text-xs text-body-soft mt-xs">
            of {num(funnel.signups)} signups
          </p>
        </div>

        {/* Trial conversion */}
        <div className="bg-canvas border border-mute rounded-card p-lg">
          <p className="text-xs font-bold uppercase tracking-widest text-body-soft mb-sm">
            Trial Conversion
          </p>
          <p
            className={`text-2xl font-bold tabular-nums ${
              (funnel.conversion_rate ?? 0) >= 0.5
                ? 'text-success-ink'
                : (funnel.conversion_rate ?? 0) >= 0.3
                ? 'text-pending-ink'
                : 'text-warning-ink'
            }`}
          >
            {pct(funnel.conversion_rate)}
          </p>
          <p className="text-xs text-body-soft mt-xs tabular-nums">
            {num(funnel.trial_converted)} converted
          </p>
        </div>

        {/* MRR growth */}
        <div className="bg-canvas border border-mute rounded-card p-lg">
          <p className="text-xs font-bold uppercase tracking-widest text-body-soft mb-sm">
            MRR Growth
          </p>
          <p
            className={`text-2xl font-bold tabular-nums flex items-baseline gap-xs ${
              mrrGrowthUp ? 'text-success-ink' : 'text-warning-ink'
            }`}
          >
            <span>{mrrGrowthUp ? '▲' : '▼'}</span>
            <span>{pctRaw(revenue.growth_pct)}</span>
          </p>
          <p className="text-xs text-body-soft mt-xs tabular-nums">
            {inr(revenue.mrr_first)} → {inr(revenue.mrr_last)}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-lg mb-2xl">
        {/* Active tenants 30d */}
        <div className="bg-canvas border border-mute rounded-card p-lg">
          <p className="text-xs font-bold uppercase tracking-widest text-body-soft mb-sm">
            Active Tenants (30d)
          </p>
          <p className="text-2xl font-bold text-ink tabular-nums">
            {num(eng.active_tenants_30d)}
          </p>
          <p className="text-xs text-body-soft mt-xs tabular-nums">
            {num(eng.active_tenants_24h)} in last 24 h
          </p>
        </div>

        {/* Events 30d */}
        <div className="bg-canvas border border-mute rounded-card p-lg">
          <p className="text-xs font-bold uppercase tracking-widest text-body-soft mb-sm">
            Events (30d)
          </p>
          <p className="text-2xl font-bold text-ink tabular-nums">
            {num(eng.events_30d)}
          </p>
          <p className="text-xs text-body-soft mt-xs tabular-nums">
            {num(eng.events_7d)} in last 7 d
          </p>
        </div>

        {/* Avg events / tenant */}
        <div className="bg-canvas border border-mute rounded-card p-lg">
          <p className="text-xs font-bold uppercase tracking-widest text-body-soft mb-sm">
            Avg Events / Tenant
          </p>
          <p className="text-2xl font-bold text-ink tabular-nums">
            {Number(eng.avg_events_per_active_tenant ?? 0).toFixed(1)}
          </p>
          <p className="text-xs text-body-soft mt-xs">Product engagement depth</p>
        </div>
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Row 2 — Tenant growth chart                                          */}
      {/* ------------------------------------------------------------------ */}
      <p className="text-xs font-bold uppercase tracking-widest text-body-soft mb-lg">
        Tenant growth
      </p>
      <div className="bg-canvas border border-mute rounded-card p-lg mb-2xl">
        <div className="flex items-start justify-between mb-md gap-lg">
          <div>
            <p className="text-sm font-semibold text-ink">Monthly Signups &amp; Cumulative Growth</p>
            <p className="text-xs text-body-soft mt-xxs">
              Bars = new signups per month · Line = cumulative tenant count
            </p>
          </div>
          <div className="flex items-center gap-lg shrink-0">
            <div className="flex items-center gap-xs">
              <span className="inline-block w-3 h-3 rounded-sm bg-primary opacity-80" />
              <span className="text-xs text-body-soft">New signups</span>
            </div>
            <div className="flex items-center gap-xs">
              <span className="inline-block w-5 h-0.5 bg-primary-dark" />
              <span className="text-xs text-body-soft">Cumulative</span>
            </div>
          </div>
        </div>
        <BarSeries data={growth} />
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Row 3 — Funnel + Plan mix                                            */}
      {/* ------------------------------------------------------------------ */}
      <div className="grid md:grid-cols-2 gap-lg mb-2xl">
        {/* Conversion funnel */}
        <div className="bg-canvas border border-mute rounded-card p-lg">
          <p className="text-xs font-bold uppercase tracking-widest text-body-soft mb-md">
            Conversion Funnel
          </p>
          <FunnelBars
            signups={funnel.signups}
            trialStarted={funnel.trial_started}
            trialConverted={funnel.trial_converted}
            active={funnel.active}
          />
          <div className="mt-lg pt-md border-t border-mute flex items-center gap-sm">
            <span className="text-xs text-body-soft">Overall conversion:</span>
            <span
              className={`text-xs font-bold tabular-nums px-sm py-xxs rounded-xs ${
                (funnel.conversion_rate ?? 0) >= 0.5
                  ? 'bg-success-soft text-success-ink'
                  : 'bg-pending-soft text-pending-ink'
              }`}
            >
              {pct(funnel.conversion_rate)}
            </span>
            <span className="text-xs text-body-soft">
              ({num(funnel.trial_converted)} / {num(funnel.signups)} signups)
            </span>
          </div>
        </div>

        {/* Plan mix */}
        <div className="bg-canvas border border-mute rounded-card p-lg">
          <p className="text-xs font-bold uppercase tracking-widest text-body-soft mb-md">
            Plan Mix
          </p>
          {planMix.length === 0 ? (
            <p className="text-sm text-body-soft">No plan data available.</p>
          ) : (
            <div className="space-y-md">
              {planMix.map((p) => {
                const share = maxPlanCount > 0 ? (p.count / maxPlanCount) * 100 : 0;
                return (
                  <div key={p.plan}>
                    <div className="flex items-center justify-between mb-xs">
                      <span className="text-sm font-semibold text-ink">{p.plan}</span>
                      <div className="flex items-center gap-sm">
                        <span className="text-xs text-body-soft tabular-nums">
                          {p.count} tenant{p.count !== 1 ? 's' : ''}
                        </span>
                        <span className="text-xs font-semibold text-ink tabular-nums">
                          {inr(p.mrr)}/mo
                        </span>
                      </div>
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

              {/* Plan mix totals */}
              <div className="pt-md border-t border-mute flex items-center justify-between">
                <span className="text-xs text-body-soft">Total MRR (from plan mix)</span>
                <span className="text-sm font-bold text-ink tabular-nums">
                  {inr(planMix.reduce((s, p) => s + (p.mrr ?? 0), 0))}
                </span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Row 4 — Cohort retention grid                                        */}
      {/* ------------------------------------------------------------------ */}
      <p className="text-xs font-bold uppercase tracking-widest text-body-soft mb-lg">
        Cohort retention
      </p>
      <div className="bg-canvas border border-mute rounded-card overflow-hidden mb-2xl">
        <div className="px-lg pt-lg pb-sm">
          <p className="text-sm font-semibold text-ink">Signup Cohort Retention</p>
          <p className="text-xs text-body-soft mt-xxs">
            Tenants grouped by signup month — how many are still active today.
            <span className="ml-sm">
              <span className="inline-block px-xs py-px rounded-xs text-[10px] font-bold bg-success-soft text-success-ink mr-xs">Green ≥80%</span>
              <span className="inline-block px-xs py-px rounded-xs text-[10px] font-bold bg-pending-soft text-pending-ink mr-xs">Yellow 50–79%</span>
              <span className="inline-block px-xs py-px rounded-xs text-[10px] font-bold bg-warning-soft text-warning-ink">Red &lt;50%</span>
            </span>
          </p>
        </div>
        <CohortGrid cohorts={cohorts} />
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Row 5 — Feature adoption + Activity trend                            */}
      {/* ------------------------------------------------------------------ */}
      <div className="grid md:grid-cols-2 gap-lg mb-2xl">
        {/* Feature adoption / top events */}
        <div className="bg-canvas border border-mute rounded-card p-lg">
          <p className="text-xs font-bold uppercase tracking-widest text-body-soft mb-md">
            Feature Adoption — Top Events
          </p>
          {topEvents.length === 0 ? (
            <p className="text-sm text-body-soft">No event data available.</p>
          ) : (
            <ul className="divide-y divide-mute">
              {topEvents.map((ev) => {
                const relShare    = maxEventCount > 0 ? (ev.count / maxEventCount) * 100 : 0;
                const adoptionPct = (eng.active_tenants_30d ?? 0) > 0
                  ? (ev.tenants / eng.active_tenants_30d) * 100
                  : 0;
                return (
                  <li key={ev.event_name} className="py-sm first:pt-0 last:pb-0">
                    <div className="flex items-start justify-between gap-sm mb-xs">
                      <span className="text-sm font-semibold text-ink leading-snug">
                        {ev.event_name.replace(/_/g, ' ')}
                      </span>
                      <span className="shrink-0 text-sm font-bold tabular-nums text-ink">
                        {num(ev.count)}
                      </span>
                    </div>

                    {/* Relative bar */}
                    <div className="w-full h-1.5 bg-canvas-soft rounded-full overflow-hidden mb-xs">
                      <div
                        className="h-full bg-primary-dark rounded-full"
                        style={{ width: `${relShare}%` }}
                      />
                    </div>

                    <div className="flex items-center gap-sm">
                      <span
                        className={`text-[11px] font-bold px-xs py-px rounded-xs tabular-nums ${
                          adoptionPct >= 80
                            ? 'bg-success-soft text-success-ink'
                            : adoptionPct >= 50
                            ? 'bg-pending-soft text-pending-ink'
                            : 'bg-canvas-soft text-body-soft'
                        }`}
                      >
                        {ev.tenants}/{eng.active_tenants_30d ?? 0} tenants
                      </span>
                      <span className="text-xs text-body-soft tabular-nums">
                        {adoptionPct.toFixed(0)}% adoption
                      </span>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* Activity trend — 14-day SVG bars */}
        <div className="bg-canvas border border-mute rounded-card p-lg">
          <div className="flex items-start justify-between mb-md gap-sm">
            <div>
              <p className="text-xs font-bold uppercase tracking-widest text-body-soft mb-xxs">
                Activity Trend — 14 Days
              </p>
              <p className="text-sm font-semibold text-ink">Daily Event Volume</p>
            </div>
            <div className="shrink-0 text-right">
              <p className="text-xs text-body-soft">Active tenants (now)</p>
              <p className="text-lg font-bold text-ink tabular-nums">
                {num(eng.active_tenants_24h)}
              </p>
            </div>
          </div>

          <ActivityTrend data={actTrend} />

          <div className="mt-md pt-md border-t border-mute flex items-center gap-lg">
            <div className="flex items-center gap-xs">
              <span className="inline-block w-3 h-3 rounded-sm bg-primary opacity-70" />
              <span className="text-xs text-body-soft">Daily events</span>
            </div>
            <div className="flex items-center gap-xs">
              <span className="inline-block w-5 h-px border-t-2 border-dashed border-success" />
              <span className="text-xs text-body-soft">Active tenants</span>
            </div>
          </div>

          {actTrend.length > 0 && (
            <div className="mt-sm flex items-center justify-between text-xs text-body-soft tabular-nums">
              <span>7d events: {num(eng.events_7d)}</span>
              <span>30d events: {num(eng.events_30d)}</span>
            </div>
          )}
        </div>
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Revenue footnote                                                     */}
      {/* ------------------------------------------------------------------ */}
      <div className="bg-canvas border border-mute rounded-card p-lg mb-2xl">
        <p className="text-xs font-bold uppercase tracking-widest text-body-soft mb-md">
          Revenue Trajectory
        </p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-lg">
          <div>
            <p className="text-xs text-body-soft mb-xxs">MRR (period start)</p>
            <p className="text-lg font-bold text-ink tabular-nums">{inr(revenue.mrr_first)}</p>
          </div>
          <div>
            <p className="text-xs text-body-soft mb-xxs">MRR (latest)</p>
            <p className="text-lg font-bold text-ink tabular-nums">{inr(revenue.mrr_last)}</p>
          </div>
          <div>
            <p className="text-xs text-body-soft mb-xxs">ARR (latest)</p>
            <p className="text-lg font-bold text-ink tabular-nums">{inr(revenue.arr_last)}</p>
          </div>
          <div>
            <p className="text-xs text-body-soft mb-xxs">MRR Growth</p>
            <p
              className={`text-lg font-bold tabular-nums ${
                mrrGrowthUp ? 'text-success-ink' : 'text-warning-ink'
              }`}
            >
              {mrrGrowthUp ? '▲' : '▼'} {pctRaw(revenue.growth_pct)}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
