-- =============================================================================
-- PoultryOS — SaaS Control Center · Increment 2 / M3: Tenant Lifecycle & Ops
-- File: 20260611000010_tenant_ops.sql
-- =============================================================================
-- Adds operator-driven tenant lifecycle: suspend / activate / soft-delete /
-- restore / extend-trial / change-plan / reset-subscription. Two load-bearing
-- pieces:
--
--   1. SUSPENSION ENFORCEMENT WITH TEETH. Every tenant-owned table's RLS gates
--      on is_tenant_member(tenant_id) first. We make that helper status-aware:
--      a tenant that is 'suspended' or soft-deleted yields NO members, so all
--      ~18 operational tables go dark for the whole workforce at once — no
--      per-table policy edits. Owners keep a narrow recovery path (read their
--      own tenant + subscription) so they can see "suspended" and pay.
--
--   2. GUARDED, AUDITED RPCs. Each cc_* action re-checks the operator's
--      platform permission (driven by their JWT — call these with the operator
--      session, NOT the service role) and writes an immutable audit row in the
--      SAME transaction via log_platform_event().
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- 1. Lifecycle + cached-ops columns on tenants.
-- -----------------------------------------------------------------------------
ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS suspended_at     TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS suspended_reason TEXT,
  ADD COLUMN IF NOT EXISTS deleted_at       TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS health_score     SMALLINT,        -- cached 0..100 (Increment 4)
  ADD COLUMN IF NOT EXISTS mrr_inr          NUMERIC(12,2);   -- cached (Increment 4)

CREATE INDEX IF NOT EXISTS idx_tenants_deleted_at ON public.tenants(deleted_at);
CREATE INDEX IF NOT EXISTS idx_tenants_status     ON public.tenants(status);

-- -----------------------------------------------------------------------------
-- 2. Suspension enforcement: make membership status-aware. A suspended or
--    soft-deleted tenant has no effective members. (SECURITY DEFINER → bypasses
--    tenants RLS when joining, no recursion.)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_tenant_member(p_tenant_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1
      FROM public.tenant_users tu
      JOIN public.tenants t ON t.id = tu.tenant_id
     WHERE tu.tenant_id = p_tenant_id
       AND tu.user_id = auth.uid()
       AND t.status <> 'suspended'
       AND t.deleted_at IS NULL
  );
$$;

-- -----------------------------------------------------------------------------
-- 3. Owner recovery paths. Because is_tenant_member now returns false while
--    suspended, the owner would lose sight of their own tenant + billing. Add
--    owner-direct SELECT policies (OR'd with the member policy) so the owner can
--    always see status + subscription and self-recover. Members/workers stay
--    fully blocked.
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS tenants_owner_select ON public.tenants;
CREATE POLICY tenants_owner_select ON public.tenants
  FOR SELECT USING (owner_id = auth.uid());

DROP POLICY IF EXISTS tenant_subscriptions_owner_select ON public.tenant_subscriptions;
CREATE POLICY tenant_subscriptions_owner_select ON public.tenant_subscriptions
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.tenants t WHERE t.id = tenant_id AND t.owner_id = auth.uid())
  );

-- -----------------------------------------------------------------------------
-- 4. Permission guard used by every cc_* RPC.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.cc_assert_permission(p_perm TEXT)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF NOT public.platform_has_permission(p_perm) THEN
    RAISE EXCEPTION 'forbidden: missing platform permission %', p_perm USING ERRCODE = '42501';
  END IF;
END;
$$;

-- -----------------------------------------------------------------------------
-- 5. Lifecycle RPCs. Each: assert permission → mutate → audit (in one txn).
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.cc_suspend_tenant(p_tenant UUID, p_reason TEXT)
RETURNS public.tenants LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_before JSONB; v_row public.tenants;
BEGIN
  PERFORM public.cc_assert_permission('tenant:manage');
  SELECT to_jsonb(t) INTO v_before FROM public.tenants t WHERE id = p_tenant;
  IF v_before IS NULL THEN RAISE EXCEPTION 'tenant % not found', p_tenant USING ERRCODE = 'P0002'; END IF;
  UPDATE public.tenants
     SET status = 'suspended', suspended_at = now(), suspended_reason = p_reason
   WHERE id = p_tenant RETURNING * INTO v_row;
  PERFORM public.log_platform_event('tenant.suspend','tenant:manage','tenant',p_tenant,p_tenant,v_before,to_jsonb(v_row),p_reason);
  RETURN v_row;
