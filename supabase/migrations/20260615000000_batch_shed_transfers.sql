-- =============================================================================
-- PoultryOS — Shed Transfer Workflow
-- File: 20260615000000_batch_shed_transfers.sql
-- Created: 2026-06-15
-- =============================================================================
-- A batch must keep its identity across sheds; only its LOCATION changes. Until
-- now `batches.shed_id` was a single hard FK with no way to move birds between
-- sheds without faking a new batch — the exact anti-pattern the product brief
-- warns against. This migration adds:
--
--   1. `batch_transfers` — immutable audit trail of every shed move (history).
--   2. `transfer_batch()` RPC — the ONLY way to move a batch: validates owner/
--      admin auth, active status, same-farm + active + capacity + poultry-type
--      compatible target shed, writes the history row AND repoints
--      batches.shed_id in one transaction.
--   3. RLS mirroring the batches model (tenant gate + owner/admin/worker/vet),
--      with worker visibility on EITHER the source or destination shed.
--
-- Direct client writes to batch_transfers are intentionally NOT granted — the
-- SECURITY DEFINER RPC is the single write path, keeping batches.shed_id and
-- the history row atomically consistent.
-- =============================================================================

BEGIN;

-- ---------- 1. batch_transfers table ----------------------------------------
CREATE TABLE IF NOT EXISTS public.batch_transfers (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  farm_id        UUID NOT NULL REFERENCES public.farms(id)   ON DELETE CASCADE,
  batch_id       UUID NOT NULL REFERENCES public.batches(id) ON DELETE CASCADE,
  from_shed_id   UUID NOT NULL REFERENCES public.sheds(id)   ON DELETE CASCADE,
  to_shed_id     UUID NOT NULL REFERENCES public.sheds(id)   ON DELETE CASCADE,
  transfer_date  DATE    NOT NULL DEFAULT CURRENT_DATE,
  bird_count     INTEGER NOT NULL CHECK (bird_count >= 0),
  moved_by       UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  notes          TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (from_shed_id <> to_shed_id)
);

CREATE INDEX IF NOT EXISTS idx_batch_transfers_batch_id   ON public.batch_transfers(batch_id);
CREATE INDEX IF NOT EXISTS idx_batch_transfers_farm_id    ON public.batch_transfers(farm_id);
CREATE INDEX IF NOT EXISTS idx_batch_transfers_tenant_id  ON public.batch_transfers(tenant_id);
CREATE INDEX IF NOT EXISTS idx_batch_transfers_from_shed  ON public.batch_transfers(from_shed_id);
CREATE INDEX IF NOT EXISTS idx_batch_transfers_to_shed    ON public.batch_transfers(to_shed_id);

COMMENT ON TABLE public.batch_transfers IS
  'Immutable audit trail of shed moves. A batch keeps its identity; only location changes. Written only via transfer_batch().';

-- Backward-compat safety net: derive tenant_id from farm_id if a future insert
-- site sets only farm_id (mirrors every other tenant-owned table).
DROP TRIGGER IF EXISTS tg_0_batch_transfers_fill_tenant ON public.batch_transfers;
CREATE TRIGGER tg_0_batch_transfers_fill_tenant
  BEFORE INSERT ON public.batch_transfers
  FOR EACH ROW EXECUTE FUNCTION public.fill_tenant_id_from_farm();

-- ---------- 2. RLS ----------------------------------------------------------
ALTER TABLE public.batch_transfers ENABLE ROW LEVEL SECURITY;

-- SELECT: tenant member, then owner/admin see all; workers see moves touching an
-- assigned shed (source OR destination); vet sees all farm moves. No client
-- INSERT/UPDATE/DELETE policy: history is immutable and written via RPC only.
CREATE POLICY batch_transfers_select_member ON public.batch_transfers
  FOR SELECT USING (
    public.is_tenant_member(tenant_id) AND (
      public.is_tenant_admin(tenant_id)
      OR public.is_farm_owner(farm_id)
      OR (
        public.user_role_for_farm(farm_id) IN ('worker', 'vet')
        AND (
          public.user_role_for_farm(farm_id) = 'vet'
          OR from_shed_id = ANY(public.user_assigned_sheds(farm_id))
          OR to_shed_id   = ANY(public.user_assigned_sheds(farm_id))
        )
      )
    )
  );

GRANT SELECT ON public.batch_transfers TO authenticated;
GRANT ALL    ON public.batch_transfers TO service_role;

