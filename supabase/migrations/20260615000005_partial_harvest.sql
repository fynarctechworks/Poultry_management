-- =============================================================================
-- PoultryOS — Partial harvest / thinning (multiple sale events per batch)
-- File: 20260615000005_partial_harvest.sql
-- Created: 2026-06-15
-- =============================================================================
-- Broiler growers "thin" a flock — selling part of it mid-cycle to cut density —
-- and may sell in several lots. The batch keeps its identity; only the live
-- count drops and revenue accrues. Until now a batch supported a single sale at
-- closure only. This adds:
--   1. batch_harvests — immutable record of each harvest lot (history).
--   2. record_harvest() RPC — the single write path: validates owner/admin +
--      active batch + birds <= current count, writes the lot, decrements
--      batches.current_bird_count, AND books an income financial_transaction
--      (so existing P&L, which sums financial_transactions, picks it up).
-- Mirrors the transfer_batch() pattern: SECURITY DEFINER RPC is the only writer.
-- =============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.batch_harvests (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  farm_id          UUID NOT NULL REFERENCES public.farms(id)   ON DELETE CASCADE,
  batch_id         UUID NOT NULL REFERENCES public.batches(id) ON DELETE CASCADE,
  harvest_date     DATE    NOT NULL DEFAULT CURRENT_DATE,
  birds_harvested  INTEGER NOT NULL CHECK (birds_harvested > 0),
  avg_weight_kg    NUMERIC(8,3) NOT NULL CHECK (avg_weight_kg > 0),
  price_per_kg     NUMERIC(10,2) NOT NULL CHECK (price_per_kg >= 0),
  revenue          NUMERIC(14,2) GENERATED ALWAYS AS
                     (round(birds_harvested * avg_weight_kg * price_per_kg, 2)) STORED,
  buyer_id         UUID REFERENCES public.buyers(id) ON DELETE SET NULL,
  notes            TEXT,
  harvested_by     UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_batch_harvests_batch_id  ON public.batch_harvests(batch_id);
CREATE INDEX IF NOT EXISTS idx_batch_harvests_farm_id   ON public.batch_harvests(farm_id);
CREATE INDEX IF NOT EXISTS idx_batch_harvests_tenant_id ON public.batch_harvests(tenant_id);
CREATE INDEX IF NOT EXISTS idx_batch_harvests_buyer_id  ON public.batch_harvests(buyer_id);

COMMENT ON TABLE public.batch_harvests IS
  'Immutable record of each (partial) harvest lot. Written only via record_harvest().';

DROP TRIGGER IF EXISTS tg_0_batch_harvests_fill_tenant ON public.batch_harvests;
CREATE TRIGGER tg_0_batch_harvests_fill_tenant
  BEFORE INSERT ON public.batch_harvests
  FOR EACH ROW EXECUTE FUNCTION public.fill_tenant_id_from_farm();

-- ---------- RLS (mirror batches: member read; RPC-only writes) --------------
ALTER TABLE public.batch_harvests ENABLE ROW LEVEL SECURITY;

CREATE POLICY batch_harvests_select_member ON public.batch_harvests
  FOR SELECT USING (
    public.is_tenant_member(tenant_id) AND (
      public.is_tenant_admin(tenant_id)
      OR public.is_farm_member(farm_id)
    )
  );

GRANT SELECT ON public.batch_harvests TO authenticated;
GRANT ALL    ON public.batch_harvests TO service_role;

-- ---------- record_harvest RPC ----------------------------------------------
CREATE OR REPLACE FUNCTION public.record_harvest(
  p_batch_id       UUID,
  p_birds          INTEGER,
  p_avg_weight_kg  NUMERIC,
  p_price_per_kg   NUMERIC,
  p_date           DATE  DEFAULT CURRENT_DATE,
  p_buyer_id       UUID  DEFAULT NULL,
  p_payment_status TEXT  DEFAULT 'paid',
  p_notes          TEXT  DEFAULT NULL
)
  RETURNS public.batch_harvests
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_batch   public.batches%ROWTYPE;
  v_h       public.batch_harvests%ROWTYPE;
  v_revenue NUMERIC;
BEGIN
  SELECT * INTO v_batch FROM public.batches WHERE id = p_batch_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'batch not found' USING ERRCODE = 'no_data_found';
  END IF;

  IF NOT (public.is_farm_owner(v_batch.farm_id)
          OR public.is_tenant_admin(v_batch.tenant_id)) THEN
    RAISE EXCEPTION 'only a farm owner or tenant admin can record a harvest'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF v_batch.status <> 'active' THEN
    RAISE EXCEPTION 'only an active batch can be harvested (status: %)', v_batch.status
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  IF p_birds IS NULL OR p_birds <= 0 THEN
    RAISE EXCEPTION 'birds harvested must be greater than 0'
      USING ERRCODE = 'invalid_parameter_value';
  END IF;
  IF p_birds > v_batch.current_bird_count THEN
    RAISE EXCEPTION 'cannot harvest % birds; only % alive', p_birds, v_batch.current_bird_count
      USING ERRCODE = 'invalid_parameter_value';
  END IF;
  IF p_avg_weight_kg IS NULL OR p_avg_weight_kg <= 0
     OR p_price_per_kg IS NULL OR p_price_per_kg < 0 THEN
    RAISE EXCEPTION 'weight must be > 0 and price >= 0'
      USING ERRCODE = 'invalid_parameter_value';
  END IF;
  IF p_payment_status NOT IN ('paid', 'pending', 'partial') THEN
    RAISE EXCEPTION 'invalid payment status: %', p_payment_status
      USING ERRCODE = 'invalid_parameter_value';
  END IF;
  IF p_date IS NULL OR p_date > CURRENT_DATE OR p_date < v_batch.placement_date THEN
    RAISE EXCEPTION 'harvest date must be between placement date and today'
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  INSERT INTO public.batch_harvests
    (tenant_id, farm_id, batch_id, harvest_date, birds_harvested,
     avg_weight_kg, price_per_kg, buyer_id, notes, harvested_by)
  VALUES
    (v_batch.tenant_id, v_batch.farm_id, v_batch.id, p_date, p_birds,
     p_avg_weight_kg, p_price_per_kg, p_buyer_id, p_notes, auth.uid())
  RETURNING * INTO v_h;

  UPDATE public.batches
     SET current_bird_count = GREATEST(0, current_bird_count - p_birds),
         updated_at = now()
   WHERE id = v_batch.id;

  -- Book the revenue so existing P&L (sum of financial_transactions) reflects it.
  v_revenue := round(p_birds * p_avg_weight_kg * p_price_per_kg, 2);
  INSERT INTO public.financial_transactions
    (farm_id, batch_id, buyer_id, transaction_type, category, amount, quantity,
     price_per_unit, transaction_date, payment_status, notes)
  VALUES
    (v_batch.farm_id, v_batch.id, p_buyer_id, 'income', 'bird_sale', v_revenue,
     round(p_birds * p_avg_weight_kg, 3), p_price_per_kg, p_date, p_payment_status,
     COALESCE(p_notes, 'Partial harvest'));

  RETURN v_h;
END;
$fn$;

REVOKE EXECUTE ON FUNCTION public.record_harvest(UUID, INTEGER, NUMERIC, NUMERIC, DATE, UUID, TEXT, TEXT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.record_harvest(UUID, INTEGER, NUMERIC, NUMERIC, DATE, UUID, TEXT, TEXT) FROM anon;
GRANT  EXECUTE ON FUNCTION public.record_harvest(UUID, INTEGER, NUMERIC, NUMERIC, DATE, UUID, TEXT, TEXT) TO authenticated;

COMMENT ON FUNCTION public.record_harvest(UUID, INTEGER, NUMERIC, NUMERIC, DATE, UUID, TEXT, TEXT) IS
  'Owner/admin-only partial harvest: writes a batch_harvests lot, decrements current_bird_count, and books an income transaction. Batch stays active.';

COMMIT;

-- =============================================================================
-- Reversal:
--   DROP FUNCTION public.record_harvest(UUID, INTEGER, NUMERIC, NUMERIC, DATE, UUID, TEXT, TEXT);
--   DROP TABLE public.batch_harvests;
-- =============================================================================
