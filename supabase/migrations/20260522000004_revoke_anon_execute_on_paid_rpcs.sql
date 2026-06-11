-- =============================================================================
-- PoultryOS — Security hardening: revoke anon EXECUTE on user-scoped RPCs
-- File: 20260522000004_revoke_anon_execute_on_paid_rpcs.sql
-- Created: 2026-05-22
--
-- Audit finding (Supabase advisor 0028 — anon_security_definer_function_executable):
--   public.get_multi_farm_summary() and public.is_paid(uuid) are SECURITY
--   DEFINER functions that were callable by the `anon` role via the REST RPC
--   endpoint. Although both short-circuit when auth.uid() IS NULL, an
--   unauthenticated caller should never be able to reach a SECURITY DEFINER
--   billing/aggregate function at all. Revoke EXECUTE from anon explicitly so
--   the surface is gone regardless of any prior CREATE OR REPLACE re-granting
--   the PostgreSQL default PUBLIC grant.
-- =============================================================================

REVOKE EXECUTE ON FUNCTION public.get_multi_farm_summary() FROM anon;
REVOKE EXECUTE ON FUNCTION public.is_paid(UUID) FROM anon;

-- Belt-and-braces: ensure the intended grants are still in place.
GRANT EXECUTE ON FUNCTION public.get_multi_farm_summary() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_paid(UUID) TO authenticated, service_role;
