-- =============================================================================
-- PoultryOS — SaaS Control Center · Increment 4 / M10: Revenue Ops
-- File: 20260611000014_revenue_ops.sql
-- =============================================================================
-- SaaS revenue metrics computed live from tenant_subscriptions + plans, plus a
-- daily snapshot table so growth/churn TRENDS accumulate going forward (we don't
-- fabricate history — trends build from the first snapshot onward). Also wires
-- the nightly pg_cron that recomputes health + records a revenue snapshot.
-- =============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.revenue_snapshots (
  snapshot_date  DATE PRIMARY KEY,
  mrr_inr        NUMERIC(14,2) NOT NULL DEFAULT 0,
  arr_inr        NUMERIC(14,2) NOT NULL DEFAULT 0,
  arpu_inr       NUMERIC(12,2) NOT NULL DEFAULT 0,
  active_count   INTEGER NOT NULL DEFAULT 0,
  trial_count    INTEGER NOT NULL DEFAULT 0,
  past_due_count INTEGER NOT NULL DEFAULT 0,
  cancelled_count INTEGER NOT NULL DEFAULT 0,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.revenue_snapshots ENABLE ROW LEVEL SECURITY;
CREATE POLICY revenue_snapshots_read ON public.revenue_snapshots
  FOR SELECT USING (public.platform_has_permission('revenue:read'));

-- -----------------------------------------------------------------------------
-- compute_revenue_metrics — live MRR/ARR/ARPU/LTV/churn + plan distribution.
-- CAC is null (marketing spend is not tracked in-app — honest rather than fake).
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.compute_revenue_metrics()
RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_mrr NUMERIC := 0; v_active INT := 0; v_trial INT := 0; v_past_due INT := 0; v_cancelled INT := 0;
  v_arpu NUMERIC := 0; v_churn NUMERIC := 0; v_ltv NUMERIC; v_dist JSONB;
BEGIN
  SELECT COALESCE(sum(CASE WHEN ts.billing_cycle = 'yearly'
                           THEN COALESCE(p.yearly_price_inr,0)/12.0
                           ELSE COALESCE(p.monthly_price_inr,0) END), 0)
    INTO v_mrr
    FROM public.tenant_subscriptions ts
    JOIN public.subscription_plans p ON p.id = ts.plan_id
   WHERE ts.status = 'active';

  SELECT
    count(*) FILTER (WHERE status = 'active'),
    count(*) FILTER (WHERE status = 'trial'),
    count(*) FILTER (WHERE status = 'past_due'),
    count(*) FILTER (WHERE status = 'cancelled')
  INTO v_active, v_trial, v_past_due, v_cancelled
  FROM public.tenant_subscriptions;

  v_arpu  := CASE WHEN v_active > 0 THEN round(v_mrr / v_active, 2) ELSE 0 END;
  v_churn := CASE WHEN (v_active + v_cancelled) > 0
                  THEN round(v_cancelled::NUMERIC / (v_active + v_cancelled), 4) ELSE 0 END;
  v_ltv   := CASE WHEN v_churn > 0 THEN round(v_arpu / v_churn, 2) ELSE NULL END;

  SELECT COALESCE(jsonb_object_agg(name, cnt), '{}'::jsonb) INTO v_dist FROM (
    SELECT p.name, count(*) AS cnt
      FROM public.tenant_subscriptions ts
      JOIN public.subscription_plans p ON p.id = ts.plan_id
     WHERE ts.status = 'active'
     GROUP BY p.name
  ) d;

  RETURN jsonb_build_object(
    'mrr_inr', v_mrr, 'arr_inr', v_mrr * 12, 'arpu_inr', v_arpu,
    'active', v_active, 'trial', v_trial, 'past_due', v_past_due, 'cancelled', v_cancelled,
    'churn_rate', v_churn, 'ltv_inr', v_ltv, 'cac_inr', NULL,
    'plan_distribution', v_dist
  );
END;
$$;

-- -----------------------------------------------------------------------------
-- snapshot_revenue — record today's metrics (idempotent per day).
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.snapshot_revenue()
RETURNS public.revenue_snapshots LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE m JSONB; v_row public.revenue_snapshots;
BEGIN
  m := public.compute_revenue_metrics();
  INSERT INTO public.revenue_snapshots
    (snapshot_date, mrr_inr, arr_inr, arpu_inr, active_count, trial_count, past_due_count, cancelled_count)
  VALUES (
    current_date,
    (m->>'mrr_inr')::NUMERIC, (m->>'arr_inr')::NUMERIC, (m->>'arpu_inr')::NUMERIC,
    (m->>'active')::INT, (m->>'trial')::INT, (m->>'past_due')::INT, (m->>'cancelled')::INT
  )
  ON CONFLICT (snapshot_date) DO UPDATE SET
    mrr_inr = EXCLUDED.mrr_inr, arr_inr = EXCLUDED.arr_inr, arpu_inr = EXCLUDED.arpu_inr,
    active_count = EXCLUDED.active_count, trial_count = EXCLUDED.trial_count,
    past_due_count = EXCLUDED.past_due_count, cancelled_count = EXCLUDED.cancelled_count
  RETURNING * INTO v_row;
  RETURN v_row;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.compute_revenue_metrics() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.snapshot_revenue()         FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.compute_revenue_metrics() TO service_role;
GRANT EXECUTE ON FUNCTION public.snapshot_revenue()         TO service_role;

-- -----------------------------------------------------------------------------
-- Nightly cron: recompute health + snapshot revenue (00:00 IST = 18:30 UTC).
-- -----------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'cc-nightly-health-revenue') THEN
    PERFORM cron.unschedule('cc-nightly-health-revenue');
  END IF;
END $$;

SELECT cron.schedule(
  'cc-nightly-health-revenue',
  '30 18 * * *',
  $$ SELECT public.recompute_all_customer_health(); SELECT public.snapshot_revenue(); $$
);

-- Seed today's snapshot so the revenue dashboard isn't empty.
SELECT public.snapshot_revenue();

COMMIT;
