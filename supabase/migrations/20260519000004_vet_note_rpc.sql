-- Migration: 20260519000004_vet_note_rpc
-- Adds public.update_vet_note(p_incident_id UUID, p_note TEXT) RPC.
--
-- Why an RPC instead of a column-restricted RLS policy:
--   PostgreSQL RLS is row-level, not column-level. Letting a vet UPDATE
--   health_incidents directly would expose every column. A SECURITY DEFINER
--   RPC scoped to the single vet_note column is the clean equivalent of
--   "Vet: UPDATE (vet_note only)" from CLAUDE.md's RLS spec.
--
-- Authorisation: the caller must have a farm_users row with role='vet' on the
-- same farm as the incident. Owners also pass (they can already edit the row
-- via the existing health_incidents_owner_modify policy, but allowing them
-- here keeps a single write path for the vet-note field).

BEGIN;

CREATE OR REPLACE FUNCTION public.update_vet_note(p_incident_id UUID, p_note TEXT)
  RETURNS VOID
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_farm_id UUID;
  v_allowed BOOLEAN;
BEGIN
  SELECT farm_id INTO v_farm_id
    FROM public.health_incidents
   WHERE id = p_incident_id;

  IF v_farm_id IS NULL THEN
    RAISE EXCEPTION 'health incident not found' USING ERRCODE = 'no_data_found';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.farm_users
     WHERE farm_id = v_farm_id
       AND user_id = auth.uid()
       AND role IN ('vet', 'owner')
  ) INTO v_allowed;

  IF NOT v_allowed THEN
    RAISE EXCEPTION 'not authorised to edit vet note for this incident'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  UPDATE public.health_incidents
     SET vet_note = p_note,
         updated_at = now()
   WHERE id = p_incident_id;
END;
$fn$;

REVOKE EXECUTE ON FUNCTION public.update_vet_note(UUID, TEXT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.update_vet_note(UUID, TEXT) FROM anon;
GRANT  EXECUTE ON FUNCTION public.update_vet_note(UUID, TEXT) TO authenticated;

COMMENT ON FUNCTION public.update_vet_note(UUID, TEXT) IS
  'Vet-note write path for health_incidents. SECURITY DEFINER; updates only the vet_note column. Caller must be a vet or owner (farm_users) on the incident''s farm. Implements CLAUDE.md "Vet: UPDATE (vet_note only)".';

COMMIT;
