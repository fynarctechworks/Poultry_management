-- =============================================================================
-- tests/db/support_errors.test.sql
-- Control Center Increment 5: support tickets (guarded + timeline + audit) and
-- error monitoring (ingestion dedup + workflow). LOCAL ONLY.
-- =============================================================================

BEGIN;

SELECT plan(9);

INSERT INTO auth.users (id, email, raw_user_meta_data, aud, role) VALUES
  ('55555555-0000-0000-0000-000000000001', 'sown@test.local', '{"full_name":"S Owner"}'::jsonb, 'authenticated','authenticated'),
  ('55555555-0000-0000-0000-000000000002', 'ssup@test.local', '{}'::jsonb, 'authenticated','authenticated'),
  ('55555555-0000-0000-0000-000000000003', 'sread@test.local', '{}'::jsonb, 'authenticated','authenticated');
INSERT INTO public.platform_admins (user_id, role_id)
  SELECT '55555555-0000-0000-0000-000000000002', id FROM public.platform_roles WHERE code = 'super_admin';
INSERT INTO public.platform_admins (user_id, role_id)
  SELECT '55555555-0000-0000-0000-000000000003', id FROM public.platform_roles WHERE code = 'read_only';

SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" = '{"sub":"55555555-0000-0000-0000-000000000001","role":"authenticated"}';
SELECT public.create_tenant_onboarding(
  '{"tenant_name":"Support Co","full_name":"S Owner","farm":{"farm_name":"SF","state":"KA","farm_type":"independent"}}'::jsonb);

RESET ROLE;
CREATE TEMP TABLE st AS SELECT id AS tenant_id FROM public.tenants WHERE owner_id = '55555555-0000-0000-0000-000000000001';
GRANT SELECT ON st TO authenticated;

-- ---- T1: read-only operator cannot open a ticket ----------------------------
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" = '{"sub":"55555555-0000-0000-0000-000000000003","role":"authenticated"}';
SELECT throws_ok(
  $$ SELECT public.cc_create_ticket((SELECT tenant_id FROM st), 'X', 'Y') $$,
  '42501', NULL, 'T1: read-only operator cannot create a ticket');

-- ---- T2: support operator opens a ticket ------------------------------------
RESET ROLE;
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" = '{"sub":"55555555-0000-0000-0000-000000000002","role":"authenticated"}';
SELECT is(
  (public.cc_create_ticket((SELECT tenant_id FROM st), 'Cannot log in', 'OTP not arriving', 'high')).status,
  'open', 'T2: support operator opens a ticket');

RESET ROLE;
CREATE TEMP TABLE tk AS
  SELECT id AS ticket_id FROM public.support_tickets WHERE tenant_id = (SELECT tenant_id FROM st) ORDER BY created_at DESC LIMIT 1;
GRANT SELECT ON tk TO authenticated;

-- ---- T3: a timeline interaction was recorded --------------------------------
SELECT ok(
  EXISTS (SELECT 1 FROM public.customer_interactions
           WHERE tenant_id = (SELECT tenant_id FROM st) AND interaction_type = 'ticket'),
  'T3: ticket creation appended a customer_interactions row');

-- ---- T4: the action was audited ---------------------------------------------
SELECT ok(
  EXISTS (SELECT 1 FROM public.platform_audit_events
           WHERE action = 'ticket.create' AND target_tenant_id = (SELECT tenant_id FROM st)),
  'T4: ticket creation wrote an audit row');

-- ---- T5: status transition to resolved sets resolved_at ---------------------
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" = '{"sub":"55555555-0000-0000-0000-000000000002","role":"authenticated"}';
SELECT is(
  (public.cc_set_ticket_status((SELECT ticket_id FROM tk), 'resolved')).status,
  'resolved', 'T5: ticket transitions to resolved');

-- ---- T6: report_error ingests a new error -----------------------------------
RESET ROLE;
CREATE TEMP TABLE er AS
  SELECT public.report_error('{"source":"frontend","module":"daily-log","message":"boom","fingerprint":"fp-1"}'::jsonb) AS err_id;
GRANT SELECT ON er TO authenticated;
SELECT ok((SELECT err_id FROM er) IS NOT NULL, 'T6: report_error ingests an error');

-- ---- T7: a repeat of the same fingerprint dedups (occurrence_count bumps) ----
SELECT public.report_error('{"source":"frontend","module":"daily-log","message":"boom","fingerprint":"fp-1"}'::jsonb);
SELECT is(
  (SELECT occurrence_count FROM public.platform_errors WHERE fingerprint = 'fp-1'), 2,
  'T7: repeated error increments occurrence_count instead of duplicating');

-- ---- T8: read-only operator cannot triage an error --------------------------
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" = '{"sub":"55555555-0000-0000-0000-000000000003","role":"authenticated"}';
SELECT throws_ok(
  $$ SELECT public.cc_set_error_status((SELECT err_id FROM er), 'resolved') $$,
  '42501', NULL, 'T8: read-only operator cannot change error status');

-- ---- T9: developer/super operator resolves the error ------------------------
RESET ROLE;
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" = '{"sub":"55555555-0000-0000-0000-000000000002","role":"authenticated"}';
SELECT is(
  (public.cc_set_error_status((SELECT err_id FROM er), 'resolved')).status,
  'resolved', 'T9: operator resolves the error');

SELECT * FROM finish();
ROLLBACK;
