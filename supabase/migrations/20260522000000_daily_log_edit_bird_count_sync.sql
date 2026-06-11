-- Keep batches.current_bird_count consistent when a daily_log's birds_dead is
-- corrected after the fact. The original trigger (tg_daily_logs_update_bird_count)
-- only fires AFTER INSERT, so an edited mortality count would otherwise desync
-- the live bird count. This applies the signed delta (NEW - OLD).
--
-- Feed quantity is intentionally NOT made editable in the web UI (the usage
-- movement is already recorded); inventory corrections go through an explicit
-- adjustment movement instead.

CREATE OR REPLACE FUNCTION public.update_batch_bird_count_on_edit()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.birds_dead IS DISTINCT FROM OLD.birds_dead THEN
    UPDATE public.batches
       SET current_bird_count = GREATEST(0, current_bird_count - (COALESCE(NEW.birds_dead, 0) - COALESCE(OLD.birds_dead, 0))),
           updated_at = now()
     WHERE id = NEW.batch_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tg_daily_logs_update_bird_count_edit ON public.daily_logs;
CREATE TRIGGER tg_daily_logs_update_bird_count_edit
  AFTER UPDATE ON public.daily_logs
  FOR EACH ROW EXECUTE FUNCTION public.update_batch_bird_count_on_edit();
