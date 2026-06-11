-- =============================================================================
-- tests/db/analytics_events.test.sql
-- Phase E: track_event RPC, tenant resolution, append-only RLS isolation.
-- LOCAL ONLY. Run via psql against the local stack.
-- =============================================================================

BEGIN;

SELECT plan(7);

-- Two users in separate tenants (reuse the onboarding RPC for realistic setup).
INSERT INTO auth.users (id, email, raw_user_meta_data, aud, role) VALUES
  ('eeeeeeee-0000-0000-0000-0000000000e1', 'an-a@test.local', '{"full_name":"An A"}'::jsonb, 'authenticated','authenticated'),
  ('eeeeeeee-0000-0000-0000-0000000000e2', 'an-b@test.local', '{"full_name":"An B"}'::jsonb, 'authenticated','authenticated');

SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" = '{"sub":"eeeeeeee-0000-0000-0000-0000000000e1","role":"authenticated"}';

-- T1: track_event before onboarding (no tenant yet) returns an id, tenant NULL
SELECT ok(
  public.track_event('signup_started', '{"method":"email"}'::jsonb) IS NOT NULL,
  'T1: track_event works pre-onboarding (no tenant)');

SELECT ok(
  (SELECT count(*) = 1 FROM public.analytics_events
    WHERE user_id = 'eeeeeeee-0000-0000-0000-0000000000e1'
      AND event_name = 'signup_started' AND tenant_id IS NULL),
  'T2: pre-onboarding event recorded with NULL tenant_id');

-- Onboard user A, then track a post-onboarding event — tenant must resolve.
SELECT public.create_tenant_onboarding('{"tenant_name":"An A Co","full_name":"An A","farm":{"farm_name":"AA Farm","state":"KA","farm_type":"independent"}}'::jsonb);
SELECT public.track_event('onboarding_completed', '{}'::jsonb);

SELECT ok(
  (SELECT count(*) = 1 FROM public.analytics_events
    WHERE user_id = 'eeeeeeee-0000-0000-0000-0000000000e1'
      AND event_name = 'onboarding_completed' AND tenant_id IS NOT NULL),
  'T3: post-onboarding event auto-resolved tenant_id from profile');

-- T4: empty event name rejected
SELECT throws_ok(
  $$ SELECT public.track_event('', '{}'::jsonb) $$,
  '22023',
  NULL,
  'T4: empty event_name raises 22023');

-- T5: user A can read own analytics events
SELECT ok(
  (SELECT count(*) >= 2 FROM public.analytics_events WHERE user_id = 'eeeeeeee-0000-0000-0000-0000000000e1'),
  'T5: user A reads own analytics events');

-- Switch to user B (different tenant)
RESET ROLE;
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" = '{"sub":"eeeeeeee-0000-0000-0000-0000000000e2","role":"authenticated"}';
SELECT public.create_tenant_onboarding('{"tenant_name":"An B Co","full_name":"An B","farm":{"farm_name":"AB Farm","state":"KA","farm_type":"independent"}}'::jsonb);

-- T6: user B CANNOT see user A's analytics events (cross-tenant isolation)
SELECT ok(
  (SELECT count(*) = 0 FROM public.analytics_events WHERE user_id = 'eeeeeeee-0000-0000-0000-0000000000e1'),
  'T6: user B cannot read user A analytics events (RLS isolation)');

-- T7: a user cannot forge an analytics row for someone else (INSERT WITH CHECK)
SELECT throws_ok(
  $$ INSERT INTO public.analytics_events (user_id, event_name)
     VALUES ('eeeeeeee-0000-0000-0000-0000000000e1', 'forged') $$,
  '42501',
  NULL,
  'T7: user B cannot insert an event attributed to user A');

SELECT * FROM finish();
ROLLBACK;
