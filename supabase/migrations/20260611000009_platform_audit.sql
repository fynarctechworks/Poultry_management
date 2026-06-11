-- =============================================================================
-- PoultryOS — SaaS Control Center · Increment 1 / M2: Immutable Platform Audit
-- File: 20260611000009_platform_audit.sql
-- =============================================================================
-- Every operator action in the Control Center writes an audit row. The log is
-- APPEND-ONLY and IMMUTABLE:
--   * service-role INSERT only (no INSERT policy for normal roles)
--   * NO update/delete policy, AND a trigger that hard-rejects UPDATE/DELETE
--     even for the service role / table owner (defence in depth)
--   * reads gated to operators holding 'audit:read'
-- This is the tamper-evident trail required by the brief's Audit + Security
-- phases. The guard in the web layer calls this on every mutating action.
-- =============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.platform_audit_events (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id          UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  actor_email       TEXT,                       -- snapshot, survives user deletion
  permission        TEXT,                       -- permission checked for this action
  action            TEXT NOT NULL,              -- e.g. 'tenant.suspend', 'plan.create'
  target_type       TEXT,                       -- 'tenant' | 'plan' | 'admin' | ...
  target_id         UUID,
  target_tenant_id  UUID REFERENCES public.tenants(id) ON DELETE SET NULL,
  before_json       JSONB,
  after_json        JSONB,
  reason            TEXT,                        -- required for destructive actions
  ip                TEXT,
  user_agent        TEXT,
  status            TEXT NOT NULL DEFAULT 'success' CHECK (status IN ('success','failure')),
  error             TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_platform_audit_actor   ON public.platform_audit_events(actor_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_platform_audit_tenant  ON public.platform_audit_events(target_tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_platform_audit_action  ON public.platform_audit_events(action, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_platform_audit_created ON public.platform_audit_events(created_at DESC);

-- -----------------------------------------------------------------------------
-- Immutability: reject any UPDATE or DELETE, regardless of caller.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.tg_platform_audit_immutable()
RETURNS TRIGGER
LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
  RAISE EXCEPTION 'platform_audit_events is append-only and immutable (% rejected)', TG_OP;
END;
$$;

CREATE TRIGGER tg_platform_audit_no_update
  BEFORE UPDATE ON public.platform_audit_events
  FOR EACH ROW EXECUTE FUNCTION public.tg_platform_audit_immutable();

CREATE TRIGGER tg_platform_audit_no_delete
  BEFORE DELETE ON public.platform_audit_events
  FOR EACH ROW EXECUTE FUNCTION public.tg_platform_audit_immutable();

-- -----------------------------------------------------------------------------
-- RLS: read for 'audit:read'; no INSERT/UPDATE/DELETE policies → writes are
-- service-role only (the web guard) or via the SECURITY DEFINER helper below.
-- -----------------------------------------------------------------------------
ALTER TABLE public.platform_audit_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY platform_audit_read ON public.platform_audit_events
  FOR SELECT USING (public.platform_has_permission('audit:read'));

-- -----------------------------------------------------------------------------
-- log_platform_event — convenience writer used by SECURITY DEFINER RPCs so they
-- can record an audit row in the same transaction as the action they perform.
-- (The web server-action guard inserts directly via the service role.)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.log_platform_event(
  p_action          TEXT,
  p_permission      TEXT    DEFAULT NULL,
  p_target_type     TEXT    DEFAULT NULL,
  p_target_id       UUID    DEFAULT NULL,
  p_target_tenant   UUID    DEFAULT NULL,
  p_before          JSONB   DEFAULT NULL,
  p_after           JSONB   DEFAULT NULL,
  p_reason          TEXT    DEFAULT NULL,
  p_status          TEXT    DEFAULT 'success',
  p_error           TEXT    DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_id    UUID;
  v_email TEXT;
BEGIN
  SELECT email INTO v_email FROM auth.users WHERE id = auth.uid();
  INSERT INTO public.platform_audit_events (
    actor_id, actor_email, permission, action, target_type, target_id,
    target_tenant_id, before_json, after_json, reason, status, error)
  VALUES (
    auth.uid(), v_email, p_permission, p_action, p_target_type, p_target_id,
    p_target_tenant, p_before, p_after, p_reason, p_status, p_error)
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.log_platform_event(TEXT,TEXT,TEXT,UUID,UUID,JSONB,JSONB,TEXT,TEXT,TEXT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.log_platform_event(TEXT,TEXT,TEXT,UUID,UUID,JSONB,JSONB,TEXT,TEXT,TEXT) FROM anon;

COMMENT ON TABLE public.platform_audit_events IS 'Append-only, immutable audit trail of every Control Center operator action. UPDATE/DELETE hard-rejected by trigger. Read requires audit:read.';

COMMIT;
