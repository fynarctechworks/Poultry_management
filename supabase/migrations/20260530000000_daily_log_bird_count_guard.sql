-- Recovered from the applied database migration history.
-- This migration ran on the live DB but its file was lost in the folder restructure.
-- Name: daily_log_bird_count_guard

-- Prevent a daily log from recording more bird deaths than the flock has alive.
-- See repo migration 20260530000000_daily_log_bird_count_guard.sql for full rationale.

CREATE OR REPLACE FUNCTION public.check_daily_log_bird_count()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_delta   INTEGER;
  v_current INTEGER;
  v_code    TEXT;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_delta := COALESCE(NEW.birds_dead, 0);
  ELSE
    v_delta := COALESCE(NEW.birds_dead, 0) - COALESCE(OLD.birds_dead, 0);
  END IF;

  IF v_delta <= 0 THEN
    RETURN NEW;
  END IF;

  SELECT current_bird_count, batch_code
    INTO v_current, v_code
    FROM public.batches
   WHERE id = NEW.batch_id
   FOR UPDATE;

  IF v_delta > v_current THEN
    RAISE EXCEPTION
      'Cannot record % bird death(s): only % live bird(s) remain in batch %',
      v_delta, v_current, COALESCE(v_code, NEW.batch_id::text)
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tg_daily_logs_check_bird_count ON public.daily_logs;
CREATE TRIGGER tg_daily_logs_check_bird_count
  BEFORE INSERT OR UPDATE ON public.daily_logs
  FOR EACH ROW EXECUTE FUNCTION public.check_daily_log_bird_count();

-- Trigger-only function: revoke the REST/RPC surface (advisor lints 0028/0029).
REVOKE EXECUTE ON FUNCTION public.check_daily_log_bird_count() FROM PUBLIC, anon, authenticated;