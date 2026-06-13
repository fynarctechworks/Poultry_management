-- =============================================================================
-- SEC-1: Remove anon EXECUTE from privileged SECURITY DEFINER functions.
-- =============================================================================
-- Audit (audit/13-verification-audit-2026-06-13.md) found 128 SECURITY DEFINER
-- functions executable by anon/authenticated. The dangerous surface is the
-- Control Center admin RPCs (cc_*) and trigger/internal-only functions being
-- callable by an UNAUTHENTICATED (anon) caller. Although every cc_* asserts
-- cc_assert_permission() as its first statement (verified), granting anon
-- EXECUTE is a defense-in-depth failure (project rule, lessons L3) and the exact
-- attack surface the rebuild brief names: subscription bypass / admin abuse.
--
-- IMPORTANT — what is intentionally NOT touched here, and why:
--   * RLS-helper functions (is_tenant_member, is_tenant_owner, is_tenant_admin,
--     is_tenant_paid, is_tenant_money, tenant_role, tenant_can_write,
--     tenant_feature, tenant_plan_status, is_platform_admin,
--     platform_has_permission) are invoked from RLS policy expressions. 84 of 92
--     policies are scoped TO public, so anon evaluates them; PostgreSQL enforces
--     EXECUTE on functions called from RLS (see migration
--     20260521000000_restore_rls_helper_execute — a prior anon/authenticated
--     revoke caused "permission denied for function" lockouts). These helpers
--     return FALSE for anon (auth.uid() IS NULL) and leak nothing, so their anon
--     grant is retained. Tightening them requires re-scoping policies TO
--     authenticated first, gated by pgTAP — tracked as deferred work (SEC-5).
--   * track_event / log_auth_event / report_error are intentional PRE-AUTH
--     writers (funnel events, failed-login audit, client error capture) that
--     fire before a session exists. Retained for anon; rate-limiting is a
--     separate concern.
--
-- Grant model after this migration:
--   cc_* admin RPCs + validate_coupon : authenticated + service_role (NOT anon).
--     Called by the Control Center operator session; internal permission assert
--     still gates non-admins.
--   trigger/internal-only functions   : service_role only (NOT anon/authenticated).
--     Invoked by triggers / PERFORM under the owner's privileges; no caller grant
--     needed for those paths.
-- =============================================================================

DO $$
DECLARE
  r record;
  -- Admin RPCs invoked by authenticated Control Center operators (re-check perms
  -- internally). Drop anon; keep authenticated + service_role.
  rpc_names text[] := ARRAY[
    'cc_activate_tenant','cc_add_error_comment','cc_apply_tenant_discount','cc_assert_permission',
    'cc_assign_error','cc_assign_ticket','cc_change_plan','cc_change_tenant_plan','cc_complete_followup',
    'cc_create_coupon','cc_create_discount','cc_create_flag','cc_create_followup','cc_create_plan',
    'cc_create_ticket','cc_duplicate_plan','cc_extend_trial','cc_list_invoices','cc_list_payments',
    'cc_log_call','cc_reset_subscription','cc_restore_tenant','cc_set_error_status','cc_set_flag',
    'cc_set_plan_active','cc_set_plan_feature','cc_set_plan_flag','cc_set_subscription_status',
    'cc_set_tenant_flag','cc_set_ticket_status','cc_soft_delete_tenant','cc_suspend_tenant',
    'cc_update_plan','validate_coupon'
  ];
  -- Trigger functions + internal helpers never called directly by a client.
  internal_names text[] := ARRAY[
    'provision_tenant_trial','fill_tenant_id_from_farm','tg_enforce_tenant_writable','rebuild_plan_features_json'
  ];
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = ANY(rpc_names)
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon;', r.sig);
    EXECUTE format('GRANT  EXECUTE ON FUNCTION %s TO authenticated, service_role;', r.sig);
  END LOOP;

  FOR r IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = ANY(internal_names)
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon, authenticated;', r.sig);
    EXECUTE format('GRANT  EXECUTE ON FUNCTION %s TO service_role;', r.sig);
  END LOOP;
END $$;
