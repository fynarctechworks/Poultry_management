-- =============================================================================
-- PoultryOS — Multi-Tenant SaaS Upgrade · Phase A3: RLS Re-Scope to Tenant
-- File: 20260611000002_tenant_rls_rescope.sql
-- =============================================================================
-- Makes TENANT membership the outer boundary on every tenant-owned table. Each
-- policy becomes:  is_tenant_member(tenant_id)  AND  (<existing farm/shed/role
-- predicate>). The existing farm helpers still resolve (farm_users is intact
-- and backfilled), so sub-farm/shed scoping and the owner/worker/vet split are
-- preserved exactly — we only ADD the tenant gate on top. Net effect: a user in
-- tenant A can never see tenant B's rows even if a farm_id somehow matched.
--
-- Tenant-role helpers also added so the 7-role model can grant access (e.g. an
-- accountant sees financials tenant-wide; a farm_manager is treated like owner
-- for operations). Legacy roles keep working because backfill mapped them.
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- 1. Tenant RLS helpers (mirror the farm helper conventions: SECURITY DEFINER,
--    STABLE, search_path=public).
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_tenant_member(p_tenant_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.tenant_users
     WHERE tenant_id = p_tenant_id AND user_id = auth.uid()
  );
$$;

CREATE OR REPLACE FUNCTION public.tenant_role(p_tenant_id UUID)
RETURNS TEXT LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT role FROM public.tenant_users
   WHERE tenant_id = p_tenant_id AND user_id = auth.uid()
   LIMIT 1;
$$;

-- Admin = owner or farm_manager: full operational + structural control.
CREATE OR REPLACE FUNCTION public.is_tenant_admin(p_tenant_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.tenant_users
     WHERE tenant_id = p_tenant_id AND user_id = auth.uid()
       AND role IN ('owner', 'farm_manager')
  );
$$;

-- Money roles = owner, farm_manager, accountant: may see/manage financials,
-- buyers, payment reminders, contract cycles, whatsapp log.
CREATE OR REPLACE FUNCTION public.is_tenant_money(p_tenant_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.tenant_users
     WHERE tenant_id = p_tenant_id AND user_id = auth.uid()
       AND role IN ('owner', 'farm_manager', 'accountant')
  );
$$;

-- -----------------------------------------------------------------------------
-- 2. tenants + tenant_users RLS
-- -----------------------------------------------------------------------------
ALTER TABLE public.tenants      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_users ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenants_member_select ON public.tenants
  FOR SELECT USING (public.is_tenant_member(id));
CREATE POLICY tenants_owner_update ON public.tenants
  FOR UPDATE USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());
CREATE POLICY tenants_owner_insert ON public.tenants
  FOR INSERT WITH CHECK (owner_id = auth.uid());

CREATE POLICY tenant_users_self_or_admin_select ON public.tenant_users
  FOR SELECT USING (user_id = auth.uid() OR public.is_tenant_admin(tenant_id));
CREATE POLICY tenant_users_admin_write ON public.tenant_users
  FOR ALL USING (public.is_tenant_admin(tenant_id))
  WITH CHECK (public.is_tenant_admin(tenant_id));

-- -----------------------------------------------------------------------------
-- 3. Re-scope each existing policy: drop + recreate with the tenant gate.
--    Pattern preserved 1:1 from the initial schema, wrapped in tenant membership
--    and extended so tenant admins/money-roles get the owner-equivalent path.
-- -----------------------------------------------------------------------------

-- ---------- farms -----------------------------------------------------------
DROP POLICY IF EXISTS farms_select_member ON public.farms;
DROP POLICY IF EXISTS farms_insert_self   ON public.farms;
DROP POLICY IF EXISTS farms_update_owner  ON public.farms;
DROP POLICY IF EXISTS farms_delete_owner  ON public.farms;

CREATE POLICY farms_select_member ON public.farms
  FOR SELECT USING (public.is_tenant_member(tenant_id) AND public.is_farm_member(id));
