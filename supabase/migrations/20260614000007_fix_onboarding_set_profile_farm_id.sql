-- Onboarding bug: create_tenant_onboarding created the farm and linked
-- profiles.tenant_id, but never set profiles.farm_id. The (dashboard) layout
-- redirects to /onboarding whenever profiles.farm_id IS NULL, so a fully
-- onboarded + paid owner was bounced back into the wizard in an endless loop.
-- Fix: link the owner profile to its new farm (step 2.4b) and backfill any
-- existing owners stuck with a NULL farm_id.

CREATE OR REPLACE FUNCTION public.create_tenant_onboarding(payload jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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

  -- 2.4b link the owner profile to its farm (dashboard layout requires farm_id)
  UPDATE public.profiles SET farm_id = v_farm_id WHERE id = v_uid;

  -- 2.5 farm_users owner row (carries tenant_id; shed scoping starts empty)
  INSERT INTO public.farm_users (tenant_id, farm_id, user_id, role, assigned_shed_ids, accepted_at)
  VALUES (v_tenant_id, v_farm_id, v_uid, 'owner', '{}', now());

  -- 2.6 mark onboarding progress complete (best-effort; row may not exist)
  INSERT INTO public.onboarding_progress (user_id, current_step, completed_at)
  VALUES (v_uid, 10, now())
  ON CONFLICT (user_id) DO UPDATE SET completed_at = now();

  RETURN jsonb_build_object('tenant_id', v_tenant_id, 'farm_id', v_farm_id);
END;
$function$;

-- Backfill owners already stuck with a NULL farm_id (the redirect-loop victims).
UPDATE public.profiles p
SET farm_id = f.id, updated_at = now()
FROM public.farms f
WHERE f.tenant_id = p.tenant_id
  AND f.owner_id = p.id
  AND p.farm_id IS NULL;
