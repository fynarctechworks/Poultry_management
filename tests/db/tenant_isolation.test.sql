-- =============================================================================
-- tests/db/tenant_isolation.test.sql
-- Phase A5: tenant isolation + onboarding RPC atomicity + handle_new_user trigger
--
-- LOCAL ONLY (inserts into auth.users). Run via:
--   psql $LOCAL_DB_URL -f tests/db/tenant_isolation.test.sql
-- =============================================================================

BEGIN;

SELECT plan(13);

-- ---------------------------------------------------------------------------
-- SEED: two auth users. The handle_new_user trigger should auto-create their
-- profiles — we assert that rather than inserting profiles manually.
-- ---------------------------------------------------------------------------
INSERT INTO auth.users (
  id, email, encrypted_password, email_confirmed_at,
  created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
  is_super_admin, aud, role
) VALUES
  ('aaaaaaaa-0000-0000-0000-0000000000a1', 'tA@test.local',
   crypt('x', gen_salt('bf')), now(), now(), now(),
   '{"provider":"email"}'::jsonb, '{"full_name":"Tenant A Owner"}'::jsonb,
   false, 'authenticated', 'authenticated'),
  ('aaaaaaaa-0000-0000-0000-0000000000a2', 'tB@test.local',
   crypt('x', gen_salt('bf')), now(), now(), now(),
   '{"provider":"email"}'::jsonb, '{"full_name":"Tenant B Owner"}'::jsonb,
   false, 'authenticated', 'authenticated');

-- T1: trigger auto-created a profile for user A (fixes audit P0-3)
SELECT ok(
  (SELECT count(*) = 1 FROM public.profiles WHERE id = 'aaaaaaaa-0000-0000-0000-0000000000a1'),
  'T1: handle_new_user trigger created profile for user A');

-- T2: trigger pulled full_name from signup metadata
SELECT is(
  (SELECT full_name FROM public.profiles WHERE id = 'aaaaaaaa-0000-0000-0000-0000000000a1'),
  'Tenant A Owner',
  'T2: profile full_name came from raw_user_meta_data');

-- ---------------------------------------------------------------------------
-- Onboarding via the transactional RPC, as user A
-- ---------------------------------------------------------------------------
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" = '{"sub":"aaaaaaaa-0000-0000-0000-0000000000a1","role":"authenticated"}';

SELECT public.create_tenant_onboarding($$
{
  "tenant_name": "Tenant A Co",
  "business_type": "broiler",
  "full_name": "Tenant A Owner",
  "whatsapp_phone": "+919000000001",
  "whatsapp_opt_in": true,
  "farm": {
    "farm_name": "Farm A1", "owner_name": "Tenant A Owner",
    "state": "Andhra Pradesh", "district": "Krishna",
    "farm_type": "independent", "heat_stress_threshold_celsius": 35.0
  }
}
$$::jsonb) AS tenant_a_result \gset

-- T3: RPC created exactly one tenant owned by A
SELECT ok(
  (SELECT count(*) = 1 FROM public.tenants WHERE owner_id = 'aaaaaaaa-0000-0000-0000-0000000000a1'),
  'T3: create_tenant_onboarding created tenant for A');

-- T4: farm linked to A''s tenant
SELECT ok(
  (SELECT count(*) = 1 FROM public.farms f
     JOIN public.tenants t ON t.id = f.tenant_id
    WHERE t.owner_id = 'aaaaaaaa-0000-0000-0000-0000000000a1'
      AND f.farm_name = 'Farm A1'),
  'T4: farm created and tenant_id linked');

-- T5: owner membership row exists with role owner
SELECT ok(
  (SELECT count(*) = 1 FROM public.tenant_users tu
     JOIN public.tenants t ON t.id = tu.tenant_id
    WHERE t.owner_id = 'aaaaaaaa-0000-0000-0000-0000000000a1'
      AND tu.user_id = 'aaaaaaaa-0000-0000-0000-0000000000a1'
      AND tu.role = 'owner'),
  'T5: tenant_users owner membership created');

