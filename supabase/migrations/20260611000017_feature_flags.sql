-- =============================================================================
-- PoultryOS — SaaS Control Center · Increment 6 / M9: Feature Flags
-- File: 20260611000017_feature_flags.sql
-- =============================================================================
-- Global flags with per-plan and per-tenant overrides + percentage rollouts.
-- The resolver tenant_feature(tenant, key) is the single read path (SECURITY
-- DEFINER) — anything (app, RPC, edge fn) can resolve a flag without reading the
-- flag tables directly. Resolution precedence (most specific wins):
--   tenant override → plan override → global (enabled? then % rollout by stable hash).
-- Operator writes go through guarded, audited cc_* RPCs (flag:manage).
-- =============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.feature_flags (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key                TEXT NOT NULL UNIQUE,
  name               TEXT NOT NULL,
  description        TEXT,
  is_enabled         BOOLEAN NOT NULL DEFAULT false,           -- global default
  rollout_percentage SMALLINT NOT NULL DEFAULT 100 CHECK (rollout_percentage BETWEEN 0 AND 100),
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TRIGGER tg_feature_flags_updated_at BEFORE UPDATE ON public.feature_flags
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

CREATE TABLE IF NOT EXISTS public.plan_feature_flags (
  flag_id    UUID NOT NULL REFERENCES public.feature_flags(id) ON DELETE CASCADE,
  plan_id    UUID NOT NULL REFERENCES public.subscription_plans(id) ON DELETE CASCADE,
  is_enabled BOOLEAN NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (flag_id, plan_id)
);

CREATE TABLE IF NOT EXISTS public.tenant_feature_flags (
  flag_id    UUID NOT NULL REFERENCES public.feature_flags(id) ON DELETE CASCADE,
  tenant_id  UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  is_enabled BOOLEAN NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (flag_id, tenant_id)
);

-- Operator reads (flag:read); resolver below reads regardless via SECURITY DEFINER.
ALTER TABLE public.feature_flags        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.plan_feature_flags   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_feature_flags ENABLE ROW LEVEL SECURITY;
CREATE POLICY feature_flags_read        ON public.feature_flags        FOR SELECT USING (public.platform_has_permission('flag:read'));
CREATE POLICY plan_feature_flags_read   ON public.plan_feature_flags   FOR SELECT USING (public.platform_has_permission('flag:read'));
CREATE POLICY tenant_feature_flags_read ON public.tenant_feature_flags FOR SELECT USING (public.platform_has_permission('flag:read'));

-- -----------------------------------------------------------------------------
-- Resolver. tenant override → plan override → global + % rollout.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.tenant_feature(p_tenant UUID, p_key TEXT)
RETURNS BOOLEAN LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_flag public.feature_flags%ROWTYPE;
  v_override BOOLEAN;
  v_plan UUID;
  v_bucket INT;
BEGIN
  SELECT * INTO v_flag FROM public.feature_flags WHERE key = p_key;
  IF NOT FOUND THEN RETURN false; END IF;

  -- 1. tenant override
  SELECT is_enabled INTO v_override FROM public.tenant_feature_flags
    WHERE flag_id = v_flag.id AND tenant_id = p_tenant;
  IF FOUND THEN RETURN v_override; END IF;

  -- 2. plan override
  SELECT ts.plan_id INTO v_plan FROM public.tenant_subscriptions ts WHERE ts.tenant_id = p_tenant;
  IF v_plan IS NOT NULL THEN
    SELECT is_enabled INTO v_override FROM public.plan_feature_flags
      WHERE flag_id = v_flag.id AND plan_id = v_plan;
    IF FOUND THEN RETURN v_override; END IF;
  END IF;

  -- 3. global + rollout
  IF NOT v_flag.is_enabled THEN RETURN false; END IF;
  IF v_flag.rollout_percentage >= 100 THEN RETURN true; END IF;
  IF v_flag.rollout_percentage <= 0 THEN RETURN false; END IF;
  v_bucket := (abs(hashtextextended(p_tenant::text || ':' || p_key, 0)) % 100);
  RETURN v_bucket < v_flag.rollout_percentage;
END;
$$;

-- -----------------------------------------------------------------------------
-- Operator CRUD (flag:manage), audited.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.cc_create_flag(
  p_key TEXT, p_name TEXT, p_description TEXT DEFAULT NULL,
  p_enabled BOOLEAN DEFAULT false, p_rollout SMALLINT DEFAULT 100)
RETURNS public.feature_flags LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_row public.feature_flags;
BEGIN
  PERFORM public.cc_assert_permission('flag:manage');
  INSERT INTO public.feature_flags (key, name, description, is_enabled, rollout_percentage)
  VALUES (p_key, p_name, p_description, COALESCE(p_enabled,false), COALESCE(p_rollout,100))
  RETURNING * INTO v_row;
  PERFORM public.log_platform_event('flag.create','flag:manage','flag',v_row.id,NULL,NULL,to_jsonb(v_row),NULL);
  RETURN v_row;
END;
$$;

CREATE OR REPLACE FUNCTION public.cc_set_flag(p_flag UUID, p_enabled BOOLEAN, p_rollout SMALLINT DEFAULT NULL)
RETURNS public.feature_flags LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_before JSONB; v_row public.feature_flags;
BEGIN
  PERFORM public.cc_assert_permission('flag:manage');
  SELECT to_jsonb(f) INTO v_before FROM public.feature_flags f WHERE id = p_flag;
  IF v_before IS NULL THEN RAISE EXCEPTION 'flag % not found', p_flag USING ERRCODE = 'P0002'; END IF;
  UPDATE public.feature_flags
     SET is_enabled = p_enabled, rollout_percentage = COALESCE(p_rollout, rollout_percentage)
   WHERE id = p_flag RETURNING * INTO v_row;
  PERFORM public.log_platform_event('flag.set','flag:manage','flag',p_flag,NULL,v_before,to_jsonb(v_row),NULL);
  RETURN v_row;
END;
$$;

CREATE OR REPLACE FUNCTION public.cc_set_tenant_flag(p_flag UUID, p_tenant UUID, p_enabled BOOLEAN)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  PERFORM public.cc_assert_permission('flag:manage');
  INSERT INTO public.tenant_feature_flags (flag_id, tenant_id, is_enabled)
  VALUES (p_flag, p_tenant, p_enabled)
  ON CONFLICT (flag_id, tenant_id) DO UPDATE SET is_enabled = EXCLUDED.is_enabled;
  PERFORM public.log_platform_event('flag.tenant_override','flag:manage','flag',p_flag,p_tenant,NULL,
            jsonb_build_object('is_enabled', p_enabled), NULL);
END;
$$;

CREATE OR REPLACE FUNCTION public.cc_set_plan_flag(p_flag UUID, p_plan UUID, p_enabled BOOLEAN)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  PERFORM public.cc_assert_permission('flag:manage');
  INSERT INTO public.plan_feature_flags (flag_id, plan_id, is_enabled)
  VALUES (p_flag, p_plan, p_enabled)
  ON CONFLICT (flag_id, plan_id) DO UPDATE SET is_enabled = EXCLUDED.is_enabled;
  PERFORM public.log_platform_event('flag.plan_override','flag:manage','flag',p_flag,NULL,NULL,
            jsonb_build_object('plan_id', p_plan, 'is_enabled', p_enabled), NULL);
END;
$$;

-- Grants. Resolver open to authenticated (apps resolve flags); CRUD to operators.
DO $$
DECLARE fn TEXT;
BEGIN
  EXECUTE 'REVOKE EXECUTE ON FUNCTION public.tenant_feature(UUID,TEXT) FROM anon';
  EXECUTE 'GRANT EXECUTE ON FUNCTION public.tenant_feature(UUID,TEXT) TO authenticated, service_role';
  FOREACH fn IN ARRAY ARRAY[
    'public.cc_create_flag(TEXT,TEXT,TEXT,BOOLEAN,SMALLINT)',
    'public.cc_set_flag(UUID,BOOLEAN,SMALLINT)',
    'public.cc_set_tenant_flag(UUID,UUID,BOOLEAN)',
    'public.cc_set_plan_flag(UUID,UUID,BOOLEAN)'
  ] LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM anon', fn);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', fn);
  END LOOP;
END $$;

COMMIT;
