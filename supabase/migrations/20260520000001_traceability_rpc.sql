-- =============================================================================
-- PoultryOS — Traceability record RPC
-- File: 20260520000001_traceability_rpc.sql
-- Created: 2026-05-20
-- Purpose: create_traceability_record(p_batch_id) — owner-only RPC that
--          snapshots a closed/harvested batch into traceability_records and
--          (optionally) promotes status from 'harvested' to 'closed', firing
--          the existing lock_traceability_on_close() trigger.
-- =============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.create_traceability_record(
  p_batch_id UUID
)
  RETURNS public.traceability_records
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_batch         public.batches%ROWTYPE;
  v_is_owner      BOOLEAN;
  v_vax_count     INTEGER;
  v_hi_count      INTEGER;
  v_withdraw_ok   BOOLEAN;
  v_record        public.traceability_records%ROWTYPE;
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
    RAISE EXCEPTION 'only farm owner can issue a traceability certificate'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF v_batch.status NOT IN ('harvested', 'closed') THEN
    RAISE EXCEPTION 'batch must be harvested or closed to issue a certificate (status: %)',
      v_batch.status
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  -- Aggregate the snapshot data
  SELECT COUNT(*) INTO v_vax_count
    FROM public.vaccinations
   WHERE batch_id = p_batch_id AND status = 'done';

  SELECT COUNT(*) INTO v_hi_count
    FROM public.health_incidents
   WHERE batch_id = p_batch_id;

  -- withdrawal_cleared: no open withdrawal periods past harvest date
  SELECT NOT EXISTS (
    SELECT 1 FROM public.health_incidents
     WHERE batch_id = p_batch_id
       AND withdrawal_clearance_date IS NOT NULL
       AND withdrawal_clearance_date > COALESCE(v_batch.harvest_date, CURRENT_DATE)
  ) INTO v_withdraw_ok;

  -- Upsert the traceability_records row (one per batch).
  INSERT INTO public.traceability_records (
    batch_id, farm_id, supplier_name, placement_date, breed_name,
    total_vaccinations, health_incidents_count, withdrawal_cleared,
    harvest_date, buyer_name, is_locked
  ) VALUES (
    v_batch.id, v_batch.farm_id, v_batch.source_supplier, v_batch.placement_date,
    v_batch.breed_name, v_vax_count, v_hi_count, v_withdraw_ok,
    v_batch.harvest_date, NULL, false
  )
  ON CONFLICT (batch_id) DO UPDATE
    SET supplier_name           = EXCLUDED.supplier_name,
        placement_date          = EXCLUDED.placement_date,
        breed_name              = EXCLUDED.breed_name,
        total_vaccinations      = EXCLUDED.total_vaccinations,
        health_incidents_count  = EXCLUDED.health_incidents_count,
        withdrawal_cleared      = EXCLUDED.withdrawal_cleared,
        harvest_date            = EXCLUDED.harvest_date,
        updated_at              = now()
    WHERE NOT public.traceability_records.is_locked
  RETURNING * INTO v_record;

  IF NOT FOUND THEN
    -- Row exists and is_locked=true (re-issue not allowed). Return the
    -- existing locked record so the UI can still display + share it.
    SELECT * INTO v_record FROM public.traceability_records WHERE batch_id = p_batch_id;
  END IF;

  -- Promote batch to closed if it was just harvested; the existing trigger
  -- lock_traceability_on_close() then flips is_locked=true.
  IF v_batch.status = 'harvested' THEN
    UPDATE public.batches SET status = 'closed', updated_at = now()
     WHERE id = p_batch_id;
    SELECT * INTO v_record FROM public.traceability_records WHERE batch_id = p_batch_id;
  END IF;

  RETURN v_record;
END;
$fn$;

REVOKE EXECUTE ON FUNCTION public.create_traceability_record(UUID) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.create_traceability_record(UUID) FROM anon;
GRANT  EXECUTE ON FUNCTION public.create_traceability_record(UUID) TO authenticated;

COMMENT ON FUNCTION public.create_traceability_record(UUID) IS
  'Owner-only: snapshot a harvested/closed batch into traceability_records and promote status=closed so lock_traceability_on_close() locks the record.';

COMMIT;
