-- =============================================================================
-- PoultryOS — Batch closure flow
-- File: 20260520000000_batch_closure_flow.sql
-- Created: 2026-05-20
-- Purpose: close_batch() RPC + prevent_closed_batch_mutation() trigger.
--
-- Phase 3 closes the place-batch -> log-daily -> sell -> close lifecycle.
-- The UI lands a batch in status='harvested'; a later Phase 4 flow promotes
-- it to status='closed' which fires lock_traceability_on_close() (already
-- present in initial_schema).
--
-- Authorisation: only owners (via farm_users.role='owner') can close.
-- Immutability: once status IN ('harvested','closed') the row is frozen
-- except for the harvested -> closed transition.
-- =============================================================================

BEGIN;

-- ---------- close_batch RPC --------------------------------------------------

CREATE OR REPLACE FUNCTION public.close_batch(
  p_batch_id           UUID,
  p_harvest_date       DATE,
  p_birds_sold         INTEGER,
  p_sale_weight_kg     NUMERIC,
  p_sale_price_per_kg  NUMERIC
)
  RETURNS public.batches
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_batch       public.batches%ROWTYPE;
  v_is_owner    BOOLEAN;
BEGIN
  SELECT * INTO v_batch FROM public.batches WHERE id = p_batch_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'batch not found' USING ERRCODE = 'no_data_found';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.farm_users
     WHERE farm_id = v_batch.farm_id
       AND user_id = auth.uid()
       AND role = 'owner'
  ) INTO v_is_owner;

  IF NOT v_is_owner THEN
    RAISE EXCEPTION 'only farm owner can close a batch'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF v_batch.status <> 'active' THEN
    RAISE EXCEPTION 'batch is not active (current status: %)', v_batch.status
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  IF p_harvest_date IS NULL OR p_harvest_date > CURRENT_DATE THEN
    RAISE EXCEPTION 'harvest_date must be on or before today'
      USING ERRCODE = 'invalid_parameter_value';
  END IF;
  IF p_harvest_date < v_batch.placement_date THEN
    RAISE EXCEPTION 'harvest_date must be on or after placement_date'
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  IF p_birds_sold IS NULL OR p_birds_sold < 0
     OR p_birds_sold > v_batch.current_bird_count THEN
    RAISE EXCEPTION 'birds_sold must be between 0 and current_bird_count (%)',
      v_batch.current_bird_count
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  IF p_sale_weight_kg IS NULL OR p_sale_weight_kg <= 0 THEN
    RAISE EXCEPTION 'sale_weight_kg must be greater than 0'
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  IF p_sale_price_per_kg IS NULL OR p_sale_price_per_kg <= 0 THEN
    RAISE EXCEPTION 'sale_price_per_kg must be greater than 0'
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  UPDATE public.batches
     SET status            = 'harvested',
         harvest_date      = p_harvest_date,
         birds_sold        = p_birds_sold,
         sale_weight_kg    = p_sale_weight_kg,
         sale_price_per_kg = p_sale_price_per_kg,
         updated_at        = now()
   WHERE id = p_batch_id
   RETURNING * INTO v_batch;

  RETURN v_batch;
END;
$fn$;

REVOKE EXECUTE ON FUNCTION public.close_batch(UUID, DATE, INTEGER, NUMERIC, NUMERIC) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.close_batch(UUID, DATE, INTEGER, NUMERIC, NUMERIC) FROM anon;
GRANT  EXECUTE ON FUNCTION public.close_batch(UUID, DATE, INTEGER, NUMERIC, NUMERIC) TO authenticated;

COMMENT ON FUNCTION public.close_batch(UUID, DATE, INTEGER, NUMERIC, NUMERIC) IS
  'Owner-only batch closure: validates inputs, sets status=harvested, fills harvest_date/birds_sold/sale_weight_kg/sale_price_per_kg. total_sale_revenue is GENERATED.';

-- ---------- prevent_closed_batch_mutation trigger ---------------------------
-- Closed-or-harvested batches are immutable; the only allowed mutation is the
-- promotion harvested -> closed (used by the Phase 4 traceability lock flow).

CREATE OR REPLACE FUNCTION public.prevent_closed_batch_mutation()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SET search_path = public, pg_temp
AS $fn$
BEGIN
  -- Only guard rows that were ALREADY in a terminal status before this update.
  IF OLD.status NOT IN ('harvested', 'closed') THEN
    RETURN NEW;
  END IF;

  -- Allow the harvested -> closed promotion.
  IF OLD.status = 'harvested' AND NEW.status = 'closed' THEN
    RETURN NEW;
  END IF;

  -- Reject any other column or status change.
  IF NEW IS DISTINCT FROM OLD THEN
    RAISE EXCEPTION 'batch % is closed; row is immutable', OLD.id
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS tg_batches_prevent_closed_mutation ON public.batches;
CREATE TRIGGER tg_batches_prevent_closed_mutation
  BEFORE UPDATE ON public.batches
  FOR EACH ROW EXECUTE FUNCTION public.prevent_closed_batch_mutation();

-- Note: existing tg_batches_lock_traceability (initial_schema F.5) fires on
-- status='closed' transitions. The harvest action above lands at 'harvested';
-- the Phase 4 traceability flow will UPDATE status to 'closed' which both
-- locks the traceability record AND is allowed by the new mutation guard.

COMMIT;
