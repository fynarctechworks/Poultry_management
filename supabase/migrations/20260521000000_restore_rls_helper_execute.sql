-- =============================================================================
-- PoultryOS — Restore EXECUTE on RLS helper functions
-- File: 20260521000000_restore_rls_helper_execute.sql
-- Purpose:
--   The 2026-05-02 hardening pass revoked EXECUTE on the SECURITY DEFINER
--   helpers used by row-level security policies. The accompanying comment
--   ("policy-bound calls go through the planner directly") is incorrect:
--   PostgreSQL still enforces EXECUTE privilege on functions invoked from
--   RLS expressions, regardless of SECURITY DEFINER. The revoke caused
--   "permission denied for function is_farm_member" on every table whose
--   policy invokes it (buyers, payment_reminders, weather_data,
--   weather_alerts, contract_cycles, whatsapp_messages_log, etc).
--
--   These helpers only return booleans about the calling user's own
--   membership and are hardened with a pinned search_path, so granting
--   EXECUTE to `authenticated` is safe.
-- =============================================================================

GRANT EXECUTE ON FUNCTION public.is_farm_member(uuid)    TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_farm_owner(uuid)     TO authenticated;
GRANT EXECUTE ON FUNCTION public.user_role_for_farm(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.user_assigned_sheds(uuid) TO authenticated;
