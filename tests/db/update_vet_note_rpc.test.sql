-- =============================================================================
-- tests/db/update_vet_note_rpc.test.sql
-- pgTAP tests for public.update_vet_note(p_incident_id UUID, p_note TEXT)
-- Migration: 20260519000004_vet_note_rpc.sql
--
-- Structural + missing-incident assertions are remote-safe (no fixtures).
-- The full vet/owner/non-member authorisation matrix needs a farm → batch →
-- health_incident → farm_users fixture chain and is therefore LOCAL ONLY —
-- run that portion via `supabase db reset` on a local stack.
--
-- All test data is rolled back at the end.
-- =============================================================================

BEGIN;

SELECT plan(6);

-- ---------------------------------------------------------------------------
-- Structural assertions (remote-safe)
-- ---------------------------------------------------------------------------

SELECT has_function(
  'public', 'update_vet_note', ARRAY['uuid', 'text'],
  'T1: function public.update_vet_note(uuid, text) exists'
);

SELECT ok(
  (SELECT prosecdef
     FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'update_vet_note'),
  'T2: update_vet_note is SECURITY DEFINER'
);

SELECT ok(
  (SELECT proconfig @> ARRAY['search_path=public, pg_temp']
     FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'update_vet_note'),
  'T3: update_vet_note has a pinned search_path'
);

SELECT ok(
  has_function_privilege('authenticated', 'public.update_vet_note(uuid,text)', 'EXECUTE'),
  'T4: authenticated role can execute update_vet_note'
);

SELECT ok(
  NOT has_function_privilege('anon', 'public.update_vet_note(uuid,text)', 'EXECUTE'),
  'T5: anon role cannot execute update_vet_note'
);

-- ---------------------------------------------------------------------------
-- Behavioural assertion (remote-safe — no fixture needed)
-- A random incident id does not exist → no_data_found is raised.
-- ---------------------------------------------------------------------------

SELECT throws_ok(
  $$ SELECT public.update_vet_note('00000000-0000-0000-0000-0000000000ff', 'note') $$,
  'P0002',  -- no_data_found
  'health incident not found',
  'T6: update_vet_note on a missing incident raises no_data_found'
);

SELECT * FROM finish();

ROLLBACK;

-- =============================================================================
-- LOCAL ONLY — authorisation matrix (needs fixtures; run on `supabase db reset`)
-- =============================================================================
-- Outline (not executed here):
--   1. Seed auth.users: an owner, a vet, an outsider.
--   2. Seed farm → shed → batch → health_incident.
--   3. Seed farm_users: owner row (role='owner'), vet row (role='vet').
--   4. SET request.jwt.claims to the vet  → update_vet_note succeeds; vet_note set.
--   5. SET request.jwt.claims to the owner → update_vet_note succeeds.
--   6. SET request.jwt.claims to the outsider → raises insufficient_privilege (42501).
--   7. Assert only vet_note + updated_at changed (all other columns OLD = NEW).
