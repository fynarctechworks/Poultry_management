-- =============================================================================
-- PoultryOS — Revoke EXECUTE on trigger-only functions
-- File: 20260522000003_harden_trigger_function_execute.sql
-- Purpose:
--   The Supabase security advisor (lints 0028/0029) flags five SECURITY DEFINER
--   functions as callable by the `anon` and `authenticated` roles through
--   `/rest/v1/rpc/<fn>`. All five are trigger functions — they are invoked only
--   by the trigger machinery and are never meant to be called directly. A
--   trigger fires regardless of EXECUTE privilege, so revoking EXECUTE from
--   PUBLIC/anon/authenticated closes the REST surface without affecting the
--   triggers themselves.
--
--   Unlike the RLS helpers (is_farm_member, etc.) which PostgreSQL requires the
--   caller to hold EXECUTE on, trigger functions referenced only by CREATE
--   TRIGGER need no grant at all.
-- =============================================================================

REVOKE EXECUTE ON FUNCTION public.apply_inventory_movement()           FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.cleanup_daily_log_movements()        FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.deduct_feed_inventory()              FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.restore_batch_bird_count_on_delete() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.update_batch_bird_count_on_edit()    FROM PUBLIC, anon, authenticated;
