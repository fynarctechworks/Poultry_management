import Link from 'next/link';
import { requirePlatformPermission, PlatformForbiddenError } from '@/lib/control/guard';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { Forbidden } from '@/components/control/Forbidden';
import { SuccessActions, CompleteFollowupButton } from '@/components/control/SuccessActions';

export const dynamic = 'force-dynamic';

// ── helpers ──────────────────────────────────────────────────────────────────

function inr(amount: number | null | undefined): string {
  if (amount == null) return '—';
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(amount);
}

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric',
  });
}

function fmtDateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: true,
  });
}

function relativeDate(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 2) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return fmtDate(iso);
}

// ── band color map (mirrors list page) ───────────────────────────────────────

const BAND: Record<string, string> = {
  green:  'bg-success-soft text-success-ink',
  yellow: 'bg-pending-soft text-pending-ink',
  red:    'bg-warning-soft text-warning-ink',
};

// ── interaction type color chips ─────────────────────────────────────────────

const TYPE_CHIP: Record<string, string> = {
  call:     'bg-primary-subtle text-primary',
  whatsapp: 'bg-success-soft text-success-ink',
  email:    'bg-info-soft text-info',
  note:     'bg-mute-soft text-body',
  meeting:  'bg-pending-soft text-pending-ink',
};

// ── sub-score bar ─────────────────────────────────────────────────────────────

function ScoreBar({ label, value }: { label: string; value: number }) {
  const clamped = Math.max(0, Math.min(100, value));
  const barColor = clamped >= 70 ? 'bg-success' : clamped >= 40 ? 'bg-pending-ink' : 'bg-warning';
  return (
    <div>
      <div className="flex justify-between mb-xxs">
        <span className="text-xs text-body-soft">{label}</span>
        <span className="text-xs font-semibold tabular-nums text-ink">{clamped}</span>
      </div>
      <div className="h-1.5 rounded-full bg-mute overflow-hidden">
        <div className={`h-full rounded-full ${barColor}`} style={{ width: `${clamped}%` }} />
      </div>
    </div>
  );
}

// ── status badge (matches TenantStatusBadge style) ───────────────────────────

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    active:    'bg-success-soft text-success-ink',
    trial:     'bg-pending-soft text-pending-ink',
    suspended: 'bg-warning-soft text-warning-ink',
    cancelled: 'bg-mute-soft text-body-soft',
    deleted:   'bg-mute-soft text-body-soft',
  };
  const cls = map[status] ?? 'bg-mute-soft text-body';
  return (
    <span className={`text-[11px] font-bold uppercase rounded-sm px-xs py-px ${cls}`}>
      {status}
    </span>
  );
}

// ── page ─────────────────────────────────────────────────────────────────────

