-- =============================================================================
-- PoultryOS — SaaS Upgrade · Phase E: Product Analytics Funnel
-- File: 20260611000007_analytics_events.sql
-- =============================================================================
-- A lightweight, append-only event stream for the activation funnel:
--   signup_started → otp_verified → onboarding_completed →
--   first_shed_created → first_batch_created → first_daily_entry → plan_selected
--
-- Distinct from `auth_audit_events` (security trail). This is product
-- analytics: tenant-scoped where a tenant exists, user-scoped before one does
-- (e.g. signup_started fires pre-onboarding). Drop-off is measurable by
-- counting distinct user_id per event_name.
-- =============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.analytics_events (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID REFERENCES public.tenants(id) ON DELETE CASCADE,  -- NULL pre-onboarding
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  event_name  TEXT NOT NULL,
  properties  JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_analytics_events_event   ON public.analytics_events(event_name, created_at);
CREATE INDEX IF NOT EXISTS idx_analytics_events_tenant  ON public.analytics_events(tenant_id);
CREATE INDEX IF NOT EXISTS idx_analytics_events_user    ON public.analytics_events(user_id);

ALTER TABLE public.analytics_events ENABLE ROW LEVEL SECURITY;

-- Append-only: a user records their own events; reads are self or tenant-admin.
-- No UPDATE / DELETE policy → the stream is immutable to clients.
CREATE POLICY analytics_events_insert_self ON public.analytics_events
  FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY analytics_events_select_self_or_admin ON public.analytics_events
  FOR SELECT USING (
    user_id = auth.uid()
    OR (tenant_id IS NOT NULL AND public.is_tenant_admin(tenant_id))
  );

-- -----------------------------------------------------------------------------
-- track_event — SECURITY DEFINER helper so the client never has to resolve the
-- tenant itself. Resolves tenant from the caller's profile, inserts the row,
-- returns the id. Best-effort: the client calls it fire-and-forget.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.track_event(p_event_name TEXT, p_properties JSONB DEFAULT '{}'::jsonb)
  RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_uid    UUID := auth.uid();
  v_tenant UUID;
  v_id     UUID;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = '28000';
  END IF;
  IF COALESCE(trim(p_event_name), '') = '' THEN
    RAISE EXCEPTION 'event_name required' USING ERRCODE = '22023';
  END IF;

  SELECT tenant_id INTO v_tenant FROM public.profiles WHERE id = v_uid;

  INSERT INTO public.analytics_events (tenant_id, user_id, event_name, properties)
  VALUES (v_tenant, v_uid, p_event_name, COALESCE(p_properties, '{}'::jsonb))
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$fn$;

REVOKE ALL ON FUNCTION public.track_event(TEXT, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.track_event(TEXT, JSONB) TO authenticated;

COMMENT ON FUNCTION public.track_event(TEXT, JSONB) IS
  'Append a product-analytics event for the activation funnel. Resolves tenant from the caller profile (NULL pre-onboarding). SECURITY DEFINER; client calls fire-and-forget.';

COMMIT;
