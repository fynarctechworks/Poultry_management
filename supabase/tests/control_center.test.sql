-- =============================================================================
-- pgTAP — Control Center: RBAC gate, audit immutability, ingestion hardening,
-- and the revenue/billing aggregate RPCs added in the enterprise audit pass.
-- =============================================================================
-- Run with:  supabase test db   (or psql -f against a DB with pgtap enabled)
-- Self-contained: builds ephemeral fixtures, exercises behaviour, then ROLLBACK.
-- =============================================================================

BEGIN;
SELECT plan(15);

-- ---------------------------------------------------------------------------
-- Fixtures (superuser).
-- ---------------------------------------------------------------------------
INSERT INTO auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token, email_change, email_change_token_new, recovery_token)
VALUES
  ('00000000-0000-0000-0000-000000000000','cccccccc-0000-0000-0000-000000000003','authenticated','authenticated',
   'tap_nonop@test.local', crypt('x', gen_salt('bf')), now(), '{"provider":"email"}','{}', now(), now(), '', '', '', '');

-- A test plan with a known yearly price so cc_tenants_mrr math is deterministic.
INSERT INTO public.subscription_plans (code, name, tier, monthly_price_inr, yearly_price_inr, is_active, sort_order)
VALUES ('tap_plan','Tap Plan','custom', 1000, 12000, true, 999);

-- A tenant on an ACTIVE yearly sub -> MRR = round(12000/12) = 1000.
INSERT INTO public.tenants (id, name, owner_id, status)
VALUES ('c0000000-0000-0000-0000-0000000000c1','TapMrrTenant','cccccccc-0000-0000-0000-000000000003','active');
UPDATE public.tenant_subscriptions
   SET status='active', billing_cycle='yearly',
       plan_id=(SELECT id FROM public.subscription_plans WHERE code='tap_plan')
 WHERE tenant_id='c0000000-0000-0000-0000-0000000000c1';

-- ---------------------------------------------------------------------------
-- 1–3. report_error hardening: caps + coercion of untrusted anon payload.
-- ---------------------------------------------------------------------------
DO $$ DECLARE v uuid; BEGIN
  v := public.report_error(jsonb_build_object(
    'source','garbage','module','m','message', repeat('x',5000),
    'severity','nonsense','fingerprint','tap_err_fp'));
END $$;
SELECT is( (SELECT length(message) FROM public.platform_errors WHERE fingerprint='tap_err_fp'), 2000,
  'report_error truncates oversized message to 2000 chars' );
SELECT is( (SELECT severity FROM public.platform_errors WHERE fingerprint='tap_err_fp'), 'error',
  'report_error coerces an invalid severity to error' );
SELECT is( (SELECT source FROM public.platform_errors WHERE fingerprint='tap_err_fp'), 'frontend',
  'report_error coerces an invalid source to frontend' );

-- ---------------------------------------------------------------------------
-- 4–5. Audit log is append-only: UPDATE and DELETE are rejected by trigger.
-- ---------------------------------------------------------------------------
INSERT INTO public.platform_audit_events (actor_id, actor_email, action, status)
VALUES ('cccccccc-0000-0000-0000-000000000003','tap@test.local','tap.audit.seed','success');
-- NB: throws_ok(sql, text) treats `text` as the EXPECTED error message. To assert
-- "throws any error" with a human description, use the 4-arg NULL/NULL form.
SELECT throws_ok(
  $$ UPDATE public.platform_audit_events SET action='tampered' WHERE action='tap.audit.seed' $$,
  NULL, NULL, 'audit events cannot be UPDATEd (immutable)' );
SELECT throws_ok(
  $$ DELETE FROM public.platform_audit_events WHERE action='tap.audit.seed' $$,
  NULL, NULL, 'audit events cannot be DELETEd (immutable)' );

-- ---------------------------------------------------------------------------
-- 6–7. RPC overload drift removed: the legacy no-reason variants are gone.
-- ---------------------------------------------------------------------------
SELECT is(
  (SELECT count(*)::int FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.proname='cc_change_plan'),
  0, 'legacy cc_change_plan overload is dropped' );
SELECT is(
  (SELECT count(*)::int FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.proname='cc_extend_trial'),
  1, 'only the reason-bearing cc_extend_trial remains' );

-- ---------------------------------------------------------------------------
-- 8. cc_tenants_mrr math (isolated by name search).
-- ---------------------------------------------------------------------------
SELECT is( public.cc_tenants_mrr('TapMrrTenant'), 1000::numeric,
  'cc_tenants_mrr converts an active yearly sub to monthly (12000/12 = 1000)' );

-- ---------------------------------------------------------------------------
-- 9–10. cc_billing_summary aggregates the whole ledger (before/after delta).
-- ---------------------------------------------------------------------------
INSERT INTO public.invoices (id, tenant_id, invoice_number, status, billing_cycle, subtotal_inr, tax_inr, total_inr, issued_at)
VALUES ('33330000-0000-0000-0000-000000000001','c0000000-0000-0000-0000-0000000000c1','INV-TAP-C1','paid','yearly',1000,180,1180, now());
SELECT is(
  ( (public.cc_billing_summary()->>'collected_net')::numeric
    - (SELECT coalesce(sum(amount_inr - coalesce(refunded_amount_inr,0)),0)
       FROM public.payments WHERE status='captured') ),
  0::numeric,
  'cc_billing_summary collected_net matches the captured-payment ledger' );
SELECT ok( (public.cc_billing_summary() ? 'outstanding')
        AND (public.cc_billing_summary() ? 'failed_count'),
  'cc_billing_summary returns the expected aggregate keys' );

-- ---------------------------------------------------------------------------
-- 11. Stale anon EXECUTE grants removed from auth-gated ingestion functions.
-- ---------------------------------------------------------------------------
SELECT ok( NOT has_function_privilege('anon',
  'public.track_event(text, jsonb)', 'EXECUTE'),
  'anon can no longer EXECUTE track_event' );

-- ---------------------------------------------------------------------------
-- 12. MFA helper exists and reports false for a freshly seeded operator.
-- ---------------------------------------------------------------------------
SELECT ok( NOT public.platform_operator_has_mfa(),
  'platform_operator_has_mfa is false when no verified factor exists' );

-- ---------------------------------------------------------------------------
-- 13–14. RBAC gate: a plain authenticated NON-operator cannot run cc_ mutations.
-- ---------------------------------------------------------------------------
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"cccccccc-0000-0000-0000-000000000003","role":"authenticated"}', true);

SELECT ok( NOT public.platform_has_permission('tenant:manage'),
  'non-operator holds no platform permission' );
SELECT throws_ok(
  $$ SELECT public.cc_suspend_tenant('c0000000-0000-0000-0000-0000000000c1','tap reason') $$,
  NULL, NULL, 'non-operator is blocked from cc_suspend_tenant by cc_assert_permission' );

RESET ROLE;

-- ---------------------------------------------------------------------------
-- 15. RLS consolidation applied: no `FOR ALL` write policy remains on the
-- tables whose admin policies were split into INSERT/UPDATE/DELETE.
-- ---------------------------------------------------------------------------
SELECT is(
  (SELECT count(*)::int FROM pg_policies
     WHERE schemaname='public' AND cmd='ALL'
       AND tablename IN ('batches','sheds','vaccinations','inventory_items',
                         'farm_users','tenant_users','billing_profiles','traceability_records')),
  0, 'no FOR ALL write policies remain on the consolidated tables' );

SELECT * FROM finish();
ROLLBACK;
