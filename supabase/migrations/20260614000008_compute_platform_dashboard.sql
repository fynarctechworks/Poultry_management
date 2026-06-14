-- supabase/migrations/20260614000008_compute_platform_dashboard.sql
-- Adds public.compute_platform_dashboard() — a single-call JSONB aggregate that
-- powers the Executive Command Center dashboard. Reads across ALL tenants via
-- SECURITY DEFINER (RLS bypassed intentionally; caller must be service_role).
-- Returns 0 / [] / empty objects when any table is empty; never returns NULL fields.

-- BEGIN / COMMIT kept as documentation markers; the MCP harness wraps its own
-- transaction. psql users should run this as-is.

BEGIN;

-- =============================================================================
-- compute_platform_dashboard
-- =============================================================================
CREATE OR REPLACE FUNCTION public.compute_platform_dashboard()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
WITH

-- ---------------------------------------------------------------------------
-- Revenue: call the existing live-metric function and embed it; then compute
-- MRR change from the two boundary revenue_snapshots.
-- ---------------------------------------------------------------------------
rev AS (
  SELECT public.compute_revenue_metrics() AS m
),

-- Latest snapshot row
snap_latest AS (
  SELECT snapshot_date, mrr_inr
    FROM public.revenue_snapshots
   ORDER BY snapshot_date DESC
   LIMIT 1
),

-- Snapshot closest to 30 days before the latest (may not exist)
snap_30d AS (
  SELECT rs.snapshot_date, rs.mrr_inr
    FROM public.revenue_snapshots rs
    JOIN snap_latest sl ON TRUE
   WHERE rs.snapshot_date <= sl.snapshot_date - 30
   ORDER BY rs.snapshot_date DESC
   LIMIT 1
),

mrr_change AS (
  SELECT
    CASE
      WHEN snap_30d.mrr_inr IS NULL OR snap_30d.mrr_inr = 0 THEN 0
      ELSE ROUND(
             ((snap_latest.mrr_inr - snap_30d.mrr_inr) / snap_30d.mrr_inr * 100.0)::NUMERIC,
             2
           )
    END AS pct
  FROM snap_latest
  FULL OUTER JOIN snap_30d ON TRUE
),

-- ---------------------------------------------------------------------------
-- Customers: aggregate from tenants + customer_health
-- ---------------------------------------------------------------------------
cust AS (
  SELECT
    COALESCE(COUNT(*) FILTER (WHERE deleted_at IS NULL), 0)                         AS total,
    COALESCE(COUNT(*) FILTER (WHERE deleted_at IS NULL AND status = 'active'), 0)   AS active,
    COALESCE(COUNT(*) FILTER (WHERE deleted_at IS NULL AND status = 'trial'), 0)    AS trial,
    COALESCE(COUNT(*) FILTER (WHERE deleted_at IS NULL AND status = 'suspended'), 0) AS suspended,
    COALESCE(COUNT(*) FILTER (WHERE deleted_at IS NULL
                                AND created_at >= now() - INTERVAL '30 days'), 0)   AS new_30d
  FROM public.tenants
),

health_agg AS (
  SELECT
    COALESCE(COUNT(*) FILTER (WHERE ch.risk_band = 'red' OR ch.churn_risk = true), 0)  AS at_risk,
    COALESCE(COUNT(*) FILTER (WHERE ch.risk_band = 'green'), 0)                         AS health_green,
    COALESCE(COUNT(*) FILTER (WHERE ch.risk_band = 'yellow'), 0)                        AS health_yellow,
    COALESCE(COUNT(*) FILTER (WHERE ch.risk_band = 'red'), 0)                           AS health_red,
    COALESCE(ROUND(AVG(ch.score)), 0)::INT                                              AS avg_health_score
  FROM public.customer_health ch
  JOIN public.tenants t ON t.id = ch.tenant_id
  WHERE t.deleted_at IS NULL
),

-- ---------------------------------------------------------------------------
-- Subscriptions
-- ---------------------------------------------------------------------------
subs AS (
  SELECT
    COALESCE(COUNT(*) FILTER (WHERE status = 'active'), 0)                              AS active,
    COALESCE(COUNT(*) FILTER (WHERE status IN ('trial','trialing')), 0)                 AS trialing,
    COALESCE(COUNT(*) FILTER (WHERE status = 'active'
                                AND current_period_end BETWEEN now() AND now() + INTERVAL '7 days'), 0)
                                                                                         AS expiring_7d,
    COALESCE(COUNT(*) FILTER (WHERE trial_ends_at BETWEEN now() AND now() + INTERVAL '7 days'), 0)
                                                                                         AS trials_ending_7d,
    COALESCE(COUNT(*) FILTER (WHERE trial_started_at IS NOT NULL), 0)                   AS trial_started_cnt,
    COALESCE(COUNT(*) FILTER (WHERE trial_converted_at IS NOT NULL), 0)                 AS trial_converted_cnt,
    COALESCE(COUNT(*) FILTER (WHERE cancelled_at >= now() - INTERVAL '30 days'), 0)     AS cancelled_30d
  FROM public.tenant_subscriptions
),

