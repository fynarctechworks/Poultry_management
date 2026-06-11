-- =============================================================================
-- tests/db/discounts_engine.test.sql
-- Control Center Increment 3 / M5: discount rule engine (validate_coupon) +
-- guarded create. LOCAL ONLY.
-- =============================================================================

BEGIN;

SELECT plan(7);

-- Operators.
INSERT INTO auth.users (id, email, raw_user_meta_data, aud, role) VALUES
  ('33333333-0000-0000-0000-000000000001', 'dsc@test.local', '{}'::jsonb, 'authenticated','authenticated'),
  ('33333333-0000-0000-0000-000000000002', 'dsr@test.local', '{}'::jsonb, 'authenticated','authenticated'),
  ('33333333-0000-0000-0000-0000000000ff', 'dto@test.local', '{}'::jsonb, 'authenticated','authenticated');
INSERT INTO public.platform_admins (user_id, role_id)
  SELECT '33333333-0000-0000-0000-000000000001', id FROM public.platform_roles WHERE code = 'super_admin';
INSERT INTO public.platform_admins (user_id, role_id)
  SELECT '33333333-0000-0000-0000-000000000002', id FROM public.platform_roles WHERE code = 'read_only';

-- A tenant for per-tenant checks.
INSERT INTO public.tenants (id, name, owner_id)
  VALUES ('33333333-0000-0000-0000-000000000a01', 'Disc Co', '33333333-0000-0000-0000-0000000000ff');

-- Seed discounts + coupons directly (setup; RLS bypassed as owner).
INSERT INTO public.discounts (id, name, discount_type, value, is_active) VALUES
  ('33333333-0000-0000-0000-0000000d0001', 'Save 10', 'percentage', 10, true),
  ('33333333-0000-0000-0000-0000000d0002', 'Old', 'percentage', 10, true),
  ('33333333-0000-0000-0000-0000000d0004', 'First only', 'flat', 100, true),
  ('33333333-0000-0000-0000-0000000d0005', 'Maxed', 'flat', 50, true);
UPDATE public.discounts SET ends_at = now() - interval '1 day' WHERE id = '33333333-0000-0000-0000-0000000d0002';
UPDATE public.discounts SET applies_to_plan_ids = ARRAY[(SELECT id FROM public.subscription_plans WHERE code='professional')]
  WHERE id = '33333333-0000-0000-0000-0000000d0001';  -- restrict Save10 to professional
UPDATE public.discounts SET first_purchase_only = true WHERE id = '33333333-0000-0000-0000-0000000d0004';
UPDATE public.discounts SET max_redemptions = 1, redeemed_count = 1 WHERE id = '33333333-0000-0000-0000-0000000d0005';

INSERT INTO public.coupon_codes (discount_id, code, max_per_tenant) VALUES
  ('33333333-0000-0000-0000-0000000d0001', 'SAVE10', 1),
  ('33333333-0000-0000-0000-0000000d0002', 'OLD', 1),
  ('33333333-0000-0000-0000-0000000d0004', 'FIRST', 1),
  ('33333333-0000-0000-0000-0000000d0005', 'MAXED', 1);

-- ---- T1: valid coupon on its allowed plan -----------------------------------
SELECT is(
  (public.validate_coupon('SAVE10', '33333333-0000-0000-0000-000000000a01', 'professional', true))->>'valid',
  'true', 'T1: SAVE10 valid for professional plan');

-- ---- T2: plan restriction rejects a different plan --------------------------
SELECT is(
  (public.validate_coupon('SAVE10', '33333333-0000-0000-0000-000000000a01', 'growth', true))->>'valid',
  'false', 'T2: SAVE10 rejected for non-allowed plan');

-- ---- T3: expired coupon -----------------------------------------------------
SELECT is(
  (public.validate_coupon('OLD', '33333333-0000-0000-0000-000000000a01', NULL, NULL))->>'valid',
  'false', 'T3: expired coupon rejected');

-- ---- T4: first-purchase-only rejected on a renewal --------------------------
SELECT is(
  (public.validate_coupon('FIRST', '33333333-0000-0000-0000-000000000a01', NULL, false))->>'valid',
  'false', 'T4: first-purchase-only rejected when not first purchase');

-- ---- T5: global usage limit reached -----------------------------------------
SELECT is(
  (public.validate_coupon('MAXED', '33333333-0000-0000-0000-000000000a01', NULL, NULL))->>'valid',
  'false', 'T5: coupon at its global usage limit rejected');

-- ---- T6: per-tenant usage limit (after one redemption) ----------------------
INSERT INTO public.coupon_redemptions (coupon_id, discount_id, tenant_id)
  SELECT id, discount_id, '33333333-0000-0000-0000-000000000a01' FROM public.coupon_codes WHERE code = 'SAVE10';
SELECT is(
  (public.validate_coupon('SAVE10', '33333333-0000-0000-0000-000000000a01', 'professional', true))->>'valid',
  'false', 'T6: per-tenant usage limit rejects a second redemption');

-- ---- T7: read-only operator cannot create a discount ------------------------
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" = '{"sub":"33333333-0000-0000-0000-000000000002","role":"authenticated"}';
SELECT throws_ok(
  $$ SELECT public.cc_create_discount('{"name":"x","discount_type":"flat","value":10}'::jsonb) $$,
  '42501', NULL,
  'T7: read-only operator cannot create a discount');

SELECT * FROM finish();
ROLLBACK;
