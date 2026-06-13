-- =============================================================================
-- PoultryOS — Enterprise Billing · Phase A2: Read-Only Mode + 7-Day Trial
-- File: 20260613000001_readonly_enforcement.sql
-- =============================================================================
-- When a tenant's subscription lapses, the account becomes READ-ONLY: login,
-- view, reports and settings stay open, but create/edit/delete are blocked —
-- without ever deleting data. We enforce this in the database (defence in depth;
-- the client also disables the UI) via ONE trigger attached to the operational
-- tables, instead of rewriting every existing RLS WITH CHECK clause.
--
-- Write window (tenant_can_write) is deliberately STRICTER than is_tenant_paid:
--   * active                         -> writable
--   * trial AND trial not expired    -> writable
--   * past_due / grace / suspended / cancelled / expired-trial -> READ-ONLY
-- This matches the brief: during the post-expiry grace period the user may view
-- and renew, but editing is disabled. is_tenant_paid (feature gating, 7-day
-- grace) is left untouched.
--
-- Billing tables (tenant_subscriptions, billing_profiles, invoices, payments…)
-- are intentionally NOT gated, so a read-only owner can still pay and renew.
--
-- Also: reconcile the auto-trial to 7 days and add trial-conversion columns
-- (satisfies the "trial_tracking" requirement without a redundant table).
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- 1. tenant_can_write — the strict write gate.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.tenant_can_write(p_tenant_id UUID)
RETURNS BOOLEAN LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_status TEXT;
  v_trial  TIMESTAMPTZ;
BEGIN
  IF p_tenant_id IS NULL THEN RETURN false; END IF;
  SELECT status, trial_ends_at INTO v_status, v_trial
    FROM public.tenant_subscriptions WHERE tenant_id = p_tenant_id;
  IF NOT FOUND THEN RETURN false; END IF;
  IF v_status = 'active' THEN RETURN true; END IF;
  IF v_status = 'trial' AND v_trial IS NOT NULL AND v_trial > now() THEN RETURN true; END IF;
  RETURN false;
END;
$$;
REVOKE ALL ON FUNCTION public.tenant_can_write(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.tenant_can_write(UUID) TO authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 2. The enforcement trigger. Bypasses system/service/cron writes (no auth.uid)
--    and platform operators (impersonation/support). Blocks lapsed end-users.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.tg_enforce_tenant_writable()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_tenant UUID;
BEGIN
  -- service role, pg_cron and other system contexts carry no end-user JWT.
  IF auth.uid() IS NULL THEN
    RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
  END IF;
  -- Control Center operators may act on tenants (support/impersonation).
  IF public.is_platform_admin() THEN
    RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
  END IF;

  v_tenant := CASE WHEN TG_OP = 'DELETE' THEN OLD.tenant_id ELSE NEW.tenant_id END;

  IF v_tenant IS NOT NULL AND NOT public.tenant_can_write(v_tenant) THEN
    RAISE EXCEPTION 'subscription_inactive: account is read-only until the subscription is renewed'
      USING ERRCODE = 'check_violation', HINT = 'renew_subscription';
  END IF;

  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;

-- -----------------------------------------------------------------------------
-- 3. Attach to the operational, tenant-owned tables. NOT billing/subscription
--    tables (owner must be able to renew while read-only).
-- -----------------------------------------------------------------------------
DO $$
DECLARE
  t TEXT;
  tbls TEXT[] := ARRAY[
    'farms','sheds','batches','daily_logs','health_incidents','vaccinations',
    'inventory_items','inventory_movements','financial_transactions','buyers',
    'payment_reminders','traceability_records','contract_cycles','farm_users'
  ];
BEGIN
  FOREACH t IN ARRAY tbls LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS tg_%1$s_writable ON public.%1$s', t);
    EXECUTE format(
      'CREATE TRIGGER tg_%1$s_writable BEFORE INSERT OR UPDATE OR DELETE ON public.%1$s '
      || 'FOR EACH ROW EXECUTE FUNCTION public.tg_enforce_tenant_writable()', t);
  END LOOP;
END $$;

-- -----------------------------------------------------------------------------
-- 4. Trial-conversion columns (the "trial_tracking" requirement, folded into
--    the existing subscription row instead of a redundant table).
-- -----------------------------------------------------------------------------
ALTER TABLE public.tenant_subscriptions
  ADD COLUMN IF NOT EXISTS trial_started_at   TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS trial_converted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS trial_cancelled_at TIMESTAMPTZ;

UPDATE public.tenant_subscriptions
   SET trial_started_at = COALESCE(trial_started_at, created_at)
 WHERE status = 'trial';

-- -----------------------------------------------------------------------------
-- 5. Reconcile the auto-provisioned trial to 7 days (was 14) + stamp start.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.provision_tenant_trial()
  RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $fn$
BEGIN
  INSERT INTO public.tenant_subscriptions
    (tenant_id, plan_id, status, billing_cycle, trial_started_at, trial_ends_at, current_period_end)
  VALUES (
    NEW.id,
    (SELECT id FROM public.subscription_plans WHERE code = 'starter'),
    'trial', 'monthly',
    now(),
    now() + interval '7 days',
    now() + interval '7 days'
  )
  ON CONFLICT (tenant_id) DO NOTHING;

  INSERT INTO public.subscription_history (tenant_id, to_status, reason, actor)
  VALUES (NEW.id, 'trial', '7-day trial provisioned on tenant creation', 'system');

  RETURN NEW;
END;
$fn$;

COMMIT;

-- =============================================================================
-- Reversal:
--   DROP TRIGGER tg_<table>_writable ON public.<table>;  (per table in step 3)
--   DROP FUNCTION public.tg_enforce_tenant_writable();
--   DROP FUNCTION public.tenant_can_write(UUID);
-- =============================================================================
