-- Migration: 20260519000000_custom_integrator_rpc
-- Adds public.create_custom_integrator(p_name TEXT) RPC so authenticated
-- onboarding clients can register a custom contract integrator without
-- service-role access.
-- See CLAUDE.md "RLS Policy Summary" + onboarding wizard step 3.

BEGIN;

CREATE OR REPLACE FUNCTION public.create_custom_integrator(p_name TEXT)
  RETURNS UUID
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_id   UUID;
  v_name TEXT := trim(p_name);
BEGIN
  IF v_name IS NULL OR length(v_name) < 2 THEN
    RAISE EXCEPTION 'integrator name required (min 2 chars)'
      USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.integrators (name, state_presence, tariff_card_json, is_pre_loaded)
    VALUES (
      v_name,
      ARRAY[]::TEXT[],
      jsonb_build_object('review_required', true, 'source', 'user_custom'),
      false
    )
    ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name
    RETURNING id INTO v_id;

  RETURN v_id;
END;
$fn$;

REVOKE EXECUTE ON FUNCTION public.create_custom_integrator(TEXT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.create_custom_integrator(TEXT) FROM anon;
GRANT  EXECUTE ON FUNCTION public.create_custom_integrator(TEXT) TO authenticated;

COMMENT ON FUNCTION public.create_custom_integrator(TEXT) IS
  'Idempotent: returns existing integrator id if name already present. Used by onboarding wizard step 3 when user picks "Custom" integrator. SECURITY DEFINER so authenticated role can bypass integrators RLS write restriction.';

COMMIT;
