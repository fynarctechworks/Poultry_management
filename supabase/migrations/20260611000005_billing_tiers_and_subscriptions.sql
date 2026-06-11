-- =============================================================================
-- PoultryOS — SaaS Upgrade · Phase B: Plan Tiers + Per-Tenant Subscriptions
-- File: 20260611000005_billing_tiers_and_subscriptions.sql
-- =============================================================================
-- Trial-first billing. Adds:
--   1. Plan tiers (starter/growth/professional/enterprise) to subscription_plans,
--      with per-tier limits (farms/users) + feature flags.
--   2. tenant_subscriptions — one row per tenant, status state machine:
--      trial -> active -> past_due -> suspended -> cancelled.
--      Backfilled: every existing tenant gets an 'active' professional sub
--      (grandfathered), every new tenant starts 'trial' (14 days).
--   3. is_tenant_paid(tenant) + plan-limit helpers, and is_paid() re-pointed to
--      be tenant + trial aware (keeps the old per-user signature working).
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- 1. Extend subscription_plans with tier metadata + limits.
-- -----------------------------------------------------------------------------
ALTER TABLE public.subscription_plans
  ADD COLUMN IF NOT EXISTS tier            TEXT,
  ADD COLUMN IF NOT EXISTS max_farms       INTEGER,   -- NULL = unlimited
  ADD COLUMN IF NOT EXISTS max_users       INTEGER,   -- NULL = unlimited
  ADD COLUMN IF NOT EXISTS is_contactable  BOOLEAN NOT NULL DEFAULT false,  -- enterprise "contact us"
  ADD COLUMN IF NOT EXISTS sort_order      SMALLINT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS recommended     BOOLEAN NOT NULL DEFAULT false;

-- Seed the four tiers. Prices in INR. Yearly ≈ 10 months (≈17% off).
INSERT INTO public.subscription_plans
  (code, name, tier, monthly_price_inr, yearly_price_inr, max_farms, max_users,
   is_contactable, sort_order, recommended, features_json, is_active)
VALUES
  ('starter', 'Starter', 'starter', 0, 0, 1, 3, false, 1, false,
   jsonb_build_object(
     'vet_access', false, 'contract_farming', false, 'traceability_pdf', false,
     'multi_farm_dashboard', false, 'whatsapp_alerts_per_month', 5, 'max_buyers', 10), true),
  ('growth', 'Growth', 'growth', 499, 4999, 5, 20, false, 2, true,
   jsonb_build_object(
     'vet_access', true, 'contract_farming', true, 'traceability_pdf', true,
     'multi_farm_dashboard', true, 'whatsapp_alerts_per_month', 500, 'max_buyers', 500), true),
  ('professional', 'Professional', 'professional', 1499, 14999, NULL, NULL, false, 3, false,
   jsonb_build_object(
     'vet_access', true, 'contract_farming', true, 'traceability_pdf', true,
     'multi_farm_dashboard', true, 'whatsapp_alerts_per_month', NULL, 'max_buyers', NULL), true),
  ('enterprise', 'Enterprise', 'enterprise', 0, 0, NULL, NULL, true, 4, false,
   jsonb_build_object(
     'vet_access', true, 'contract_farming', true, 'traceability_pdf', true,
     'multi_farm_dashboard', true, 'whatsapp_alerts_per_month', NULL, 'max_buyers', NULL,
     'custom_integrations', true, 'dedicated_support', true, 'sso', true), true)
ON CONFLICT (code) DO UPDATE SET
  name=EXCLUDED.name, tier=EXCLUDED.tier, monthly_price_inr=EXCLUDED.monthly_price_inr,
  yearly_price_inr=EXCLUDED.yearly_price_inr, max_farms=EXCLUDED.max_farms,
  max_users=EXCLUDED.max_users, is_contactable=EXCLUDED.is_contactable,
  sort_order=EXCLUDED.sort_order, recommended=EXCLUDED.recommended,
  features_json=EXCLUDED.features_json, is_active=EXCLUDED.is_active, updated_at=now();

-- Retire the legacy single 'pro' plan from the pricing list (kept row for any
-- FK history, just deactivated so it stops showing on the pricing page).
UPDATE public.subscription_plans SET is_active = false WHERE code = 'pro';

-- -----------------------------------------------------------------------------
-- 2. tenant_subscriptions — the state machine, one row per tenant.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.tenant_subscriptions (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id            UUID NOT NULL UNIQUE REFERENCES public.tenants(id) ON DELETE CASCADE,
  plan_id              UUID REFERENCES public.subscription_plans(id) ON DELETE SET NULL,
  status               TEXT NOT NULL DEFAULT 'trial'
                         CHECK (status IN ('trial','active','past_due','suspended','cancelled')),
  billing_cycle        TEXT NOT NULL DEFAULT 'monthly'
                         CHECK (billing_cycle IN ('monthly','yearly')),
  trial_ends_at        TIMESTAMPTZ,
  current_period_end   TIMESTAMPTZ,         -- renewal date
  razorpay_subscription_id TEXT,
  payment_method       TEXT,
  cancelled_at         TIMESTAMPTZ,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tenant_subscriptions_tenant ON public.tenant_subscriptions(tenant_id);
CREATE INDEX IF NOT EXISTS idx_tenant_subscriptions_status ON public.tenant_subscriptions(status);

CREATE TRIGGER tg_tenant_subscriptions_updated_at
  BEFORE UPDATE ON public.tenant_subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

ALTER TABLE public.tenant_subscriptions ENABLE ROW LEVEL SECURITY;

-- Members may read their tenant's subscription; only owners may write (billing).
CREATE POLICY tenant_subscriptions_member_select ON public.tenant_subscriptions
  FOR SELECT USING (public.is_tenant_member(tenant_id));
CREATE POLICY tenant_subscriptions_owner_write ON public.tenant_subscriptions
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.tenants t WHERE t.id = tenant_id AND t.owner_id = auth.uid())
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.tenants t WHERE t.id = tenant_id AND t.owner_id = auth.uid())
  );

