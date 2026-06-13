-- Recovered from the applied database migration history.
-- This migration ran on the live DB but its file was lost in the folder restructure.
-- Name: rebuild_farms_insert_policy

DROP POLICY IF EXISTS farms_insert_self ON public.farms;
CREATE POLICY farms_insert_self ON public.farms
  FOR INSERT TO authenticated
  WITH CHECK (owner_id = auth.uid());