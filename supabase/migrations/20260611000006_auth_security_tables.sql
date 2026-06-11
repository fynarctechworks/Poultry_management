-- =============================================================================
-- PoultryOS — SaaS Upgrade · Phase C: Auth Security (devices, audit, 2FA prefs)
-- File: 20260611000006_auth_security_tables.sql
-- =============================================================================
-- Supabase Auth owns sessions + JWTs + phone-OTP + TOTP enrolment. This adds the
-- metadata it does NOT track, surfaced in the Security Settings screens:
--   * trusted_devices  — "remember this device 30 days" + device list
--   * auth_audit_events — login history, IP, security-relevant actions (audit)
--   * profiles 2FA preference columns
-- All rows are tenant-scoped where a tenant exists; user-scoped otherwise.
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- 1. 2FA preference on profiles (Supabase MFA factors hold the secrets; this is
--    just the user's chosen method + remember-device window).
-- -----------------------------------------------------------------------------
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS two_factor_method TEXT NOT NULL DEFAULT 'disabled'
    CHECK (two_factor_method IN ('disabled','sms','email','totp')),
  ADD COLUMN IF NOT EXISTS phone_verified_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS email_verified_at TIMESTAMPTZ;

-- -----------------------------------------------------------------------------
-- 2. trusted_devices — one row per remembered device per user.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.trusted_devices (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  device_hash    TEXT NOT NULL,            -- client-generated stable device fingerprint
  device_name    TEXT,                     -- "Redmi 9A", "Chrome on Windows"
  last_ip        TEXT,
  last_seen_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  trusted_until  TIMESTAMPTZ NOT NULL,     -- 30 days from trust
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, device_hash)
);

CREATE INDEX IF NOT EXISTS idx_trusted_devices_user ON public.trusted_devices(user_id);

CREATE TRIGGER tg_trusted_devices_updated_at
  BEFORE UPDATE ON public.trusted_devices
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

ALTER TABLE public.trusted_devices ENABLE ROW LEVEL SECURITY;
CREATE POLICY trusted_devices_self ON public.trusted_devices
  FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- -----------------------------------------------------------------------------
-- 3. auth_audit_events — append-only security/login history.
--    Tenant-scoped when known; user always set. Never updated/deleted by users.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.auth_audit_events (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  tenant_id     UUID REFERENCES public.tenants(id) ON DELETE SET NULL,
  event_type    TEXT NOT NULL
                  CHECK (event_type IN (
                    'login_success','login_failed','logout','otp_sent','otp_verified',
                    'otp_failed','2fa_enabled','2fa_disabled','2fa_challenge',
                    'password_changed','device_trusted','device_revoked',
                    'session_revoked','email_verified','phone_verified')),
  ip_address    TEXT,
  user_agent    TEXT,
  device_hash   TEXT,
  metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_auth_audit_user ON public.auth_audit_events(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_auth_audit_tenant ON public.auth_audit_events(tenant_id, created_at DESC);

ALTER TABLE public.auth_audit_events ENABLE ROW LEVEL SECURITY;
-- A user sees their own events; tenant admins see all events in their tenant.
CREATE POLICY auth_audit_self_select ON public.auth_audit_events
  FOR SELECT USING (
    user_id = auth.uid()
    OR (tenant_id IS NOT NULL AND public.is_tenant_admin(tenant_id))
  );
-- Inserts: a user may log their own events (client records login/logout); the
-- service role records the rest. No UPDATE/DELETE policy → append-only.
CREATE POLICY auth_audit_self_insert ON public.auth_audit_events
  FOR INSERT WITH CHECK (user_id = auth.uid());

-- -----------------------------------------------------------------------------
-- 4. log_auth_event — SECURITY DEFINER helper so the client can record an audit
--    row with the tenant auto-resolved, without needing tenant_id locally.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.log_auth_event(
  p_event_type TEXT,
  p_ip         TEXT DEFAULT NULL,
  p_user_agent TEXT DEFAULT NULL,
  p_device_hash TEXT DEFAULT NULL,
  p_metadata   JSONB DEFAULT '{}'::jsonb
) RETURNS UUID
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_uid    UUID := auth.uid();
  v_tenant UUID;
  v_id     UUID;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = '28000';
  END IF;
  SELECT tenant_id INTO v_tenant FROM public.profiles WHERE id = v_uid;
  INSERT INTO public.auth_audit_events
    (user_id, tenant_id, event_type, ip_address, user_agent, device_hash, metadata_json)
  VALUES (v_uid, v_tenant, p_event_type, p_ip, p_user_agent, p_device_hash, COALESCE(p_metadata, '{}'::jsonb))
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$fn$;

REVOKE ALL ON FUNCTION public.log_auth_event(TEXT,TEXT,TEXT,TEXT,JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.log_auth_event(TEXT,TEXT,TEXT,TEXT,JSONB) TO authenticated, service_role;

COMMENT ON FUNCTION public.log_auth_event IS
  'Append a row to auth_audit_events with tenant auto-resolved from the caller''s profile. Used by the client to record login/logout/2fa events.';

COMMIT;