-- ---------- 3. transfer_batch RPC -------------------------------------------
CREATE OR REPLACE FUNCTION public.transfer_batch(
  p_batch_id      UUID,
  p_to_shed_id    UUID,
  p_transfer_date DATE DEFAULT CURRENT_DATE,
  p_notes         TEXT DEFAULT NULL
)
  RETURNS public.batch_transfers
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_batch     public.batches%ROWTYPE;
  v_to_shed   public.sheds%ROWTYPE;
  v_occupancy INTEGER;
  v_transfer  public.batch_transfers%ROWTYPE;
BEGIN
  SELECT * INTO v_batch FROM public.batches WHERE id = p_batch_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'batch not found' USING ERRCODE = 'no_data_found';
  END IF;

  -- Authorisation: farm owner or tenant admin (owner / farm_manager).
  IF NOT (public.is_farm_owner(v_batch.farm_id)
          OR public.is_tenant_admin(v_batch.tenant_id)) THEN
    RAISE EXCEPTION 'only a farm owner or tenant admin can transfer a batch'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF v_batch.status <> 'active' THEN
    RAISE EXCEPTION 'only an active batch can be transferred (current status: %)',
      v_batch.status USING ERRCODE = 'invalid_parameter_value';
  END IF;

  IF p_to_shed_id = v_batch.shed_id THEN
    RAISE EXCEPTION 'batch is already in that shed'
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  IF p_transfer_date IS NULL OR p_transfer_date > CURRENT_DATE THEN
    RAISE EXCEPTION 'transfer_date must be on or before today'
      USING ERRCODE = 'invalid_parameter_value';
  END IF;
  IF p_transfer_date < v_batch.placement_date THEN
    RAISE EXCEPTION 'transfer_date must be on or after the batch placement date'
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  SELECT * INTO v_to_shed FROM public.sheds WHERE id = p_to_shed_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'destination shed not found' USING ERRCODE = 'no_data_found';
  END IF;
  IF v_to_shed.farm_id <> v_batch.farm_id THEN
    RAISE EXCEPTION 'destination shed belongs to a different farm'
      USING ERRCODE = 'invalid_parameter_value';
  END IF;
  IF v_to_shed.status <> 'active' THEN
    RAISE EXCEPTION 'destination shed is inactive'
      USING ERRCODE = 'invalid_parameter_value';
  END IF;
  IF v_to_shed.poultry_type <> v_batch.poultry_type THEN
    RAISE EXCEPTION 'destination shed type (%) does not match batch type (%)',
      v_to_shed.poultry_type, v_batch.poultry_type
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  -- Capacity guard: existing active occupancy + incoming birds must fit.
  SELECT COALESCE(SUM(current_bird_count), 0) INTO v_occupancy
    FROM public.batches
   WHERE shed_id = p_to_shed_id AND status = 'active';

  IF v_occupancy + v_batch.current_bird_count > v_to_shed.capacity THEN
    RAISE EXCEPTION
      'destination shed capacity exceeded: % existing + % incoming > % capacity',
      v_occupancy, v_batch.current_bird_count, v_to_shed.capacity
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  -- 1) record history, 2) repoint the batch — one transaction.
  INSERT INTO public.batch_transfers
    (tenant_id, farm_id, batch_id, from_shed_id, to_shed_id,
     transfer_date, bird_count, moved_by, notes)
  VALUES
    (v_batch.tenant_id, v_batch.farm_id, v_batch.id, v_batch.shed_id, p_to_shed_id,
     p_transfer_date, v_batch.current_bird_count, auth.uid(), p_notes)
  RETURNING * INTO v_transfer;

  UPDATE public.batches
     SET shed_id = p_to_shed_id, updated_at = now()
   WHERE id = v_batch.id;

  RETURN v_transfer;
END;
$fn$;

REVOKE EXECUTE ON FUNCTION public.transfer_batch(UUID, UUID, DATE, TEXT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.transfer_batch(UUID, UUID, DATE, TEXT) FROM anon;
GRANT  EXECUTE ON FUNCTION public.transfer_batch(UUID, UUID, DATE, TEXT) TO authenticated;

COMMENT ON FUNCTION public.transfer_batch(UUID, UUID, DATE, TEXT) IS
  'Owner/admin-only batch shed transfer: validates active batch + same-farm/active/capacity/type-compatible destination, writes batch_transfers history and repoints batches.shed_id atomically.';

COMMIT;

-- =============================================================================
-- Reversal (manual, if ever needed):
--   DROP FUNCTION public.transfer_batch(UUID, UUID, DATE, TEXT);
--   DROP TABLE public.batch_transfers;
-- =============================================================================
