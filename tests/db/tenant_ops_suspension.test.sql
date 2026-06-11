-- =============================================================================
-- tests/db/tenant_ops_suspension.test.sql
-- Control Center Increment 2: tenant lifecycle RPCs + suspension enforcement.
-- Proves the gate: suspend → the whole tenant workforce goes dark; owner keeps
-- a recovery read; activate → access restored. RPCs are permission-gated +
-- audited. LOCAL ONLY.
-- =============================================================================

BEGIN;

SELECT plan(8);

-- Actors: tenant owner, a worker, a super-admin operator, a read-only operator.
INSERT INTO auth.users (id, email, raw_user_meta_data, aud, role) VALUES
  ('11111111-0000-0000-0000-000000000001', 'own@test.local', '{"full_name":"Owner O"}'::jsonb, 'authenticated','authenticated'),
  ('11111111-0000-0000-0000-000000000002', 'wrk@test.local', '{"full_name":"Worker W"}'::jsonb, 'authenticated','authenticated'),
  ('11111111-0000-0000-0000-000000000003', 'ops@test.local', '{"full_name":"Op Super"}'::jsonb, 'authenticated','authenticated'),
  ('11111111-0000-0000-0000-000000000004', 'opr@test.local', '{"full_name":"Op Read"}'::jsonb, 'authenticated','authenticated');

-- Operators (direct insert; owner bypasses RLS).
INSERT INTO public.platform_admins (user_id, role_id)
  SELECT '11111111-0000-0000-0000-000000000003', id FROM public.platform_roles WHERE code = 'super_admin';
INSERT INTO public.platform_admins (user_id, role_id)
  SELECT '11111111-0000-0000-0000-000000000004', id FROM public.platform_roles WHERE code = 'read_only';

-- Owner onboards a tenant (creates tenant + owner membership + farm + trial sub).
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" = '{"sub":"11111111-0000-0000-0000-000000000001","role":"authenticated"}';
SELECT public.create_tenant_onboarding(
  '{"tenant_name":"Ops Co","full_name":"Owner O","farm":{"farm_name":"Ops Farm","state":"KA","farm_type":"independent"}}'::jsonb);

-- Capture ids in a session temp table (visible across SET ROLE, no RLS).
RESET ROLE;
CREATE TEMP TABLE tt AS
  SELECT id AS tenant_id FROM public.tenants WHERE owner_id = '11111111-0000-0000-0000-000000000001';
GRANT SELECT ON tt TO authenticated;

-- Add a worker to the tenant.
INSERT INTO public.tenant_users (tenant_id, user_id, role)
  SELECT tenant_id, '11111111-0000-0000-0000-000000000002', 'worker' FROM tt;

-- ---- T1: worker is a member before suspension -------------------------------
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" = '{"sub":"11111111-0000-0000-0000-000000000002","role":"authenticated"}';
SELECT ok(public.is_tenant_member((SELECT tenant_id FROM tt)),
  'T1: worker is a tenant member before suspension');

-- ---- T2: a read-only operator cannot suspend (permission gate) ---------------
RESET ROLE;
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" = '{"sub":"11111111-0000-0000-0000-000000000004","role":"authenticated"}';
SELECT throws_ok(
  $$ SELECT public.cc_suspend_tenant((SELECT tenant_id FROM tt), 'unauthorized attempt') $$,
  '42501', NULL,
  'T2: read-only operator is forbidden from suspending');

-- ---- T3: super-admin operator suspends --------------------------------------
RESET ROLE;
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" = '{"sub":"11111111-0000-0000-0000-000000000003","role":"authenticated"}';
SELECT is(
  (public.cc_suspend_tenant((SELECT tenant_id FROM tt), 'nonpayment')).status,
  'suspended',
  'T3: super-admin operator suspends the tenant');

-- ---- T4: the action was audited ---------------------------------------------
SELECT ok(
  (SELECT count(*) >= 1 FROM public.platform_audit_events
     WHERE action = 'tenant.suspend' AND target_tenant_id = (SELECT tenant_id FROM tt)),
  'T4: suspension wrote an audit row');

-- ---- T5: the worker is now blocked (suspension enforcement) ------------------
RESET ROLE;
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" = '{"sub":"11111111-0000-0000-0000-000000000002","role":"authenticated"}';
SELECT ok(NOT public.is_tenant_member((SELECT tenant_id FROM tt)),
  'T5: worker loses membership while suspended');

-- ---- T6: worker sees zero farms (all tenant data goes dark) ------------------
SELECT ok(
  (SELECT count(*) FROM public.farms WHERE tenant_id = (SELECT tenant_id FROM tt)) = 0,
  'T6: worker cannot read any tenant data while suspended');

-- ---- T7: the OWNER keeps a recovery read on their own tenant -----------------
RESET ROLE;
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" = '{"sub":"11111111-0000-0000-0000-000000000001","role":"authenticated"}';
SELECT ok(
  (SELECT count(*) FROM public.tenants WHERE id = (SELECT tenant_id FROM tt)) = 1,
  'T7: suspended owner can still read their own tenant (recovery path)');

-- ---- T8: activation restores membership -------------------------------------
RESET ROLE;
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" = '{"sub":"11111111-0000-0000-0000-000000000003","role":"authenticated"}';
SELECT public.cc_activate_tenant((SELECT tenant_id FROM tt));

RESET ROLE;
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" = '{"sub":"11111111-0000-0000-0000-000000000002","role":"authenticated"}';
SELECT ok(public.is_tenant_member((SELECT tenant_id FROM tt)),
  'T8: worker membership restored after activation');

SELECT * FROM finish();
ROLLBACK;
