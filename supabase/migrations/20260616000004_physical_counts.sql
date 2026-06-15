-- Phase 4.3 — Physical spot-counts for the Owner Trust / Farm Integrity report.
--
-- Lightweight counts the owner (or supervisor) enters occasionally — actual feed
-- stock on hand, actual bird count — so the app can reconcile what was LOGGED
-- against physical reality. Owner-only (the whole point is a check the worker
-- can't game), tenant-scoped like every other farm table.

CREATE TABLE IF NOT EXISTS public.physical_counts (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL,
  farm_id       UUID NOT NULL REFERENCES public.farms(id) ON DELETE CASCADE,
  -- bird_count rows reference a batch; feed_stock rows reference an inventory item.
  batch_id      UUID REFERENCES public.batches(id) ON DELETE CASCADE,
  item_id       UUID REFERENCES public.inventory_items(id) ON DELETE CASCADE,
  count_type    TEXT NOT NULL CHECK (count_type IN ('feed_stock', 'bird_count')),
  counted_value NUMERIC NOT NULL CHECK (counted_value >= 0),
  count_date    DATE NOT NULL DEFAULT CURRENT_DATE,
  counted_by    UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  notes         TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_physical_counts_farm_type_date
  ON public.physical_counts (farm_id, count_type, count_date DESC);
CREATE INDEX IF NOT EXISTS idx_physical_counts_batch
  ON public.physical_counts (batch_id) WHERE batch_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_physical_counts_item
  ON public.physical_counts (item_id) WHERE item_id IS NOT NULL;

COMMENT ON TABLE public.physical_counts IS 'Owner/supervisor physical spot-counts (feed stock, bird count) used by the Farm Integrity reconciliation. Owner-only.';

-- Populate tenant_id from the farm (same pattern as other farm tables).
DROP TRIGGER IF EXISTS trg_physical_counts_tenant ON public.physical_counts;
CREATE TRIGGER trg_physical_counts_tenant
  BEFORE INSERT ON public.physical_counts
  FOR EACH ROW EXECUTE FUNCTION public.fill_tenant_id_from_farm();

ALTER TABLE public.physical_counts ENABLE ROW LEVEL SECURITY;

-- Owner-only: a spot-count is an audit instrument; workers must not write/read it.
DROP POLICY IF EXISTS physical_counts_owner_only ON public.physical_counts;
CREATE POLICY physical_counts_owner_only
  ON public.physical_counts FOR ALL
  USING (is_tenant_member(tenant_id) AND is_farm_owner(farm_id))
  WITH CHECK (is_tenant_member(tenant_id) AND is_farm_owner(farm_id));