-- ---------------------------------------------------------------------------
-- Payments
-- ---------------------------------------------------------------------------
pay_fail AS (
  SELECT
    COALESCE(COUNT(*), 0)::INT          AS failed_7d,
    COALESCE(SUM(amount_inr), 0)        AS failed_amount_inr
  FROM public.payment_attempts
  WHERE status = 'failed'
    AND created_at >= now() - INTERVAL '7 days'
),

pay_success AS (
  SELECT
    COALESCE(COUNT(*) FILTER (WHERE status = 'captured'), 0)::INT    AS captured_30d,
    COALESCE(COUNT(*), 0)::INT                                        AS total_30d
  FROM public.payments
  WHERE created_at >= now() - INTERVAL '30 days'
),

webhook_fail AS (
  SELECT COALESCE(COUNT(*), 0)::INT AS cnt
  FROM public.razorpay_webhook_events
  WHERE status IN ('failed','error')
    AND created_at >= now() - INTERVAL '24 hours'
),

-- ---------------------------------------------------------------------------
-- Support
-- ---------------------------------------------------------------------------
sup AS (
  SELECT
    COALESCE(COUNT(*) FILTER (WHERE status NOT IN ('resolved','closed')), 0)::INT                              AS open_cnt,
    COALESCE(COUNT(*) FILTER (WHERE status NOT IN ('resolved','closed')
                                AND priority IN ('high','urgent')), 0)::INT                                     AS escalated,
    COALESCE(COUNT(*) FILTER (WHERE created_at >= now() - INTERVAL '24 hours'), 0)::INT                        AS new_24h,
    COALESCE(COUNT(*) FILTER (WHERE assigned_to IS NULL
                                AND status NOT IN ('resolved','closed')), 0)::INT                               AS unassigned,
    COALESCE(COUNT(*) FILTER (WHERE resolved_at >= now() - INTERVAL '7 days'), 0)::INT                         AS resolved_7d
  FROM public.support_tickets
),

-- ---------------------------------------------------------------------------
-- Errors
-- ---------------------------------------------------------------------------
errs AS (
  SELECT
    COALESCE(COUNT(*) FILTER (WHERE severity = 'critical'
                                AND status NOT IN ('resolved','ignored')), 0)::INT                              AS critical_open,
    COALESCE(COUNT(*) FILTER (WHERE status NOT IN ('resolved','ignored')), 0)::INT                              AS open_total,
    COALESCE(COUNT(*) FILTER (WHERE last_seen_at >= now() - INTERVAL '24 hours'), 0)::INT                      AS new_24h,
    COALESCE(COUNT(DISTINCT tenant_id) FILTER (WHERE status NOT IN ('resolved','ignored')), 0)::INT             AS affected_tenants
  FROM public.platform_errors
),

-- ---------------------------------------------------------------------------
-- Security: auth_audit_events + platform_audit_events
-- ---------------------------------------------------------------------------
sec AS (
  SELECT
    COALESCE(COUNT(*) FILTER (WHERE event_type ILIKE '%fail%'
                                AND created_at >= now() - INTERVAL '24 hours'), 0)::INT         AS failed_logins_24h,
    COALESCE(COUNT(*) FILTER (WHERE (event_type ILIKE '%suspicious%' OR event_type ILIKE '%lock%')
                                AND created_at >= now() - INTERVAL '24 hours'), 0)::INT         AS suspicious_24h
  FROM public.auth_audit_events
),

admin_actions AS (
  SELECT COALESCE(COUNT(*), 0)::INT AS cnt
  FROM public.platform_audit_events
  WHERE created_at >= now() - INTERVAL '24 hours'
),

-- ---------------------------------------------------------------------------
-- Trend: last 30 revenue_snapshots ASC
-- ---------------------------------------------------------------------------
trend AS (
  SELECT jsonb_agg(
           jsonb_build_object(
             'date',         rs.snapshot_date,
             'mrr_inr',      rs.mrr_inr,
             'active_count', rs.active_count,
             'trial_count',  rs.trial_count
           )
           ORDER BY rs.snapshot_date ASC
         ) AS arr
  FROM (
    SELECT snapshot_date, mrr_inr, active_count, trial_count
      FROM public.revenue_snapshots
     ORDER BY snapshot_date DESC
     LIMIT 30
  ) rs
),

