-- =============================================================================
-- tests/db/plans_dynamic.test.sql
-- Control Center Increment 3 / M4: dynamic plans — guarded CRUD, history, audit,
-- and backward-compatible features_json rebuild. LOCAL ONLY.
-- =============================================================================

BEGIN;

SELECT plan(6);

INSERT INTO auth.users (id, email, raw_user_meta_data, aud, role) VALUES
  ('22222222-0000-0000-0000-000000000001', 'pls@test.local', '{}'::jsonb, 'authenticated','authenticated'),
  ('22222222-0000-0000-0000-000000000002', 'plr@test.local', '{}'::jsonb, 'authenticated','authenticated');
INSERT INTO public.platform_admins (user_id, role_id)
  SELECT '22222222-0000-0000-0000-000000000001', id FROM public.platform_roles WHERE code = 'super_admin';
INSERT INTO public.platform_admins (user_id, role_id)
  SELECT '22222222-0000-0000-0000-000000000002', id FROM public.platform_roles WHERE code = 'read_only';

-- ---- T1: read-only operator cannot create a plan -----------------------------
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" = '{"sub":"22222222-0000-0000-0000-000000000002","role":"authenticated"}';
SELECT throws_ok(
  $$ SELECT public.cc_create_plan('{"code":"nope","name":"Nope","tier":"custom"}'::jsonb) $$,
  '42501', NULL,
  'T1: read-only operator cannot create a plan');

-- ---- T2: super admin creates a plan -----------------------------------------
RESET ROLE;
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" = '{"sub":"22222222-0000-0000-0000-000000000001","role":"authenticated"}';
SELECT is(
  (public.cc_create_plan('{"code":"test_plan","name":"Test Plan","tier":"custom","monthly_price_inr":111,"max_farms":7}'::jsonb)).code,
  'test_plan',
  'T2: super admin creates a plan');

RESET ROLE;
CREATE TEMP TABLE np AS SELECT id AS plan_id FROM public.subscription_plans WHERE code = 'test_plan';
GRANT SELECT ON np TO authenticated;

-- ---- T3: a plan_history 'create' row exists ---------------------------------
SELECT ok(
  (SELECT count(*) >= 1 FROM public.plan_history
     WHERE plan_id = (SELECT plan_id FROM np) AND action = 'create'),
  'T3: plan creation recorded in plan_history');

-- ---- T4: the action was audited ---------------------------------------------
SELECT ok(
  (SELECT count(*) >= 1 FROM public.platform_audit_events
     WHERE action = 'plan.create' AND target_id = (SELECT plan_id FROM np)),
  'T4: plan creation wrote an audit row');

-- ---- T5: setting a feature rebuilds features_json (backward compatible) ------
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" = '{"sub":"22222222-0000-0000-0000-000000000001","role":"authenticated"}';
SELECT public.cc_set_plan_feature((SELECT plan_id FROM np), 'vet_access', 'true'::jsonb);
SELECT is(
  (SELECT features_json->>'vet_access' FROM public.subscription_plans WHERE id = (SELECT plan_id FROM np)),
  'true',
  'T5: cc_set_plan_feature rebuilt subscription_plans.features_json');

-- ---- T6: existing plans were backfilled into plan_feature_mapping ------------
RESET ROLE;
SELECT ok(
  (SELECT count(*) FROM public.plan_feature_mapping m
     JOIN public.subscription_plans p ON p.id = m.plan_id WHERE p.code = 'growth') > 0,
  'T6: existing plan features backfilled into plan_feature_mapping');

SELECT * FROM finish();
ROLLBACK;
