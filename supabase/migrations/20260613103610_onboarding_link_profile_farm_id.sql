-- =============================================================================
-- Phase C fix: link profiles.farm_id during onboarding.
-- File: 20260613103610_onboarding_link_profile_farm_id.sql
-- =============================================================================
-- create_tenant_onboarding linked profiles.tenant_id but never the legacy
-- profiles.farm_id, which the dashboard layout uses as the "onboarding complete"
-- gate -> every newly-onboarded owner bounced back to /onboarding. Recreate the
-- function adding the farm link right after the farm is created, and backfill
-- existing owners whose link is missing.
-- =============================================================================

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

  IF EXISTS (SELECT 1 FROM public.tenants WHERE owner_id = v_uid) THEN
    RAISE EXCEPTION 'tenant already exists for this user' USING ERRCODE = '23505';
  END IF;

  IF COALESCE(trim(v_farm->>'farm_name'), '') = '' THEN
    RAISE EXCEPTION 'farm_name required' USING ERRCODE = '22023';
  END IF;

  IF v_farm_type = 'contract' AND v_integrator IS NULL THEN
    RAISE EXCEPTION 'contract farm requires integrator_id' USING ERRCODE = '22023';
  END IF;

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

  INSERT INTO public.tenant_users (tenant_id, user_id, role, accepted_at)
  VALUES (v_tenant_id, v_uid, 'owner', now());

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

  INSERT INTO public.farms (
    tenant_id, owner_id, farm_name, owner_name, state, district, phone, gstin,
    farm_type, integrator_id, latitude, longitude, heat_stress_threshold_celsius, upi_id
  )
  VALUES (
    v_tenant_id, v_uid,
    trim(v_farm->>'farm_name'),
    COALESCE(NULLIF(trim(v_farm->>'owner_name'), ''), COALESCE(NULLIF(trim(payload->>'full_name'), ''), 'Owner')),
    COALESCE(NULLIF(v_farm->>'state', ''), 'Unknown'),
    NULLIF(v_farm->>'district', ''),
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

  -- Link the owner's profile to their farm so the dashboard "onboarding complete"
  -- gate (profiles.farm_id) passes.
  UPDATE public.profiles SET farm_id = v_farm_id WHERE id = v_uid;

  INSERT INTO public.farm_users (tenant_id, farm_id, user_id, role, assigned_shed_ids, accepted_at)
  VALUES (v_tenant_id, v_farm_id, v_uid, 'owner', '{}', now());

  INSERT INTO public.onboarding_progress (user_id, current_step, completed_at)
  VALUES (v_uid, 10, now())
  ON CONFLICT (user_id) DO UPDATE SET completed_at = now();

  RETURN jsonb_build_object('tenant_id', v_tenant_id, 'farm_id', v_farm_id);
END;
$fn$;

-- Backfill any existing owners whose farm link is missing.
UPDATE public.profiles p
   SET farm_id = f.id
  FROM public.farms f
 WHERE f.owner_id = p.id AND p.farm_id IS NULL;
