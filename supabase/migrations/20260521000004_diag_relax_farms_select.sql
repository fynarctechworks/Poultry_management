-- Recovered from the applied database migration history.
-- This migration ran on the live DB but its file was lost in the folder restructure.
-- Name: diag_relax_farms_select

ALTER POLICY farms_select_member ON public.farms USING (true);