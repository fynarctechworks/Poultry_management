-- =============================================================================
-- tests/db/health_revenue.test.sql
-- Control Center Increment 4: customer health scoring + revenue metrics.
-- LOCAL ONLY. Assumes no other committed tenants (clean local DB).
-- =============================================================================

BEGIN;

SELECT plan(9);

INSERT INTO auth.users (id, email, raw_user_meta_data, aud, role) VALUES
  ('44444444-0000-0000-0000-000000000001', 'hown@test.local', '{"full_name":"H Owner"}'::jsonb, 'authenticated','authenticated'),
  ('44444444-0000-0000-0000-000000000002', 'hror@test.local', '{}'::jsonb, 'authenticated','authenticated'),
  ('44444444-0000-0000-0000-000000000003', 'hnon@test.local', '{}'::jsonb, 'authenticated','authenticated');
INSERT INTO public.platform_admins (user_id, role_id)
  SELECT '44444444-0000-0000-0000-000000000002', id FROM public.platform_roles WHERE code = 'read_only';

SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" = '{"sub":"44444444-0000-0000-0000-000000000001","role":"authenticated"}';
SELECT public.create_tenant_onboarding(
  '{"tenant_name":"Health Co","full_name":"H Owner","farm":{"farm_name":"HF","state":"KA","farm_type":"independent"}}'::jsonb);

RESET ROLE;
CREATE TEMP TABLE ht AS SELECT id AS tenant_id FROM public.tenants WHERE owner_id = '44444444-0000-0000-0000-000000000001';
GRANT SELECT ON ht TO authenticated;

-- ---- T1: score is within range ----------------------------------------------
SELECT ok(
  (public.compute_tenant_health((SELECT tenant_id FROM ht))).score BETWEEN 0 AND 100,
  'T1: compute_tenant_health returns a 0..100 score');

-- ---- T2: a customer_health row now exists -----------------------------------
SELECT ok(
  EXISTS (SELECT 1 FROM public.customer_health WHERE tenant_id = (SELECT tenant_id FROM ht)),
  'T2: customer_health row created for the tenant');

-- ---- T3: tenants.health_score mirrors the cached score ----------------------
SELECT ok(
  (SELECT t.health_score FROM public.tenants t WHERE t.id = (SELECT tenant_id FROM ht))
    = (SELECT ch.score FROM public.customer_health ch WHERE ch.tenant_id = (SELECT tenant_id FROM ht)),
  'T3: tenants.health_score mirrors customer_health.score');

-- ---- T4: an active subscription drives payment_score to 100 -----------------
UPDATE public.tenant_subscriptions
   SET status = 'active', plan_id = (SELECT id FROM public.subscription_plans WHERE code = 'growth'),
       billing_cycle = 'monthly'
 WHERE tenant_id = (SELECT tenant_id FROM ht);
SELECT is(
  (public.compute_tenant_health((SELECT tenant_id FROM ht))).payment_score::int, 100,
  'T4: active subscription yields payment_score 100');

-- ---- T5: recompute_all processes at least the one tenant --------------------
SELECT ok(public.recompute_all_customer_health() >= 1,
  'T5: recompute_all_customer_health processes live tenants');

-- ---- T6: a read-only operator can read the health board ---------------------
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" = '{"sub":"44444444-0000-0000-0000-000000000002","role":"authenticated"}';
SELECT ok((SELECT count(*) FROM public.customer_health) >= 1,
  'T6: read-only operator can read customer_health (success:read)');

-- ---- T7: a non-operator cannot read the health board ------------------------
RESET ROLE;
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" = '{"sub":"44444444-0000-0000-0000-000000000003","role":"authenticated"}';
SELECT ok((SELECT count(*) FROM public.customer_health) = 0,
  'T7: non-operator cannot read customer_health (RLS)');

-- ---- T8: MRR reflects the active growth subscription (₹499/mo) ---------------
RESET ROLE;
SELECT is(
  (public.compute_revenue_metrics()->>'mrr_inr')::NUMERIC, 499::NUMERIC,
  'T8: compute_revenue_metrics MRR = 499 for one active growth sub');

-- ---- T9: snapshot_revenue records today's MRR -------------------------------
SELECT public.snapshot_revenue();
SELECT is(
  (SELECT mrr_inr FROM public.revenue_snapshots WHERE snapshot_date = current_date), 499::NUMERIC,
  'T9: snapshot_revenue records today''s MRR');

SELECT * FROM finish();
ROLLBACK;
