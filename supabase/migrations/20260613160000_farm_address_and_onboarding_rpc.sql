-- =============================================================================
-- PoultryOS — Farm address + onboarding RPC pass-through
-- File: 20260613160000_farm_address_and_onboarding_rpc.sql
-- =============================================================================
-- Adds an optional free-text address/locality to farms and threads it through the
-- atomic create_tenant_onboarding() RPC so the onboarding wizard can capture the
-- farm's village / locality / street address. Additive + backwards compatible:
-- callers that omit farm.address simply store NULL.
-- =============================================================================

BEGIN;

ALTER TABLE public.farms ADD COLUMN IF NOT EXISTS address TEXT;
COMMENT ON COLUMN public.farms.address IS 'Optional free-text village / locality / street address of the farm.';

CREATE OR REPLACE FUNCTION public.create_tenant_onboarding(payload JSONB)
  RETURNS JSONB
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_uid        UUID := auth.uid();
  v_tenant_id  UUID;
  v_farm_id    UUID;
  v_farm       JSONB := payload->'farm';
  v_farm_type  TEXT  := COALESCE(v_farm->>'farm_type', 'independent');
  v_integrator UUID  := NULLIF(v_farm->>'integrator_id', '')::UUID;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = '28000';
  END IF;

  -- Guard: a user who already owns a tenant cannot create a second via onboarding.
  IF EXISTS (SELECT 1 FROM public.tenants WHERE owner_id = v_uid) THEN
    RAISE EXCEPTION 'tenant already exists for this user' USING ERRCODE = '23505';
  END IF;

  IF COALESCE(trim(v_farm->>'farm_name'), '') = '' THEN
    RAISE EXCEPTION 'farm_name required' USING ERRCODE = '22023';
  END IF;

  -- contract farms must carry an integrator (mirrors farms CHECK constraint)
  IF v_farm_type = 'contract' AND v_integrator IS NULL THEN
    RAISE EXCEPTION 'contract farm requires integrator_id' USING ERRCODE = '22023';
  END IF;

  -- 2.1 tenant (status=trial; Phase B subscription state machine owns the rest)
  INSERT INTO public.tenants (name, owner_id, business_type, country, timezone, currency, status)
  VALUES (
    COALESCE(NULLIF(trim(payload->>'tenant_name'), ''), trim(v_farm->>'farm_name')),
    v_uid,
    NULLIF(payload->>'business_type', ''),
    COALESCE(NULLIF(payload->>'country', ''), 'IN'),
    COALESCE(NULLIF(payload->>'timezone', ''), 'Asia/Kolkata'),
    COALESCE(NULLIF(payload->>'currency', ''), 'INR'),
    'trial'
  )
  RETURNING id INTO v_tenant_id;

  -- 2.2 owner membership
  INSERT INTO public.tenant_users (tenant_id, user_id, role, accepted_at)
  VALUES (v_tenant_id, v_uid, 'owner', now());

  -- 2.3 profile: ensure exists (trigger should have made it) + link + details
  INSERT INTO public.profiles (id, full_name, tenant_id, role, subscription_status)
  VALUES (
    v_uid,
    COALESCE(NULLIF(trim(payload->>'full_name'), ''), 'New User'),
    v_tenant_id, 'owner', 'free'
  )
  ON CONFLICT (id) DO UPDATE SET
    full_name       = COALESCE(NULLIF(trim(payload->>'full_name'), ''), public.profiles.full_name),
    tenant_id       = v_tenant_id,
    whatsapp_phone  = COALESCE(NULLIF(payload->>'whatsapp_phone', ''), public.profiles.whatsapp_phone),
    whatsapp_opt_in = COALESCE((payload->>'whatsapp_opt_in')::BOOLEAN, public.profiles.whatsapp_opt_in);

  -- 2.4 farm
  INSERT INTO public.farms (
    tenant_id, owner_id, farm_name, owner_name, state, district, address, phone, gstin,
    farm_type, integrator_id, latitude, longitude, heat_stress_threshold_celsius, upi_id
  )
  VALUES (
    v_tenant_id, v_uid,
    trim(v_farm->>'farm_name'),
    COALESCE(NULLIF(trim(v_farm->>'owner_name'), ''), COALESCE(NULLIF(trim(payload->>'full_name'), ''), 'Owner')),
    COALESCE(NULLIF(v_farm->>'state', ''), 'Unknown'),
    NULLIF(v_farm->>'district', ''),
    NULLIF(trim(v_farm->>'address'), ''),
    NULLIF(v_farm->>'phone', ''),
    NULLIF(v_farm->>'gstin', ''),
    v_farm_type,
    v_integrator,
    NULLIF(v_farm->>'latitude', '')::NUMERIC,
    NULLIF(v_farm->>'longitude', '')::NUMERIC,
    COALESCE(NULLIF(v_farm->>'heat_stress_threshold_celsius', '')::NUMERIC, 35.0),
    NULLIF(v_farm->>'upi_id', '')
  )
  RETURNING id INTO v_farm_id;

  -- 2.5 farm_users owner row (carries tenant_id; shed scoping starts empty)
  INSERT INTO public.farm_users (tenant_id, farm_id, user_id, role, assigned_shed_ids, accepted_at)
  VALUES (v_tenant_id, v_farm_id, v_uid, 'owner', '{}', now());

  -- 2.6 mark onboarding progress complete (best-effort; row may not exist)
  INSERT INTO public.onboarding_progress (user_id, current_step, completed_at)
  VALUES (v_uid, 10, now())
  ON CONFLICT (user_id) DO UPDATE SET completed_at = now();

  RETURN jsonb_build_object('tenant_id', v_tenant_id, 'farm_id', v_farm_id);
END;
$fn$;

REVOKE EXECUTE ON FUNCTION public.create_tenant_onboarding(JSONB) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.create_tenant_onboarding(JSONB) FROM anon;
GRANT  EXECUTE ON FUNCTION public.create_tenant_onboarding(JSONB) TO authenticated;

-- Seed an "Other" integrator so contract farmers whose company isn't one of the
-- pre-loaded majors can still complete onboarding.
INSERT INTO public.integrators (name, is_pre_loaded, tariff_card_json)
VALUES ('Other', false, '{}'::jsonb)
ON CONFLICT (name) DO NOTHING;

COMMIT;
