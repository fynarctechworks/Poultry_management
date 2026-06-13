-- =============================================================================
-- PERF-2 + PERF-3 (round 2): covering FK indexes + RLS initplan wrapping.
-- =============================================================================
-- Pure performance, no behavior change. Targets the tenant/billing/Control-Center
-- tables added AFTER 20260522000005_perf_fk_indexes_and_rls_initplan (which fixed
-- the v1 set). Sources: live performance advisor 2026-06-13.
--
-- PERF-2: 26 foreign keys had no covering index → seq-scan penalty on joins and
--   ON DELETE cascade checks at scale. Plain CREATE INDEX (not CONCURRENTLY)
--   because apply_migration runs in a transaction; tables are near-empty pre-launch.
--   On a populated production DB, prefer CREATE INDEX CONCURRENTLY run outside a tx.
--
-- PERF-3: 16 RLS policies re-evaluated auth.uid() per row. Wrapping it as
--   (select auth.uid()) lets the planner hoist it to a one-time InitPlan. Only
--   auth.uid() is wrapped; STABLE helper calls (is_tenant_admin, etc.) are left
--   as-is (not flagged). Logic is byte-for-byte equivalent.
-- =============================================================================

-- ---- PERF-2: covering indexes on unindexed foreign keys ----
CREATE INDEX IF NOT EXISTS idx_call_notes_author_id              ON public.call_notes(author_id);
CREATE INDEX IF NOT EXISTS idx_call_notes_call_id                ON public.call_notes(call_id);
CREATE INDEX IF NOT EXISTS idx_coupon_redemptions_discount_id    ON public.coupon_redemptions(discount_id);
CREATE INDEX IF NOT EXISTS idx_customer_followups_assigned_to     ON public.customer_followups(assigned_to);
CREATE INDEX IF NOT EXISTS idx_customer_interactions_actor_id     ON public.customer_interactions(actor_id);
CREATE INDEX IF NOT EXISTS idx_discounts_created_by              ON public.discounts(created_by);
CREATE INDEX IF NOT EXISTS idx_error_comments_author_id          ON public.error_comments(author_id);
CREATE INDEX IF NOT EXISTS idx_invoices_plan_id                  ON public.invoices(plan_id);
CREATE INDEX IF NOT EXISTS idx_invoices_subscription_id          ON public.invoices(subscription_id);
CREATE INDEX IF NOT EXISTS idx_payment_attempts_plan_id          ON public.payment_attempts(plan_id);
CREATE INDEX IF NOT EXISTS idx_payment_attempts_subscription_id  ON public.payment_attempts(subscription_id);
CREATE INDEX IF NOT EXISTS idx_plan_feature_flags_plan_id        ON public.plan_feature_flags(plan_id);
CREATE INDEX IF NOT EXISTS idx_plan_feature_mapping_feature_id   ON public.plan_feature_mapping(feature_id);
CREATE INDEX IF NOT EXISTS idx_plan_history_changed_by           ON public.plan_history(changed_by);
CREATE INDEX IF NOT EXISTS idx_platform_admins_created_by        ON public.platform_admins(created_by);
CREATE INDEX IF NOT EXISTS idx_platform_errors_assigned_to       ON public.platform_errors(assigned_to);
CREATE INDEX IF NOT EXISTS idx_platform_errors_user_id           ON public.platform_errors(user_id);
CREATE INDEX IF NOT EXISTS idx_platform_role_permissions_perm_id ON public.platform_role_permissions(permission_id);
CREATE INDEX IF NOT EXISTS idx_profiles_tenant_id               ON public.profiles(tenant_id);
CREATE INDEX IF NOT EXISTS idx_promotions_discount_id            ON public.promotions(discount_id);
CREATE INDEX IF NOT EXISTS idx_subscription_history_subscription_id ON public.subscription_history(subscription_id);
CREATE INDEX IF NOT EXISTS idx_support_calls_assigned_to         ON public.support_calls(assigned_to);
CREATE INDEX IF NOT EXISTS idx_support_tickets_created_by        ON public.support_tickets(created_by);
CREATE INDEX IF NOT EXISTS idx_support_tickets_requester_user_id ON public.support_tickets(requester_user_id);
CREATE INDEX IF NOT EXISTS idx_tenant_feature_flags_tenant_id    ON public.tenant_feature_flags(tenant_id);
CREATE INDEX IF NOT EXISTS idx_tenant_subscriptions_plan_id      ON public.tenant_subscriptions(plan_id);

-- ---- PERF-3: hoist auth.uid() in RLS policies to InitPlan ----
ALTER POLICY analytics_events_insert_self ON public.analytics_events
  WITH CHECK (user_id = (select auth.uid()));
ALTER POLICY analytics_events_select_self_or_admin ON public.analytics_events
  USING ((user_id = (select auth.uid())) OR ((tenant_id IS NOT NULL) AND is_tenant_admin(tenant_id)));

ALTER POLICY auth_audit_self_insert ON public.auth_audit_events
  WITH CHECK (user_id = (select auth.uid()));
ALTER POLICY auth_audit_self_select ON public.auth_audit_events
  USING ((user_id = (select auth.uid())) OR ((tenant_id IS NOT NULL) AND is_tenant_admin(tenant_id)));

ALTER POLICY farm_users_self_select ON public.farm_users
  USING (is_tenant_member(tenant_id) AND ((user_id = (select auth.uid())) OR is_tenant_admin(tenant_id) OR is_farm_owner(farm_id)));

ALTER POLICY farms_delete_admin ON public.farms
  USING (is_tenant_admin(tenant_id) OR (owner_id = (select auth.uid())));
ALTER POLICY farms_insert_admin ON public.farms
  WITH CHECK (is_tenant_admin(tenant_id) AND (owner_id = (select auth.uid())));
ALTER POLICY farms_update_admin ON public.farms
  USING (is_tenant_admin(tenant_id) OR (owner_id = (select auth.uid())))
  WITH CHECK (is_tenant_admin(tenant_id) OR (owner_id = (select auth.uid())));

ALTER POLICY onboarding_progress_self ON public.onboarding_progress
  USING (user_id = (select auth.uid()))
  WITH CHECK (user_id = (select auth.uid()));

ALTER POLICY tenant_subscriptions_owner_select ON public.tenant_subscriptions
  USING (EXISTS (SELECT 1 FROM tenants t WHERE t.id = tenant_subscriptions.tenant_id AND t.owner_id = (select auth.uid())));
ALTER POLICY tenant_subscriptions_owner_update ON public.tenant_subscriptions
  USING (EXISTS (SELECT 1 FROM tenants t WHERE t.id = tenant_subscriptions.tenant_id AND t.owner_id = (select auth.uid())))
  WITH CHECK (EXISTS (SELECT 1 FROM tenants t WHERE t.id = tenant_subscriptions.tenant_id AND t.owner_id = (select auth.uid())));

ALTER POLICY tenant_users_self_or_admin_select ON public.tenant_users
  USING ((user_id = (select auth.uid())) OR is_tenant_admin(tenant_id));

ALTER POLICY tenants_owner_insert ON public.tenants
  WITH CHECK (owner_id = (select auth.uid()));
ALTER POLICY tenants_owner_select ON public.tenants
  USING (owner_id = (select auth.uid()));
ALTER POLICY tenants_owner_update ON public.tenants
  USING (owner_id = (select auth.uid()))
  WITH CHECK (owner_id = (select auth.uid()));

ALTER POLICY trusted_devices_self ON public.trusted_devices
  USING (user_id = (select auth.uid()))
  WITH CHECK (user_id = (select auth.uid()));
