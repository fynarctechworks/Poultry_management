-- =============================================================================
-- PoultryOS — SaaS Control Center · Increment 3 / M5: Discount Engine
-- File: 20260611000012_discounts.sql
-- =============================================================================
-- Flexible discounts: flat / percentage, delivered as coupon codes, custom
-- per-tenant grants, or promotions. Rule engine in validate_coupon():
--   date window · plan restriction · global + per-tenant usage limits ·
--   first-purchase-only · renewal-only · active flags.
-- Discounts are NOT world-readable (prevents coupon enumeration); validate_coupon
-- is SECURITY DEFINER so the tenant checkout can validate without read access.
-- Operator writes go through guarded, audited cc_* RPCs (discount:manage).
-- =============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.discounts (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name                TEXT NOT NULL,
  description         TEXT,
  discount_type       TEXT NOT NULL CHECK (discount_type IN ('flat','percentage')),
  value               NUMERIC(10,2) NOT NULL CHECK (value > 0),
  scope               TEXT NOT NULL DEFAULT 'coupon'
                        CHECK (scope IN ('coupon','tenant','promotion','referral','partner','seasonal','lifetime')),
  duration            TEXT NOT NULL DEFAULT 'once' CHECK (duration IN ('once','repeating','forever')),
  tenant_id           UUID REFERENCES public.tenants(id) ON DELETE CASCADE,   -- for scope='tenant'
  applies_to_plan_ids UUID[] NOT NULL DEFAULT '{}',                            -- empty = all plans
  starts_at           TIMESTAMPTZ,
  ends_at             TIMESTAMPTZ,
  max_redemptions     INTEGER,                                                 -- NULL = unlimited
  redeemed_count      INTEGER NOT NULL DEFAULT 0,
  first_purchase_only BOOLEAN NOT NULL DEFAULT false,
  renewal_only        BOOLEAN NOT NULL DEFAULT false,
  stackable           BOOLEAN NOT NULL DEFAULT false,
  is_active           BOOLEAN NOT NULL DEFAULT true,
  created_by          UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (NOT (first_purchase_only AND renewal_only)),
  CHECK (discount_type <> 'percentage' OR value <= 100)
);
CREATE TRIGGER tg_discounts_updated_at BEFORE UPDATE ON public.discounts
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();
CREATE INDEX IF NOT EXISTS idx_discounts_tenant ON public.discounts(tenant_id);

