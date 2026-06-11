-- =============================================================================
-- tests/db/inventory_feed_deduct.test.sql
-- pgTAP tests for the deduct_feed_inventory trigger and the
-- get_low_stock_items RPC.
--
-- Structural assertions are remote-safe (no fixtures needed).
-- Behavioural assertions require a local stack — see LOCAL ONLY block below.
--
-- Functions under test:
--   public.deduct_feed_inventory()
--     LANGUAGE plpgsql, SECURITY INVOKER, search_path pinned
--     Trigger: tg_daily_logs_deduct_feed AFTER INSERT ON daily_logs
--     Item match: lower(item_name) LIKE lower(NEW.feed_type) || '%'
--     inventory_movements.quantity written as POSITIVE feed_consumed_kg
--     current_stock updated to GREATEST(0, current_stock - feed_consumed_kg)
--   public.get_low_stock_items(p_farm_id UUID)
--     LANGUAGE sql, SECURITY INVOKER, search_path pinned
--     Returns SETOF inventory_items WHERE low_stock_threshold > 0
--       AND current_stock <= low_stock_threshold
--
-- Migrations:
--   20260502000000_initial_schema.sql         — trigger + deduct function
--   20260502000001_harden_functions_and_extensions.sql — search_path pin
--   20260519000005_low_stock_items_rpc.sql    — get_low_stock_items RPC
--
-- All test data is rolled back at the end.
-- =============================================================================

BEGIN;

SELECT plan(6);

-- ---------------------------------------------------------------------------
-- T1: deduct_feed_inventory function exists
-- ---------------------------------------------------------------------------

SELECT has_function(
  'public', 'deduct_feed_inventory', ARRAY[]::text[],
  'T1: function public.deduct_feed_inventory() exists'
);

-- ---------------------------------------------------------------------------
-- T2: tg_daily_logs_deduct_feed trigger exists on daily_logs
-- ---------------------------------------------------------------------------

SELECT has_trigger(
  'daily_logs', 'tg_daily_logs_deduct_feed',
  'T2: trigger tg_daily_logs_deduct_feed exists on daily_logs'
);

-- ---------------------------------------------------------------------------
-- T3: deduct_feed_inventory has a pinned search_path
-- ---------------------------------------------------------------------------

SELECT ok(
  (SELECT proconfig @> ARRAY['search_path=public, pg_temp']
     FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'deduct_feed_inventory'),
  'T3: deduct_feed_inventory has a pinned search_path'
);

-- ---------------------------------------------------------------------------
-- T4: get_low_stock_items(uuid) function exists
-- ---------------------------------------------------------------------------

SELECT has_function(
  'public', 'get_low_stock_items', ARRAY['uuid'],
  'T4: function public.get_low_stock_items(uuid) exists'
);

-- ---------------------------------------------------------------------------
-- T5: get_low_stock_items has a pinned search_path
-- ---------------------------------------------------------------------------

SELECT ok(
  (SELECT proconfig @> ARRAY['search_path=public, pg_temp']
     FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'get_low_stock_items'),
  'T5: get_low_stock_items has a pinned search_path'
);

-- ---------------------------------------------------------------------------
-- T6: authenticated role can EXECUTE get_low_stock_items
-- ---------------------------------------------------------------------------

SELECT ok(
  has_function_privilege('authenticated', 'public.get_low_stock_items(uuid)', 'EXECUTE'),
  'T6: authenticated role can execute get_low_stock_items'
);

SELECT * FROM finish();

ROLLBACK;

-- =============================================================================
-- LOCAL ONLY — behavioural tests (needs fixtures; run via `supabase db reset`)
-- =============================================================================
-- Outline (not executed here):
--
-- Setup:
--   1. Insert into auth.users: a fixture owner.
--   2. Insert into public.farms, public.sheds, public.batches.
--   3. Insert into public.inventory_items: a feed item with
--        item_name = 'Grower Feed', category = 'feed', unit = 'kg',
--        current_stock = 200, low_stock_threshold = 50.
--   4. Insert a second inventory_items row: item_name = 'Layer Pellets',
--        current_stock = 30, low_stock_threshold = 40  (already below threshold).
--   5. Insert a third inventory_items row: item_name = 'Water Pump',
--        category = 'equipment', current_stock = 2, low_stock_threshold = 0
--        (threshold = 0 → never low-stock).
--
-- (a) Feed deduction — matching prefix:
--   Insert a daily_logs row with feed_type = 'grower', feed_consumed_kg = 80.
--   The trigger matches 'Grower Feed' via:
--     lower('Grower Feed') LIKE lower('grower') || '%'  →  'grower feed' LIKE 'grower%'  → TRUE
--   Assert:
--     - Exactly one inventory_movements row exists for the inventory_items.id of
--       'Grower Feed' with movement_type = 'usage', quantity = 80 (POSITIVE),
--       and daily_log_id = the newly inserted daily_logs.id.
--     - inventory_items.current_stock for 'Grower Feed' is now 120
--       (GREATEST(0, 200 - 80)).
--
-- (b) Feed deduction — no matching inventory item:
--   Insert a daily_logs row with feed_type = 'finisher', feed_consumed_kg = 50.
--   'Grower Feed' does NOT match 'finisher%', so no movement row is created.
--   Assert:
--     - No inventory_movements row exists with a daily_log_id matching this insert.
--     - The daily_logs insert itself succeeds (lives_ok).
--     - inventory_items current_stock values are unchanged from the state after (a).
--
-- (c) get_low_stock_items — returns only rows at or below threshold:
--   After steps (a) and (b) the stock state is:
--     'Grower Feed'   current_stock = 120, low_stock_threshold = 50  → NOT low
--     'Layer Pellets' current_stock = 30,  low_stock_threshold = 40  → LOW
--     'Water Pump'    current_stock = 2,   low_stock_threshold = 0   → threshold=0, excluded
--   SELECT * FROM public.get_low_stock_items(<farm_id>):
--     - Returns exactly 1 row.
--     - That row's item_name = 'Layer Pellets'.
--   Insert one more daily_logs row with feed_type = 'grower', feed_consumed_kg = 160
--   to drive 'Grower Feed' stock to GREATEST(0, 120 - 160) = 0 (≤ threshold 50).
--   SELECT * FROM public.get_low_stock_items(<farm_id>):
--     - Returns exactly 2 rows (both 'Grower Feed' and 'Layer Pellets').
-- =============================================================================
