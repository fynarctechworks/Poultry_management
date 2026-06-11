-- =============================================================================
-- PoultryOS — Phase 5: multi-farm consolidated dashboard RPC
--
-- Returns one row per farm that the calling user owns OR is a member of
-- (via farm_users). Each row aggregates the basic operational + financial
-- KPIs for the current month so the web dashboard can render the
-- consolidated table without N round-trips.
--
-- Paid-tier feature (multi_farm_dashboard) — the client is expected to gate
-- access on is_paid(). The RPC itself does not enforce billing; RLS handles
-- visibility (callers only see their own farms).
-- =============================================================================

CREATE OR REPLACE FUNCTION public.get_multi_farm_summary()
  RETURNS TABLE (
    farm_id                  UUID,
    farm_name                TEXT,
    state                    TEXT,
    district                 TEXT,
    farm_type                TEXT,
    active_batches           INTEGER,
    total_birds              INTEGER,
    mortality_count_month    INTEGER,
    mortality_pct_month      NUMERIC,
    feed_used_kg_month       NUMERIC,
    eggs_collected_month     INTEGER,
    income_month             NUMERIC,
    expense_month            NUMERIC,
    net_pnl_month            NUMERIC,
    pending_receivables      NUMERIC,
    last_log_date            DATE
  )
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public, pg_temp
AS $$
DECLARE
  v_user UUID := auth.uid();
  v_month_start DATE := date_trunc('month', now() AT TIME ZONE 'Asia/Kolkata')::DATE;
BEGIN
  IF v_user IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  WITH accessible_farms AS (
    SELECT f.id, f.farm_name, f.state, f.district, f.farm_type::TEXT AS farm_type
      FROM public.farms f
     WHERE f.owner_id = v_user
        OR EXISTS (
          SELECT 1
            FROM public.farm_users fu
           WHERE fu.farm_id = f.id
             AND fu.user_id = v_user
             AND fu.accepted_at IS NOT NULL
        )
  ),
  batch_agg AS (
    SELECT b.farm_id,
           COUNT(*) FILTER (WHERE b.status = 'active')::INTEGER AS active_batches,
           COALESCE(SUM(b.current_bird_count) FILTER (WHERE b.status = 'active'), 0)::INTEGER AS total_birds,
           COALESCE(SUM(b.opening_bird_count) FILTER (WHERE b.status = 'active'), 0)::INTEGER AS opening_birds
      FROM public.batches b
     WHERE b.farm_id IN (SELECT id FROM accessible_farms)
     GROUP BY b.farm_id
  ),
  log_agg AS (
    SELECT dl.farm_id,
           COALESCE(SUM(dl.birds_dead), 0)::INTEGER AS deaths_month,
           COALESCE(SUM(dl.feed_consumed_kg), 0)::NUMERIC AS feed_kg_month,
           COALESCE(SUM(dl.eggs_collected), 0)::INTEGER AS eggs_month,
           MAX(dl.log_date) AS last_log_date
      FROM public.daily_logs dl
     WHERE dl.farm_id IN (SELECT id FROM accessible_farms)
       AND dl.log_date >= v_month_start
     GROUP BY dl.farm_id
  ),
  last_log AS (
    -- last_log_date across all time (not just this month) for the "stale data" indicator
    SELECT dl.farm_id, MAX(dl.log_date) AS last_log_date
      FROM public.daily_logs dl
     WHERE dl.farm_id IN (SELECT id FROM accessible_farms)
     GROUP BY dl.farm_id
  ),
  txn_agg AS (
    SELECT ft.farm_id,
           COALESCE(SUM(ft.amount) FILTER (WHERE ft.transaction_type = 'income'), 0)::NUMERIC AS income_month,
           COALESCE(SUM(ft.amount) FILTER (WHERE ft.transaction_type = 'expense'), 0)::NUMERIC AS expense_month
      FROM public.financial_transactions ft
     WHERE ft.farm_id IN (SELECT id FROM accessible_farms)
       AND ft.transaction_date >= v_month_start
     GROUP BY ft.farm_id
  ),
  receivables_agg AS (
    SELECT ft.farm_id,
           COALESCE(SUM(ft.amount), 0)::NUMERIC AS pending_receivables
      FROM public.financial_transactions ft
     WHERE ft.farm_id IN (SELECT id FROM accessible_farms)
       AND ft.transaction_type = 'income'
       AND ft.payment_status IN ('pending', 'partial')
     GROUP BY ft.farm_id
  )
  SELECT
    af.id,
    af.farm_name,
    af.state,
    af.district,
    af.farm_type,
    COALESCE(ba.active_batches, 0),
    COALESCE(ba.total_birds, 0),
    COALESCE(la.deaths_month, 0),
    CASE
      WHEN COALESCE(ba.opening_birds, 0) > 0
        THEN ROUND((COALESCE(la.deaths_month, 0)::NUMERIC / ba.opening_birds) * 100, 2)
      ELSE NULL
    END,
    COALESCE(la.feed_kg_month, 0),
    COALESCE(la.eggs_month, 0),
    COALESCE(ta.income_month, 0),
    COALESCE(ta.expense_month, 0),
    COALESCE(ta.income_month, 0) - COALESCE(ta.expense_month, 0),
    COALESCE(ra.pending_receivables, 0),
    ll.last_log_date
  FROM accessible_farms af
  LEFT JOIN batch_agg      ba ON ba.farm_id = af.id
  LEFT JOIN log_agg        la ON la.farm_id = af.id
  LEFT JOIN last_log       ll ON ll.farm_id = af.id
  LEFT JOIN txn_agg        ta ON ta.farm_id = af.id
  LEFT JOIN receivables_agg ra ON ra.farm_id = af.id
  ORDER BY af.farm_name;
END;
$$;

REVOKE ALL ON FUNCTION public.get_multi_farm_summary() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_multi_farm_summary() TO authenticated, service_role;

COMMENT ON FUNCTION public.get_multi_farm_summary() IS
  'Returns one row per farm the calling user can access, with current-month operational + financial KPIs. Used by the multi-farm consolidated dashboard (web only).';
