-- =============================================================================
-- PoultryOS — Contract farming: integrators seed + settlement RPC
-- File: 20260520000003_contract_farming_seed_and_rpc.sql
-- Created: 2026-05-20
-- Purpose:
--   1. Seed integrators table with the 4 major Indian contract integrators
--      (Suguna, Venkateshwara, Skylark, IB Group) and realistic tariff cards.
--   2. calculate_contract_settlement(p_cycle_id) — owner-visible RPC that
--      computes the expected settlement amount from the cycle's actuals and
--      its integrator's tariff_card_json.
-- =============================================================================

BEGIN;

-- ---------- Seed integrators -------------------------------------------------
-- Idempotent (UNIQUE name) — safe to re-run.

INSERT INTO public.integrators (name, state_presence, tariff_card_json, is_pre_loaded)
VALUES
  (
    'Suguna',
    ARRAY['Tamil Nadu','Karnataka','Andhra Pradesh','Telangana','Maharashtra','Kerala'],
    jsonb_build_object(
      'base_growing_charge_per_kg', 6.00,
      'fcr_bonus',        jsonb_build_object('threshold', 1.70, 'bonus_per_kg', 1.00),
      'mortality_bonus',  jsonb_build_object('threshold_pct', 5.00, 'bonus_per_kg', 0.50),
      'weight_target_kg', 2.20,
      'cycle_days', 42
    ),
    true
  ),
  (
    'Venkateshwara',
    ARRAY['Maharashtra','Karnataka','Andhra Pradesh','Telangana','Madhya Pradesh'],
    jsonb_build_object(
      'base_growing_charge_per_kg', 6.50,
      'fcr_bonus',        jsonb_build_object('threshold', 1.72, 'bonus_per_kg', 1.00),
      'mortality_bonus',  jsonb_build_object('threshold_pct', 5.00, 'bonus_per_kg', 0.50),
      'weight_target_kg', 2.30,
      'cycle_days', 42
    ),
    true
  ),
  (
    'Skylark',
    ARRAY['Punjab','Haryana','Uttar Pradesh','Rajasthan'],
    jsonb_build_object(
      'base_growing_charge_per_kg', 5.50,
      'fcr_bonus',        jsonb_build_object('threshold', 1.75, 'bonus_per_kg', 0.75),
      'mortality_bonus',  jsonb_build_object('threshold_pct', 6.00, 'bonus_per_kg', 0.50),
      'weight_target_kg', 2.10,
      'cycle_days', 42
    ),
    true
  ),
  (
    'IB Group',
    ARRAY['West Bengal','Odisha','Bihar','Jharkhand','Assam'],
    jsonb_build_object(
      'base_growing_charge_per_kg', 6.00,
      'fcr_bonus',        jsonb_build_object('threshold', 1.75, 'bonus_per_kg', 0.75),
      'mortality_bonus',  jsonb_build_object('threshold_pct', 6.00, 'bonus_per_kg', 0.50),
      'weight_target_kg', 2.20,
      'cycle_days', 42
    ),
    true
  )
ON CONFLICT (name) DO UPDATE
  SET state_presence    = EXCLUDED.state_presence,
      tariff_card_json  = EXCLUDED.tariff_card_json,
      is_pre_loaded     = true,
      updated_at        = now();

-- ---------- calculate_contract_settlement RPC -------------------------------
-- Formula (matches CLAUDE.md tariff_card_json schema):
--   base   = base_growing_charge_per_kg * birds_delivered * avg_weight_kg
--   fcr_b  = (actual_fcr <= fcr_threshold) ? fcr_bonus_per_kg * total_kg : 0
--   mort_b = (actual_mortality_pct <= mortality_threshold) ? mortality_bonus_per_kg * total_kg : 0
--   total  = base + fcr_b + mort_b
-- Reads tariff card from the cycle's integrator. Returns a single row with
-- the breakdown so the UI can show "why this number".

CREATE OR REPLACE FUNCTION public.calculate_contract_settlement(
  p_cycle_id UUID
)
  RETURNS TABLE (
    total_live_weight_kg NUMERIC,
    base_amount          NUMERIC,
    fcr_bonus            NUMERIC,
    mortality_bonus      NUMERIC,
    total_settlement     NUMERIC
  )
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_cycle          public.contract_cycles%ROWTYPE;
  v_is_member      BOOLEAN;
  v_tariff         JSONB;
  v_base_rate      NUMERIC;
  v_fcr_thresh     NUMERIC;
  v_fcr_bonus_kg   NUMERIC;
  v_mort_thresh    NUMERIC;
  v_mort_bonus_kg  NUMERIC;
  v_live_kg        NUMERIC;
  v_base           NUMERIC;
  v_fcr_b          NUMERIC;
  v_mort_b         NUMERIC;
BEGIN
  SELECT * INTO v_cycle FROM public.contract_cycles WHERE id = p_cycle_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'contract cycle not found' USING ERRCODE = 'no_data_found';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.farm_users
     WHERE farm_id = v_cycle.farm_id AND user_id = auth.uid()
  ) INTO v_is_member;
  IF NOT v_is_member THEN
    RAISE EXCEPTION 'not authorised for this contract cycle'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT tariff_card_json INTO v_tariff
    FROM public.integrators WHERE id = v_cycle.integrator_id;
  IF v_tariff IS NULL THEN
    RAISE EXCEPTION 'integrator tariff card missing'
      USING ERRCODE = 'no_data_found';
  END IF;

  v_base_rate     := COALESCE((v_tariff->>'base_growing_charge_per_kg')::NUMERIC, 0);
  v_fcr_thresh    := COALESCE((v_tariff#>>'{fcr_bonus,threshold}')::NUMERIC, 0);
  v_fcr_bonus_kg  := COALESCE((v_tariff#>>'{fcr_bonus,bonus_per_kg}')::NUMERIC, 0);
  v_mort_thresh   := COALESCE((v_tariff#>>'{mortality_bonus,threshold_pct}')::NUMERIC, 0);
  v_mort_bonus_kg := COALESCE((v_tariff#>>'{mortality_bonus,bonus_per_kg}')::NUMERIC, 0);

  v_live_kg := COALESCE(v_cycle.birds_delivered, 0) * COALESCE(v_cycle.avg_weight_kg, 0);
  v_base    := v_base_rate * v_live_kg;
  v_fcr_b   := CASE
    WHEN v_cycle.actual_fcr IS NOT NULL
         AND v_fcr_thresh > 0
         AND v_cycle.actual_fcr <= v_fcr_thresh
      THEN v_fcr_bonus_kg * v_live_kg
    ELSE 0
  END;
  v_mort_b  := CASE
    WHEN v_cycle.actual_mortality_pct IS NOT NULL
         AND v_mort_thresh > 0
         AND v_cycle.actual_mortality_pct <= v_mort_thresh
      THEN v_mort_bonus_kg * v_live_kg
    ELSE 0
  END;

  RETURN QUERY SELECT
    v_live_kg,
    v_base,
    v_fcr_b,
    v_mort_b,
    v_base + v_fcr_b + v_mort_b;
END;
$fn$;

REVOKE EXECUTE ON FUNCTION public.calculate_contract_settlement(UUID) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.calculate_contract_settlement(UUID) FROM anon;
GRANT  EXECUTE ON FUNCTION public.calculate_contract_settlement(UUID) TO authenticated;

COMMENT ON FUNCTION public.calculate_contract_settlement(UUID) IS
  'Owner/worker/vet read-only: returns the settlement breakdown (base + FCR bonus + mortality bonus) for a contract cycle using the integrator tariff card.';

COMMIT;
