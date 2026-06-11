-- =============================================================================
-- tests/db/feature_flags_system.test.sql
-- Control Center Increment 6: feature flag resolution (overrides + rollout) and
-- system health readers. LOCAL ONLY.
-- =============================================================================

BEGIN;

SELECT plan(8);

INSERT INTO auth.users (id, email, raw_user_meta_data, aud, role) VALUES
  ('66666666-0000-0000-0000-000000000001', 'fown@test.local', '{"full_name":"F Owner"}'::jsonb, 'authenticated','authenticated'),
  ('66666666-0000-0000-0000-000000000002', 'fsup@test.local', '{}'::jsonb, 'authenticated','authenticated'),
  ('66666666-0000-0000-0000-000000000003', 'frd@test.local', '{}'::jsonb, 'authenticated','authenticated');
INSERT INTO public.platform_admins (user_id, role_id)
  SELECT '66666666-0000-0000-0000-000000000002', id FROM public.platform_roles WHERE code = 'super_admin';
INSERT INTO public.platform_admins (user_id, role_id)
  SELECT '66666666-0000-0000-0000-000000000003', id FROM public.platform_roles WHERE code = 'read_only';

SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" = '{"sub":"66666666-0000-0000-0000-000000000001","role":"authenticated"}';
SELECT public.create_tenant_onboarding(
  '{"tenant_name":"Flag Co","full_name":"F Owner","farm":{"farm_name":"FF","state":"KA","farm_type":"independent"}}'::jsonb);

RESET ROLE;
CREATE TEMP TABLE ft AS SELECT id AS tenant_id FROM public.tenants WHERE owner_id = '66666666-0000-0000-0000-000000000001';
GRANT SELECT ON ft TO authenticated;

-- ---- T1: read-only operator cannot create a flag ----------------------------
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" = '{"sub":"66666666-0000-0000-0000-000000000003","role":"authenticated"}';
SELECT throws_ok(
  $$ SELECT public.cc_create_flag('beta_x','Beta X') $$,
  '42501', NULL, 'T1: read-only operator cannot create a flag');

-- ---- T2: super admin creates an enabled, 100%-rollout flag ------------------
RESET ROLE;
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" = '{"sub":"66666666-0000-0000-0000-000000000002","role":"authenticated"}';
SELECT is(
  (public.cc_create_flag('beta_x','Beta X', NULL, true, 100::smallint)).key, 'beta_x',
  'T2: super admin creates a feature flag');

RESET ROLE;
CREATE TEMP TABLE ff AS SELECT id AS flag_id FROM public.feature_flags WHERE key = 'beta_x';
GRANT SELECT ON ff TO authenticated;

-- ---- T3: global enabled @100% → resolver returns true -----------------------
SELECT ok(public.tenant_feature((SELECT tenant_id FROM ft), 'beta_x'),
  'T3: enabled flag at 100%% rollout resolves true');

-- ---- T4: globally disabling the flag → false --------------------------------
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" = '{"sub":"66666666-0000-0000-0000-000000000002","role":"authenticated"}';
SELECT public.cc_set_flag((SELECT flag_id FROM ff), false);
RESET ROLE;
SELECT ok(NOT public.tenant_feature((SELECT tenant_id FROM ft), 'beta_x'),
  'T4: globally disabled flag resolves false');

-- ---- T5: tenant override beats global (re-enable, override off) -------------
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" = '{"sub":"66666666-0000-0000-0000-000000000002","role":"authenticated"}';
SELECT public.cc_set_flag((SELECT flag_id FROM ff), true, 100::smallint);
SELECT public.cc_set_tenant_flag((SELECT flag_id FROM ff), (SELECT tenant_id FROM ft), false);
RESET ROLE;
SELECT ok(NOT public.tenant_feature((SELECT tenant_id FROM ft), 'beta_x'),
  'T5: tenant override (off) beats an enabled global flag');

-- ---- T6: unknown flag key resolves false ------------------------------------
SELECT ok(NOT public.tenant_feature((SELECT tenant_id FROM ft), 'does_not_exist'),
  'T6: unknown flag key resolves false');

-- ---- T7: rollout 0% → false even when globally enabled ----------------------
DELETE FROM public.tenant_feature_flags WHERE tenant_id = (SELECT tenant_id FROM ft);  -- clear override
UPDATE public.feature_flags SET rollout_percentage = 0 WHERE key = 'beta_x';
SELECT ok(NOT public.tenant_feature((SELECT tenant_id FROM ft), 'beta_x'),
  'T7: 0%% rollout resolves false');

-- ---- T8: system_health returns metrics --------------------------------------
SELECT ok(public.system_health() ? 'tenants', 'T8: system_health() returns metrics');

SELECT * FROM finish();
ROLLBACK;