END;
$$;

CREATE OR REPLACE FUNCTION public.cc_activate_tenant(p_tenant UUID)
RETURNS public.tenants LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_before JSONB; v_row public.tenants;
BEGIN
  PERFORM public.cc_assert_permission('tenant:manage');
  SELECT to_jsonb(t) INTO v_before FROM public.tenants t WHERE id = p_tenant;
  IF v_before IS NULL THEN RAISE EXCEPTION 'tenant % not found', p_tenant USING ERRCODE = 'P0002'; END IF;
  UPDATE public.tenants
     SET status = 'active', suspended_at = NULL, suspended_reason = NULL
   WHERE id = p_tenant RETURNING * INTO v_row;
  PERFORM public.log_platform_event('tenant.activate','tenant:manage','tenant',p_tenant,p_tenant,v_before,to_jsonb(v_row),NULL);
  RETURN v_row;
END;
$$;

CREATE OR REPLACE FUNCTION public.cc_soft_delete_tenant(p_tenant UUID, p_reason TEXT)
RETURNS public.tenants LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_before JSONB; v_row public.tenants;
BEGIN
  PERFORM public.cc_assert_permission('tenant:manage');
  SELECT to_jsonb(t) INTO v_before FROM public.tenants t WHERE id = p_tenant;
  IF v_before IS NULL THEN RAISE EXCEPTION 'tenant % not found', p_tenant USING ERRCODE = 'P0002'; END IF;
  UPDATE public.tenants
     SET deleted_at = now(), suspended_reason = COALESCE(p_reason, suspended_reason)
   WHERE id = p_tenant RETURNING * INTO v_row;
  PERFORM public.log_platform_event('tenant.soft_delete','tenant:manage','tenant',p_tenant,p_tenant,v_before,to_jsonb(v_row),p_reason);
  RETURN v_row;
END;
$$;

CREATE OR REPLACE FUNCTION public.cc_restore_tenant(p_tenant UUID)
RETURNS public.tenants LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_before JSONB; v_row public.tenants;
BEGIN
  PERFORM public.cc_assert_permission('tenant:manage');
  SELECT to_jsonb(t) INTO v_before FROM public.tenants t WHERE id = p_tenant;
  IF v_before IS NULL THEN RAISE EXCEPTION 'tenant % not found', p_tenant USING ERRCODE = 'P0002'; END IF;
  UPDATE public.tenants
     SET deleted_at = NULL, status = 'active', suspended_at = NULL, suspended_reason = NULL
   WHERE id = p_tenant RETURNING * INTO v_row;
  PERFORM public.log_platform_event('tenant.restore','tenant:manage','tenant',p_tenant,p_tenant,v_before,to_jsonb(v_row),NULL);
  RETURN v_row;
END;
$$;

CREATE OR REPLACE FUNCTION public.cc_extend_trial(p_tenant UUID, p_days INTEGER)
RETURNS public.tenant_subscriptions LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_before JSONB; v_row public.tenant_subscriptions;
BEGIN
  PERFORM public.cc_assert_permission('tenant:manage');
  IF p_days IS NULL OR p_days <= 0 THEN RAISE EXCEPTION 'p_days must be positive' USING ERRCODE = '22023'; END IF;
  SELECT to_jsonb(s) INTO v_before FROM public.tenant_subscriptions s WHERE tenant_id = p_tenant;
  IF v_before IS NULL THEN RAISE EXCEPTION 'subscription for tenant % not found', p_tenant USING ERRCODE = 'P0002'; END IF;
  UPDATE public.tenant_subscriptions
     SET status = 'trial',
         trial_ends_at = GREATEST(now(), COALESCE(trial_ends_at, now())) + make_interval(days => p_days)
   WHERE tenant_id = p_tenant RETURNING * INTO v_row;
  PERFORM public.log_platform_event('tenant.extend_trial','tenant:manage','tenant',p_tenant,p_tenant,v_before,to_jsonb(v_row),
                                    format('%s days', p_days));
  RETURN v_row;
