-- =============================================================================
-- 20260617000000_email_messages_log
-- =============================================================================
-- Audit log for ALL transactional emails sent via the centralized send-email
-- Edge Function (Layer 2 — Resend HTTP API). Mirrors whatsapp_messages_log:
-- service-role INSERT/UPDATE only, tenant "money" members SELECT, never deleted.
--
-- tenant_id is NULLABLE on purpose: some emails (welcome, security alerts) are
-- tenant-scoped, but auth-adjacent emails can fire before a tenant row is wired.
-- A NULL tenant_id row is visible ONLY to the service role (is_tenant_member(NULL)
-- is false), which is the correct privacy default.
--
-- NOTE (per repo convention): apply via Supabase MCP, NOT `supabase db push`.
-- The disk version here is for source-control ordering only.
-- =============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.email_messages_log (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id          UUID REFERENCES public.tenants(id) ON DELETE SET NULL,
  recipient_email    TEXT NOT NULL,
  email_type         TEXT NOT NULL
                       CHECK (email_type IN (
                         'verify_email', 'welcome', 'password_reset',
                         'password_changed', 'email_changed', 'login_alert',
                         'tenant_invitation', 'trial_started', 'trial_expiring',
                         'subscription_activated', 'subscription_expired',
                         'payment_success', 'payment_failed',
                         'security_alert', 'system_notification'
                       )),
  template_id        TEXT NOT NULL,
  subject            TEXT,
  payload_json       JSONB,
  resend_message_id  TEXT,
  status             TEXT NOT NULL DEFAULT 'sent'
                       CHECK (status IN ('queued', 'sent', 'delivered', 'bounced', 'complained', 'failed')),
  error_message      TEXT,
  attempts           INTEGER NOT NULL DEFAULT 1,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.email_messages_log IS
  'Audit trail of every transactional email sent via the send-email Edge Function. Service-role writes only; never deleted.';

CREATE INDEX IF NOT EXISTS idx_email_log_tenant
  ON public.email_messages_log(tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_email_log_recipient
  ON public.email_messages_log(lower(recipient_email), created_at DESC);
CREATE INDEX IF NOT EXISTS idx_email_log_resend_id
  ON public.email_messages_log(resend_message_id)
  WHERE resend_message_id IS NOT NULL;

-- updated_at trigger (reuse the project-wide helper installed in initial schema)
DROP TRIGGER IF EXISTS set_updated_at ON public.email_messages_log;
CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON public.email_messages_log
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- =============================================================================
-- RLS — mirror whatsapp_messages_log: money-tier members SELECT own tenant;
-- service role bypasses RLS for INSERT/UPDATE. No INSERT/UPDATE/DELETE policy
-- for end users => audit trail is immutable from the client side.
-- =============================================================================
ALTER TABLE public.email_messages_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS email_log_money_select ON public.email_messages_log;
CREATE POLICY email_log_money_select ON public.email_messages_log
  FOR SELECT USING (
    tenant_id IS NOT NULL
    AND public.is_tenant_member(tenant_id)
    AND public.is_tenant_money(tenant_id)
  );

COMMIT;