-- -----------------------------------------------------------------------------
-- 3. Backfill: existing tenants -> active professional; new tenants -> trial.
-- -----------------------------------------------------------------------------
INSERT INTO public.tenant_subscriptions (tenant_id, plan_id, status, billing_cycle, current_period_end)
SELECT
  t.id,
  (SELECT id FROM public.subscription_plans WHERE code = 'professional'),
  'active', 'monthly',
  now() + interval '1 year'        -- grandfather existing tenants generously
FROM public.tenants t
ON CONFLICT (tenant_id) DO NOTHING;

-- -----------------------------------------------------------------------------
-- 4. Auto-provision a trial subscription whenever a NEW tenant is created.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.provision_tenant_trial()
  RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $fn$
BEGIN
  INSERT INTO public.tenant_subscriptions
    (tenant_id, plan_id, status, billing_cycle, trial_ends_at, current_period_end)
  VALUES (
    NEW.id,
    (SELECT id FROM public.subscription_plans WHERE code = 'starter'),
    'trial', 'monthly',
    now() + interval '14 days',
    now() + interval '14 days'
  )
  ON CONFLICT (tenant_id) DO NOTHING;
  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS tg_tenants_provision_trial ON public.tenants;
CREATE TRIGGER tg_tenants_provision_trial
  AFTER INSERT ON public.tenants
  FOR EACH ROW EXECUTE FUNCTION public.provision_tenant_trial();

-- -----------------------------------------------------------------------------
-- 5. is_tenant_paid — true while trial active, subscription active, or within a
--    7-day past_due grace window. The single source of truth for gating.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_tenant_paid(p_tenant_id UUID)
  RETURNS BOOLEAN LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_status   TEXT;
  v_trial    TIMESTAMPTZ;
  v_changed  TIMESTAMPTZ;
BEGIN
  IF p_tenant_id IS NULL THEN RETURN false; END IF;
  SELECT status, trial_ends_at, updated_at
    INTO v_status, v_trial, v_changed
    FROM public.tenant_subscriptions WHERE tenant_id = p_tenant_id;
  IF NOT FOUND THEN RETURN false; END IF;

  IF v_status = 'active' THEN RETURN true; END IF;
  IF v_status = 'trial' AND v_trial IS NOT NULL AND v_trial > now() THEN RETURN true; END IF;
  IF v_status = 'past_due' AND v_changed > now() - interval '7 days' THEN RETURN true; END IF;
  RETURN false;
END;
$fn$;

REVOKE ALL ON FUNCTION public.is_tenant_paid(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_tenant_paid(UUID) TO authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 6. Re-point is_paid(uid) to be tenant + trial aware, preserving the old
--    signature so every existing freemium gate keeps compiling. Resolves the
--    user's tenant via profiles.tenant_id (falls back to owned tenant).
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_paid(uid UUID DEFAULT auth.uid())
  RETURNS BOOLEAN LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_tenant UUID;
BEGIN
  IF uid IS NULL THEN RETURN false; END IF;
  SELECT tenant_id INTO v_tenant FROM public.profiles WHERE id = uid;
  IF v_tenant IS NULL THEN
    SELECT id INTO v_tenant FROM public.tenants WHERE owner_id = uid LIMIT 1;
  END IF;
  IF v_tenant IS NULL THEN RETURN false; END IF;
  RETURN public.is_tenant_paid(v_tenant);
END;
$fn$;

REVOKE ALL ON FUNCTION public.is_paid(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_paid(UUID) TO authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 7. Plan-limit helper for freemium enforcement (farms/users count vs tier).
--    Returns the tenant's effective plan limits + current usage as jsonb.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.tenant_plan_status(p_tenant_id UUID)
  RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_plan   public.subscription_plans%ROWTYPE;
  v_farms  INTEGER;
  v_users  INTEGER;
BEGIN
  SELECT p.* INTO v_plan
    FROM public.tenant_subscriptions ts
    JOIN public.subscription_plans p ON p.id = ts.plan_id
   WHERE ts.tenant_id = p_tenant_id;

  SELECT count(*) INTO v_farms FROM public.farms WHERE tenant_id = p_tenant_id;
  SELECT count(*) INTO v_users FROM public.tenant_users WHERE tenant_id = p_tenant_id;

  RETURN jsonb_build_object(
    'tier',        v_plan.tier,
    'max_farms',   v_plan.max_farms,
    'max_users',   v_plan.max_users,
    'used_farms',  v_farms,
    'used_users',  v_users,
    'can_add_farm', v_plan.max_farms IS NULL OR v_farms < v_plan.max_farms,
    'can_add_user', v_plan.max_users IS NULL OR v_users < v_plan.max_users,
    'features',    v_plan.features_json,
    'is_paid',     public.is_tenant_paid(p_tenant_id)
  );
END;
$fn$;

REVOKE ALL ON FUNCTION public.tenant_plan_status(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.tenant_plan_status(UUID) TO authenticated, service_role;

COMMIT;