END;
$$;

CREATE OR REPLACE FUNCTION public.cc_change_plan(p_tenant UUID, p_plan_code TEXT, p_cycle TEXT DEFAULT NULL)
RETURNS public.tenant_subscriptions LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_before JSONB; v_row public.tenant_subscriptions; v_plan UUID;
BEGIN
  PERFORM public.cc_assert_permission('tenant:manage');
  SELECT id INTO v_plan FROM public.subscription_plans WHERE code = p_plan_code AND is_active;
  IF v_plan IS NULL THEN RAISE EXCEPTION 'plan % not found or inactive', p_plan_code USING ERRCODE = 'P0002'; END IF;
  IF p_cycle IS NOT NULL AND p_cycle NOT IN ('monthly','yearly') THEN
    RAISE EXCEPTION 'cycle must be monthly or yearly' USING ERRCODE = '22023';
  END IF;
  SELECT to_jsonb(s) INTO v_before FROM public.tenant_subscriptions s WHERE tenant_id = p_tenant;
  IF v_before IS NULL THEN RAISE EXCEPTION 'subscription for tenant % not found', p_tenant USING ERRCODE = 'P0002'; END IF;
  UPDATE public.tenant_subscriptions
     SET plan_id = v_plan, billing_cycle = COALESCE(p_cycle, billing_cycle)
   WHERE tenant_id = p_tenant RETURNING * INTO v_row;
  PERFORM public.log_platform_event('tenant.change_plan','tenant:manage','tenant',p_tenant,p_tenant,v_before,to_jsonb(v_row),
                                    format('plan=%s cycle=%s', p_plan_code, COALESCE(p_cycle,'unchanged')));
  RETURN v_row;
END;
$$;

CREATE OR REPLACE FUNCTION public.cc_reset_subscription(p_tenant UUID)
RETURNS public.tenant_subscriptions LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_before JSONB; v_row public.tenant_subscriptions; v_starter UUID;
BEGIN
  PERFORM public.cc_assert_permission('tenant:manage');
  SELECT id INTO v_starter FROM public.subscription_plans WHERE code = 'starter';
  SELECT to_jsonb(s) INTO v_before FROM public.tenant_subscriptions s WHERE tenant_id = p_tenant;
  IF v_before IS NULL THEN RAISE EXCEPTION 'subscription for tenant % not found', p_tenant USING ERRCODE = 'P0002'; END IF;
  UPDATE public.tenant_subscriptions
     SET plan_id = v_starter, status = 'trial', billing_cycle = 'monthly',
         trial_ends_at = now() + interval '14 days',
         razorpay_subscription_id = NULL, payment_method = NULL, cancelled_at = NULL
   WHERE tenant_id = p_tenant RETURNING * INTO v_row;
  PERFORM public.log_platform_event('tenant.reset_subscription','tenant:manage','tenant',p_tenant,p_tenant,v_before,to_jsonb(v_row),NULL);
  RETURN v_row;
END;
$$;

-- -----------------------------------------------------------------------------
-- 6. Grants. Operators call these with their own JWT (the RPC self-checks the
--    platform permission). Revoke from anon; service role can also call but
--    would fail the permission check (no auth.uid()), by design.
-- -----------------------------------------------------------------------------
DO $$
DECLARE fn TEXT;
BEGIN
  FOREACH fn IN ARRAY ARRAY[
    'public.cc_suspend_tenant(UUID,TEXT)',
    'public.cc_activate_tenant(UUID)',
    'public.cc_soft_delete_tenant(UUID,TEXT)',
    'public.cc_restore_tenant(UUID)',
    'public.cc_extend_trial(UUID,INTEGER)',
    'public.cc_change_plan(UUID,TEXT,TEXT)',
    'public.cc_reset_subscription(UUID)'
  ] LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM anon', fn);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', fn);
  END LOOP;
END $$;

REVOKE EXECUTE ON FUNCTION public.cc_assert_permission(TEXT) FROM anon;

COMMENT ON FUNCTION public.is_tenant_member(UUID) IS 'Tenant membership, status-aware: returns false when the tenant is suspended or soft-deleted, which blocks every tenant-owned table at once (suspension enforcement). SECURITY DEFINER.';

COMMIT;
