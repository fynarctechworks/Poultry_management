-- =============================================================================
-- PoultryOS — SaaS Control Center · Increment 4 / M7: Customer Health
-- File: 20260611000013_customer_health.sql
-- =============================================================================
-- A cached 0..100 health score per tenant with green/yellow/red banding and a
-- churn-risk flag, computed from real signals already in the DB:
--   payment (subscription status) · usage (last daily log) ·
--   login (last analytics event) · setup completion (farm/shed/batch/log).
-- Recomputed nightly by pg_cron; also recomputable on demand. The cached score
-- mirrors into tenants.health_score for fast list rendering.
-- =============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.customer_health (
  tenant_id     UUID PRIMARY KEY REFERENCES public.tenants(id) ON DELETE CASCADE,
  score         SMALLINT NOT NULL DEFAULT 0,
  risk_band     TEXT NOT NULL DEFAULT 'red' CHECK (risk_band IN ('green','yellow','red')),
  payment_score SMALLINT NOT NULL DEFAULT 0,
  usage_score   SMALLINT NOT NULL DEFAULT 0,
  login_score   SMALLINT NOT NULL DEFAULT 0,
  setup_score   SMALLINT NOT NULL DEFAULT 0,
  churn_risk    BOOLEAN  NOT NULL DEFAULT true,
  computed_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_customer_health_band  ON public.customer_health(risk_band);
CREATE INDEX IF NOT EXISTS idx_customer_health_churn ON public.customer_health(churn_risk);

ALTER TABLE public.customer_health ENABLE ROW LEVEL SECURITY;
CREATE POLICY customer_health_read ON public.customer_health
  FOR SELECT USING (public.platform_has_permission('success:read'));
-- writes via SECURITY DEFINER functions / service role only.

-- -----------------------------------------------------------------------------
-- compute_tenant_health — score one tenant and upsert.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.compute_tenant_health(p_tenant UUID)
RETURNS public.customer_health LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_sub TEXT; v_last_log DATE; v_last_evt TIMESTAMPTZ;
  v_farms INT; v_sheds INT; v_batches INT; v_logs INT;
  v_pay INT; v_usage INT; v_login INT; v_setup INT; v_score INT; v_band TEXT;
  v_row public.customer_health;
BEGIN
  SELECT status INTO v_sub FROM public.tenant_subscriptions WHERE tenant_id = p_tenant;
  SELECT max(log_date) INTO v_last_log FROM public.daily_logs WHERE tenant_id = p_tenant;
  SELECT max(created_at) INTO v_last_evt FROM public.analytics_events WHERE tenant_id = p_tenant;
  SELECT count(*) INTO v_farms   FROM public.farms   WHERE tenant_id = p_tenant;
  SELECT count(*) INTO v_sheds   FROM public.sheds   WHERE tenant_id = p_tenant;
  SELECT count(*) INTO v_batches FROM public.batches WHERE tenant_id = p_tenant;
  SELECT count(*) INTO v_logs    FROM public.daily_logs WHERE tenant_id = p_tenant;

  v_pay := CASE v_sub
             WHEN 'active' THEN 100 WHEN 'trial' THEN 70 WHEN 'past_due' THEN 30
             WHEN 'suspended' THEN 0 WHEN 'cancelled' THEN 0 ELSE 50 END;

  v_usage := CASE
               WHEN v_last_log IS NULL THEN 0
               WHEN now()::date - v_last_log <= 2  THEN 100
               WHEN now()::date - v_last_log <= 7  THEN 70
               WHEN now()::date - v_last_log <= 14 THEN 40
               ELSE 10 END;

  v_login := CASE
               WHEN v_last_evt IS NULL THEN 20
               WHEN now() - v_last_evt <= interval '2 days'  THEN 100
               WHEN now() - v_last_evt <= interval '7 days'  THEN 70
               WHEN now() - v_last_evt <= interval '14 days' THEN 40
               ELSE 10 END;

  v_setup := (CASE WHEN v_farms   > 0 THEN 25 ELSE 0 END)
           + (CASE WHEN v_sheds   > 0 THEN 25 ELSE 0 END)
           + (CASE WHEN v_batches > 0 THEN 25 ELSE 0 END)
           + (CASE WHEN v_logs    > 0 THEN 25 ELSE 0 END);

  v_score := round(v_pay * 0.35 + v_usage * 0.30 + v_login * 0.15 + v_setup * 0.20);
  v_band  := CASE WHEN v_score >= 70 THEN 'green' WHEN v_score >= 40 THEN 'yellow' ELSE 'red' END;

  INSERT INTO public.customer_health
    (tenant_id, score, risk_band, payment_score, usage_score, login_score, setup_score, churn_risk, computed_at)
  VALUES
    (p_tenant, v_score, v_band, v_pay, v_usage, v_login, v_setup,
     (v_band = 'red' OR v_sub IN ('past_due','suspended','cancelled')), now())
  ON CONFLICT (tenant_id) DO UPDATE SET
    score = EXCLUDED.score, risk_band = EXCLUDED.risk_band, payment_score = EXCLUDED.payment_score,
    usage_score = EXCLUDED.usage_score, login_score = EXCLUDED.login_score, setup_score = EXCLUDED.setup_score,
    churn_risk = EXCLUDED.churn_risk, computed_at = now()
  RETURNING * INTO v_row;

  UPDATE public.tenants SET health_score = v_score WHERE id = p_tenant;
  RETURN v_row;
END;
$$;

-- -----------------------------------------------------------------------------
-- recompute_all_customer_health — every live tenant. Returns rows processed.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.recompute_all_customer_health()
RETURNS INTEGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE r RECORD; n INT := 0;
BEGIN
  FOR r IN SELECT id FROM public.tenants WHERE deleted_at IS NULL LOOP
    PERFORM public.compute_tenant_health(r.id);
    n := n + 1;
  END LOOP;
  RETURN n;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.compute_tenant_health(UUID) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.recompute_all_customer_health() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.compute_tenant_health(UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.recompute_all_customer_health() TO service_role;

-- Seed an initial pass so the board isn't empty on first load.
SELECT public.recompute_all_customer_health();

COMMIT;
