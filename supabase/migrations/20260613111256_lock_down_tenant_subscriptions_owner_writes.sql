-- =============================================================================
-- SECURITY FIX: tenant owners could self-grant a paid/active subscription.
-- File: 20260613111256_lock_down_tenant_subscriptions_owner_writes.sql
-- =============================================================================
-- The `tenant_subscriptions_owner_write` policy was FOR ALL gated only on tenant
-- ownership, so an owner could UPDATE status/current_period_end (or INSERT/DELETE)
-- their own subscription row and bypass billing entirely (is_tenant_paid reads
-- this table). Lock it down: owners may only change plan_id + billing_cycle (the
-- free-plan selection path in onboarding); status, periods, trial fields and
-- razorpay refs are service-role only (set by the webhook / lifecycle cron).
-- INSERT/DELETE are removed from owners (provision_tenant_trial is SECURITY
-- DEFINER and the service role bypasses RLS, so the system paths keep working).
-- =============================================================================

BEGIN;

-- 1. Replace the over-broad FOR ALL policy with a row-scoped FOR UPDATE policy.
DROP POLICY IF EXISTS tenant_subscriptions_owner_write ON public.tenant_subscriptions;

CREATE POLICY tenant_subscriptions_owner_update ON public.tenant_subscriptions
  FOR UPDATE
  USING (EXISTS (SELECT 1 FROM public.tenants t WHERE t.id = tenant_subscriptions.tenant_id AND t.owner_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.tenants t WHERE t.id = tenant_subscriptions.tenant_id AND t.owner_id = auth.uid()));

-- 2. Column-level privileges decide WHICH columns an owner may write. RLS gates
--    the row; these grants gate the columns. Plan selection only.
REVOKE INSERT, UPDATE, DELETE ON public.tenant_subscriptions FROM authenticated;
GRANT  UPDATE (plan_id, billing_cycle) ON public.tenant_subscriptions TO authenticated;

-- service_role keeps full access (bypasses RLS; unaffected by the REVOKE above).
GRANT ALL ON public.tenant_subscriptions TO service_role;

COMMENT ON POLICY tenant_subscriptions_owner_update ON public.tenant_subscriptions IS
  'Owners may UPDATE only their own subscription row, and (via column GRANTs) only plan_id + billing_cycle. status/periods/razorpay are service-role only — prevents self-granting a paid subscription.';

COMMIT;
