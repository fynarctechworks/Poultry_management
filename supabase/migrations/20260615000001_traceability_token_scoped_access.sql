-- =============================================================================
-- PoultryOS — Traceability: token-scoped anonymous access (security fix)
-- File: 20260615000001_traceability_token_scoped_access.sql
-- Created: 2026-06-15
-- =============================================================================
-- PROBLEM: the public traceability page relied on an RLS policy
--   `traceability_anon_select ... USING (qr_token IS NOT NULL)`.
-- RLS is evaluated per-row, and `qr_token IS NOT NULL` is TRUE for every row, so
-- ANY anonymous caller could enumerate EVERY tenant's traceability records
-- (supplier, buyer, harvest dates) via the PostgREST endpoint — a cross-tenant
-- privacy leak. The intent ("read a record only if you already know its token")
-- cannot be expressed as a row policy, because RLS can't require the token to
-- appear in the caller's WHERE clause.
--
-- FIX: serve the public page through a SECURITY DEFINER function that takes an
-- exact token and returns at most one row (no enumeration possible — there is no
-- way to list tokens), and DROP the broad anon row policy. With RLS enabled and
-- no anon policy, anonymous direct table reads return zero rows.
--
-- We intentionally DO NOT touch table-level GRANTs (the default-privileges
-- baseline that pgTAP CI asserts). Dropping the policy is sufficient and exact.
-- =============================================================================

BEGIN;

-- ---------- 1. Token-scoped public accessor ---------------------------------
CREATE OR REPLACE FUNCTION public.get_traceability_by_token(p_token TEXT)
  RETURNS TABLE (
    batch_id               UUID,
    supplier_name          TEXT,
    placement_date         DATE,
    breed_name             TEXT,
    total_vaccinations     INTEGER,
    health_incidents_count INTEGER,
    withdrawal_cleared     BOOLEAN,
    harvest_date           DATE,
    buyer_name             TEXT,
    certificate_pdf_url    TEXT,
    is_locked              BOOLEAN,
    qr_token               TEXT
  )
  LANGUAGE sql
  SECURITY DEFINER
  STABLE
  SET search_path = public, pg_temp
AS $fn$
  SELECT t.batch_id, t.supplier_name, t.placement_date, t.breed_name,
         t.total_vaccinations, t.health_incidents_count, t.withdrawal_cleared,
         t.harvest_date, t.buyer_name, t.certificate_pdf_url, t.is_locked,
         t.qr_token
    FROM public.traceability_records t
   WHERE p_token IS NOT NULL
     AND length(p_token) > 0
     AND t.qr_token = p_token
   LIMIT 1;
$fn$;

REVOKE EXECUTE ON FUNCTION public.get_traceability_by_token(TEXT) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.get_traceability_by_token(TEXT) TO anon, authenticated;

COMMENT ON FUNCTION public.get_traceability_by_token(TEXT) IS
  'Public traceability lookup: returns at most one record for an EXACT qr_token. '
  'Replaces the enumerable anon row policy — no token list can be obtained.';

-- ---------- 2. Remove the enumerable anon row policy ------------------------
-- After this, anon has no SELECT policy on the table; RLS therefore returns
-- zero rows to anonymous direct reads. Authenticated member/admin policies are
-- unchanged.
DROP POLICY IF EXISTS traceability_anon_select ON public.traceability_records;

COMMIT;

-- =============================================================================
-- Reversal (NOT recommended — re-opens the leak):
--   DROP FUNCTION public.get_traceability_by_token(TEXT);
--   CREATE POLICY traceability_anon_select ON public.traceability_records
--     FOR SELECT TO anon USING (qr_token IS NOT NULL);
-- =============================================================================
