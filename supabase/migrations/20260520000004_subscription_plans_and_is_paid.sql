-- =============================================================================
-- PoultryOS — Phase 5 freemium gating: subscription_plans table + is_paid RPC
-- File: 20260520000004_subscription_plans_and_is_paid.sql
-- Created: 2026-05-20
-- Purpose:
--   1. subscription_plans table — master list of billing plans; seeded with the
--      single 'pro' plan (₹299/mo, ₹2999/yr).
--   2. is_paid(uid UUID) RPC — returns TRUE for active subscribers plus a
--      7-day grace window for past_due (so a failed charge doesn't lock the
--      farm out immediately).
-- =============================================================================

-- BEGIN; — kept as documentation for manual psql use; stripped before MCP apply

-- =============================================================================
-- 1. subscription_plans table
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.subscription_plans (
  id                        UUID          NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  code                      TEXT          NOT NULL,
  name                      TEXT          NOT NULL,
  monthly_price_inr         NUMERIC(10,2) NOT NULL,
  yearly_price_inr          NUMERIC(10,2) NOT NULL,
  razorpay_plan_id_monthly  TEXT,           -- nullable; filled from Razorpay dashboard
  razorpay_plan_id_yearly   TEXT,           -- nullable; filled from Razorpay dashboard
  features_json             JSONB         NOT NULL DEFAULT '{}'::jsonb,
  is_active                 BOOLEAN       NOT NULL DEFAULT true,
  created_at                TIMESTAMPTZ   NOT NULL DEFAULT now(),
  updated_at                TIMESTAMPTZ   NOT NULL DEFAULT now(),

  CONSTRAINT subscription_plans_code_unique UNIQUE (code)
);

-- =============================================================================
-- 2. updated_at trigger (reuses the shared helper from initial_schema)
-- =============================================================================

CREATE TRIGGER tg_subscription_plans_updated_at
  BEFORE UPDATE ON public.subscription_plans
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- =============================================================================
-- 3. RLS
-- =============================================================================

ALTER TABLE public.subscription_plans ENABLE ROW LEVEL SECURITY;

-- Any authenticated user can read active plans (pricing page, upgrade prompts).
-- No INSERT / UPDATE / DELETE policies → only service_role can write.
CREATE POLICY subscription_plans_authenticated_select
  ON public.subscription_plans
  FOR SELECT
  TO authenticated
  USING (is_active = true);

-- =============================================================================
-- 4. Seed: 'pro' plan
--    ON CONFLICT (code) DO UPDATE so re-running the migration is safe.
-- =============================================================================

INSERT INTO public.subscription_plans (
  code,
  name,
  monthly_price_inr,
  yearly_price_inr,
  razorpay_plan_id_monthly,
  razorpay_plan_id_yearly,
  features_json,
  is_active
)
VALUES (
  'pro',
  'PoultryOS Pro',
  299.00,
  2999.00,
  NULL,
  NULL,
  jsonb_build_object(
    'unlimited_farms',           true,
    'unlimited_sheds',           true,
    'unlimited_workers',         true,
    'vet_access',                true,
    'unlimited_buyers',          true,
    'unlimited_whatsapp_alerts', true,
    'contract_farming',          true,
    'traceability_pdf',          true,
    'multi_farm_dashboard',      true
  ),
  true
)
ON CONFLICT (code) DO UPDATE
  SET name                      = EXCLUDED.name,
      monthly_price_inr         = EXCLUDED.monthly_price_inr,
      yearly_price_inr          = EXCLUDED.yearly_price_inr,
      features_json             = EXCLUDED.features_json,
      is_active                 = EXCLUDED.is_active,
      updated_at                = now();

-- =============================================================================
-- 5. is_paid(uid UUID) RPC
--    Returns TRUE if:
--      - subscription_status = 'active', OR
--      - subscription_status = 'past_due' AND profiles.updated_at is within the
--        last 7 days (grace period so a single failed charge doesn't lock out
--        the farmer immediately).
--    Defaults to auth.uid() so callers can omit the argument.
--    SECURITY DEFINER so it can read profiles without the caller needing direct
--    SELECT on profiles. Revoked from anon/public; granted to authenticated +
--    service_role.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.is_paid(
  uid UUID DEFAULT auth.uid()
)
  RETURNS BOOLEAN
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public, pg_temp
AS $$
DECLARE
  v_status  TEXT;
  v_changed TIMESTAMPTZ;
BEGIN
  IF uid IS NULL THEN
    RETURN false;
  END IF;

  SELECT subscription_status, updated_at
    INTO v_status, v_changed
    FROM public.profiles
   WHERE id = uid;

  IF NOT FOUND THEN
    RETURN false;
  END IF;

  IF v_status = 'active' THEN
    RETURN true;
  END IF;

  -- 7-day grace period: a failed Razorpay charge moves the account to
  -- past_due but we don't immediately lock the farm out.
  IF v_status = 'past_due' AND v_changed > now() - interval '7 days' THEN
    RETURN true;
  END IF;

  RETURN false;
END;
$$;

-- L3: REVOKE from anon/public to prevent PostgREST exposure of a SECURITY DEFINER
-- function. Then grant explicitly to the roles that need it (L3 pattern).
REVOKE ALL ON FUNCTION public.is_paid(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_paid(UUID) TO authenticated, service_role;

COMMENT ON FUNCTION public.is_paid(UUID) IS
  'Returns TRUE when the given user (default: current user) has an active paid subscription, '
  'or is within the 7-day past_due grace window. Used by all freemium gate checks.';

-- COMMIT; — kept as documentation for manual psql use; stripped before MCP apply
