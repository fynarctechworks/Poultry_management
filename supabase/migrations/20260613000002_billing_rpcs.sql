-- =============================================================================
-- PoultryOS — Enterprise Billing · Phase A3: Billing RPCs
-- File: 20260613000002_billing_rpcs.sql
-- =============================================================================
-- Tenant-facing reads for the billing portal, and audited Control Center
-- overrides for subscription lifecycle management. The Razorpay edge functions
-- own the money movement; these RPCs own the in-app state + the operator tools.
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- set_subscription_status — single writer for status transitions. Mirrors the
-- status onto tenants, stamps trial conversion/cancel, logs subscription_history.
-- SECURITY DEFINER so the webhook (service role) and cc_* RPCs share one path.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_subscription_status(
  p_tenant_id UUID,
  p_status    TEXT,
  p_reason    TEXT DEFAULT NULL,
  p_actor     TEXT DEFAULT 'system'
)
RETURNS public.tenant_subscriptions
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_old TEXT;
  v_row public.tenant_subscriptions;
BEGIN
  IF p_status NOT IN ('trial','active','past_due','suspended','cancelled') THEN
    RAISE EXCEPTION 'invalid status %', p_status USING ERRCODE = 'check_violation';
  END IF;

  SELECT status INTO v_old FROM public.tenant_subscriptions WHERE tenant_id = p_tenant_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'no subscription for tenant %', p_tenant_id USING ERRCODE = 'P0002'; END IF;

  UPDATE public.tenant_subscriptions SET
    status             = p_status,
    cancelled_at       = CASE WHEN p_status = 'cancelled' THEN now() ELSE cancelled_at END,
    trial_converted_at = CASE WHEN p_status = 'active' AND v_old = 'trial'
                              THEN COALESCE(trial_converted_at, now()) ELSE trial_converted_at END,
    trial_cancelled_at = CASE WHEN p_status = 'cancelled' AND v_old = 'trial'
                              THEN COALESCE(trial_cancelled_at, now()) ELSE trial_cancelled_at END
  WHERE tenant_id = p_tenant_id
  RETURNING * INTO v_row;

  UPDATE public.tenants SET status = p_status WHERE id = p_tenant_id;

  INSERT INTO public.subscription_history (tenant_id, subscription_id, from_status, to_status, reason, actor)
  VALUES (p_tenant_id, v_row.id, v_old, p_status, p_reason, p_actor);

  RETURN v_row;
