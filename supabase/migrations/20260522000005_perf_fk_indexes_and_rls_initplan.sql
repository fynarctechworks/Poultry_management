-- =============================================================================
-- PoultryOS — Performance hardening from Supabase advisor (0001 + 0003)
-- File: 20260522000005_perf_fk_indexes_and_rls_initplan.sql
-- Created: 2026-05-22
--
-- Two advisor categories addressed:
--
-- 1. unindexed_foreign_keys (0001) — 11 FK columns had no covering index, so
--    cascade deletes and FK-joined lookups did sequential scans. Add a btree
--    index per FK column.
--
-- 2. auth_rls_initplan (0003) — RLS policies on profiles/farms/farm_users
--    called auth.uid() bare, forcing per-row re-evaluation. Wrapping it as
--    (SELECT auth.uid()) lets Postgres evaluate it once as an InitPlan.
--    Behaviour is identical; only the query plan changes.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Covering indexes for foreign keys
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_contract_cycles_integrator_id
  ON public.contract_cycles (integrator_id);
CREATE INDEX IF NOT EXISTS idx_daily_logs_logged_by
  ON public.daily_logs (logged_by);
CREATE INDEX IF NOT EXISTS idx_farms_integrator_id
  ON public.farms (integrator_id);
CREATE INDEX IF NOT EXISTS idx_financial_transactions_batch_id
  ON public.financial_transactions (batch_id);
CREATE INDEX IF NOT EXISTS idx_health_incidents_reported_by
  ON public.health_incidents (reported_by);
CREATE INDEX IF NOT EXISTS idx_inventory_movements_daily_log_id
  ON public.inventory_movements (daily_log_id);
CREATE INDEX IF NOT EXISTS idx_inventory_movements_farm_id
  ON public.inventory_movements (farm_id);
CREATE INDEX IF NOT EXISTS idx_payment_reminders_farm_id
  ON public.payment_reminders (farm_id);
CREATE INDEX IF NOT EXISTS idx_traceability_records_farm_id
  ON public.traceability_records (farm_id);
CREATE INDEX IF NOT EXISTS idx_vaccinations_administered_by
  ON public.vaccinations (administered_by);
CREATE INDEX IF NOT EXISTS idx_vaccinations_batch_id
  ON public.vaccinations (batch_id);

-- ---------------------------------------------------------------------------
-- 2. RLS InitPlan optimisation — wrap auth.uid() in a scalar sub-select
-- ---------------------------------------------------------------------------

-- profiles
ALTER POLICY profiles_select_self ON public.profiles
  USING (id = (SELECT auth.uid()));
ALTER POLICY profiles_update_self ON public.profiles
  USING (id = (SELECT auth.uid()))
  WITH CHECK (id = (SELECT auth.uid()));
ALTER POLICY profiles_insert_self ON public.profiles
  WITH CHECK (id = (SELECT auth.uid()));

-- farms
ALTER POLICY farms_delete_owner ON public.farms
  USING (owner_id = (SELECT auth.uid()));
ALTER POLICY farms_update_owner ON public.farms
  USING (owner_id = (SELECT auth.uid()))
  WITH CHECK (owner_id = (SELECT auth.uid()));
ALTER POLICY farms_insert_self ON public.farms
  WITH CHECK (owner_id = (SELECT auth.uid()));
ALTER POLICY farms_select_member ON public.farms
  USING (
    (owner_id = (SELECT auth.uid()))
    OR EXISTS (
      SELECT 1
        FROM public.farm_users
       WHERE farm_users.farm_id = farms.id
         AND farm_users.user_id = (SELECT auth.uid())
    )
  );

-- farm_users
ALTER POLICY farm_users_self_select ON public.farm_users
  USING (
    (user_id = (SELECT auth.uid()))
    OR public.is_farm_owner(farm_id)
  );