CREATE POLICY farms_insert_admin ON public.farms
  FOR INSERT WITH CHECK (public.is_tenant_admin(tenant_id) AND owner_id = auth.uid());
CREATE POLICY farms_update_admin ON public.farms
  FOR UPDATE USING (public.is_tenant_admin(tenant_id) OR owner_id = auth.uid())
  WITH CHECK (public.is_tenant_admin(tenant_id) OR owner_id = auth.uid());
CREATE POLICY farms_delete_admin ON public.farms
  FOR DELETE USING (public.is_tenant_admin(tenant_id) OR owner_id = auth.uid());

-- ---------- sheds -----------------------------------------------------------
DROP POLICY IF EXISTS sheds_select_member ON public.sheds;
DROP POLICY IF EXISTS sheds_owner_write   ON public.sheds;

CREATE POLICY sheds_select_member ON public.sheds
  FOR SELECT USING (
    public.is_tenant_member(tenant_id) AND (
      public.is_tenant_admin(tenant_id)
      OR public.is_farm_owner(farm_id)
      OR (
        public.user_role_for_farm(farm_id) IN ('worker', 'vet')
        AND (public.user_role_for_farm(farm_id) = 'vet'
             OR id = ANY(public.user_assigned_sheds(farm_id)))
      )
    )
  );
CREATE POLICY sheds_admin_write ON public.sheds
  FOR ALL USING (public.is_tenant_member(tenant_id) AND (public.is_tenant_admin(tenant_id) OR public.is_farm_owner(farm_id)))
  WITH CHECK (public.is_tenant_member(tenant_id) AND (public.is_tenant_admin(tenant_id) OR public.is_farm_owner(farm_id)));

-- ---------- batches ---------------------------------------------------------
DROP POLICY IF EXISTS batches_select_member ON public.batches;
DROP POLICY IF EXISTS batches_owner_write   ON public.batches;

CREATE POLICY batches_select_member ON public.batches
  FOR SELECT USING (
    public.is_tenant_member(tenant_id) AND (
      public.is_tenant_admin(tenant_id)
      OR public.is_farm_owner(farm_id)
      OR (
        public.user_role_for_farm(farm_id) IN ('worker', 'vet')
        AND (public.user_role_for_farm(farm_id) = 'vet'
             OR shed_id = ANY(public.user_assigned_sheds(farm_id)))
      )
    )
  );
CREATE POLICY batches_admin_write ON public.batches
  FOR ALL USING (public.is_tenant_member(tenant_id) AND (public.is_tenant_admin(tenant_id) OR public.is_farm_owner(farm_id)))
  WITH CHECK (public.is_tenant_member(tenant_id) AND (public.is_tenant_admin(tenant_id) OR public.is_farm_owner(farm_id)));

-- ---------- daily_logs ------------------------------------------------------
DROP POLICY IF EXISTS daily_logs_select_member ON public.daily_logs;
DROP POLICY IF EXISTS daily_logs_insert_member ON public.daily_logs;
DROP POLICY IF EXISTS daily_logs_owner_modify  ON public.daily_logs;
DROP POLICY IF EXISTS daily_logs_owner_delete  ON public.daily_logs;

CREATE POLICY daily_logs_select_member ON public.daily_logs
  FOR SELECT USING (
    public.is_tenant_member(tenant_id) AND (
      public.is_tenant_admin(tenant_id)
      OR public.is_farm_owner(farm_id)
      OR (
        public.user_role_for_farm(farm_id) IN ('worker', 'vet')
        AND (public.user_role_for_farm(farm_id) = 'vet'
             OR EXISTS (SELECT 1 FROM public.batches b
                         WHERE b.id = daily_logs.batch_id
                           AND b.shed_id = ANY(public.user_assigned_sheds(farm_id))))
      )
    )
  );
