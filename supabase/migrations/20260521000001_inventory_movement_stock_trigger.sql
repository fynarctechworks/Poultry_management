-- Centralise inventory stock math in a single trigger on inventory_movements.
-- Previously only feed usage (via daily_logs) adjusted current_stock; purchases
-- and manual adjustments inserted movement rows without ever changing stock.

-- ---------- apply_inventory_movement -----------------------------------------
-- AFTER INSERT on inventory_movements: adjust the item's current_stock by the
-- signed effect of the movement.
--   purchase   -> stock + quantity
--   adjustment -> stock + quantity   (quantity is a signed delta)
--   usage      -> stock - quantity   (clamped at 0)
CREATE OR REPLACE FUNCTION public.apply_inventory_movement()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.movement_type = 'usage' THEN
    UPDATE public.inventory_items
       SET current_stock = GREATEST(0, current_stock - NEW.quantity),
           updated_at = now()
     WHERE id = NEW.item_id;
  ELSE
    -- purchase and adjustment both add the (possibly signed) quantity
    UPDATE public.inventory_items
       SET current_stock = GREATEST(0, current_stock + NEW.quantity),
           updated_at = now()
     WHERE id = NEW.item_id;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER tg_inventory_movements_apply
  AFTER INSERT ON public.inventory_movements
  FOR EACH ROW EXECUTE FUNCTION public.apply_inventory_movement();

-- ---------- deduct_feed_inventory (revised) ----------------------------------
-- Drop the manual stock UPDATE; the new movement trigger now owns stock math.
-- This function only locates the matching feed item and records the usage
-- movement, which the trigger then applies to current_stock.
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

  SELECT id INTO v_item_id
    FROM public.inventory_items
   WHERE farm_id = NEW.farm_id
     AND category = 'feed'
     AND lower(item_name) LIKE lower(NEW.feed_type) || '%'
   ORDER BY created_at ASC
   LIMIT 1;

  IF v_item_id IS NULL THEN
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
