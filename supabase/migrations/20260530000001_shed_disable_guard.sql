-- Recovered from the applied database migration history.
-- This migration ran on the live DB but its file was lost in the folder restructure.
-- Name: shed_disable_guard

-- Guard shed disabling so a shed that still houses live flocks can't be
-- deactivated out from under them. See repo migration
-- 20260530000001_shed_disable_guard.sql for full rationale.

CREATE OR REPLACE FUNCTION public.check_shed_disable()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_active_batches INTEGER;
BEGIN
  -- Only a transition into 'inactive' needs guarding.
  IF NEW.status <> 'inactive' OR OLD.status = 'inactive' THEN
    RETURN NEW;
  END IF;

  SELECT count(*)
    INTO v_active_batches
    FROM public.batches
   WHERE shed_id = NEW.id
     AND status = 'active';

  IF v_active_batches > 0 THEN
    RAISE EXCEPTION
      'Cannot disable shed "%": % active batch(es) still placed in it. Close or move them first.',
      NEW.shed_name, v_active_batches
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tg_sheds_check_disable ON public.sheds;
CREATE TRIGGER tg_sheds_check_disable
  BEFORE UPDATE ON public.sheds
  FOR EACH ROW EXECUTE FUNCTION public.check_shed_disable();