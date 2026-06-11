-- =============================================================================
-- tests/db/onboarding_smoke.test.sql
-- Smoke test: full onboarding insert chain + key trigger/RLS assertions
--
-- LOCAL ONLY: run via `supabase db reset` or `supabase db test`.
-- NOT safe to apply to a remote/production project — inserts directly into
-- auth.users, which bypasses Supabase Auth and would pollute remote auth state.
--
-- Usage (local stack):
--   supabase start
--   supabase db test --db-url postgresql://postgres:postgres@127.0.0.1:54322/postgres
--   OR: psql $LOCAL_DB_URL -f tests/db/onboarding_smoke.test.sql
-- =============================================================================

BEGIN;

SELECT plan(10);

-- ---------------------------------------------------------------------------
-- SEED: two auth users
-- ---------------------------------------------------------------------------
INSERT INTO auth.users (
  id, email, encrypted_password, email_confirmed_at,
  created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
  is_super_admin, aud, role
) VALUES
  (
    'aaaaaaaa-0000-0000-0000-000000000001',
    'owner1@test.local',
    crypt('test-password', gen_salt('bf')),
    now(), now(), now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{}'::jsonb,
    false, 'authenticated', 'authenticated'
  ),
  (
    'aaaaaaaa-0000-0000-0000-000000000002',
    'owner2@test.local',
    crypt('test-password', gen_salt('bf')),
    now(), now(), now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{}'::jsonb,
    false, 'authenticated', 'authenticated'
  );

-- ---------------------------------------------------------------------------
-- SEED: tenants + memberships (required since the multi-tenant migration —
-- RLS now gates on is_tenant_member(tenant_id) first). One tenant per owner.
-- ---------------------------------------------------------------------------
INSERT INTO public.tenants (id, name, owner_id, status) VALUES
  ('eeeeeeee-0000-0000-0000-000000000001', 'Tenant One', 'aaaaaaaa-0000-0000-0000-000000000001', 'active'),
  ('eeeeeeee-0000-0000-0000-000000000002', 'Tenant Two', 'aaaaaaaa-0000-0000-0000-000000000002', 'active');