END;
$$;
REVOKE ALL ON FUNCTION public.set_subscription_status(UUID,TEXT,TEXT,TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_subscription_status(UUID,TEXT,TEXT,TEXT) TO service_role;

-- -----------------------------------------------------------------------------
-- my_billing_summary — everything the tenant billing portal + banners need.
-- Resolves the caller's tenant (owned tenant first, else profile.tenant_id).
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.my_billing_summary()
RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_tenant   UUID;
  v_ts       public.tenant_subscriptions%ROWTYPE;
  v_plan     public.subscription_plans%ROWTYPE;
  v_renew    TIMESTAMPTZ;
  v_days     INTEGER;
BEGIN
  SELECT id INTO v_tenant FROM public.tenants WHERE owner_id = auth.uid() LIMIT 1;
  IF v_tenant IS NULL THEN
    SELECT tenant_id INTO v_tenant FROM public.profiles WHERE id = auth.uid();
  END IF;
  IF v_tenant IS NULL THEN RETURN jsonb_build_object('has_subscription', false); END IF;

  SELECT * INTO v_ts FROM public.tenant_subscriptions WHERE tenant_id = v_tenant;
  IF NOT FOUND THEN RETURN jsonb_build_object('has_subscription', false, 'tenant_id', v_tenant); END IF;

  SELECT * INTO v_plan FROM public.subscription_plans WHERE id = v_ts.plan_id;

  v_renew := CASE WHEN v_ts.status = 'trial' THEN v_ts.trial_ends_at ELSE v_ts.current_period_end END;
  v_days  := CASE WHEN v_renew IS NULL THEN NULL
                  ELSE GREATEST(0, CEIL(EXTRACT(EPOCH FROM (v_renew - now())) / 86400.0))::INTEGER END;

  RETURN jsonb_build_object(
    'has_subscription',   true,
    'tenant_id',          v_tenant,
    'is_owner',           public.is_tenant_owner(v_tenant),
    'status',             v_ts.status,
    'billing_cycle',      v_ts.billing_cycle,
    'can_write',          public.tenant_can_write(v_tenant),
    'is_paid',            public.is_tenant_paid(v_tenant),
    'is_trial',           v_ts.status = 'trial',
    'trial_ends_at',      v_ts.trial_ends_at,
    'current_period_end', v_ts.current_period_end,
    'renewal_at',         v_renew,
    'days_remaining',     v_days,
    'cancellable',        v_ts.status = 'trial',   -- cancel allowed during trial only
    'cancelled_at',       v_ts.cancelled_at,
    'razorpay_subscription_id', v_ts.razorpay_subscription_id,
    'plan', CASE WHEN v_plan.id IS NULL THEN NULL ELSE jsonb_build_object(
      'id', v_plan.id, 'code', v_plan.code, 'name', v_plan.name, 'tier', v_plan.tier,
      'monthly_price_inr', v_plan.monthly_price_inr, 'yearly_price_inr', v_plan.yearly_price_inr,
      'features', v_plan.features_json) END
  );
END;
$$;
REVOKE ALL ON FUNCTION public.my_billing_summary() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.my_billing_summary() TO authenticated, service_role;

-- -----------------------------------------------------------------------------
-- my_invoices — the caller's tenant invoice history (newest first). PDF bytes
-- are fetched separately via the generate-invoice-pdf edge function (signed URL).
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.my_invoices()
RETURNS SETOF public.invoices LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT i.* FROM public.invoices i
   WHERE i.tenant_id IN (
     SELECT id FROM public.tenants WHERE owner_id = auth.uid()
     UNION
     SELECT tenant_id FROM public.profiles WHERE id = auth.uid() AND tenant_id IS NOT NULL)
   ORDER BY i.issued_at DESC;
$$;
REVOKE ALL ON FUNCTION public.my_invoices() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.my_invoices() TO authenticated, service_role;

-- =============================================================================
-- Control Center operator RPCs (audited).
-- =============================================================================

-- cc_list_invoices — filterable invoice list for /admin/billing.
CREATE OR REPLACE FUNCTION public.cc_list_invoices(
  p_status TEXT DEFAULT NULL, p_tenant UUID DEFAULT NULL,
  p_search TEXT DEFAULT NULL, p_limit INT DEFAULT 100, p_offset INT DEFAULT 0)
RETURNS SETOF public.invoices LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  PERFORM public.cc_assert_permission('billing:read');
  RETURN QUERY
    SELECT i.* FROM public.invoices i
     WHERE (p_status IS NULL OR i.status = p_status)
       AND (p_tenant IS NULL OR i.tenant_id = p_tenant)
       AND (p_search IS NULL OR i.invoice_number ILIKE '%'||p_search||'%'
            OR i.razorpay_payment_id ILIKE '%'||p_search||'%')
     ORDER BY i.issued_at DESC
     LIMIT GREATEST(p_limit,0) OFFSET GREATEST(p_offset,0);
END;
$$;

-- cc_list_payments — filterable payment list (incl. failed/refunded).
CREATE OR REPLACE FUNCTION public.cc_list_payments(
  p_status TEXT DEFAULT NULL, p_tenant UUID DEFAULT NULL,
  p_limit INT DEFAULT 100, p_offset INT DEFAULT 0)
RETURNS SETOF public.payments LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  PERFORM public.cc_assert_permission('billing:read');
  RETURN QUERY
    SELECT p.* FROM public.payments p
     WHERE (p_status IS NULL OR p.status = p_status)
       AND (p_tenant IS NULL OR p.tenant_id = p_tenant)
     ORDER BY p.created_at DESC
     LIMIT GREATEST(p_limit,0) OFFSET GREATEST(p_offset,0);
END;
$$;

-- cc_extend_trial — push the trial end out N days (e.g. sales courtesy).
CREATE OR REPLACE FUNCTION public.cc_extend_trial(p_tenant UUID, p_days INT, p_reason TEXT DEFAULT NULL)
RETURNS public.tenant_subscriptions LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_row public.tenant_subscriptions; v_before JSONB;
BEGIN
  PERFORM public.cc_assert_permission('subscription:manage');
  IF p_days IS NULL OR p_days <= 0 THEN RAISE EXCEPTION 'days must be positive'; END IF;
  SELECT to_jsonb(ts) INTO v_before FROM public.tenant_subscriptions ts WHERE tenant_id = p_tenant;
  UPDATE public.tenant_subscriptions SET
    status = 'trial',
    trial_ends_at = GREATEST(COALESCE(trial_ends_at, now()), now()) + make_interval(days => p_days),
    current_period_end = GREATEST(COALESCE(current_period_end, now()), now()) + make_interval(days => p_days)
  WHERE tenant_id = p_tenant RETURNING * INTO v_row;
  IF v_row.id IS NULL THEN RAISE EXCEPTION 'no subscription for tenant %', p_tenant USING ERRCODE='P0002'; END IF;
  UPDATE public.tenants SET status = 'trial' WHERE id = p_tenant;
  INSERT INTO public.subscription_history (tenant_id, subscription_id, to_status, reason, actor)
    VALUES (p_tenant, v_row.id, 'trial', COALESCE(p_reason,'trial extended '||p_days||'d'), 'admin');
  PERFORM public.log_platform_event('subscription.extend_trial','subscription:manage','tenant',p_tenant,p_tenant,
            v_before, to_jsonb(v_row), p_reason);
  RETURN v_row;
END;
$$;

-- cc_change_tenant_plan — operator override of a tenant's plan/cycle.
CREATE OR REPLACE FUNCTION public.cc_change_tenant_plan(
  p_tenant UUID, p_plan_code TEXT, p_cycle TEXT DEFAULT 'monthly', p_reason TEXT DEFAULT NULL)
RETURNS public.tenant_subscriptions LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_row public.tenant_subscriptions; v_before JSONB; v_plan UUID;
BEGIN
  PERFORM public.cc_assert_permission('subscription:manage');
  SELECT id INTO v_plan FROM public.subscription_plans WHERE code = p_plan_code AND is_active;
  IF v_plan IS NULL THEN RAISE EXCEPTION 'plan % not found/active', p_plan_code USING ERRCODE='P0002'; END IF;
  IF p_cycle NOT IN ('monthly','yearly') THEN RAISE EXCEPTION 'bad cycle %', p_cycle; END IF;
  SELECT to_jsonb(ts) INTO v_before FROM public.tenant_subscriptions ts WHERE tenant_id = p_tenant;
  UPDATE public.tenant_subscriptions SET plan_id = v_plan, billing_cycle = p_cycle
   WHERE tenant_id = p_tenant RETURNING * INTO v_row;
  IF v_row.id IS NULL THEN RAISE EXCEPTION 'no subscription for tenant %', p_tenant USING ERRCODE='P0002'; END IF;
  INSERT INTO public.subscription_history (tenant_id, subscription_id, from_status, to_status, reason, actor, metadata_json)
    VALUES (p_tenant, v_row.id, v_row.status, v_row.status, COALESCE(p_reason,'plan changed by operator'),
            'admin', jsonb_build_object('plan_code', p_plan_code, 'cycle', p_cycle));
  PERFORM public.log_platform_event('subscription.change_plan','subscription:manage','tenant',p_tenant,p_tenant,
            v_before, to_jsonb(v_row), p_reason);
  RETURN v_row;
END;
$$;

-- cc_set_subscription_status — suspend / activate / cancel a tenant (audited).
CREATE OR REPLACE FUNCTION public.cc_set_subscription_status(p_tenant UUID, p_status TEXT, p_reason TEXT DEFAULT NULL)
RETURNS public.tenant_subscriptions LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_before JSONB; v_row public.tenant_subscriptions;
BEGIN
  PERFORM public.cc_assert_permission('subscription:manage');
  SELECT to_jsonb(ts) INTO v_before FROM public.tenant_subscriptions ts WHERE tenant_id = p_tenant;
  v_row := public.set_subscription_status(p_tenant, p_status, COALESCE(p_reason,'operator action'), 'admin');
  PERFORM public.log_platform_event('subscription.set_status','subscription:manage','tenant',p_tenant,p_tenant,
            v_before, to_jsonb(v_row), p_reason);
  RETURN v_row;
END;
$$;

-- cc_reset_subscription — back to a fresh 7-day trial on the starter plan.
CREATE OR REPLACE FUNCTION public.cc_reset_subscription(p_tenant UUID, p_reason TEXT DEFAULT NULL)
RETURNS public.tenant_subscriptions LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_row public.tenant_subscriptions; v_before JSONB;
BEGIN
  PERFORM public.cc_assert_permission('subscription:manage');
  SELECT to_jsonb(ts) INTO v_before FROM public.tenant_subscriptions ts WHERE tenant_id = p_tenant;
  UPDATE public.tenant_subscriptions SET
    plan_id = (SELECT id FROM public.subscription_plans WHERE code='starter'),
    status='trial', billing_cycle='monthly',
    trial_started_at = now(), trial_ends_at = now() + interval '7 days',
    current_period_end = now() + interval '7 days',
    trial_converted_at = NULL, trial_cancelled_at = NULL,
    cancelled_at = NULL, razorpay_subscription_id = NULL
  WHERE tenant_id = p_tenant RETURNING * INTO v_row;
  IF v_row.id IS NULL THEN RAISE EXCEPTION 'no subscription for tenant %', p_tenant USING ERRCODE='P0002'; END IF;
  UPDATE public.tenants SET status='trial' WHERE id = p_tenant;
  INSERT INTO public.subscription_history (tenant_id, subscription_id, to_status, reason, actor)
    VALUES (p_tenant, v_row.id, 'trial', COALESCE(p_reason,'subscription reset'), 'admin');
  PERFORM public.log_platform_event('subscription.reset','subscription:manage','tenant',p_tenant,p_tenant,
            v_before, to_jsonb(v_row), p_reason);
  RETURN v_row;
END;
$$;

-- Grants: operators call cc_* with their JWT (permission asserted inside).
DO $$
DECLARE fn TEXT;
BEGIN
  FOREACH fn IN ARRAY ARRAY[
    'public.cc_list_invoices(TEXT,UUID,TEXT,INT,INT)',
    'public.cc_list_payments(TEXT,UUID,INT,INT)',
    'public.cc_extend_trial(UUID,INT,TEXT)',
    'public.cc_change_tenant_plan(UUID,TEXT,TEXT,TEXT)',
    'public.cc_set_subscription_status(UUID,TEXT,TEXT)',
    'public.cc_reset_subscription(UUID,TEXT)'
  ] LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM anon', fn);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', fn);
  END LOOP;
END $$;

COMMIT;
