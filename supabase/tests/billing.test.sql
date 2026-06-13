-- =============================================================================
-- pgTAP — Enterprise billing: RLS isolation, read-only enforcement, operator gate
-- =============================================================================
-- Run with:  supabase test db   (or psql -f against a DB with pgtap enabled)
-- Self-contained: builds two ephemeral tenants + an invoice/payment, exercises
-- the policies by SET ROLE authenticated + request.jwt.claims, then ROLLBACK.
-- =============================================================================

BEGIN;
SELECT plan(10);

-- ---------------------------------------------------------------------------
-- Fixtures (as superuser; RLS not yet engaged).
-- ---------------------------------------------------------------------------
INSERT INTO auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token, email_change, email_change_token_new, recovery_token)
VALUES
  ('00000000-0000-0000-0000-000000000000','aaaaaaaa-0000-0000-0000-000000000001','authenticated','authenticated',
   'tap_owner_a@test.local', crypt('x', gen_salt('bf')), now(), '{"provider":"email"}','{}', now(), now(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000','bbbbbbbb-0000-0000-0000-000000000002','authenticated','authenticated',
   'tap_owner_b@test.local', crypt('x', gen_salt('bf')), now(), '{"provider":"email"}','{}', now(), now(), '', '', '', '');

-- Two tenants (owner-linked). provision_tenant_trial trigger gives each a trial sub.
INSERT INTO public.tenants (id, name, owner_id, status)
VALUES ('a0000000-0000-0000-0000-0000000000a1','Tap Tenant A','aaaaaaaa-0000-0000-0000-000000000001','active'),
       ('b0000000-0000-0000-0000-0000000000b1','Tap Tenant B','bbbbbbbb-0000-0000-0000-000000000002','active');
INSERT INTO public.tenant_users (tenant_id, user_id, role, accepted_at) VALUES
  ('a0000000-0000-0000-0000-0000000000a1','aaaaaaaa-0000-0000-0000-000000000001','owner', now()),
  ('b0000000-0000-0000-0000-0000000000b1','bbbbbbbb-0000-0000-0000-000000000002','owner', now());

-- Activate tenant A's subscription; leave a captured invoice + payment for A only.
UPDATE public.tenant_subscriptions SET status='active', current_period_end = now() + interval '1 month'
 WHERE tenant_id='a0000000-0000-0000-0000-0000000000a1';

INSERT INTO public.invoices (id, tenant_id, invoice_number, status, billing_cycle, subtotal_inr, tax_inr, total_inr, issued_at)
VALUES ('11110000-0000-0000-0000-000000000001','a0000000-0000-0000-0000-0000000000a1','INV-TAP-000001','paid','monthly',499,89.82,588.82, now());
INSERT INTO public.payments (id, tenant_id, invoice_id, razorpay_payment_id, amount_inr, method, status, captured_at)
VALUES ('22220000-0000-0000-0000-000000000001','a0000000-0000-0000-0000-0000000000a1','11110000-0000-0000-0000-000000000001','pay_tap_a',588.82,'upi','captured', now());

-- ---------------------------------------------------------------------------
-- Helper math: GST 18% on 499 == 89.82, total == 588.82
-- ---------------------------------------------------------------------------
SELECT is( round(499 * 0.18, 2), 89.82::numeric, 'GST 18% of 499 = 89.82' );
SELECT is( (499 + round(499 * 0.18, 2)), 588.82::numeric, 'invoice total = subtotal + GST' );

-- ---------------------------------------------------------------------------
-- As OWNER A (RLS engaged): sees own invoice/payment; can write.
-- ---------------------------------------------------------------------------
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-0000-0000-000000000001","role":"authenticated"}', true);

SELECT is( (SELECT count(*)::int FROM public.invoices), 1, 'owner A sees exactly their 1 invoice' );
SELECT is( (SELECT count(*)::int FROM public.payments), 1, 'owner A sees exactly their 1 payment' );
SELECT ok( public.tenant_can_write('a0000000-0000-0000-0000-0000000000a1'), 'owner A (active) can write' );
SELECT ok( NOT public.platform_has_permission('billing:read'), 'owner A is not a platform operator' );

-- ---------------------------------------------------------------------------
-- As OWNER B: must NOT see tenant A's money rows (RLS isolation).
-- ---------------------------------------------------------------------------
SELECT set_config('request.jwt.claims', '{"sub":"bbbbbbbb-0000-0000-0000-000000000002","role":"authenticated"}', true);

SELECT is( (SELECT count(*)::int FROM public.invoices), 0, 'owner B sees ZERO of owner A invoices' );
SELECT is( (SELECT count(*)::int FROM public.payments), 0, 'owner B sees ZERO of owner A payments' );

-- ---------------------------------------------------------------------------
-- Read-only enforcement: suspend tenant B, owner B write must be rejected.
-- ---------------------------------------------------------------------------
RESET ROLE;  -- superuser to flip status
UPDATE public.tenant_subscriptions SET status='suspended' WHERE tenant_id='b0000000-0000-0000-0000-0000000000b1';
UPDATE public.tenants SET status='suspended' WHERE id='b0000000-0000-0000-0000-0000000000b1';

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"bbbbbbbb-0000-0000-0000-000000000002","role":"authenticated"}', true);

SELECT ok( NOT public.tenant_can_write('b0000000-0000-0000-0000-0000000000b1'), 'suspended tenant B cannot write' );
-- tg_enforce_tenant_writable raises ERRCODE check_violation (SQLSTATE 23514)
-- with HINT renew_subscription — the app keys off this to detect read-only state.
SELECT throws_ok(
  $$ INSERT INTO public.farms (tenant_id, owner_id, farm_name, owner_name, state)
     VALUES ('b0000000-0000-0000-0000-0000000000b1','bbbbbbbb-0000-0000-0000-000000000002','Blocked Farm','B','KA') $$,
  '23514',
  NULL,
  'write to a suspended tenant is blocked by tenant_can_write trigger'
);

RESET ROLE;
SELECT * FROM finish();
ROLLBACK;