INSERT INTO public.tenant_users (tenant_id, user_id, role, accepted_at) VALUES
  ('eeeeeeee-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 'owner', now()),
  ('eeeeeeee-0000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000002', 'owner', now());

-- ---------------------------------------------------------------------------
-- SEED: profiles (simulates onboarding step 1 — profile UPDATE after signup)
-- ---------------------------------------------------------------------------
INSERT INTO public.profiles (
  id, full_name, phone, whatsapp_phone, whatsapp_opt_in, role, subscription_status, tenant_id
) VALUES
  ('aaaaaaaa-0000-0000-0000-000000000001', 'Owner One', '+919000000001', '+919000000001', true, 'owner', 'free', 'eeeeeeee-0000-0000-0000-000000000001'),
  ('aaaaaaaa-0000-0000-0000-000000000002', 'Owner Two', '+919000000002', '+919000000002', false, 'owner', 'free', 'eeeeeeee-0000-0000-0000-000000000002')
ON CONFLICT (id) DO UPDATE SET tenant_id = EXCLUDED.tenant_id, full_name = EXCLUDED.full_name;

-- ---------------------------------------------------------------------------
-- SEED: farm for user 1 (onboarding step 2)
-- ---------------------------------------------------------------------------
INSERT INTO public.farms (
  id, tenant_id, owner_id, farm_name, owner_name, state, district, farm_type,
  heat_stress_threshold_celsius, upi_id
) VALUES (
  'ffffffff-0000-0000-0000-000000000001',
  'eeeeeeee-0000-0000-0000-000000000001',
  'aaaaaaaa-0000-0000-0000-000000000001',
  'Sunrise Poultry Farm', 'Owner One', 'Andhra Pradesh', 'Krishna',
  'independent', 35.0, 'owner1@okhdfcbank'
);

-- Farm for user 2
INSERT INTO public.farms (
  id, tenant_id, owner_id, farm_name, owner_name, state, district, farm_type,
  heat_stress_threshold_celsius
) VALUES (
  'ffffffff-0000-0000-0000-000000000002',
  'eeeeeeee-0000-0000-0000-000000000002',
  'aaaaaaaa-0000-0000-0000-000000000002',
  'Blue Sky Farm', 'Owner Two', 'Telangana', 'Karimnagar',
  'independent', 36.0
);

-- Link profiles to farms
UPDATE public.profiles SET farm_id = 'ffffffff-0000-0000-0000-000000000001'
  WHERE id = 'aaaaaaaa-0000-0000-0000-000000000001';
UPDATE public.profiles SET farm_id = 'ffffffff-0000-0000-0000-000000000002'
  WHERE id = 'aaaaaaaa-0000-0000-0000-000000000002';

-- ---------------------------------------------------------------------------
-- SEED: farm_users entry (onboarding step 2 completion)
-- ---------------------------------------------------------------------------
INSERT INTO public.farm_users (id, tenant_id, farm_id, user_id, role, invited_at, accepted_at)
VALUES (
  gen_random_uuid(),
  'eeeeeeee-0000-0000-0000-000000000001',
  'ffffffff-0000-0000-0000-000000000001',
  'aaaaaaaa-0000-0000-0000-000000000001',
  'owner',
  now(), now()
);

-- ---------------------------------------------------------------------------
-- SEED: shed for farm 1 (onboarding step — farm setup)
-- ---------------------------------------------------------------------------
INSERT INTO public.sheds (id, tenant_id, farm_id, shed_name, capacity, poultry_type, status)
VALUES (
  'dddddddd-0000-0000-0000-000000000001',
  'eeeeeeee-0000-0000-0000-000000000001',
  'ffffffff-0000-0000-0000-000000000001',
  'Shed A', 1000, 'broiler', 'active'
);

-- ---------------------------------------------------------------------------
-- SEED: batch WITHOUT providing batch_code — trigger must generate it
-- ---------------------------------------------------------------------------
INSERT INTO public.batches (
  id, tenant_id, shed_id, farm_id, breed_name, poultry_type,
  placement_date, opening_bird_count, current_bird_count, source_supplier, cost_per_bird, status
) VALUES (
  'bbbbbbbb-0000-0000-0000-000000000001',
  'eeeeeeee-0000-0000-0000-000000000001',
  'dddddddd-0000-0000-0000-000000000001',
  'ffffffff-0000-0000-0000-000000000001',
  'Vencobb 400', 'broiler',
  current_date, 500, 500, 'ABC Hatchery', 45.00, 'active'
);

-- ---------------------------------------------------------------------------
-- T1. batch_code is populated by the generate_batch_code trigger
-- ---------------------------------------------------------------------------
SELECT ok(
  (SELECT batch_code IS NOT NULL AND length(batch_code) > 0
   FROM public.batches
   WHERE id = 'bbbbbbbb-0000-0000-0000-000000000001'),
  'T1: batch_code auto-populated by generate_batch_code trigger'
);

-- ---------------------------------------------------------------------------
-- T2. current_bird_count = opening_bird_count after insert (before any logs)
-- ---------------------------------------------------------------------------
SELECT ok(
  (SELECT current_bird_count = opening_bird_count
   FROM public.batches
   WHERE id = 'bbbbbbbb-0000-0000-0000-000000000001'),
  'T2: current_bird_count equals opening_bird_count after insert'
);

-- ---------------------------------------------------------------------------
-- T3. Insert daily_log → current_bird_count decrements by birds_dead
-- ---------------------------------------------------------------------------
INSERT INTO public.daily_logs (
  id, tenant_id, batch_id, farm_id, logged_by, log_date,
  birds_dead, death_cause, feed_consumed_kg, feed_type,
  feed_cost_per_kg, is_synced
) VALUES (
  gen_random_uuid(),
  'eeeeeeee-0000-0000-0000-000000000001',
  'bbbbbbbb-0000-0000-0000-000000000001',
  'ffffffff-0000-0000-0000-000000000001',
  'aaaaaaaa-0000-0000-0000-000000000001',
  current_date,
  5, 'disease', 120.0, 'grower', 22.50, true
);

SELECT ok(
  (SELECT current_bird_count = 495
   FROM public.batches
   WHERE id = 'bbbbbbbb-0000-0000-0000-000000000001'),
  'T3: current_bird_count = 495 after daily_log with 5 deaths'
);

-- ---------------------------------------------------------------------------
-- T4. UNIQUE(batch_id, log_date) — duplicate log_date fails
-- ---------------------------------------------------------------------------
SELECT throws_ok(
  $$ INSERT INTO public.daily_logs (
       id, tenant_id, batch_id, farm_id, logged_by, log_date,
       birds_dead, death_cause, feed_consumed_kg, feed_type,
       feed_cost_per_kg, is_synced
     ) VALUES (
       gen_random_uuid(),
       'eeeeeeee-0000-0000-0000-000000000001',
       'bbbbbbbb-0000-0000-0000-000000000001',
       'ffffffff-0000-0000-0000-000000000001',
       'aaaaaaaa-0000-0000-0000-000000000001',
       current_date,
       2, 'unknown', 100.0, 'grower', 22.50, true
     ) $$,
  '23505',
  NULL,
  'T4: duplicate (batch_id, log_date) raises unique-violation 23505'
);

-- ---------------------------------------------------------------------------
-- T5. farm 1 data exists (sanity)
-- ---------------------------------------------------------------------------
SELECT ok(
  (SELECT count(*) = 1 FROM public.farms WHERE id = 'ffffffff-0000-0000-0000-000000000001'),
  'T5: farm 1 row exists'
);

-- ---------------------------------------------------------------------------
-- T6. farm 2 data exists (sanity)
-- ---------------------------------------------------------------------------
SELECT ok(
  (SELECT count(*) = 1 FROM public.farms WHERE id = 'ffffffff-0000-0000-0000-000000000002'),
  'T6: farm 2 row exists'
);

-- ---------------------------------------------------------------------------
-- RLS tests — must switch role to authenticated + set JWT claims
-- ---------------------------------------------------------------------------

-- T7. Owner 1 authenticated → can SELECT their own farm
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" = '{"sub":"aaaaaaaa-0000-0000-0000-000000000001","role":"authenticated"}';

SELECT ok(
  (SELECT count(*) = 1 FROM public.farms WHERE id = 'ffffffff-0000-0000-0000-000000000001'),
  'T7: owner1 can SELECT own farm (RLS allows)'
);

-- T8. Owner 1 CANNOT SELECT owner 2''s farm
SELECT ok(
  (SELECT count(*) = 0 FROM public.farms WHERE id = 'ffffffff-0000-0000-0000-000000000002'),
  'T8: owner1 cannot SELECT owner2 farm (RLS denies cross-farm)'
);

-- T9. Owner 1 CANNOT SELECT owner 2''s sheds
SELECT ok(
  (SELECT count(*) = 0 FROM public.sheds WHERE farm_id = 'ffffffff-0000-0000-0000-000000000002'),
  'T9: owner1 cannot SELECT sheds belonging to owner2 farm (RLS denies)'
);

-- T10. Owner 1 can SELECT their own batch
SELECT ok(
  (SELECT count(*) = 1 FROM public.batches WHERE id = 'bbbbbbbb-0000-0000-0000-000000000001'),
  'T10: owner1 can SELECT own batch (RLS allows)'
);

-- Restore superuser role for finish() and rollback
RESET ROLE;

SELECT * FROM finish();

ROLLBACK;
