-- =============================================================================
-- PoultryOS — SaaS Control Center · Increment 1 / M1: Platform RBAC
-- File: 20260611000008_platform_rbac.sql
-- =============================================================================
-- Introduces the OPERATOR PLANE: an internal identity surface that sits ABOVE
-- the tenant model. Platform admins are NOT tenant_users — they are PoultryOS
-- staff who operate the whole SaaS. Access is database-driven (no hardcoded
-- permissions per the brief) and enforced at the app layer via a service-role
-- guard that re-checks `platform_has_permission()` and writes an audit row.
--
-- Tables are prefixed `platform_*` to stay visually distinct from tenant tables.
-- Writes go through the service role only (no INSERT/UPDATE/DELETE policies);
-- reads are gated to active platform admins.
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- 1. platform_roles — the 12 operator roles (DB-driven, not hardcoded).
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.platform_roles (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code         TEXT NOT NULL UNIQUE,
  name         TEXT NOT NULL,
  description  TEXT,
  is_system    BOOLEAN NOT NULL DEFAULT true,   -- system roles cannot be deleted
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TRIGGER tg_platform_roles_updated_at
  BEFORE UPDATE ON public.platform_roles
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- -----------------------------------------------------------------------------
-- 2. platform_permissions — resource:action catalog (e.g. 'tenant:suspend').
--    The wildcard '*' grants everything (held by super_admin).
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.platform_permissions (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code         TEXT NOT NULL UNIQUE,            -- 'resource:action' or '*'
  resource     TEXT NOT NULL,
  action       TEXT NOT NULL,
  description  TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- -----------------------------------------------------------------------------
-- 3. platform_role_permissions — many-to-many grant table.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.platform_role_permissions (
  role_id        UUID NOT NULL REFERENCES public.platform_roles(id) ON DELETE CASCADE,
  permission_id  UUID NOT NULL REFERENCES public.platform_permissions(id) ON DELETE CASCADE,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (role_id, permission_id)
);

-- -----------------------------------------------------------------------------
-- 4. platform_admins — operator membership. One row per staff user.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.platform_admins (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  role_id        UUID NOT NULL REFERENCES public.platform_roles(id) ON DELETE RESTRICT,
  status         TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended')),
  created_by     UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  last_active_at TIMESTAMPTZ,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_platform_admins_user ON public.platform_admins(user_id);
CREATE INDEX IF NOT EXISTS idx_platform_admins_role ON public.platform_admins(role_id);

CREATE TRIGGER tg_platform_admins_updated_at
  BEFORE UPDATE ON public.platform_admins
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- -----------------------------------------------------------------------------
-- 5. Helper functions (SECURITY DEFINER so RLS-gated callers can resolve access).
-- -----------------------------------------------------------------------------

-- True if the user is an active platform admin.
CREATE OR REPLACE FUNCTION public.is_platform_admin(p_uid UUID DEFAULT auth.uid())
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.platform_admins
     WHERE user_id = p_uid AND status = 'active'
  );
$$;

-- True if the active platform admin's role grants `p_perm` (or holds wildcard '*').
CREATE OR REPLACE FUNCTION public.platform_has_permission(p_perm TEXT, p_uid UUID DEFAULT auth.uid())
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT EXISTS (
    SELECT 1
      FROM public.platform_admins  pa
      JOIN public.platform_role_permissions rp ON rp.role_id = pa.role_id
      JOIN public.platform_permissions      p  ON p.id = rp.permission_id
     WHERE pa.user_id = p_uid
       AND pa.status = 'active'
       AND (p.code = '*' OR p.code = p_perm)
  );
$$;

-- -----------------------------------------------------------------------------
-- 6. RLS — reads for active platform admins; all writes via service role only.
-- -----------------------------------------------------------------------------
ALTER TABLE public.platform_roles            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_permissions      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_role_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_admins           ENABLE ROW LEVEL SECURITY;

-- Any active operator may read the RBAC catalog (needed to render the Access UI).
CREATE POLICY platform_roles_read            ON public.platform_roles            FOR SELECT USING (public.is_platform_admin());
CREATE POLICY platform_permissions_read      ON public.platform_permissions      FOR SELECT USING (public.is_platform_admin());
CREATE POLICY platform_role_permissions_read ON public.platform_role_permissions FOR SELECT USING (public.is_platform_admin());
-- Admins list is more sensitive: requires the access:read permission.
CREATE POLICY platform_admins_read           ON public.platform_admins           FOR SELECT USING (public.platform_has_permission('access:read'));

-- NOTE: no INSERT/UPDATE/DELETE policies anywhere → only the service role (used
-- by the Control Center server-action guard) can mutate these tables.

-- -----------------------------------------------------------------------------
-- 7. Seed roles, permission catalog, and grants.
-- -----------------------------------------------------------------------------
INSERT INTO public.platform_roles (code, name, description) VALUES
  ('super_admin',        'Super Admin',        'Unrestricted access to the entire Control Center.'),
  ('founder',            'Founder',            'Full visibility and management; same as super admin in practice.'),
  ('finance_admin',      'Finance Admin',      'Revenue, billing, discounts, invoices.'),
  ('support_manager',    'Support Manager',    'Owns support + call center; manages agents and escalations.'),
  ('support_agent',      'Support Agent',      'Handles tickets and calls.'),
  ('sales_manager',      'Sales Manager',      'Owns pipeline, discounts, promotions.'),
  ('sales_agent',        'Sales Agent',        'Works leads and applies approved discounts.'),
  ('customer_success',   'Customer Success',   'Customer health, churn prevention, follow-ups.'),
  ('operations_manager', 'Operations Manager', 'Tenant lifecycle, system monitoring, feature flags.'),
  ('developer',          'Developer',          'Error monitoring, feature flags, system health.'),
  ('qa',                 'QA',                 'Read access plus feature-flag toggling for testing.'),
  ('read_only',          'Read Only',          'Read-only access across all modules.')
ON CONFLICT (code) DO NOTHING;

INSERT INTO public.platform_permissions (code, resource, action, description) VALUES
  ('*',                 '*',            '*',         'Wildcard — grants everything.'),
  ('tenant:read',       'tenant',       'read',      'View tenants and their details.'),
  ('tenant:manage',     'tenant',       'manage',    'Activate/suspend/delete/restore/change-plan tenants.'),
  ('tenant:impersonate','tenant',       'impersonate','Impersonate a tenant (audited).'),
  ('subscription:read', 'subscription', 'read',      'View plans and subscriptions.'),
  ('subscription:manage','subscription','manage',    'Create/edit/archive plans.'),
  ('discount:read',     'discount',     'read',      'View discounts and coupons.'),
  ('discount:manage',   'discount',     'manage',    'Create/edit/apply discounts and coupons.'),
  ('revenue:read',      'revenue',      'read',      'View revenue dashboards and forecasts.'),
  ('support:read',      'support',      'read',      'View support tickets and calls.'),
  ('support:manage',    'support',      'manage',    'Work, resolve and escalate tickets/calls.'),
  ('success:read',      'success',      'read',      'View customer health and churn risk.'),
  ('success:manage',    'success',      'manage',    'Manage follow-ups and health interventions.'),
  ('error:read',        'error',        'read',      'View error monitoring.'),
  ('error:manage',      'error',        'manage',    'Assign/resolve/ignore errors.'),
  ('audit:read',        'audit',        'read',      'View the platform audit log.'),
  ('access:read',       'access',       'read',      'View platform roles, permissions and admins.'),
  ('access:manage',     'access',       'manage',    'Manage platform roles, permissions and admins.'),
  ('flag:read',         'flag',         'read',      'View feature flags.'),
  ('flag:manage',       'flag',         'manage',    'Toggle and roll out feature flags.'),
  ('system:read',       'system',       'read',      'View system health and monitoring.')
ON CONFLICT (code) DO NOTHING;

-- Grants. super_admin + founder hold the wildcard. Others get scoped sets.
WITH r AS (SELECT id, code FROM public.platform_roles),
     p AS (SELECT id, code, action FROM public.platform_permissions)
INSERT INTO public.platform_role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM r JOIN p ON TRUE WHERE (
  -- Wildcard roles
  (r.code IN ('super_admin','founder') AND p.code = '*') OR
  -- Read Only: every *:read permission
  (r.code = 'read_only' AND p.action = 'read') OR
  -- Finance
  (r.code = 'finance_admin' AND p.code IN ('tenant:read','subscription:read','subscription:manage','discount:read','discount:manage','revenue:read','audit:read')) OR
  -- Support manager / agent
  (r.code = 'support_manager' AND p.code IN ('tenant:read','support:read','support:manage','success:read','audit:read')) OR
  (r.code = 'support_agent'   AND p.code IN ('tenant:read','support:read','support:manage')) OR
  -- Sales manager / agent
  (r.code = 'sales_manager' AND p.code IN ('tenant:read','subscription:read','discount:read','discount:manage','revenue:read')) OR
  (r.code = 'sales_agent'   AND p.code IN ('tenant:read','subscription:read','discount:read')) OR
  -- Customer success
  (r.code = 'customer_success' AND p.code IN ('tenant:read','success:read','success:manage','support:read','revenue:read')) OR
  -- Operations manager
  (r.code = 'operations_manager' AND p.code IN ('tenant:read','tenant:manage','flag:read','flag:manage','system:read','error:read','audit:read')) OR
  -- Developer
  (r.code = 'developer' AND p.code IN ('error:read','error:manage','flag:read','flag:manage','system:read','tenant:read')) OR
  -- QA
  (r.code = 'qa' AND (p.action = 'read' OR p.code = 'flag:manage'))
)
ON CONFLICT DO NOTHING;

-- -----------------------------------------------------------------------------
-- 8. Cold-start bootstrap. Promotes the FIRST super admin safely: only succeeds
--    while NO platform_admins exist (so it cannot be used to escalate later).
--    Run once after deploy:  SELECT public.platform_bootstrap_super_admin('you@poultryos.app');
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.platform_bootstrap_super_admin(p_email TEXT)
RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_user_id UUID;
  v_role_id UUID;
  v_admin_id UUID;
BEGIN
  IF EXISTS (SELECT 1 FROM public.platform_admins) THEN
    RAISE EXCEPTION 'platform_admins already seeded; use the access-control UI to add admins';
  END IF;

  SELECT id INTO v_user_id FROM auth.users WHERE lower(email) = lower(p_email) LIMIT 1;
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'no auth user with email %', p_email;
  END IF;

  SELECT id INTO v_role_id FROM public.platform_roles WHERE code = 'super_admin';

  INSERT INTO public.platform_admins (user_id, role_id, created_by)
  VALUES (v_user_id, v_role_id, v_user_id)
  RETURNING id INTO v_admin_id;

  RETURN v_admin_id;
END;
$$;

-- Only the service role may run the bootstrap (revoke from public/authenticated/anon).
REVOKE EXECUTE ON FUNCTION public.platform_bootstrap_super_admin(TEXT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.platform_bootstrap_super_admin(TEXT) FROM anon, authenticated;

COMMENT ON FUNCTION public.is_platform_admin(UUID) IS 'True if the user is an active PoultryOS platform (Control Center) operator. SECURITY DEFINER.';
COMMENT ON FUNCTION public.platform_has_permission(TEXT, UUID) IS 'True if the active operator''s role grants the resource:action permission (or holds the ''*'' wildcard). DB-driven RBAC; no hardcoded permissions.';
COMMENT ON FUNCTION public.platform_bootstrap_super_admin(TEXT) IS 'One-time cold-start: promotes the first super admin by email. Refuses to run once any platform_admins exist. Service-role only.';

COMMIT;
