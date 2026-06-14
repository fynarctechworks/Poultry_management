-- supabase/migrations/20260614000010_compute_analytics_overview.sql
-- Adds public.compute_analytics_overview() — single-call JSONB aggregate powering the
-- Analytics Command Center (/admin/analytics): tenant growth, conversion funnel,
-- signup-month cohort retention, plan mix, revenue growth, product engagement.
-- SECURITY DEFINER, service_role only. Applied to remote via Supabase MCP.

CREATE OR REPLACE FUNCTION public.compute_analytics_overview()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
WITH
months AS (
  SELECT to_char(date_trunc('month', created_at),'YYYY-MM') AS ym,
         date_trunc('month', created_at) AS m,
         COUNT(*) AS signups
  FROM public.tenants
  WHERE deleted_at IS NULL
  GROUP BY 1,2
),
growth_rows AS (
  SELECT ym, m, signups, SUM(signups) OVER (ORDER BY m) AS cumulative
  FROM months
),
growth AS (
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'month', ym, 'signups', signups, 'cumulative', cumulative
         ) ORDER BY m), '[]'::jsonb) AS arr
  FROM growth_rows
),
funnel AS (
  SELECT
    (SELECT COUNT(*) FROM public.tenants WHERE deleted_at IS NULL)::int                            AS signups,
    (SELECT COUNT(*) FROM public.tenant_subscriptions WHERE trial_started_at IS NOT NULL)::int     AS trial_started,
    (SELECT COUNT(*) FROM public.tenant_subscriptions WHERE trial_converted_at IS NOT NULL)::int   AS trial_converted,
    (SELECT COUNT(*) FROM public.tenant_subscriptions WHERE status = 'active')::int                AS active
),
cohorts AS (
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'cohort', ym, 'size', sz, 'active', act,
           'retention_pct', CASE WHEN sz=0 THEN 0 ELSE ROUND(act::numeric/sz*100) END
         ) ORDER BY ym), '[]'::jsonb) AS arr
  FROM (
    SELECT to_char(date_trunc('month', t.created_at),'YYYY-MM') AS ym,
           COUNT(*) AS sz, COUNT(*) FILTER (WHERE t.status='active') AS act
    FROM public.tenants t WHERE t.deleted_at IS NULL GROUP BY 1
  ) c
),
plan_mix AS (
  SELECT COALESCE(jsonb_agg(jsonb_build_object('plan', name, 'count', cnt, 'mrr', mrr) ORDER BY cnt DESC), '[]'::jsonb) AS arr
  FROM (
    SELECT sp.name, COUNT(*) AS cnt,
           SUM(CASE WHEN ts.billing_cycle='yearly' THEN ROUND(sp.yearly_price_inr/12.0) ELSE sp.monthly_price_inr END) AS mrr
    FROM public.tenant_subscriptions ts
    JOIN public.subscription_plans sp ON sp.id = ts.plan_id
    WHERE ts.status='active' GROUP BY sp.name
  ) p
),
rev AS (
  SELECT
    (SELECT mrr_inr FROM public.revenue_snapshots ORDER BY snapshot_date ASC  LIMIT 1) AS mrr_first,
    (SELECT mrr_inr FROM public.revenue_snapshots ORDER BY snapshot_date DESC LIMIT 1) AS mrr_last
),
eng AS (
  SELECT
    COUNT(*) FILTER (WHERE created_at >= now()-INTERVAL '30 days')::int                    AS events_30d,
    COUNT(*) FILTER (WHERE created_at >= now()-INTERVAL '7 days')::int                     AS events_7d,
    COUNT(DISTINCT tenant_id) FILTER (WHERE created_at >= now()-INTERVAL '30 days')::int   AS active_tenants_30d,
    COUNT(DISTINCT tenant_id) FILTER (WHERE created_at >= now()-INTERVAL '24 hours')::int  AS active_tenants_24h
  FROM public.analytics_events
),
top_events AS (
  SELECT COALESCE(jsonb_agg(jsonb_build_object('event_name', event_name, 'count', cnt, 'tenants', tenants) ORDER BY cnt DESC), '[]'::jsonb) AS arr
  FROM (
    SELECT event_name, COUNT(*) AS cnt, COUNT(DISTINCT tenant_id) AS tenants
    FROM public.analytics_events WHERE created_at >= now()-INTERVAL '30 days'
    GROUP BY event_name ORDER BY COUNT(*) DESC LIMIT 10
  ) e
),
activity_trend AS (
  SELECT COALESCE(jsonb_agg(jsonb_build_object('date', d, 'events', COALESCE(ev,0), 'active_tenants', COALESCE(at_cnt,0)) ORDER BY d), '[]'::jsonb) AS arr
  FROM (SELECT gs::date AS d FROM generate_series(now()::date - 13, now()::date, INTERVAL '1 day') gs) days
  LEFT JOIN (
    SELECT created_at::date AS d, COUNT(*) AS ev, COUNT(DISTINCT tenant_id) AS at_cnt
    FROM public.analytics_events WHERE created_at >= now()::date - 13 GROUP BY created_at::date
  ) agg USING (d)
)
SELECT jsonb_build_object(
  'generated_at', now(),
  'growth', growth.arr,
  'funnel', jsonb_build_object(
     'signups', funnel.signups, 'trial_started', funnel.trial_started,
     'trial_converted', funnel.trial_converted, 'active', funnel.active,
     'conversion_rate', CASE WHEN funnel.trial_started=0 THEN 0 ELSE ROUND(funnel.trial_converted::numeric/funnel.trial_started, 4) END
  ),
  'cohorts', cohorts.arr,
  'plan_mix', plan_mix.arr,
  'revenue', jsonb_build_object(
     'mrr_first', COALESCE(rev.mrr_first,0), 'mrr_last', COALESCE(rev.mrr_last,0),
     'arr_last', COALESCE(rev.mrr_last,0)*12,
     'growth_pct', CASE WHEN COALESCE(rev.mrr_first,0)=0 THEN 0 ELSE ROUND((rev.mrr_last-rev.mrr_first)/rev.mrr_first*100, 1) END
  ),
  'engagement', jsonb_build_object(
     'events_30d', eng.events_30d, 'events_7d', eng.events_7d,
     'active_tenants_30d', eng.active_tenants_30d, 'active_tenants_24h', eng.active_tenants_24h,
     'avg_events_per_active_tenant', CASE WHEN eng.active_tenants_30d=0 THEN 0 ELSE ROUND(eng.events_30d::numeric/eng.active_tenants_30d, 1) END
  ),
  'top_events', top_events.arr,
  'activity_trend', activity_trend.arr
)
FROM growth, funnel, cohorts, plan_mix, rev, eng, top_events, activity_trend;
$$;

REVOKE ALL ON FUNCTION public.compute_analytics_overview() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.compute_analytics_overview() TO service_role;

COMMENT ON FUNCTION public.compute_analytics_overview IS
  'Single-call JSONB aggregate for the Analytics Command Center (growth, funnel, cohorts, plan mix, engagement). SECURITY DEFINER, service_role only.';