-- ---------------------------------------------------------------------------
-- Platform health score
-- ---------------------------------------------------------------------------
health_score_calc AS (
  SELECT
    GREATEST(
      0,
      100
      - CASE WHEN errs.critical_open > 0                           THEN 25 ELSE 0 END
      - CASE WHEN webhook_fail.cnt > 0                             THEN 15 ELSE 0 END
      - CASE WHEN pay_success.total_30d > 0
              AND (pay_success.captured_30d::NUMERIC / pay_success.total_30d) < 0.9
                                                                   THEN 10 ELSE 0 END
      - CASE WHEN sec.failed_logins_24h > 20                       THEN 10 ELSE 0 END
      - CASE WHEN sup.escalated > 0                                THEN 10 ELSE 0 END
    )::INT AS score
  FROM errs, webhook_fail, pay_success, sec, sup
)

-- ---------------------------------------------------------------------------
-- Assemble the final JSONB
-- ---------------------------------------------------------------------------
SELECT jsonb_build_object(

  'generated_at', now(),

  'revenue', (rev.m || jsonb_build_object(
    'mrr_change_pct', COALESCE((SELECT pct FROM mrr_change), 0)
  )),

  'customers', jsonb_build_object(
    'total',            cust.total,
    'active',           cust.active,
    'trial',            cust.trial,
    'suspended',        cust.suspended,
    'new_30d',          cust.new_30d,
    'at_risk',          health_agg.at_risk,
    'health_green',     health_agg.health_green,
    'health_yellow',    health_agg.health_yellow,
    'health_red',       health_agg.health_red,
    'avg_health_score', health_agg.avg_health_score
  ),

  'subscriptions', jsonb_build_object(
    'active',                 subs.active,
    'trialing',               subs.trialing,
    'expiring_7d',            subs.expiring_7d,
    'trials_ending_7d',       subs.trials_ending_7d,
    'trial_conversion_rate',  CASE
                                WHEN subs.trial_started_cnt = 0 THEN 0
                                ELSE ROUND(
                                       subs.trial_converted_cnt::NUMERIC / subs.trial_started_cnt,
                                       4
                                     )
                              END,
    'cancelled_30d',          subs.cancelled_30d
  ),

  'payments', jsonb_build_object(
    'failed_7d',             pay_fail.failed_7d,
    'failed_amount_inr',     pay_fail.failed_amount_inr,
    'success_rate_30d',      CASE
                               WHEN pay_success.total_30d = 0 THEN 0
                               ELSE ROUND(
                                      pay_success.captured_30d::NUMERIC / pay_success.total_30d,
                                      4
                                    )
                             END,
    'webhook_failures_24h',  webhook_fail.cnt
  ),

  'support', jsonb_build_object(
    'open',         sup.open_cnt,
    'escalated',    sup.escalated,
    'new_24h',      sup.new_24h,
    'unassigned',   sup.unassigned,
    'resolved_7d',  sup.resolved_7d
  ),

  'errors', jsonb_build_object(
    'critical_open',     errs.critical_open,
    'open_total',        errs.open_total,
    'new_24h',           errs.new_24h,
    'affected_tenants',  errs.affected_tenants
  ),

  'security', jsonb_build_object(
    'failed_logins_24h',  sec.failed_logins_24h,
    'suspicious_24h',     sec.suspicious_24h,
    'admin_actions_24h',  admin_actions.cnt
  ),

  'platform_health', jsonb_build_object(
    'score',  health_score_calc.score,
    'status', CASE
                WHEN health_score_calc.score >= 85 THEN 'healthy'
                WHEN health_score_calc.score >= 60 THEN 'degraded'
                ELSE 'critical'
              END
  ),

  'trend', COALESCE(trend.arr, '[]'::jsonb)

)
FROM rev, cust, health_agg, subs,
     pay_fail, pay_success, webhook_fail,
     sup, errs, sec, admin_actions,
     trend, health_score_calc;
$$;

-- Restrict execution: this function crosses tenant boundaries (SECURITY DEFINER),
-- so ONLY service_role may call it. The Control Center server uses the service
-- client (lib/control/serviceClient.ts) — same pattern as compute_revenue_metrics.
-- Granting authenticated here would let any tenant user read platform-wide data.
REVOKE ALL ON FUNCTION public.compute_platform_dashboard() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.compute_platform_dashboard() TO service_role;

COMMENT ON FUNCTION public.compute_platform_dashboard IS
  'Single-call JSONB aggregate for the Executive Command Center dashboard. '
  'SECURITY DEFINER — bypasses RLS intentionally to read across all tenants. '
  'Caller must hold service_role or be a verified platform operator.';

COMMIT;