CREATE TABLE IF NOT EXISTS public.coupon_codes (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  discount_id    UUID NOT NULL REFERENCES public.discounts(id) ON DELETE CASCADE,
  code           TEXT NOT NULL UNIQUE,
  max_per_tenant INTEGER NOT NULL DEFAULT 1,
  is_active      BOOLEAN NOT NULL DEFAULT true,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TRIGGER tg_coupon_codes_updated_at BEFORE UPDATE ON public.coupon_codes
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();
CREATE INDEX IF NOT EXISTS idx_coupon_codes_discount ON public.coupon_codes(discount_id);

CREATE TABLE IF NOT EXISTS public.coupon_redemptions (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  coupon_id      UUID REFERENCES public.coupon_codes(id) ON DELETE SET NULL,
  discount_id    UUID NOT NULL REFERENCES public.discounts(id) ON DELETE CASCADE,
  tenant_id      UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  amount_applied NUMERIC(10,2),
  redeemed_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_coupon_redemptions_tenant ON public.coupon_redemptions(tenant_id);
CREATE INDEX IF NOT EXISTS idx_coupon_redemptions_coupon ON public.coupon_redemptions(coupon_id);

CREATE TABLE IF NOT EXISTS public.promotions (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  description TEXT,
  discount_id UUID REFERENCES public.discounts(id) ON DELETE SET NULL,
  banner_text TEXT,
  starts_at   TIMESTAMPTZ,
  ends_at     TIMESTAMPTZ,
  is_active   BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TRIGGER tg_promotions_updated_at BEFORE UPDATE ON public.promotions
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- -----------------------------------------------------------------------------
-- RLS: operator-only reads (discount:read). No write policies → service/RPC only.
-- (Tenants never read these directly; they validate via the RPC below.)
-- -----------------------------------------------------------------------------
ALTER TABLE public.discounts          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.coupon_codes       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.coupon_redemptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.promotions         ENABLE ROW LEVEL SECURITY;

CREATE POLICY discounts_read          ON public.discounts          FOR SELECT USING (public.platform_has_permission('discount:read'));
CREATE POLICY coupon_codes_read       ON public.coupon_codes       FOR SELECT USING (public.platform_has_permission('discount:read'));
CREATE POLICY coupon_redemptions_read ON public.coupon_redemptions FOR SELECT USING (public.platform_has_permission('discount:read'));
CREATE POLICY promotions_read         ON public.promotions         FOR SELECT USING (public.platform_has_permission('discount:read'));

-- -----------------------------------------------------------------------------
-- validate_coupon — the rule engine. Returns {valid, reason?, discount_id?,
-- discount_type?, value?}. Callable by any authenticated user (tenant checkout).
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.validate_coupon(
  p_code TEXT, p_tenant UUID, p_plan_code TEXT DEFAULT NULL, p_is_first BOOLEAN DEFAULT NULL)
RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  c public.coupon_codes%ROWTYPE;
  d public.discounts%ROWTYPE;
  v_plan UUID;
  v_tenant_uses INTEGER;
BEGIN
  SELECT * INTO c FROM public.coupon_codes WHERE code = p_code;
  IF NOT FOUND OR NOT c.is_active THEN
    RETURN jsonb_build_object('valid', false, 'reason', 'Invalid coupon code.');
  END IF;
  SELECT * INTO d FROM public.discounts WHERE id = c.discount_id;
  IF NOT FOUND OR NOT d.is_active THEN
    RETURN jsonb_build_object('valid', false, 'reason', 'This coupon is no longer active.');
  END IF;
  IF d.starts_at IS NOT NULL AND now() < d.starts_at THEN
    RETURN jsonb_build_object('valid', false, 'reason', 'This coupon is not active yet.');
  END IF;
  IF d.ends_at IS NOT NULL AND now() > d.ends_at THEN
    RETURN jsonb_build_object('valid', false, 'reason', 'This coupon has expired.');
  END IF;
  IF array_length(d.applies_to_plan_ids, 1) IS NOT NULL AND p_plan_code IS NOT NULL THEN
    SELECT id INTO v_plan FROM public.subscription_plans WHERE code = p_plan_code;
    IF v_plan IS NULL OR NOT (v_plan = ANY(d.applies_to_plan_ids)) THEN
      RETURN jsonb_build_object('valid', false, 'reason', 'This coupon is not valid for the selected plan.');
    END IF;
  END IF;
  IF d.tenant_id IS NOT NULL AND d.tenant_id <> p_tenant THEN
    RETURN jsonb_build_object('valid', false, 'reason', 'This coupon is not valid for your account.');
  END IF;
  IF d.max_redemptions IS NOT NULL AND d.redeemed_count >= d.max_redemptions THEN
    RETURN jsonb_build_object('valid', false, 'reason', 'This coupon has reached its usage limit.');
  END IF;
  SELECT count(*) INTO v_tenant_uses
    FROM public.coupon_redemptions r WHERE r.coupon_id = c.id AND r.tenant_id = p_tenant;
  IF v_tenant_uses >= c.max_per_tenant THEN
    RETURN jsonb_build_object('valid', false, 'reason', 'You have already used this coupon.');
  END IF;
  IF d.first_purchase_only AND p_is_first IS NOT NULL AND p_is_first = false THEN
    RETURN jsonb_build_object('valid', false, 'reason', 'This coupon is for first purchases only.');
  END IF;
  IF d.renewal_only AND p_is_first IS NOT NULL AND p_is_first = true THEN
    RETURN jsonb_build_object('valid', false, 'reason', 'This coupon is for renewals only.');
  END IF;

  RETURN jsonb_build_object('valid', true, 'discount_id', d.id,
    'discount_type', d.discount_type, 'value', d.value, 'scope', d.scope);
END;
$$;

-- -----------------------------------------------------------------------------
-- Operator CRUD (discount:manage), audited.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.cc_create_discount(p_payload JSONB)
RETURNS public.discounts LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_row public.discounts;
BEGIN
  PERFORM public.cc_assert_permission('discount:manage');
  INSERT INTO public.discounts
    (name, description, discount_type, value, scope, duration, tenant_id,
     applies_to_plan_ids, starts_at, ends_at, max_redemptions,
     first_purchase_only, renewal_only, stackable, is_active, created_by)
  VALUES (
    p_payload->>'name', p_payload->>'description',
    p_payload->>'discount_type', (p_payload->>'value')::NUMERIC,
    COALESCE(p_payload->>'scope','coupon'), COALESCE(p_payload->>'duration','once'),
    NULLIF(p_payload->>'tenant_id','')::UUID,
    COALESCE((SELECT array_agg(x::UUID) FROM jsonb_array_elements_text(COALESCE(p_payload->'applies_to_plan_ids','[]'::jsonb)) x), '{}'),
    NULLIF(p_payload->>'starts_at','')::TIMESTAMPTZ, NULLIF(p_payload->>'ends_at','')::TIMESTAMPTZ,
    NULLIF(p_payload->>'max_redemptions','')::INTEGER,
    COALESCE((p_payload->>'first_purchase_only')::BOOLEAN, false),
    COALESCE((p_payload->>'renewal_only')::BOOLEAN, false),
    COALESCE((p_payload->>'stackable')::BOOLEAN, false),
    COALESCE((p_payload->>'is_active')::BOOLEAN, true), auth.uid()
  ) RETURNING * INTO v_row;
  PERFORM public.log_platform_event('discount.create','discount:manage','discount',v_row.id,
            v_row.tenant_id, NULL, to_jsonb(v_row), NULL);
  RETURN v_row;
END;
$$;

CREATE OR REPLACE FUNCTION public.cc_create_coupon(p_discount UUID, p_code TEXT, p_max_per_tenant INTEGER DEFAULT 1)
RETURNS public.coupon_codes LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_row public.coupon_codes;
BEGIN
  PERFORM public.cc_assert_permission('discount:manage');
  IF NOT EXISTS (SELECT 1 FROM public.discounts WHERE id = p_discount) THEN
    RAISE EXCEPTION 'discount % not found', p_discount USING ERRCODE = 'P0002';
  END IF;
  INSERT INTO public.coupon_codes (discount_id, code, max_per_tenant)
  VALUES (p_discount, upper(p_code), GREATEST(1, COALESCE(p_max_per_tenant,1)))
  RETURNING * INTO v_row;
  PERFORM public.log_platform_event('coupon.create','discount:manage','coupon',v_row.id,NULL,NULL,to_jsonb(v_row),NULL);
  RETURN v_row;
END;
$$;

-- Operator applies a custom discount directly to a tenant (records a redemption).
CREATE OR REPLACE FUNCTION public.cc_apply_tenant_discount(p_tenant UUID, p_discount UUID, p_amount NUMERIC DEFAULT NULL)
RETURNS public.coupon_redemptions LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_row public.coupon_redemptions;
BEGIN
  PERFORM public.cc_assert_permission('discount:manage');
  IF NOT EXISTS (SELECT 1 FROM public.discounts WHERE id = p_discount AND is_active) THEN
    RAISE EXCEPTION 'discount % not found or inactive', p_discount USING ERRCODE = 'P0002';
  END IF;
  INSERT INTO public.coupon_redemptions (discount_id, tenant_id, amount_applied)
  VALUES (p_discount, p_tenant, p_amount) RETURNING * INTO v_row;
  UPDATE public.discounts SET redeemed_count = redeemed_count + 1 WHERE id = p_discount;
  PERFORM public.log_platform_event('discount.apply','discount:manage','discount',p_discount,p_tenant,NULL,to_jsonb(v_row),NULL);
  RETURN v_row;
END;
$$;

-- Grants.
DO $$
DECLARE fn TEXT;
BEGIN
  EXECUTE 'REVOKE EXECUTE ON FUNCTION public.validate_coupon(TEXT,UUID,TEXT,BOOLEAN) FROM anon';
  EXECUTE 'GRANT EXECUTE ON FUNCTION public.validate_coupon(TEXT,UUID,TEXT,BOOLEAN) TO authenticated';
  FOREACH fn IN ARRAY ARRAY[
    'public.cc_create_discount(JSONB)',
    'public.cc_create_coupon(UUID,TEXT,INTEGER)',
    'public.cc_apply_tenant_discount(UUID,UUID,NUMERIC)'
  ] LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM anon', fn);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', fn);
  END LOOP;
END $$;

COMMIT;
