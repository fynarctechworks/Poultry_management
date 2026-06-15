-- Phase 4.1 — Contract settlement reconciliation
--
-- Adds the integrator-STATED side of a settlement (distinct from the grower's
-- own measured figures, which already live in birds_delivered / avg_weight_kg /
-- actual_fcr / actual_mortality_pct) so the app can do a line-by-line
-- "your data vs integrator-stated" comparison with the rupee impact of each gap.
--
-- Also adds a per-cycle tariff snapshot the grower must confirm/edit before the
-- first settlement calc: seeded integrator tariff cards are reference data and
-- may be wrong for an individual grower's contract. Locking the confirmed terms
-- onto the cycle means a later edit to the integrator master never silently
-- changes a historical expectation.

ALTER TABLE public.contract_cycles
  ADD COLUMN IF NOT EXISTS integrator_birds_lifted   INTEGER,
  ADD COLUMN IF NOT EXISTS integrator_avg_weight_kg  NUMERIC,
  ADD COLUMN IF NOT EXISTS integrator_fcr            NUMERIC,
  ADD COLUMN IF NOT EXISTS integrator_mortality_pct  NUMERIC,
  ADD COLUMN IF NOT EXISTS tariff_card_snapshot      JSONB,
  ADD COLUMN IF NOT EXISTS tariff_confirmed_at       TIMESTAMPTZ;

COMMENT ON COLUMN public.contract_cycles.integrator_birds_lifted  IS 'Birds lifted per the integrator''s settlement statement (vs grower''s birds_delivered).';
COMMENT ON COLUMN public.contract_cycles.integrator_avg_weight_kg IS 'Avg live weight per the integrator''s statement (vs grower''s avg_weight_kg).';
COMMENT ON COLUMN public.contract_cycles.integrator_fcr           IS 'FCR per the integrator''s statement (vs grower''s actual_fcr).';
COMMENT ON COLUMN public.contract_cycles.integrator_mortality_pct IS 'Mortality %% per the integrator''s statement (vs grower''s actual_mortality_pct).';
COMMENT ON COLUMN public.contract_cycles.tariff_card_snapshot     IS 'Grower-confirmed tariff terms for THIS cycle. Settlement calc prefers this over the integrator master when present.';
COMMENT ON COLUMN public.contract_cycles.tariff_confirmed_at      IS 'When the grower confirmed/edited the tariff terms for this cycle.';

-- Settlement calc: prefer the per-cycle confirmed snapshot, fall back to the
-- integrator master. Otherwise identical to the prior definition so the shared
-- TS engine (packages/shared/src/contract-reconciliation.ts) stays in lockstep.
CREATE OR REPLACE FUNCTION public.calculate_contract_settlement(p_cycle_id uuid)
 RETURNS TABLE(total_live_weight_kg numeric, base_amount numeric, fcr_bonus numeric, mortality_bonus numeric, total_settlement numeric)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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

  -- Prefer the grower-confirmed per-cycle tariff snapshot; fall back to master.
  v_tariff := v_cycle.tariff_card_snapshot;
  IF v_tariff IS NULL THEN
    SELECT tariff_card_json INTO v_tariff
      FROM public.integrators WHERE id = v_cycle.integrator_id;
  END IF;
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
$function$;
