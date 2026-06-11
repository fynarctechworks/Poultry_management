-- Make daily_log / batch / shed deletes safe by reversing all trigger-maintained
-- derived state. Batches and sheds rely on FK ON DELETE CASCADE; the work here is
-- ensuring the cascade chain leaves bird counts and inventory stock consistent.
--
-- daily_logs delete  ->  restore batches.current_bird_count (+ birds_dead back)
--                    ->  remove the auto-generated feed usage movement, which
--                        in turn restores inventory stock
-- inventory_movements delete -> reverse the movement's effect on current_stock

-- A. Restore batch bird count when a daily_log is deleted -----------------------
CREATE OR REPLACE FUNCTION public.restore_batch_bird_count_on_delete()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF COALESCE(OLD.birds_dead, 0) > 0 THEN
    UPDATE public.batches
       SET current_bird_count = current_bird_count + OLD.birds_dead,
           updated_at = now()
     WHERE id = OLD.batch_id;
  END IF;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS tg_daily_logs_restore_bird_count ON public.daily_logs;
CREATE TRIGGER tg_daily_logs_restore_bird_count
  AFTER DELETE ON public.daily_logs
  FOR EACH ROW EXECUTE FUNCTION public.restore_batch_bird_count_on_delete();

-- B. Remove auto-generated feed movements before a daily_log is deleted ---------
-- inventory_movements.daily_log_id is ON DELETE SET NULL, which would orphan the
-- usage movement and leave stock permanently deducted. Explicitly delete those
-- movements first so the movement-delete trigger (C) restores stock.
CREATE OR REPLACE FUNCTION public.cleanup_daily_log_movements()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  DELETE FROM public.inventory_movements WHERE daily_log_id = OLD.id;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS tg_daily_logs_cleanup_movements ON public.daily_logs;
CREATE TRIGGER tg_daily_logs_cleanup_movements
  BEFORE DELETE ON public.daily_logs
  FOR EACH ROW EXECUTE FUNCTION public.cleanup_daily_log_movements();

-- C. Reverse stock effect when an inventory_movement is deleted ----------------
CREATE OR REPLACE FUNCTION public.apply_inventory_movement()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.movement_type = 'usage' THEN
      -- a usage took stock away; deleting it adds the quantity back
      UPDATE public.inventory_items
         SET current_stock = current_stock + OLD.quantity,
             updated_at = now()
       WHERE id = OLD.item_id;
    ELSE
      -- purchase / adjustment added quantity; deleting it removes it again
      UPDATE public.inventory_items
         SET current_stock = GREATEST(0, current_stock - OLD.quantity),
             updated_at = now()
       WHERE id = OLD.item_id;
    END IF;
    RETURN OLD;
  END IF;

  -- INSERT
  IF NEW.movement_type = 'usage' THEN
    UPDATE public.inventory_items
       SET current_stock = GREATEST(0, current_stock - NEW.quantity),
           updated_at = now()
     WHERE id = NEW.item_id;
  ELSE
    UPDATE public.inventory_items
       SET current_stock = GREATEST(0, current_stock + NEW.quantity),
           updated_at = now()
     WHERE id = NEW.item_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tg_inventory_movements_apply ON public.inventory_movements;
CREATE TRIGGER tg_inventory_movements_apply
  AFTER INSERT OR DELETE ON public.inventory_movements
  FOR EACH ROW EXECUTE FUNCTION public.apply_inventory_movement();