export default async function SuccessDetailPage({ params }: { params: { tenantId: string } }) {
  let service;
  try {
    ({ service } = await requirePlatformPermission('success:read'));
  } catch (e) {
    if (e instanceof PlatformForbiddenError) return <Forbidden message={e.message} />;
    throw e;
  }

  const canManageRes = await createSupabaseServerClient().rpc('platform_has_permission', { p_perm: 'success:manage' });
  const canManage = !!canManageRes.data;

  const tenantId = params.tenantId;
  const now = new Date().toISOString();

  const [tenantRes, healthRes, followupsRes, interactionsRes] = await Promise.all([
    service
      .from('tenants')
      .select('id, name, status, mrr_inr, created_at')
      .eq('id', tenantId)
      .single(),
    service
      .from('customer_health')
      .select('score, risk_band, payment_score, usage_score, login_score, setup_score, churn_risk, computed_at')
      .eq('tenant_id', tenantId)
      .maybeSingle(),
    service
      .from('customer_followups')
      .select('id, reason, due_at, status, completed_at, created_at')
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false }),
    service
      .from('customer_interactions')
      .select('id, interaction_type, summary, created_at')
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false })
      .limit(50),
  ]);

  if (tenantRes.error || !tenantRes.data) {
    return (
      <div className="max-w-[560px]">
        <Link href="/admin/success" className="text-sm text-body-soft hover:text-ink">
          ← Customer Success
        </Link>
        <p className="mt-lg text-sm text-body-soft">Tenant not found.</p>
      </div>
    );
  }

  const tenant = tenantRes.data;
  const health = healthRes.data ?? null;
  const followups = followupsRes.data ?? [];
  const interactions = interactionsRes.data ?? [];

  const openFollowups = followups.filter((f) => f.status === 'open');
  const closedFollowups = followups.filter((f) => f.status !== 'open');

  const card = 'bg-canvas border border-mute rounded-card p-lg';

  return (
    <div className="max-w-[900px] grid gap-lg">
      {/* Header */}
      <div>
        <Link href="/admin/success" className="text-sm text-body-soft hover:text-ink">
          ← Customer Success
        </Link>
        <div className="flex flex-wrap items-center gap-md mt-sm">
          <h2 className="font-display text-[2rem] text-ink">{tenant.name}</h2>
          <StatusBadge status={tenant.status} />
        </div>
        <p className="text-sm text-body-soft mt-xxs">
          Member since {fmtDate(tenant.created_at)}
          {tenant.mrr_inr != null && (
            <> · MRR {inr(tenant.mrr_inr)}</>
          )}
        </p>
      </div>

      {/* Health breakdown */}
      <div className={card}>
        <div className="flex items-center justify-between mb-md">
          <h3 className="text-sm font-bold text-ink">Health breakdown</h3>
          {health && (
            <span className="text-xs text-body-soft">
              Computed {fmtDateTime(health.computed_at)}
            </span>
          )}
        </div>
        {!health ? (
          <p className="text-sm text-body-soft">No health data yet.</p>
        ) : (
          <div className="grid gap-md">
            <div className="flex items-center gap-md">
              <span className="text-3xl font-bold tabular-nums text-ink">{health.score}</span>
              <span className="text-sm text-body-soft">/100</span>
              <span className={`text-[11px] font-bold uppercase rounded-sm px-xs py-px ${BAND[health.risk_band] ?? 'bg-mute-soft text-body'}`}>
                {health.risk_band}
              </span>
              {health.churn_risk && (
                <span className="text-[11px] font-bold uppercase bg-warning-soft text-warning-ink rounded-sm px-xs py-px">
                  churn risk
                </span>
              )}
            </div>
            <div className="grid gap-sm">
              <ScoreBar label="Payment" value={health.payment_score} />
              <ScoreBar label="Usage" value={health.usage_score} />
              <ScoreBar label="Login" value={health.login_score} />
              <ScoreBar label="Setup" value={health.setup_score} />
            </div>
          </div>
        )}
      </div>

      {/* Follow-ups */}
      <div className={card}>
        <h3 className="text-sm font-bold text-ink mb-md">
          Follow-ups{openFollowups.length > 0 && (
            <span className="ml-sm text-[11px] font-bold bg-warning-soft text-warning-ink rounded-sm px-xs py-px">
              {openFollowups.length} open
            </span>
          )}
        </h3>
        {followups.length === 0 ? (
          <p className="text-sm text-body-soft">No follow-ups yet.</p>
        ) : (
          <ul className="divide-y divide-mute text-sm">
            {/* Open first */}
            {openFollowups.map((f) => {
              const overdue = f.due_at && f.due_at < now;
              return (
                <li key={f.id} className="py-sm flex items-start justify-between gap-md">
                  <div className="flex flex-col gap-xxs min-w-0">
                    <span className="text-ink font-medium break-words">{f.reason ?? '—'}</span>
                    <span className={`text-xs ${overdue ? 'text-danger font-semibold' : 'text-body-soft'}`}>
                      {f.due_at ? (overdue ? 'Overdue · ' : 'Due ') + fmtDate(f.due_at) : 'No due date'}
                    </span>
                  </div>
                  {canManage && <CompleteFollowupButton id={f.id} />}
                </li>
              );
            })}
            {/* Completed / cancelled */}
            {closedFollowups.map((f) => (
              <li key={f.id} className="py-sm flex items-start justify-between gap-md opacity-50">
                <div className="flex flex-col gap-xxs min-w-0">
                  <span className="text-body line-through break-words">{f.reason ?? '—'}</span>
                  <span className="text-xs text-body-soft capitalize">
                    {f.status}{f.completed_at ? ' · ' + fmtDate(f.completed_at) : ''}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Interactions timeline */}
      <div className={card}>
        <h3 className="text-sm font-bold text-ink mb-md">Interactions timeline</h3>
        {interactions.length === 0 ? (
          <p className="text-sm text-body-soft">No interactions logged yet.</p>
        ) : (
          <ul className="relative pl-lg">
            {/* Vertical line */}
            <span className="absolute left-[7px] top-sm bottom-sm w-px bg-mute" aria-hidden />
            {interactions.map((it) => {
              const chipCls = TYPE_CHIP[it.interaction_type] ?? 'bg-mute-soft text-body';
              return (
                <li key={it.id} className="relative mb-lg last:mb-0">
                  {/* Dot */}
                  <span className="absolute -left-lg top-[3px] w-3 h-3 rounded-full border-2 border-canvas bg-mute" aria-hidden />
                  <div className="flex flex-wrap items-start gap-sm">
                    <span className={`text-[11px] font-bold uppercase rounded-sm px-xs py-px ${chipCls}`}>
                      {it.interaction_type}
                    </span>
                    <span className="text-xs text-body-soft">{relativeDate(it.created_at)}</span>
                  </div>
                  {it.summary && (
                    <p className="mt-xxs text-sm text-ink">{it.summary}</p>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* Action forms */}
      <SuccessActions tenantId={tenantId} canManage={canManage} />
    </div>
  );
}
