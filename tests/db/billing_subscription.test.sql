-- =============================================================================
-- tests/db/billing_subscription.test.sql
-- Phase B: trial provisioning, is_tenant_paid state machine, plan limits.
-- LOCAL ONLY (inserts into auth.users). Run via psql against the local stack.
-- =============================================================================

BEGIN;

SELECT plan(9);

-- Seed an owner + onboard via the RPC (which creates a tenant → fires the
-- provision_tenant_trial trigger).
INSERT INTO auth.users (id, email, raw_user_meta_data, aud, role)
VALUES ('cccccccc-0000-0000-0000-0000000000c1', 'bill@test.local',
        '{"full_name":"Bill Owner"}'::jsonb, 'authenticated', 'authenticated');

SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" = '{"sub":"cccccccc-0000-0000-0000-0000000000c1","role":"authenticated"}';
SELECT public.create_tenant_onboarding($$
{ "tenant_name":"Bill Co", "full_name":"Bill Owner",
  "farm": { "farm_name":"Bill Farm", "state":"Karnataka", "farm_type":"independent" } }
$$::jsonb);
RESET ROLE;

-- Resolve the new tenant id
SELECT id AS bill_tenant FROM public.tenants WHERE owner_id = 'cccccccc-0000-0000-0000-0000000000c1' \gset

-- T1: a subscription row was auto-provisioned for the new tenant
SELECT ok(
  (SELECT count(*) = 1 FROM public.tenant_subscriptions WHERE tenant_id = :'bill_tenant'),
  'T1: provision_tenant_trial created a subscription for the new tenant');

-- T2: it is in trial status
SELECT is(
  (SELECT status FROM public.tenant_subscriptions WHERE tenant_id = :'bill_tenant'),
  'trial', 'T2: new tenant subscription status = trial');

-- T3: trial_ends_at is in the future (~14 days)
SELECT ok(
  (SELECT trial_ends_at > now() + interval '13 days'
     FROM public.tenant_subscriptions WHERE tenant_id = :'bill_tenant'),
  'T3: trial_ends_at ~14 days out');

-- T4: is_tenant_paid TRUE during an active trial
SELECT ok(public.is_tenant_paid(:'bill_tenant'), 'T4: is_tenant_paid true during trial');

-- T5: is_paid(uid) resolves the tenant and agrees
SELECT ok(public.is_paid('cccccccc-0000-0000-0000-0000000000c1'),
  'T5: is_paid(uid) true via tenant resolution during trial');

-- T6: expire the trial → is_tenant_paid FALSE
UPDATE public.tenant_subscriptions
   SET trial_ends_at = now() - interval '1 day'
 WHERE tenant_id = :'bill_tenant';
SELECT ok(NOT public.is_tenant_paid(:'bill_tenant'),
  'T6: is_tenant_paid false once trial expired');

-- T7: move to active → paid again
UPDATE public.tenant_subscriptions SET status = 'active' WHERE tenant_id = :'bill_tenant';
SELECT ok(public.is_tenant_paid(:'bill_tenant'), 'T7: is_tenant_paid true when active');

-- T8: starter tier limits — put tenant on starter (1 farm) and check can_add_farm.
-- Tenant already has 1 farm from onboarding, so can_add_farm must be false.
UPDATE public.tenant_subscriptions
   SET plan_id = (SELECT id FROM public.subscription_plans WHERE code='starter')
 WHERE tenant_id = :'bill_tenant';
SELECT is(
  (public.tenant_plan_status(:'bill_tenant')->>'can_add_farm')::boolean,
  false, 'T8: starter tenant at 1/1 farms cannot add another farm');

-- T9: professional tier → unlimited farms → can_add_farm true
UPDATE public.tenant_subscriptions
   SET plan_id = (SELECT id FROM public.subscription_plans WHERE code='professional')
 WHERE tenant_id = :'bill_tenant';
SELECT is(
  (public.tenant_plan_status(:'bill_tenant')->>'can_add_farm')::boolean,
  true, 'T9: professional tenant can add unlimited farms');

SELECT * FROM finish();
ROLLBACK;