CREATE POLICY daily_logs_insert_member ON public.daily_logs
  FOR INSERT WITH CHECK (
    public.is_tenant_member(tenant_id) AND (
      public.is_tenant_admin(tenant_id)
      OR public.is_farm_owner(farm_id)
      OR (
        public.user_role_for_farm(farm_id) = 'worker'
        AND EXISTS (SELECT 1 FROM public.batches b
                     WHERE b.id = daily_logs.batch_id
                       AND b.shed_id = ANY(public.user_assigned_sheds(farm_id)))
      )
    )
  );
CREATE POLICY daily_logs_admin_modify ON public.daily_logs
  FOR UPDATE USING (public.is_tenant_member(tenant_id) AND (public.is_tenant_admin(tenant_id) OR public.is_farm_owner(farm_id)))
  WITH CHECK (public.is_tenant_member(tenant_id) AND (public.is_tenant_admin(tenant_id) OR public.is_farm_owner(farm_id)));
CREATE POLICY daily_logs_admin_delete ON public.daily_logs
  FOR DELETE USING (public.is_tenant_member(tenant_id) AND (public.is_tenant_admin(tenant_id) OR public.is_farm_owner(farm_id)));

-- ---------- health_incidents ------------------------------------------------
DROP POLICY IF EXISTS health_incidents_select_member ON public.health_incidents;
DROP POLICY IF EXISTS health_incidents_insert_member ON public.health_incidents;
DROP POLICY IF EXISTS health_incidents_owner_modify  ON public.health_incidents;
DROP POLICY IF EXISTS health_incidents_owner_delete  ON public.health_incidents;

CREATE POLICY health_incidents_select_member ON public.health_incidents
  FOR SELECT USING (
    public.is_tenant_member(tenant_id) AND (
      public.is_tenant_admin(tenant_id)
      OR public.is_farm_owner(farm_id)
      OR public.user_role_for_farm(farm_id) IN ('worker', 'vet')
    )
  );
CREATE POLICY health_incidents_insert_member ON public.health_incidents
  FOR INSERT WITH CHECK (
    public.is_tenant_member(tenant_id) AND (
      public.is_tenant_admin(tenant_id)
      OR public.is_farm_owner(farm_id)
      OR public.user_role_for_farm(farm_id) IN ('worker', 'vet')
    )
  );
CREATE POLICY health_incidents_modify ON public.health_incidents
  FOR UPDATE USING (
    public.is_tenant_member(tenant_id) AND (
      public.is_tenant_admin(tenant_id)
      OR public.is_farm_owner(farm_id)
      OR public.user_role_for_farm(farm_id) = 'vet'
    )
  )
  WITH CHECK (
    public.is_tenant_member(tenant_id) AND (
      public.is_tenant_admin(tenant_id)
      OR public.is_farm_owner(farm_id)
      OR public.user_role_for_farm(farm_id) = 'vet'
    )
  );
CREATE POLICY health_incidents_admin_delete ON public.health_incidents
  FOR DELETE USING (public.is_tenant_member(tenant_id) AND (public.is_tenant_admin(tenant_id) OR public.is_farm_owner(farm_id)));

-- ---------- vaccinations ----------------------------------------------------
DROP POLICY IF EXISTS vaccinations_select_member ON public.vaccinations;
DROP POLICY IF EXISTS vaccinations_owner_write   ON public.vaccinations;

CREATE POLICY vaccinations_select_member ON public.vaccinations
  FOR SELECT USING (public.is_tenant_member(tenant_id) AND (public.is_tenant_admin(tenant_id) OR public.is_farm_member(farm_id)));
CREATE POLICY vaccinations_admin_write ON public.vaccinations
  FOR ALL USING (public.is_tenant_member(tenant_id) AND (public.is_tenant_admin(tenant_id) OR public.is_farm_owner(farm_id)))
  WITH CHECK (public.is_tenant_member(tenant_id) AND (public.is_tenant_admin(tenant_id) OR public.is_farm_owner(farm_id)));

-- ---------- inventory_items -------------------------------------------------
DROP POLICY IF EXISTS inventory_items_select_member ON public.inventory_items;
DROP POLICY IF EXISTS inventory_items_owner_write   ON public.inventory_items;

