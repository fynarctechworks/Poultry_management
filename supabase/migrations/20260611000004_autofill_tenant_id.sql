-- =============================================================================
-- PoultryOS — Multi-Tenant SaaS Upgrade · Phase A6: Auto-fill tenant_id
-- File: 20260611000004_autofill_tenant_id.sql
-- =============================================================================
-- Backward-compatibility safety net. Every tenant-owned child table carries
-- both farm_id and a NOT NULL tenant_id now. Existing code (the mobile/web
-- client AND the service-role Edge Functions: weather, whatsapp log, payment
-- reminders, etc.) inserts rows setting only farm_id. Without this, those
-- inserts would fail the NOT NULL constraint.
--
-- This BEFORE INSERT trigger derives tenant_id from the row's farm_id whenever
-- tenant_id was not supplied. Result: NO existing insert site needs to change;
-- new code may still set tenant_id explicitly and the trigger leaves it alone.
-- =============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.fill_tenant_id_from_farm()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public, pg_temp
AS $fn$
BEGIN
  IF NEW.tenant_id IS NULL AND NEW.farm_id IS NOT NULL THEN
    SELECT f.tenant_id INTO NEW.tenant_id
      FROM public.farms f
     WHERE f.id = NEW.farm_id;
  END IF;
  RETURN NEW;
END;
$fn$;

-- Attach to every tenant-owned table that has a farm_id. (farms itself has no
-- farm_id — its tenant_id is set explicitly by create_tenant_onboarding or a
-- future add-farm flow.)
DO $$
DECLARE
  tbl TEXT;
  tables TEXT[] := ARRAY[
    'sheds','batches','farm_users','buyers','daily_logs','health_incidents',
    'vaccinations','inventory_items','inventory_movements','financial_transactions',
    'payment_reminders','traceability_records','weather_data','weather_alerts',
    'contract_cycles','whatsapp_messages_log'
  ];
BEGIN
  FOREACH tbl IN ARRAY tables LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS tg_%I_fill_tenant ON public.%I', tbl, tbl);
    -- Name with leading "tg_0_" so it fires before other BEFORE triggers
    -- (e.g. generate_batch_code) — Postgres fires BEFORE triggers in name order.
    EXECUTE format(
      'CREATE TRIGGER tg_0_%I_fill_tenant BEFORE INSERT ON public.%I
         FOR EACH ROW EXECUTE FUNCTION public.fill_tenant_id_from_farm()',
      tbl, tbl);
  END LOOP;
END$$;

COMMENT ON FUNCTION public.fill_tenant_id_from_farm() IS
  'BEFORE INSERT safety net: derives tenant_id from farm_id when not supplied, so existing client/Edge-Function insert sites (which set only farm_id) keep working after the multi-tenant migration.';

COMMIT;
