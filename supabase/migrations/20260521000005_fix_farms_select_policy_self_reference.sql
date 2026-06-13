-- Recovered from the applied database migration history.
-- This migration ran on the live DB but its file was lost in the folder restructure.
-- Name: fix_farms_select_policy_self_reference

-- The previous SELECT policy was `is_farm_member(id)`, which calls
-- `is_farm_owner` -> `SELECT … FROM farms WHERE id = p AND owner_id = auth.uid()`.
-- During INSERT ... RETURNING, this lookup runs in the pre-insert snapshot and
-- cannot see the row being inserted, so the policy fails with
-- "new row violates row-level security policy for table farms" — even though
-- the WITH CHECK on farms_insert_self is satisfied.
--
-- Inline the owner check against the row itself so the SELECT policy can be
-- evaluated without a self-referential lookup.

ALTER POLICY farms_select_member ON public.farms
  USING (
    owner_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.farm_users
       WHERE farm_users.farm_id = farms.id
         AND farm_users.user_id = auth.uid()
    )
  );

-- Restore the strict WITH CHECK on insert (we relaxed it to `true` for diagnosis).
ALTER POLICY farms_insert_self ON public.farms
  WITH CHECK (owner_id = auth.uid());