CREATE POLICY inventory_items_select_member ON public.inventory_items
  FOR SELECT USING (
    public.is_tenant_member(tenant_id) AND (
      public.is_tenant_admin(tenant_id)
      OR public.is_farm_owner(farm_id)
      OR public.user_role_for_farm(farm_id) = 'worker'
    )
  );
CREATE POLICY inventory_items_admin_write ON public.inventory_items
  FOR ALL USING (public.is_tenant_member(tenant_id) AND (public.is_tenant_admin(tenant_id) OR public.is_farm_owner(farm_id)))
  WITH CHECK (public.is_tenant_member(tenant_id) AND (public.is_tenant_admin(tenant_id) OR public.is_farm_owner(farm_id)));

-- ---------- inventory_movements ---------------------------------------------
DROP POLICY IF EXISTS inventory_movements_select        ON public.inventory_movements;
DROP POLICY IF EXISTS inventory_movements_insert_member ON public.inventory_movements;
DROP POLICY IF EXISTS inventory_movements_owner_modify  ON public.inventory_movements;
DROP POLICY IF EXISTS inventory_movements_owner_delete  ON public.inventory_movements;

CREATE POLICY inventory_movements_select ON public.inventory_movements
  FOR SELECT USING (
    public.is_tenant_member(tenant_id) AND (
      public.is_tenant_admin(tenant_id)
      OR public.is_farm_owner(farm_id)
      OR public.user_role_for_farm(farm_id) = 'worker'
    )
  );
CREATE POLICY inventory_movements_insert_member ON public.inventory_movements
  FOR INSERT WITH CHECK (
    public.is_tenant_member(tenant_id) AND (
      public.is_tenant_admin(tenant_id)
      OR public.is_farm_owner(farm_id)
      OR public.user_role_for_farm(farm_id) = 'worker'
    )
  );
CREATE POLICY inventory_movements_admin_modify ON public.inventory_movements
  FOR UPDATE USING (public.is_tenant_member(tenant_id) AND (public.is_tenant_admin(tenant_id) OR public.is_farm_owner(farm_id)))
  WITH CHECK (public.is_tenant_member(tenant_id) AND (public.is_tenant_admin(tenant_id) OR public.is_farm_owner(farm_id)));
CREATE POLICY inventory_movements_admin_delete ON public.inventory_movements
  FOR DELETE USING (public.is_tenant_member(tenant_id) AND (public.is_tenant_admin(tenant_id) OR public.is_farm_owner(farm_id)));

-- ---------- financial_transactions (money roles) ----------------------------
DROP POLICY IF EXISTS financial_tx_owner_only ON public.financial_transactions;
CREATE POLICY financial_tx_money_only ON public.financial_transactions
  FOR ALL USING (public.is_tenant_member(tenant_id) AND (public.is_tenant_money(tenant_id) OR public.is_farm_owner(farm_id)))
  WITH CHECK (public.is_tenant_member(tenant_id) AND (public.is_tenant_money(tenant_id) OR public.is_farm_owner(farm_id)));

-- ---------- traceability_records --------------------------------------------
-- anon qr_token read UNCHANGED (public traceability page must keep working).
DROP POLICY IF EXISTS traceability_member_select ON public.traceability_records;
DROP POLICY IF EXISTS traceability_owner_write   ON public.traceability_records;
CREATE POLICY traceability_member_select ON public.traceability_records
  FOR SELECT TO authenticated USING (public.is_tenant_member(tenant_id) AND public.is_farm_member(farm_id));
CREATE POLICY traceability_admin_write ON public.traceability_records
  FOR ALL TO authenticated USING (public.is_tenant_member(tenant_id) AND (public.is_tenant_admin(tenant_id) OR public.is_farm_owner(farm_id)))
  WITH CHECK (public.is_tenant_member(tenant_id) AND (public.is_tenant_admin(tenant_id) OR public.is_farm_owner(farm_id)));