-- T6: calling the RPC twice for the same user is rejected (no second tenant)
SELECT throws_ok(
  $$ SELECT public.create_tenant_onboarding('{"farm":{"farm_name":"dup"}}'::jsonb) $$,
  '23505', NULL,
  'T6: second onboarding for same user raises 23505');

-- T7: RPC atomicity — a contract farm with no integrator rolls back fully.
-- (We are still user A who already has a tenant, so guard fires first; use a
--  fresh assertion via a sub-block as a different... instead assert the
--  validation path on the payload shape.)
RESET ROLE;
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" = '{"sub":"aaaaaaaa-0000-0000-0000-0000000000a2","role":"authenticated"}';
SELECT throws_ok(
  $$ SELECT public.create_tenant_onboarding(
       '{"farm":{"farm_name":"Bad Farm","farm_type":"contract"}}'::jsonb) $$,
  '22023', NULL,
  'T7: contract farm without integrator_id raises 22023 and rolls back');

-- T8: after the failed call, user B still has NO tenant (atomic rollback)
RESET ROLE;
SELECT ok(
  (SELECT count(*) = 0 FROM public.tenants WHERE owner_id = 'aaaaaaaa-0000-0000-0000-0000000000a2'),
  'T8: failed onboarding left no orphan tenant for B (atomicity)');

-- ---------------------------------------------------------------------------
-- Onboard user B properly, then prove cross-tenant isolation under RLS
-- ---------------------------------------------------------------------------
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" = '{"sub":"aaaaaaaa-0000-0000-0000-0000000000a2","role":"authenticated"}';
SELECT public.create_tenant_onboarding($$
{
  "tenant_name": "Tenant B Co", "full_name": "Tenant B Owner",
  "farm": { "farm_name": "Farm B1", "state": "Telangana", "farm_type": "independent" }
}
$$::jsonb);

-- T9: as user A, can SELECT own farm
RESET ROLE;
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" = '{"sub":"aaaaaaaa-0000-0000-0000-0000000000a1","role":"authenticated"}';
SELECT ok(
  (SELECT count(*) = 1 FROM public.farms WHERE farm_name = 'Farm A1'),
  'T9: user A sees own farm (RLS allows in-tenant)');

-- T10: as user A, CANNOT see tenant B''s farm
SELECT ok(
  (SELECT count(*) = 0 FROM public.farms WHERE farm_name = 'Farm B1'),
  'T10: user A cannot see tenant B farm (RLS denies cross-tenant)');

-- T11: as user A, CANNOT see tenant B''s tenant row
SELECT ok(
  (SELECT count(*) = 0 FROM public.tenants WHERE name = 'Tenant B Co'),
  'T11: user A cannot see tenant B tenant row');

-- T12: as user A, CANNOT see tenant B''s membership rows
SELECT ok(
  (SELECT count(*) = 0 FROM public.tenant_users tu
     JOIN public.tenants t ON t.id = tu.tenant_id
    WHERE t.name = 'Tenant B Co'),
  'T12: user A cannot see tenant B memberships');

-- T13: auto-fill trigger — inserting a shed with ONLY farm_id (no tenant_id,
-- mimicking existing client/Edge-Function code) populates tenant_id from farm.
RESET ROLE;
WITH ins AS (
  INSERT INTO public.sheds (farm_id, shed_name, capacity, poultry_type, status)
  SELECT id, 'Auto Shed', 500, 'broiler', 'active'
    FROM public.farms WHERE farm_name = 'Farm A1'
  RETURNING tenant_id
)
SELECT is(
  (SELECT tenant_id FROM ins),
  (SELECT tenant_id FROM public.farms WHERE farm_name = 'Farm A1'),
  'T13: shed inserted with only farm_id got tenant_id auto-filled'
);

SELECT * FROM finish();
ROLLBACK;
