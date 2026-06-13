-- =============================================================================
-- PoultryOS — Enterprise Billing · Phase B4: Subscription Lifecycle + Reminders
-- File: 20260613000003_subscription_lifecycle.sql
-- =============================================================================
-- Daily state machine (pure SQL, scheduled by pg_cron — no external dependency
-- so the load-bearing transitions never silently fail):
--
--   trial   & trial_ends_at < now()                       -> past_due (read-only)
--   active  & current_period_end < now()                  -> past_due
--   past_due & updated_at < now() - 3 days  (grace over)  -> suspended
--
-- Renewal reminders (7/3/1/expiry day) are NOT sent here — they need WhatsApp +
-- push (Edge Functions). This file exposes:
--   * get_pending_subscription_reminders()  — rows due a reminder today
--   * record_subscription_reminder(...)      — idempotent send log
-- which the `subscription-lifecycle` Edge Function consumes, invoked by the same
-- cron via pg_net.
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- 1. Transitions. SECURITY DEFINER + service-role only.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.process_subscription_lifecycle()
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  r RECORD;
  v_trial_expired INT := 0;
  v_period_expired INT := 0;
  v_suspended INT := 0;
BEGIN
  -- trial ended without conversion -> past_due (account becomes read-only)
  FOR r IN SELECT tenant_id FROM public.tenant_subscriptions
            WHERE status = 'trial' AND trial_ends_at IS NOT NULL AND trial_ends_at < now() LOOP
    PERFORM public.set_subscription_status(r.tenant_id, 'past_due', 'Trial ended without payment', 'system');
    v_trial_expired := v_trial_expired + 1;
  END LOOP;

  -- active but period lapsed (renewal charge didn't land) -> past_due
  FOR r IN SELECT tenant_id FROM public.tenant_subscriptions
            WHERE status = 'active' AND current_period_end IS NOT NULL AND current_period_end < now() LOOP
    PERFORM public.set_subscription_status(r.tenant_id, 'past_due', 'Billing period lapsed', 'system');
    v_period_expired := v_period_expired + 1;
  END LOOP;

  -- past_due beyond the 3-day grace -> suspended
  FOR r IN SELECT tenant_id FROM public.tenant_subscriptions
            WHERE status = 'past_due' AND updated_at < now() - interval '3 days' LOOP
    PERFORM public.set_subscription_status(r.tenant_id, 'suspended', 'Grace period elapsed', 'system');
    v_suspended := v_suspended + 1;
  END LOOP;

  RETURN jsonb_build_object('trial_expired', v_trial_expired, 'period_expired', v_period_expired, 'suspended', v_suspended);
END;
$$;
REVOKE ALL ON FUNCTION public.process_subscription_lifecycle() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.process_subscription_lifecycle() TO service_role;

-- -----------------------------------------------------------------------------
-- 2. Reminders due today (exactly 7 / 3 / 1 / 0 days before renewal). One stage
--    per subscription per day at most; excludes ones already recorded.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_pending_subscription_reminders()
RETURNS TABLE (
  tenant_id UUID, subscription_id UUID, stage TEXT, period_end TIMESTAMPTZ,
  days_remaining INT, owner_name TEXT, owner_phone TEXT, whatsapp_phone TEXT,
  plan_name TEXT, amount_inr NUMERIC
) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  RETURN QUERY
  WITH base AS (
    SELECT ts.tenant_id, ts.id AS subscription_id, ts.billing_cycle,
           COALESCE(ts.current_period_end, ts.trial_ends_at) AS renewal_at,
           CEIL(EXTRACT(EPOCH FROM (COALESCE(ts.current_period_end, ts.trial_ends_at) - now())) / 86400.0)::INT AS dleft,
           p.name AS plan_name,
           CASE WHEN ts.billing_cycle = 'yearly' THEN p.yearly_price_inr ELSE p.monthly_price_inr END AS amount_inr
      FROM public.tenant_subscriptions ts
      JOIN public.subscription_plans p ON p.id = ts.plan_id
     WHERE ts.status IN ('trial','active')
       AND COALESCE(ts.current_period_end, ts.trial_ends_at) IS NOT NULL
  )
  SELECT b.tenant_id, b.subscription_id,
         CASE b.dleft WHEN 7 THEN 'day_7' WHEN 3 THEN 'day_3' WHEN 1 THEN 'day_1' ELSE 'expiry' END,
         b.renewal_at, b.dleft,
         pr.full_name, pr.phone, pr.whatsapp_phone, b.plan_name, b.amount_inr
    FROM base b
    JOIN public.tenants t ON t.id = b.tenant_id
    LEFT JOIN public.profiles pr ON pr.id = t.owner_id
   WHERE b.dleft IN (7,3,1,0)
     AND NOT EXISTS (
       SELECT 1 FROM public.subscription_reminders sr
        WHERE sr.subscription_id = b.subscription_id
          AND sr.period_end = b.renewal_at
          AND sr.stage = CASE b.dleft WHEN 7 THEN 'day_7' WHEN 3 THEN 'day_3' WHEN 1 THEN 'day_1' ELSE 'expiry' END);
END;
$$;
REVOKE ALL ON FUNCTION public.get_pending_subscription_reminders() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_pending_subscription_reminders() TO service_role;

CREATE OR REPLACE FUNCTION public.record_subscription_reminder(
  p_tenant UUID, p_subscription UUID, p_stage TEXT, p_period_end TIMESTAMPTZ,
  p_push BOOLEAN DEFAULT false, p_whatsapp BOOLEAN DEFAULT false)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  INSERT INTO public.subscription_reminders (tenant_id, subscription_id, stage, period_end, sent_via_push, sent_via_whatsapp)
  VALUES (p_tenant, p_subscription, p_stage, p_period_end, p_push, p_whatsapp)
  ON CONFLICT (subscription_id, stage, period_end) DO NOTHING;
END;
$$;
REVOKE ALL ON FUNCTION public.record_subscription_reminder(UUID,UUID,TEXT,TIMESTAMPTZ,BOOLEAN,BOOLEAN) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_subscription_reminder(UUID,UUID,TEXT,TIMESTAMPTZ,BOOLEAN,BOOLEAN) TO service_role;

-- -----------------------------------------------------------------------------
-- 3. Schedule. Transitions run as pure SQL (reliable). The reminder dispatch is
--    invoked via the existing invoke_edge_function helper (pg_net + vault key)
--    if present; otherwise transitions still run and reminders are a no-op.
-- -----------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'billing-subscription-lifecycle') THEN
    PERFORM cron.unschedule('billing-subscription-lifecycle');
  END IF;
END $$;

-- 10:00 IST = 04:30 UTC.
SELECT cron.schedule('billing-subscription-lifecycle', '30 4 * * *', $cron$
  SELECT public.process_subscription_lifecycle();
$cron$);

DO $$
BEGIN
  -- The existing crons invoke Edge Functions via private.invoke_edge_function('/path').
  IF EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'private' AND p.proname = 'invoke_edge_function'
  ) THEN
    IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'billing-subscription-reminders') THEN
      PERFORM cron.unschedule('billing-subscription-reminders');
    END IF;
    -- 10:05 IST = 04:35 UTC, a few minutes after transitions settle.
    PERFORM cron.schedule('billing-subscription-reminders', '35 4 * * *',
      $cron$ SELECT private.invoke_edge_function('/subscription-lifecycle'); $cron$);
  END IF;
END $$;

COMMIT;
