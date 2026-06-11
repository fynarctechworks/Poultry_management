-- =============================================================================
-- tests/db/custom_integrator_rpc.test.sql
-- pgTAP tests for public.create_custom_integrator(p_name TEXT)
-- Migration: 20260519000000_custom_integrator_rpc.sql
--
-- Run against a non-production or local Supabase project:
--   supabase db test   (local)
--   OR execute via Supabase MCP execute_sql against a staging project
--
-- All test data is rolled back at the end.
-- =============================================================================

BEGIN;

SELECT plan(12);

-- ---------------------------------------------------------------------------
-- T1. Function exists in public schema
-- ---------------------------------------------------------------------------
SELECT has_function(
  'public',
  'create_custom_integrator',
  ARRAY['text'],
  'T1: function public.create_custom_integrator(text) exists'
);

-- ---------------------------------------------------------------------------
-- T2. Function is SECURITY DEFINER
-- ---------------------------------------------------------------------------
SELECT ok(
  (
    SELECT prosecdef
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'create_custom_integrator'
  ),
  'T2: function is SECURITY DEFINER'
);

-- ---------------------------------------------------------------------------
-- T3. search_path is pinned to public, pg_temp
-- ---------------------------------------------------------------------------
SELECT ok(
  (
    SELECT proconfig @> ARRAY['search_path=public, pg_temp']
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'create_custom_integrator'
  ),
  'T3: search_path is pinned to public, pg_temp'
);

-- ---------------------------------------------------------------------------
-- T4. authenticated role has EXECUTE privilege
-- ---------------------------------------------------------------------------
SELECT ok(
  has_function_privilege('authenticated', 'public.create_custom_integrator(text)', 'EXECUTE'),
  'T4: authenticated role has EXECUTE on create_custom_integrator'
);

-- ---------------------------------------------------------------------------
-- T5. anon role does NOT have EXECUTE privilege
-- ---------------------------------------------------------------------------
SELECT ok(
  NOT has_function_privilege('anon', 'public.create_custom_integrator(text)', 'EXECUTE'),
  'T5: anon role does NOT have EXECUTE on create_custom_integrator'
);

-- ---------------------------------------------------------------------------
-- T6. Happy path: returns a valid UUID
-- ---------------------------------------------------------------------------
DO $$
DECLARE v_result UUID;
BEGIN
  v_result := public.create_custom_integrator('Test Integrator Alpha');
  IF v_result IS NULL THEN
    RAISE EXCEPTION 'T6 setup: expected non-null UUID';
  END IF;
END $$;

SELECT ok(
  (SELECT public.create_custom_integrator('Test Integrator Alpha') IS NOT NULL),
  'T6: happy path returns a non-null UUID'
);

-- ---------------------------------------------------------------------------
-- T7. Row has is_pre_loaded=false
-- ---------------------------------------------------------------------------
SELECT ok(
  (SELECT NOT is_pre_loaded FROM public.integrators WHERE name = 'Test Integrator Alpha'),
  'T7: created integrator has is_pre_loaded=false'
);

-- ---------------------------------------------------------------------------
-- T8. Row has tariff_card_json->''source'' = ''user_custom''
-- ---------------------------------------------------------------------------
SELECT ok(
  (SELECT tariff_card_json->>'source' = 'user_custom'
   FROM public.integrators
   WHERE name = 'Test Integrator Alpha'),
  'T8: tariff_card_json source = user_custom'
);

-- ---------------------------------------------------------------------------
-- T9. Idempotency: second call with same name returns the same UUID
-- ---------------------------------------------------------------------------
SELECT ok(
  (
    SELECT public.create_custom_integrator('Test Integrator Alpha') =
           public.create_custom_integrator('Test Integrator Alpha')
  ),
  'T9: idempotent — same name returns same UUID on repeated calls'
);

-- ---------------------------------------------------------------------------
-- T10. Only one row exists for the name (upsert, not duplicate insert)
-- ---------------------------------------------------------------------------
SELECT ok(
  (SELECT count(*) = 1 FROM public.integrators WHERE name = 'Test Integrator Alpha'),
  'T10: only one row created despite multiple calls'
);

-- ---------------------------------------------------------------------------
-- T11. Validation: empty string raises SQLSTATE 22023
-- ---------------------------------------------------------------------------
SELECT throws_ok(
  $$ SELECT public.create_custom_integrator('') $$,
  '22023',
  'integrator name required (min 2 chars)',
  'T11: empty string raises SQLSTATE 22023'
);

-- ---------------------------------------------------------------------------
-- T12. Validation: single character raises SQLSTATE 22023
-- ---------------------------------------------------------------------------
SELECT throws_ok(
  $$ SELECT public.create_custom_integrator('X') $$,
  '22023',
  'integrator name required (min 2 chars)',
  'T12: single-char string raises SQLSTATE 22023'
);

SELECT * FROM finish();

-- Clean up test data — remove the integrator we inserted
DELETE FROM public.integrators WHERE name = 'Test Integrator Alpha';

ROLLBACK;