-- ---------- farm_users ------------------------------------------------------
DROP POLICY IF EXISTS farm_users_self_select ON public.farm_users;
DROP POLICY IF EXISTS farm_users_owner_write ON public.farm_users;
CREATE POLICY farm_users_self_select ON public.farm_users
  FOR SELECT USING (
    public.is_tenant_member(tenant_id) AND (user_id = auth.uid() OR public.is_tenant_admin(tenant_id) OR public.is_farm_owner(farm_id))
  );
CREATE POLICY farm_users_admin_write ON public.farm_users
  FOR ALL USING (public.is_tenant_member(tenant_id) AND (public.is_tenant_admin(tenant_id) OR public.is_farm_owner(farm_id)))
  WITH CHECK (public.is_tenant_member(tenant_id) AND (public.is_tenant_admin(tenant_id) OR public.is_farm_owner(farm_id)));

-- ---------- buyers (money roles) --------------------------------------------
DROP POLICY IF EXISTS buyers_owner_only ON public.buyers;
CREATE POLICY buyers_money_only ON public.buyers
  FOR ALL USING (public.is_tenant_member(tenant_id) AND (public.is_tenant_money(tenant_id) OR public.is_farm_owner(farm_id)))
  WITH CHECK (public.is_tenant_member(tenant_id) AND (public.is_tenant_money(tenant_id) OR public.is_farm_owner(farm_id)));

-- ---------- payment_reminders (money SELECT; service_role writes) -----------
DROP POLICY IF EXISTS payment_reminders_owner_select ON public.payment_reminders;
CREATE POLICY payment_reminders_money_select ON public.payment_reminders
  FOR SELECT USING (public.is_tenant_member(tenant_id) AND (public.is_tenant_money(tenant_id) OR public.is_farm_owner(farm_id)));

-- ---------- weather_data ----------------------------------------------------
DROP POLICY IF EXISTS weather_data_member_select ON public.weather_data;
CREATE POLICY weather_data_member_select ON public.weather_data
  FOR SELECT USING (public.is_tenant_member(tenant_id) AND public.is_farm_member(farm_id));

-- ---------- weather_alerts --------------------------------------------------
DROP POLICY IF EXISTS weather_alerts_member_select ON public.weather_alerts;
DROP POLICY IF EXISTS weather_alerts_member_ack    ON public.weather_alerts;
CREATE POLICY weather_alerts_member_select ON public.weather_alerts
  FOR SELECT USING (public.is_tenant_member(tenant_id) AND public.is_farm_member(farm_id));
CREATE POLICY weather_alerts_member_ack ON public.weather_alerts
  FOR UPDATE USING (public.is_tenant_member(tenant_id) AND public.is_farm_member(farm_id))
  WITH CHECK (public.is_tenant_member(tenant_id) AND public.is_farm_member(farm_id));

-- ---------- contract_cycles (money roles) -----------------------------------
DROP POLICY IF EXISTS contract_cycles_owner_only ON public.contract_cycles;
CREATE POLICY contract_cycles_money_only ON public.contract_cycles
  FOR ALL USING (public.is_tenant_member(tenant_id) AND (public.is_tenant_money(tenant_id) OR public.is_farm_owner(farm_id)))
  WITH CHECK (public.is_tenant_member(tenant_id) AND (public.is_tenant_money(tenant_id) OR public.is_farm_owner(farm_id)));

-- ---------- whatsapp_messages_log (money SELECT; service_role writes) -------
DROP POLICY IF EXISTS whatsapp_log_owner_select ON public.whatsapp_messages_log;
CREATE POLICY whatsapp_log_money_select ON public.whatsapp_messages_log
  FOR SELECT USING (public.is_tenant_member(tenant_id) AND (public.is_tenant_money(tenant_id) OR public.is_farm_owner(farm_id)));

-- NOTE: market_prices + integrators remain global (any-authenticated SELECT),
-- unchanged — they carry no tenant_id by design.

COMMIT;
