-- Recovered from the applied database migration history.
-- This migration ran on the live DB but its file was lost in the folder restructure.
-- Name: diag_relax_farms_insert

ALTER POLICY farms_insert_self ON public.farms WITH CHECK (true);