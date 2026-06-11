-- =============================================================================
-- tests/db/auth_security.test.sql
-- Phase C: log_auth_event, audit RLS isolation, trusted_devices self-scope.
-- LOCAL ONLY. Run via psql against the local stack.
-- =============================================================================

BEGIN;

SELECT plan(7);

-- Two users in separate tenants (reuse the onboarding RPC for realistic setup).
INSERT INTO auth.users (id, email, raw_user_meta_data, aud, role) VALUES
  ('dddddddd-0000-0000-0000-0000000000d1', 'sec-a@test.local', '{"full_name":"Sec A"}'::jsonb, 'authenticated','authenticated'),
  ('dddddddd-0000-0000-0000-0000000000d2', 'sec-b@test.local', '{"full_name":"Sec B"}'::jsonb, 'authenticated','authenticated');

SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" = '{"sub":"dddddddd-0000-0000-0000-0000000000d1","role":"authenticated"}';
SELECT public.create_tenant_onboarding('{"tenant_name":"Sec A Co","full_name":"Sec A","farm":{"farm_name":"SA Farm","state":"KA","farm_type":"independent"}}'::jsonb);

-- T1: log_auth_event inserts and returns a uuid
SELECT ok(
  public.log_auth_event('login_success', '1.2.3.4', 'jest-UA', 'devhashA', '{"k":"v"}'::jsonb) IS NOT NULL,
  'T1: log_auth_event returns an id for authenticated user');

-- T2: the event is tenant-resolved (tenant_id populated from profile)
SELECT ok(
  (SELECT count(*) = 1 FROM public.auth_audit_events
    WHERE user_id = 'dddddddd-0000-0000-0000-0000000000d1' AND tenant_id IS NOT NULL),
  'T2: audit event auto-resolved tenant_id from profile');

-- T3: user A can SELECT own audit events
SELECT ok(
  (SELECT count(*) >= 1 FROM public.auth_audit_events WHERE user_id = 'dddddddd-0000-0000-0000-0000000000d1'),
  'T3: user A reads own audit events');

-- T4: trusted device self-insert works
INSERT INTO public.trusted_devices (user_id, device_hash, device_name, trusted_until)
VALUES ('dddddddd-0000-0000-0000-0000000000d1', 'devhashA', 'Redmi 9A', now() + interval '30 days');
SELECT ok(
  (SELECT count(*) = 1 FROM public.trusted_devices WHERE user_id = 'dddddddd-0000-0000-0000-0000000000d1'),
  'T4: user A trusted device row visible to self');

-- Switch to user B (different tenant)
RESET ROLE;
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" = '{"sub":"dddddddd-0000-0000-0000-0000000000d2","role":"authenticated"}';
SELECT public.create_tenant_onboarding('{"tenant_name":"Sec B Co","full_name":"Sec B","farm":{"farm_name":"SB Farm","state":"KA","farm_type":"independent"}}'::jsonb);

-- T5: user B CANNOT see user A's audit events (cross-user/tenant isolation)
SELECT ok(
  (SELECT count(*) = 0 FROM public.auth_audit_events WHERE user_id = 'dddddddd-0000-0000-0000-0000000000d1'),
  'T5: user B cannot read user A audit events (RLS isolation)');

-- T6: user B CANNOT see user A's trusted devices
SELECT ok(
  (SELECT count(*) = 0 FROM public.trusted_devices WHERE user_id = 'dddddddd-0000-0000-0000-0000000000d1'),
  'T6: user B cannot read user A trusted devices (RLS isolation)');

-- T7: user B cannot forge an audit row for user A (insert WITH CHECK user_id=auth.uid())
SELECT throws_ok(
  $$ INSERT INTO public.auth_audit_events (user_id, event_type)
     VALUES ('dddddddd-0000-0000-0000-0000000000d1', 'login_success') $$,
  '42501', NULL,
  'T7: user B cannot insert audit event impersonating user A');

RESET ROLE;
SELECT * FROM finish();
ROLLBACK;
