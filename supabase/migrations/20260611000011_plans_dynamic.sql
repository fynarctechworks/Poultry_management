-- =============================================================================
-- PoultryOS — SaaS Control Center · Increment 3 / M4: Dynamic Plans
-- File: 20260611000011_plans_dynamic.sql
-- =============================================================================
-- Makes plans fully editable from the Control Center without breaking the app.
-- subscription_plans stays CANONICAL (the app + tenant_plan_status already read
-- its columns + features_json). We add a normalized, admin-friendly layer:
--
--   subscription_features   — catalog of feature keys (typed)
--   plan_feature_mapping    — per-plan feature values (the editable normal form)
--   plan_history            — append-only change log
--
-- Editing a feature upserts a mapping and REBUILDS subscription_plans.features_json
-- from the mappings, so every existing app read stays correct (backward compatible).
-- All mutations go through guarded, audited cc_* RPCs (subscription:manage).
-- =============================================================================

BEGIN;

-- archived marker on plans (archive = inactive + dated).
ALTER TABLE public.subscription_plans
  ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;

-- -----------------------------------------------------------------------------
-- 1. Feature catalog.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.subscription_features (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code        TEXT NOT NULL UNIQUE,
  name        TEXT NOT NULL,
  description TEXT,
  value_type  TEXT NOT NULL DEFAULT 'boolean' CHECK (value_type IN ('boolean','numeric','text')),
  category    TEXT NOT NULL DEFAULT 'access',
  sort_order  SMALLINT NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TRIGGER tg_subscription_features_updated_at
  BEFORE UPDATE ON public.subscription_features
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

INSERT INTO public.subscription_features (code, name, value_type, category, sort_order) VALUES
  ('vet_access',                'Vet collaboration',        'boolean', 'access',  1),
  ('contract_farming',          'Contract farming module',  'boolean', 'access',  2),
  ('traceability_pdf',          'Traceability QR & PDF',     'boolean', 'access',  3),
  ('multi_farm_dashboard',      'Multi-farm dashboard',      'boolean', 'access',  4),
  ('custom_integrations',       'Custom integrations',       'boolean', 'access',  5),
  ('sso',                       'SSO',                       'boolean', 'access',  6),
  ('priority_support',          'Priority support',          'boolean', 'support', 7),
  ('dedicated_support',         'Dedicated support',         'boolean', 'support', 8),
  ('whatsapp_alerts_per_month', 'WhatsApp alerts / month',   'numeric', 'limits',  9),
  ('max_buyers',                'Max buyers',                'numeric', 'limits', 10)
ON CONFLICT (code) DO NOTHING;

-- -----------------------------------------------------------------------------
-- 2. Per-plan feature values (the editable normal form). value is JSONB so a
--    feature can be true/false, a number, or null (= unlimited).
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.plan_feature_mapping (
  plan_id     UUID NOT NULL REFERENCES public.subscription_plans(id) ON DELETE CASCADE,
  feature_id  UUID NOT NULL REFERENCES public.subscription_features(id) ON DELETE CASCADE,
  value       JSONB,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (plan_id, feature_id)
);
CREATE TRIGGER tg_plan_feature_mapping_updated_at
  BEFORE UPDATE ON public.plan_feature_mapping
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- Backfill mappings from each plan's existing features_json.
INSERT INTO public.plan_feature_mapping (plan_id, feature_id, value)
SELECT p.id, f.id, kv.value
  FROM public.subscription_plans p
  CROSS JOIN LATERAL jsonb_each(p.features_json) kv
  JOIN public.subscription_features f ON f.code = kv.key
ON CONFLICT (plan_id, feature_id) DO NOTHING;

-- -----------------------------------------------------------------------------
-- 3. Append-only plan change history.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.plan_history (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id     UUID REFERENCES public.subscription_plans(id) ON DELETE SET NULL,
  changed_by  UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  action      TEXT NOT NULL,
  before_json JSONB,
  after_json  JSONB,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_plan_history_plan ON public.plan_history(plan_id, created_at DESC);

-- -----------------------------------------------------------------------------
-- 4. RLS. Catalog + mappings readable by any authenticated user (the pricing
--    page / app reads them); history readable by operators with subscription:read.
--    All writes are service-role / RPC only (no write policies).
-- -----------------------------------------------------------------------------
ALTER TABLE public.subscription_features ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.plan_feature_mapping  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.plan_history          ENABLE ROW LEVEL SECURITY;

CREATE POLICY subscription_features_read ON public.subscription_features
  FOR SELECT TO authenticated USING (true);
CREATE POLICY plan_feature_mapping_read ON public.plan_feature_mapping
  FOR SELECT TO authenticated USING (true);
CREATE POLICY plan_history_read ON public.plan_history
  FOR SELECT USING (public.platform_has_permission('subscription:read'));

-- -----------------------------------------------------------------------------
-- 5. Rebuild features_json from mappings (keeps the canonical app read correct).
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.rebuild_plan_features_json(p_plan UUID)
RETURNS VOID LANGUAGE sql SECURITY DEFINER SET search_path = public, pg_temp AS $$
  UPDATE public.subscription_plans p
     SET features_json = COALESCE((
           SELECT jsonb_object_agg(f.code, m.value)
             FROM public.plan_feature_mapping m
             JOIN public.subscription_features f ON f.id = m.feature_id
            WHERE m.plan_id = p.id
         ), '{}'::jsonb),
         updated_at = now()
   WHERE p.id = p_plan;
$$;

-- -----------------------------------------------------------------------------
-- 6. Guarded, audited plan CRUD RPCs (subscription:manage). Each writes
--    plan_history + a platform audit row.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.cc_create_plan(p_payload JSONB)
RETURNS public.subscription_plans LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_row public.subscription_plans;
BEGIN
  PERFORM public.cc_assert_permission('subscription:manage');
  INSERT INTO public.subscription_plans
    (code, name, tier, monthly_price_inr, yearly_price_inr, max_farms, max_users,
     is_contactable, sort_order, recommended, is_active, features_json)
  VALUES (
    p_payload->>'code',
    p_payload->>'name',
    p_payload->>'tier',
    COALESCE((p_payload->>'monthly_price_inr')::NUMERIC, 0),
    COALESCE((p_payload->>'yearly_price_inr')::NUMERIC, 0),
    NULLIF(p_payload->>'max_farms','')::INTEGER,
    NULLIF(p_payload->>'max_users','')::INTEGER,
    COALESCE((p_payload->>'is_contactable')::BOOLEAN, false),
    COALESCE((p_payload->>'sort_order')::SMALLINT, 0),
    COALESCE((p_payload->>'recommended')::BOOLEAN, false),
    COALESCE((p_payload->>'is_active')::BOOLEAN, true),
    COALESCE(p_payload->'features_json', '{}'::jsonb)
  ) RETURNING * INTO v_row;

  INSERT INTO public.plan_history (plan_id, changed_by, action, after_json)
    VALUES (v_row.id, auth.uid(), 'create', to_jsonb(v_row));
  PERFORM public.log_platform_event('plan.create','subscription:manage','plan',v_row.id,NULL,NULL,to_jsonb(v_row),NULL);
  RETURN v_row;
END;
$$;

CREATE OR REPLACE FUNCTION public.cc_update_plan(p_plan UUID, p_payload JSONB)
RETURNS public.subscription_plans LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_before JSONB; v_row public.subscription_plans;
BEGIN
  PERFORM public.cc_assert_permission('subscription:manage');
  SELECT to_jsonb(p) INTO v_before FROM public.subscription_plans p WHERE id = p_plan;
  IF v_before IS NULL THEN RAISE EXCEPTION 'plan % not found', p_plan USING ERRCODE = 'P0002'; END IF;
  UPDATE public.subscription_plans SET
    name              = COALESCE(p_payload->>'name', name),
    tier              = COALESCE(p_payload->>'tier', tier),
    monthly_price_inr = COALESCE((p_payload->>'monthly_price_inr')::NUMERIC, monthly_price_inr),
    yearly_price_inr  = COALESCE((p_payload->>'yearly_price_inr')::NUMERIC, yearly_price_inr),
    max_farms         = CASE WHEN p_payload ? 'max_farms' THEN NULLIF(p_payload->>'max_farms','')::INTEGER ELSE max_farms END,
    max_users         = CASE WHEN p_payload ? 'max_users' THEN NULLIF(p_payload->>'max_users','')::INTEGER ELSE max_users END,
    recommended       = COALESCE((p_payload->>'recommended')::BOOLEAN, recommended),
    is_contactable    = COALESCE((p_payload->>'is_contactable')::BOOLEAN, is_contactable),
    sort_order        = COALESCE((p_payload->>'sort_order')::SMALLINT, sort_order)
  WHERE id = p_plan RETURNING * INTO v_row;

  INSERT INTO public.plan_history (plan_id, changed_by, action, before_json, after_json)
    VALUES (p_plan, auth.uid(), 'update', v_before, to_jsonb(v_row));
  PERFORM public.log_platform_event('plan.update','subscription:manage','plan',p_plan,NULL,v_before,to_jsonb(v_row),NULL);
  RETURN v_row;
END;
$$;

CREATE OR REPLACE FUNCTION public.cc_set_plan_active(p_plan UUID, p_active BOOLEAN)
RETURNS public.subscription_plans LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_before JSONB; v_row public.subscription_plans;
BEGIN
  PERFORM public.cc_assert_permission('subscription:manage');
  SELECT to_jsonb(p) INTO v_before FROM public.subscription_plans p WHERE id = p_plan;
  IF v_before IS NULL THEN RAISE EXCEPTION 'plan % not found', p_plan USING ERRCODE = 'P0002'; END IF;
  UPDATE public.subscription_plans
     SET is_active = p_active,
         archived_at = CASE WHEN p_active THEN NULL ELSE COALESCE(archived_at, now()) END
   WHERE id = p_plan RETURNING * INTO v_row;
  INSERT INTO public.plan_history (plan_id, changed_by, action, before_json, after_json)
    VALUES (p_plan, auth.uid(), CASE WHEN p_active THEN 'activate' ELSE 'archive' END, v_before, to_jsonb(v_row));
  PERFORM public.log_platform_event(CASE WHEN p_active THEN 'plan.activate' ELSE 'plan.archive' END,
                                    'subscription:manage','plan',p_plan,NULL,v_before,to_jsonb(v_row),NULL);
  RETURN v_row;
END;
$$;

CREATE OR REPLACE FUNCTION public.cc_set_plan_feature(p_plan UUID, p_feature_code TEXT, p_value JSONB)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_feat UUID; v_before JSONB;
BEGIN
  PERFORM public.cc_assert_permission('subscription:manage');
  SELECT id INTO v_feat FROM public.subscription_features WHERE code = p_feature_code;
  IF v_feat IS NULL THEN RAISE EXCEPTION 'feature % not found', p_feature_code USING ERRCODE = 'P0002'; END IF;
  SELECT features_json INTO v_before FROM public.subscription_plans WHERE id = p_plan;
  IF v_before IS NULL THEN RAISE EXCEPTION 'plan % not found', p_plan USING ERRCODE = 'P0002'; END IF;

  INSERT INTO public.plan_feature_mapping (plan_id, feature_id, value)
  VALUES (p_plan, v_feat, p_value)
  ON CONFLICT (plan_id, feature_id) DO UPDATE SET value = EXCLUDED.value, updated_at = now();

  PERFORM public.rebuild_plan_features_json(p_plan);

  INSERT INTO public.plan_history (plan_id, changed_by, action, before_json, after_json)
    VALUES (p_plan, auth.uid(), 'feature_set',
            jsonb_build_object('features_json', v_before),
            jsonb_build_object('feature', p_feature_code, 'value', p_value));
  PERFORM public.log_platform_event('plan.feature_set','subscription:manage','plan',p_plan,NULL,
            jsonb_build_object('feature', p_feature_code), p_value, NULL);
END;
$$;

CREATE OR REPLACE FUNCTION public.cc_duplicate_plan(p_plan UUID, p_new_code TEXT, p_new_name TEXT)
RETURNS public.subscription_plans LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_row public.subscription_plans;
BEGIN
  PERFORM public.cc_assert_permission('subscription:manage');
  INSERT INTO public.subscription_plans
    (code, name, tier, monthly_price_inr, yearly_price_inr, max_farms, max_users,
     is_contactable, sort_order, recommended, is_active, features_json)
  SELECT p_new_code, p_new_name, tier, monthly_price_inr, yearly_price_inr, max_farms, max_users,
         is_contactable, sort_order, false, false, features_json
    FROM public.subscription_plans WHERE id = p_plan
  RETURNING * INTO v_row;

  INSERT INTO public.plan_feature_mapping (plan_id, feature_id, value)
    SELECT v_row.id, feature_id, value FROM public.plan_feature_mapping WHERE plan_id = p_plan
  ON CONFLICT DO NOTHING;

  INSERT INTO public.plan_history (plan_id, changed_by, action, after_json)
    VALUES (v_row.id, auth.uid(), 'duplicate', to_jsonb(v_row));
  PERFORM public.log_platform_event('plan.duplicate','subscription:manage','plan',v_row.id,NULL,
            jsonb_build_object('source_plan', p_plan), to_jsonb(v_row), NULL);
  RETURN v_row;
END;
$$;

-- Grants: operators call with their JWT; revoke from anon.
DO $$
DECLARE fn TEXT;
BEGIN
  FOREACH fn IN ARRAY ARRAY[
    'public.cc_create_plan(JSONB)',
    'public.cc_update_plan(UUID,JSONB)',
    'public.cc_set_plan_active(UUID,BOOLEAN)',
    'public.cc_set_plan_feature(UUID,TEXT,JSONB)',
    'public.cc_duplicate_plan(UUID,TEXT,TEXT)'
  ] LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM anon', fn);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', fn);
  END LOOP;
END $$;

COMMIT;
