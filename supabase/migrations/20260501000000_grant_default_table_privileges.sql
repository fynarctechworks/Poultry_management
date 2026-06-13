-- =============================================================================
-- BASELINE: Supabase standard default privileges for the `public` schema
-- File: 20260501000000_grant_default_table_privileges.sql
-- =============================================================================
-- Every later migration in this project assumes the Supabase grant baseline:
-- the api roles (anon, authenticated, service_role) hold TABLE-level privileges
-- on public objects, and ROW security (RLS) — not the absence of a GRANT — is
-- what gates access. The clearest proof is the billing lock-down migration
-- (20260613111256), which does:
--
--     REVOKE INSERT, UPDATE, DELETE ON public.tenant_subscriptions FROM authenticated;
--     GRANT  UPDATE (plan_id, billing_cycle) ON public.tenant_subscriptions TO authenticated;
--
-- That REVOKE is only meaningful if the baseline GRANT existed in the first place.
--
-- Hosted Supabase (and older `supabase` CLI images) install this baseline via
-- ALTER DEFAULT PRIVILEGES at project init, so the app works in production and
-- the pgTAP suite passed on older images. NEWER CLI images (pulled by
-- `supabase/setup-cli@latest` in CI) DO NOT, so under `SET ROLE authenticated`
-- every direct table access raises `permission denied for table ...`, each pgTAP
-- file aborts mid-plan ("Bad plan: planned N, ran M"), and the suite fails.
--
-- Make the schema self-contained instead of depending on image-version-specific
-- implicit grants. This runs FIRST (earliest version), so every table created by
-- the subsequent migrations inherits the baseline at creation time, and the later
-- column/RLS lock-downs override specific tables exactly as before.
--
-- PURE `ALTER DEFAULT PRIVILEGES` — it affects only objects created AFTER it.
-- It is therefore a safe no-op against an already-migrated production database
-- (existing prod tables already carry the correct grants and are not touched).
-- No FOR ROLE clause: it binds to the migration-runner role, which is the same
-- role that creates every table in the later migrations — guaranteeing inheritance
-- regardless of that role's name across CLI/image versions.
-- =============================================================================

BEGIN;

-- Schema usage (idempotent; usually already present from the base image).
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;

-- Mirror Supabase's documented default privileges for the public schema. RLS is
-- the security boundary for anon/authenticated; service_role bypasses RLS.
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT ALL ON TABLES    TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT ALL ON SEQUENCES TO anon, authenticated, service_role;

COMMIT;

-- =============================================================================
-- Reversal:
--   ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES    FROM anon, authenticated, service_role;
--   ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM anon, authenticated, service_role;
-- =============================================================================
