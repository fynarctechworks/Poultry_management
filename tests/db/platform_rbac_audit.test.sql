-- =============================================================================
-- tests/db/platform_rbac_audit.test.sql
-- Control Center Increment 1: platform RBAC resolution + immutable audit log.
-- LOCAL ONLY. Run via psql against the local stack.
-- =============================================================================

BEGIN;

SELECT plan(12);

-- Three users: a super admin, a read-only operator, and a non-operator.
INSERT INTO auth.users (id, email, raw_user_meta_data, aud, role) VALUES
  ('ffffffff-0000-0000-0000-0000000000f1', 'sa@poultryos.app', '{}'::jsonb, 'authenticated','authenticated'),
  ('ffffffff-0000-0000-0000-0000000000f2', 'ro@poultryos.app', '{}'::jsonb, 'authenticated','authenticated'),
  ('ffffffff-0000-0000-0000-0000000000f3', 'no@poultryos.app', '{}'::jsonb, 'authenticated','authenticated');

-- ---- Bootstrap (runs as the migration/superuser role) ----------------------
-- T1: first super admin is promoted
SELECT ok(
  public.platform_bootstrap_super_admin('sa@poultryos.app') IS NOT NULL,
  'T1: bootstrap promotes the first super admin');

-- T2: bootstrap refuses once any platform admin exists
SELECT throws_ok(
  $$ SELECT public.platform_bootstrap_super_admin('ro@poultryos.app') $$,
  'P0001', NULL,
  'T2: second bootstrap rejected (already seeded)');

-- Add a read-only operator directly (owner bypasses RLS; no write policy needed).
INSERT INTO public.platform_admins (user_id, role_id)
  SELECT 'ffffffff-0000-0000-0000-0000000000f2', id
    FROM public.platform_roles WHERE code = 'read_only';

-- ---- Super admin context ---------------------------------------------------
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" = '{"sub":"ffffffff-0000-0000-0000-0000000000f1","role":"authenticated"}';

-- T3: recognised as a platform admin
SELECT ok(public.is_platform_admin(), 'T3: super admin is a platform admin');

-- T4: wildcard role grants any permission
SELECT ok(public.platform_has_permission('tenant:manage'),
  'T4: super admin wildcard grants tenant:manage');

-- T5: can read the (sensitive) platform_admins list (has access:read via wildcard)
SELECT ok((SELECT count(*) >= 2 FROM public.platform_admins),
  'T5: super admin reads the admins list');

-- ---- Read-only operator context --------------------------------------------
RESET ROLE;
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" = '{"sub":"ffffffff-0000-0000-0000-0000000000f2","role":"authenticated"}';

-- T6: read_only role grants tenant:read
SELECT ok(public.platform_has_permission('tenant:read'),
  'T6: read-only operator has tenant:read');

-- T7: read_only role does NOT grant tenant:manage
SELECT ok(NOT public.platform_has_permission('tenant:manage'),
  'T7: read-only operator lacks tenant:manage');

-- ---- Non-operator context --------------------------------------------------
RESET ROLE;
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" = '{"sub":"ffffffff-0000-0000-0000-0000000000f3","role":"authenticated"}';

-- T8: not a platform admin
SELECT ok(NOT public.is_platform_admin(), 'T8: non-operator is not a platform admin');

-- T9: holds no permissions
SELECT ok(NOT public.platform_has_permission('tenant:read'),
  'T9: non-operator holds no permissions');

-- T10: cannot read the platform_admins list (RLS returns zero rows)
SELECT ok((SELECT count(*) = 0 FROM public.platform_admins),
  'T10: non-operator cannot read the admins list (RLS)');

-- ---- Audit immutability ----------------------------------------------------
RESET ROLE;  -- back to owner to seed an audit row
INSERT INTO public.platform_audit_events (action) VALUES ('test.action');

-- T11: UPDATE is hard-rejected by the immutability trigger
SELECT throws_ok(
  $$ UPDATE public.platform_audit_events SET action = 'tampered' WHERE action = 'test.action' $$,
  'P0001', NULL,
  'T11: audit events cannot be updated');

-- T12: DELETE is hard-rejected by the immutability trigger
SELECT throws_ok(
  $$ DELETE FROM public.platform_audit_events WHERE action = 'test.action' $$,
  'P0001', NULL,
  'T12: audit events cannot be deleted');

SELECT * FROM finish();
ROLLBACK;
