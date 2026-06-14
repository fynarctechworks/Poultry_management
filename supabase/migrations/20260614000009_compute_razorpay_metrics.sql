-- supabase/migrations/20260614000009_compute_razorpay_metrics.sql
-- Adds public.compute_razorpay_metrics() — single-call JSONB aggregate powering the
-- Razorpay Command Center (/admin/razorpay). SECURITY DEFINER, service_role only.
-- Applied to the remote project via Supabase MCP (see migration-versioning note in repo).

CREATE OR REPLACE FUNCTION public.compute_razorpay_metrics()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
WITH
pay30 AS (
  SELECT
    COALESCE(SUM(amount_inr) FILTER (WHERE status='captured'),0)              AS gross_captured_30d,
    COALESCE(SUM(fee_inr)    FILTER (WHERE status='captured'),0)              AS fee_total_30d,
    COALESCE(SUM(tax_inr)    FILTER (WHERE status='captured'),0)              AS tax_total_30d,
    COALESCE(SUM(refunded_amount_inr),0)                                       AS refunded_amount_30d,
    COALESCE(COUNT(*) FILTER (WHERE refunded_amount_inr>0),0)::int             AS refunded_count_30d,
    COALESCE(COUNT(*) FILTER (WHERE status='captured'),0)::int                 AS captured_count_30d,
    COALESCE(COUNT(*) FILTER (WHERE status='failed'),0)::int                   AS failed_count_30d,
    COALESCE(SUM(amount_inr) FILTER (WHERE status='failed'),0)                 AS failed_amount_30d,
    COALESCE(COUNT(*),0)::int                                                  AS total_count_30d
  FROM public.payments
  WHERE created_at >= now() - INTERVAL '30 days'
),
methods AS (
  SELECT COALESCE(jsonb_object_agg(method, c),'{}'::jsonb) AS dist
  FROM (
    SELECT COALESCE(method,'unknown') AS method, COUNT(*) AS c
    FROM public.payments
    WHERE status='captured' AND created_at >= now() - INTERVAL '30 days'
    GROUP BY 1
  ) m
),
wh AS (
  SELECT
    COALESCE(COUNT(*) FILTER (WHERE created_at >= now() - INTERVAL '7 days'),0)::int                          AS total_7d,
    COALESCE(COUNT(*) FILTER (WHERE status='failed' AND created_at >= now() - INTERVAL '7 days'),0)::int      AS failed_7d,
    COALESCE(COUNT(*) FILTER (WHERE status='failed' AND created_at >= now() - INTERVAL '24 hours'),0)::int    AS failed_24h,
    COALESCE(COUNT(*) FILTER (WHERE status='received'),0)::int                                                AS pending_received
  FROM public.razorpay_webhook_events
),
subs AS (
  SELECT COALESCE(COUNT(*) FILTER (WHERE razorpay_subscription_id IS NOT NULL AND status='active'),0)::int AS active_rzp_subs
  FROM public.tenant_subscriptions
),
att AS (
  SELECT
    COALESCE(COUNT(*) FILTER (WHERE status='failed' AND created_at >= now() - INTERVAL '7 days'),0)::int   AS failed_7d,
    COALESCE(SUM(amount_inr) FILTER (WHERE status='failed' AND created_at >= now() - INTERVAL '7 days'),0)  AS failed_amount_7d,
    COALESCE(COUNT(*) FILTER (WHERE created_at >= now() - INTERVAL '7 days'),0)::int                        AS total_7d
  FROM public.payment_attempts
)
SELECT jsonb_build_object(
  'generated_at', now(),
  'gross_captured_30d', pay30.gross_captured_30d,
  'fee_total_30d', pay30.fee_total_30d,
  'tax_total_30d', pay30.tax_total_30d,
  'net_captured_30d', pay30.gross_captured_30d - pay30.fee_total_30d,
  'captured_count_30d', pay30.captured_count_30d,
  'failed_count_30d', pay30.failed_count_30d,
  'failed_amount_30d', pay30.failed_amount_30d,
  'total_count_30d', pay30.total_count_30d,
  'success_rate_30d', CASE WHEN pay30.total_count_30d=0 THEN 0
                           ELSE ROUND(pay30.captured_count_30d::numeric / pay30.total_count_30d, 4) END,
  'refunded_amount_30d', pay30.refunded_amount_30d,
  'refunded_count_30d', pay30.refunded_count_30d,
  'method_distribution', methods.dist,
  'webhook_total_7d', wh.total_7d,
  'webhook_failed_7d', wh.failed_7d,
  'webhook_failed_24h', wh.failed_24h,
  'webhook_pending', wh.pending_received,
  'active_subscriptions', subs.active_rzp_subs,
  'attempts_failed_7d', att.failed_7d,
  'attempts_failed_amount_7d', att.failed_amount_7d,
  'attempts_total_7d', att.total_7d
)
FROM pay30, methods, wh, subs, att;
$$;

REVOKE ALL ON FUNCTION public.compute_razorpay_metrics() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.compute_razorpay_metrics() TO service_role;

COMMENT ON FUNCTION public.compute_razorpay_metrics IS
  'Single-call JSONB aggregate for the Razorpay Command Center. SECURITY DEFINER, service_role only.';
