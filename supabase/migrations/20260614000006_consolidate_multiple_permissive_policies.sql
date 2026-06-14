-- #7 Consolidate multiple permissive policies (planner optimization).
-- For 7 tables the `*_admin/owner_write FOR ALL` predicate is a proven SUBSET of
-- the table's SELECT-member predicate, so we split FOR ALL into explicit
-- INSERT/UPDATE/DELETE (write-only) policies — removing the redundant SELECT
-- participation while preserving writes. Reads remain fully covered by the
-- unchanged member SELECT policy.
-- For traceability_records the admin read path (tenant-admin not on the farm) is
-- NOT a subset, so its predicate is folded into the SELECT policy (exact union).
-- For tenants & tenant_subscriptions the two overlapping SELECT policies are
-- merged into one (exact union). All transformations are semantics-preserving.

-- batches
DROP POLICY batches_admin_write ON public.batches;
CREATE POLICY batches_admin_insert ON public.batches FOR INSERT WITH CHECK (is_tenant_member(tenant_id) AND (is_tenant_admin(tenant_id) OR is_farm_owner(farm_id)));
CREATE POLICY batches_admin_update ON public.batches FOR UPDATE USING (is_tenant_member(tenant_id) AND (is_tenant_admin(tenant_id) OR is_farm_owner(farm_id))) WITH CHECK (is_tenant_member(tenant_id) AND (is_tenant_admin(tenant_id) OR is_farm_owner(farm_id)));
CREATE POLICY batches_admin_delete ON public.batches FOR DELETE USING (is_tenant_member(tenant_id) AND (is_tenant_admin(tenant_id) OR is_farm_owner(farm_id)));

-- farm_users
DROP POLICY farm_users_admin_write ON public.farm_users;
CREATE POLICY farm_users_admin_insert ON public.farm_users FOR INSERT WITH CHECK (is_tenant_member(tenant_id) AND (is_tenant_admin(tenant_id) OR is_farm_owner(farm_id)));
CREATE POLICY farm_users_admin_update ON public.farm_users FOR UPDATE USING (is_tenant_member(tenant_id) AND (is_tenant_admin(tenant_id) OR is_farm_owner(farm_id))) WITH CHECK (is_tenant_member(tenant_id) AND (is_tenant_admin(tenant_id) OR is_farm_owner(farm_id)));
CREATE POLICY farm_users_admin_delete ON public.farm_users FOR DELETE USING (is_tenant_member(tenant_id) AND (is_tenant_admin(tenant_id) OR is_farm_owner(farm_id)));

-- inventory_items
DROP POLICY inventory_items_admin_write ON public.inventory_items;
CREATE POLICY inventory_items_admin_insert ON public.inventory_items FOR INSERT WITH CHECK (is_tenant_member(tenant_id) AND (is_tenant_admin(tenant_id) OR is_farm_owner(farm_id)));
CREATE POLICY inventory_items_admin_update ON public.inventory_items FOR UPDATE USING (is_tenant_member(tenant_id) AND (is_tenant_admin(tenant_id) OR is_farm_owner(farm_id))) WITH CHECK (is_tenant_member(tenant_id) AND (is_tenant_admin(tenant_id) OR is_farm_owner(farm_id)));
CREATE POLICY inventory_items_admin_delete ON public.inventory_items FOR DELETE USING (is_tenant_member(tenant_id) AND (is_tenant_admin(tenant_id) OR is_farm_owner(farm_id)));

-- sheds
DROP POLICY sheds_admin_write ON public.sheds;
CREATE POLICY sheds_admin_insert ON public.sheds FOR INSERT WITH CHECK (is_tenant_member(tenant_id) AND (is_tenant_admin(tenant_id) OR is_farm_owner(farm_id)));
CREATE POLICY sheds_admin_update ON public.sheds FOR UPDATE USING (is_tenant_member(tenant_id) AND (is_tenant_admin(tenant_id) OR is_farm_owner(farm_id))) WITH CHECK (is_tenant_member(tenant_id) AND (is_tenant_admin(tenant_id) OR is_farm_owner(farm_id)));
CREATE POLICY sheds_admin_delete ON public.sheds FOR DELETE USING (is_tenant_member(tenant_id) AND (is_tenant_admin(tenant_id) OR is_farm_owner(farm_id)));

