-- =============================================================================
-- PoultryOS — Daily-log trigger accuracy (P0.3 feed match + P0.4 mortality cfg)
-- File: 20260615000003_daily_log_trigger_accuracy.sql
-- Created: 2026-06-15
-- =============================================================================
-- P0.3  deduct_feed_inventory() previously matched the feed item with
--       `ORDER BY created_at ASC` — i.e. it always deducted from the OLDEST
--       matching item even if that item was empty, silently drifting stock.
--       Fix: prefer an item that actually has stock, then the most recent.
--       (Silent "no match" is surfaced to the user client-side after save.)
--
-- P0.4  check_mortality_spike() hard-coded a 1.0%/day threshold, which misfires
--       across breeds/ages and erodes trust in every alert. Fix: make it a
--       per-farm setting (farms.mortality_alert_threshold_pct, default 1.0).
-- =============================================================================

BEGIN;

-- ---------- P0.4: configurable mortality threshold --------------------------
ALTER TABLE public.farms
  ADD COLUMN IF NOT EXISTS mortality_alert_threshold_pct NUMERIC NOT NULL DEFAULT 1.0;

ALTER TABLE public.farms
  DROP CONSTRAINT IF EXISTS farms_mortality_threshold_chk;
ALTER TABLE public.farms
  ADD CONSTRAINT farms_mortality_threshold_chk
  CHECK (mortality_alert_threshold_pct > 0 AND mortality_alert_threshold_pct <= 100);

COMMENT ON COLUMN public.farms.mortality_alert_threshold_pct IS
  'Daily mortality %% (deaths / opening count) above which a spike alert fires. Default 1.0.';

CREATE OR REPLACE FUNCTION public.check_mortality_spike()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_opening    INTEGER;
  v_pct        NUMERIC;
  v_threshold  NUMERIC;
  v_batch_code TEXT;
  v_farm_id    UUID;
BEGIN
  IF NEW.birds_dead = 0 THEN
    RETURN NEW;
  END IF;

  SELECT opening_bird_count, batch_code, farm_id
    INTO v_opening, v_batch_code, v_farm_id
    FROM public.batches
   WHERE id = NEW.batch_id;

  IF v_opening IS NULL OR v_opening = 0 THEN
    RETURN NEW;
  END IF;

  -- Per-farm configurable threshold (fallback 1.0 for safety).
  SELECT COALESCE(mortality_alert_threshold_pct, 1.0)
    INTO v_threshold
    FROM public.farms
   WHERE id = v_farm_id;
  v_threshold := COALESCE(v_threshold, 1.0);

  v_pct := (NEW.birds_dead::NUMERIC / v_opening::NUMERIC) * 100.0;

  IF v_pct > v_threshold THEN
    PERFORM public.tg_post_to_edge_function(
      'send-push-notification',
      jsonb_build_object(
        'event', 'mortality_spike',
        'farm_id', v_farm_id,
        'batch_id', NEW.batch_id,
        'batch_code', v_batch_code,
        'birds_dead', NEW.birds_dead,
        'mortality_pct', v_pct,
        'threshold_pct', v_threshold,
        'log_date', NEW.log_date
      )
    );
    PERFORM public.tg_post_to_edge_function(
      'send-whatsapp-message',
      jsonb_build_object(
        'event', 'mortality_alert',
        'farm_id', v_farm_id,
        'batch_id', NEW.batch_id,
        'batch_code', v_batch_code,
        'birds_dead', NEW.birds_dead,
        'mortality_pct', v_pct,
        'threshold_pct', v_threshold
      )
    );
  END IF;

  RETURN NEW;
END;
$$;

-- ---------- P0.3: smarter feed-item match -----------------------------------
CREATE OR REPLACE FUNCTION public.deduct_feed_inventory()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_item_id UUID;
BEGIN
  IF NEW.feed_consumed_kg IS NULL OR NEW.feed_consumed_kg = 0
     OR NEW.feed_type IS NULL THEN
    RETURN NEW;
  END IF;

  -- Match the farm's feed item by type, preferring one that actually has stock,
  -- then the most recently added. (Was: oldest first, which drained empty lots.)
  SELECT id INTO v_item_id
    FROM public.inventory_items
   WHERE farm_id = NEW.farm_id
     AND category = 'feed'
     AND lower(item_name) LIKE lower(NEW.feed_type) || '%'
   ORDER BY (current_stock > 0) DESC, created_at DESC
   LIMIT 1;

  IF v_item_id IS NULL THEN
    -- No matching feed item: nothing to deduct. The client surfaces a
    -- non-blocking "feed stock not updated" notice so it is never silent.
    RETURN NEW;
  END IF;

  INSERT INTO public.inventory_movements (
    item_id, farm_id, movement_type, quantity, cost_per_unit,
    movement_date, daily_log_id, notes
  ) VALUES (
    v_item_id, NEW.farm_id, 'usage', NEW.feed_consumed_kg, NEW.feed_cost_per_kg,
    NEW.log_date, NEW.id,
    'Auto-deducted from daily log'
  );

  RETURN NEW;
END;
$$;

COMMIT;
