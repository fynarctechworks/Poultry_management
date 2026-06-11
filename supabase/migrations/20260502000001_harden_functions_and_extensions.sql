-- =============================================================================
-- PoultryOS — Hardening pass after security advisor review
-- File: 20260502000001_harden_functions_and_extensions.sql
-- Created: 2026-05-02
-- Purpose:
--   * Pin search_path on all our functions (prevents search-path hijack
--     attacks against SECURITY DEFINER code).
--   * Revoke PostgREST RPC access on SECURITY DEFINER helpers — these are
--     internal RLS plumbing, not part of the public API surface.
-- Note:
--   * pg_net cannot be relocated out of `public` schema (extension does
--     not support SET SCHEMA). The advisor warning is accepted.
-- =============================================================================

-- 1. Pin search_path on every function we own
ALTER FUNCTION public.tg_set_updated_at()
  SET search_path = public, pg_temp;
ALTER FUNCTION public.tg_post_to_edge_function(text, jsonb)
  SET search_path = public, extensions, net, pg_temp;
ALTER FUNCTION public.update_batch_bird_count()
  SET search_path = public, pg_temp;
ALTER FUNCTION public.check_mortality_spike()
  SET search_path = public, extensions, net, pg_temp;
ALTER FUNCTION public.deduct_feed_inventory()
  SET search_path = public, pg_temp;
ALTER FUNCTION public.generate_batch_code()
  SET search_path = public, pg_temp;
ALTER FUNCTION public.lock_traceability_on_close()
  SET search_path = public, pg_temp;
ALTER FUNCTION public.update_buyer_balance()
  SET search_path = public, pg_temp;
ALTER FUNCTION public.check_payment_overdue()
  SET search_path = public, pg_temp;
ALTER FUNCTION public.lock_contract_cycle_on_close()
  SET search_path = public, pg_temp;

-- 2. Revoke PostgREST RPC access on SECURITY DEFINER helpers.
-- These are meant to be called from RLS policies and triggers, never via API.
-- RLS policy evaluation still works because policy-bound calls go through
-- the planner directly, not through PostgREST.
REVOKE EXECUTE ON FUNCTION public.user_role_for_farm(uuid)
  FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.user_assigned_sheds(uuid)
  FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.is_farm_owner(uuid)
  FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.is_farm_member(uuid)
  FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.tg_post_to_edge_function(text, jsonb)
  FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.check_payment_overdue()
  FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.check_mortality_spike()
  FROM anon, authenticated, public;