-- vaccinations
DROP POLICY vaccinations_admin_write ON public.vaccinations;
CREATE POLICY vaccinations_admin_insert ON public.vaccinations FOR INSERT WITH CHECK (is_tenant_member(tenant_id) AND (is_tenant_admin(tenant_id) OR is_farm_owner(farm_id)));
CREATE POLICY vaccinations_admin_update ON public.vaccinations FOR UPDATE USING (is_tenant_member(tenant_id) AND (is_tenant_admin(tenant_id) OR is_farm_owner(farm_id))) WITH CHECK (is_tenant_member(tenant_id) AND (is_tenant_admin(tenant_id) OR is_farm_owner(farm_id)));
CREATE POLICY vaccinations_admin_delete ON public.vaccinations FOR DELETE USING (is_tenant_member(tenant_id) AND (is_tenant_admin(tenant_id) OR is_farm_owner(farm_id)));

-- billing_profiles (owner)
DROP POLICY billing_profiles_owner_write ON public.billing_profiles;
CREATE POLICY billing_profiles_owner_insert ON public.billing_profiles FOR INSERT WITH CHECK (is_tenant_owner(tenant_id));
CREATE POLICY billing_profiles_owner_update ON public.billing_profiles FOR UPDATE USING (is_tenant_owner(tenant_id)) WITH CHECK (is_tenant_owner(tenant_id));
CREATE POLICY billing_profiles_owner_delete ON public.billing_profiles FOR DELETE USING (is_tenant_owner(tenant_id));

-- tenant_users (admin)
DROP POLICY tenant_users_admin_write ON public.tenant_users;
CREATE POLICY tenant_users_admin_insert ON public.tenant_users FOR INSERT WITH CHECK (is_tenant_admin(tenant_id));
CREATE POLICY tenant_users_admin_update ON public.tenant_users FOR UPDATE USING (is_tenant_admin(tenant_id)) WITH CHECK (is_tenant_admin(tenant_id));
CREATE POLICY tenant_users_admin_delete ON public.tenant_users FOR DELETE USING (is_tenant_admin(tenant_id));

-- traceability_records: write-only admin + folded SELECT (preserves tenant-admin read)
DROP POLICY traceability_admin_write ON public.traceability_records;
CREATE POLICY traceability_admin_insert ON public.traceability_records FOR INSERT TO authenticated WITH CHECK (is_tenant_member(tenant_id) AND (is_tenant_admin(tenant_id) OR is_farm_owner(farm_id)));
CREATE POLICY traceability_admin_update ON public.traceability_records FOR UPDATE TO authenticated USING (is_tenant_member(tenant_id) AND (is_tenant_admin(tenant_id) OR is_farm_owner(farm_id))) WITH CHECK (is_tenant_member(tenant_id) AND (is_tenant_admin(tenant_id) OR is_farm_owner(farm_id)));
CREATE POLICY traceability_admin_delete ON public.traceability_records FOR DELETE TO authenticated USING (is_tenant_member(tenant_id) AND (is_tenant_admin(tenant_id) OR is_farm_owner(farm_id)));
DROP POLICY traceability_member_select ON public.traceability_records;
CREATE POLICY traceability_member_select ON public.traceability_records FOR SELECT TO authenticated USING (is_tenant_member(tenant_id) AND (is_tenant_admin(tenant_id) OR is_farm_member(farm_id)));

-- tenants: merge two SELECTs into one
DROP POLICY tenants_member_select ON public.tenants;
DROP POLICY tenants_owner_select ON public.tenants;
CREATE POLICY tenants_member_select ON public.tenants FOR SELECT USING (is_tenant_member(id) OR (owner_id = (SELECT auth.uid())));

-- tenant_subscriptions: merge two SELECTs into one
DROP POLICY tenant_subscriptions_member_select ON public.tenant_subscriptions;
DROP POLICY tenant_subscriptions_owner_select ON public.tenant_subscriptions;
CREATE POLICY tenant_subscriptions_member_select ON public.tenant_subscriptions FOR SELECT USING (is_tenant_member(tenant_id) OR EXISTS (SELECT 1 FROM public.tenants t WHERE t.id = tenant_subscriptions.tenant_id AND t.owner_id = (SELECT auth.uid())));
