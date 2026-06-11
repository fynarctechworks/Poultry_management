-- =============================================================================
-- PoultryOS — Low-stock items read-only RPC helper
-- File: 20260519000005_low_stock_items_rpc.sql
-- Created: 2026-05-19
-- Purpose: Expose a single read-only RPC function that returns every
--          inventory_items row for a given farm whose current_stock is at or
--          below its low_stock_threshold. Powers the inventory low-stock view
--          in the mobile and web frontends via PostgREST RPC.
--
-- Design notes:
--   * SECURITY INVOKER — RLS on inventory_items is enforced for the calling
--     user. Owners see their items; workers see their items (per existing
--     policy). No row leaks across farms.
--   * STABLE — result is safe to cache within a single statement; no writes.
--   * search_path pinned to public, pg_temp (lessons L3 / L4).
--   * No REVOKE — PostgREST needs authenticated + anon roles to be able to
--     EXECUTE in order to call the function via /rpc/. RLS is the gate.
--   * RETURNS SETOF public.inventory_items — exact column list confirmed from
--     20260502000000_initial_schema.sql:
--       id, farm_id, item_name, category, unit, current_stock,
--       low_stock_threshold, created_at, updated_at
--
-- Prerequisites:
--   public.inventory_items table created by 20260502000000_initial_schema.sql.
-- =============================================================================

BEGIN;

-- Functions -------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_low_stock_items(p_farm_id UUID)
  RETURNS SETOF public.inventory_items
  LANGUAGE sql
  STABLE
  SECURITY INVOKER
  SET search_path = public, pg_temp
AS $$
  SELECT *
    FROM public.inventory_items
   WHERE farm_id            = p_farm_id
     AND low_stock_threshold > 0
     AND current_stock      <= low_stock_threshold
   ORDER BY category, item_name;
$$;

COMMENT ON FUNCTION public.get_low_stock_items(UUID) IS
  'Returns all inventory_items rows for the given farm whose current_stock is at or '
  'below their low_stock_threshold (and threshold > 0). Used by the mobile and web '
  'inventory low-stock view via PostgREST RPC (/rpc/get_low_stock_items). '
  'SECURITY INVOKER — RLS on inventory_items applies, so callers only ever see '
  'rows belonging to farms they are authorised to access.';

COMMIT;
