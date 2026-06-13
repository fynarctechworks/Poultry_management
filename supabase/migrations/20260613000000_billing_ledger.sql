-- =============================================================================
-- PoultryOS — Enterprise Billing · Phase A1: Money Ledger
-- File: 20260613000000_billing_ledger.sql
-- =============================================================================
-- The existing SaaS layer computes revenue LIVE from tenant_subscriptions but
-- keeps no record of actual money movement. This migration adds the durable
-- ledger that real invoicing/billing needs:
--
--   billing_profiles         one editable billing identity per tenant (on invoices)
--   invoice_counters         atomic per-year invoice-number sequence
--   invoices / invoice_items the issued documents (frozen billing snapshot + GST)
--   payments                 captured / failed / refunded Razorpay payments
--   payment_attempts         every checkout attempt incl. failures/abandons
--   subscription_history     append-only state-transition log
--   subscription_reminders   audit of renewal reminders sent (7/3/1/expiry)
--   razorpay_webhook_events  idempotency guard for the webhook
--
-- Plus the private `invoices` storage bucket for generated PDFs, and the
-- billing:read / billing:manage Control Center permissions.
--
-- All money tables are tenant-scoped: owners read their own; writes are
-- service-role only (the webhook / edge functions are the system of record).
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- 0. Owner helper — DRY the "is this user the billing owner of the tenant"
--    check reused across every money table policy.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_tenant_owner(p_tenant_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.tenants t
     WHERE t.id = p_tenant_id AND t.owner_id = auth.uid()
  );
$$;
REVOKE ALL ON FUNCTION public.is_tenant_owner(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_tenant_owner(UUID) TO authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 1. billing_profiles — one per tenant. Editable; snapshotted onto each invoice
--    at issue time so a later edit never rewrites historical documents.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.billing_profiles (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id            UUID NOT NULL UNIQUE REFERENCES public.tenants(id) ON DELETE CASCADE,
  billing_name         TEXT NOT NULL,
  company_name         TEXT,
  gstin                TEXT,
  email                TEXT NOT NULL,
  phone                TEXT,
  address_line1        TEXT,
  address_line2        TEXT,
  city                 TEXT,
  state                TEXT,
  country              TEXT NOT NULL DEFAULT 'IN',
  postal_code          TEXT,
  razorpay_customer_id TEXT,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_billing_profiles_tenant ON public.billing_profiles(tenant_id);
CREATE TRIGGER tg_billing_profiles_updated_at
  BEFORE UPDATE ON public.billing_profiles
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- -----------------------------------------------------------------------------
-- 2. invoice_counters — atomic, gap-free-per-year invoice numbering.
--    next_invoice_number() returns 'INV-YYYY-NNNNNN'.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.invoice_counters (
  year      INTEGER PRIMARY KEY,
  last_seq  INTEGER NOT NULL DEFAULT 0
);

CREATE OR REPLACE FUNCTION public.next_invoice_number()
RETURNS TEXT LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_year INTEGER := EXTRACT(YEAR FROM now())::INTEGER;
  v_seq  INTEGER;
BEGIN
  INSERT INTO public.invoice_counters (year, last_seq)
  VALUES (v_year, 1)
  ON CONFLICT (year) DO UPDATE SET last_seq = public.invoice_counters.last_seq + 1
  RETURNING last_seq INTO v_seq;
  RETURN 'INV-' || v_year::TEXT || '-' || lpad(v_seq::TEXT, 6, '0');
END;
$$;
REVOKE ALL ON FUNCTION public.next_invoice_number() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.next_invoice_number() TO service_role;

-- -----------------------------------------------------------------------------
-- 3. invoices — the issued document. Money in paise-free INR NUMERIC(12,2).
--    billing_snapshot_json freezes the billing_profile as it was at issue.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.invoices (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  subscription_id       UUID REFERENCES public.tenant_subscriptions(id) ON DELETE SET NULL,
  plan_id               UUID REFERENCES public.subscription_plans(id) ON DELETE SET NULL,
  invoice_number        TEXT NOT NULL UNIQUE,
  status                TEXT NOT NULL DEFAULT 'issued'
                          CHECK (status IN ('draft','issued','paid','failed','void','refunded')),
  billing_cycle         TEXT NOT NULL DEFAULT 'monthly'
                          CHECK (billing_cycle IN ('monthly','yearly')),
  currency              TEXT NOT NULL DEFAULT 'INR',
  subtotal_inr          NUMERIC(12,2) NOT NULL DEFAULT 0,
  discount_inr          NUMERIC(12,2) NOT NULL DEFAULT 0,
  tax_rate_pct          NUMERIC(5,2)  NOT NULL DEFAULT 18.00,   -- GST
  tax_inr               NUMERIC(12,2) NOT NULL DEFAULT 0,
  total_inr             NUMERIC(12,2) NOT NULL DEFAULT 0,
  period_start          TIMESTAMPTZ,
  period_end            TIMESTAMPTZ,
  issued_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  due_at                TIMESTAMPTZ,
  paid_at               TIMESTAMPTZ,
  razorpay_invoice_id   TEXT,
  razorpay_order_id     TEXT,
  razorpay_payment_id   TEXT,
  razorpay_subscription_id TEXT,
  billing_snapshot_json JSONB,
  pdf_path              TEXT,                      -- storage object path in 'invoices' bucket
  notes                 TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_invoices_tenant   ON public.invoices(tenant_id, issued_at DESC);
CREATE INDEX IF NOT EXISTS idx_invoices_status   ON public.invoices(status);
CREATE INDEX IF NOT EXISTS idx_invoices_rzp_sub  ON public.invoices(razorpay_subscription_id);
CREATE TRIGGER tg_invoices_updated_at
  BEFORE UPDATE ON public.invoices
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

CREATE TABLE IF NOT EXISTS public.invoice_items (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id    UUID NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
  description   TEXT NOT NULL,
  quantity      NUMERIC(10,2) NOT NULL DEFAULT 1,
  unit_price_inr NUMERIC(12,2) NOT NULL DEFAULT 0,
  amount_inr    NUMERIC(12,2) NOT NULL DEFAULT 0,
  sort_order    SMALLINT NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_invoice_items_invoice ON public.invoice_items(invoice_id, sort_order);

-- -----------------------------------------------------------------------------
-- 4. payments — captured/failed/refunded Razorpay payments tied to an invoice.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.payments (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id                UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  invoice_id               UUID REFERENCES public.invoices(id) ON DELETE SET NULL,
  razorpay_payment_id      TEXT UNIQUE,
  razorpay_order_id        TEXT,
  razorpay_subscription_id TEXT,
  amount_inr               NUMERIC(12,2) NOT NULL DEFAULT 0,
  currency                 TEXT NOT NULL DEFAULT 'INR',
  method                   TEXT,    -- card | upi | netbanking | wallet | emandate | other
  status                   TEXT NOT NULL DEFAULT 'created'
                             CHECK (status IN ('created','authorized','captured','failed','refunded','partially_refunded')),
  captured_at              TIMESTAMPTZ,
  fee_inr                  NUMERIC(12,2),
  tax_inr                  NUMERIC(12,2),
  refunded_amount_inr      NUMERIC(12,2) NOT NULL DEFAULT 0,
  error_code               TEXT,
  error_description        TEXT,
  raw_json                 JSONB,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_payments_tenant  ON public.payments(tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_payments_invoice ON public.payments(invoice_id);
CREATE INDEX IF NOT EXISTS idx_payments_status  ON public.payments(status);
CREATE TRIGGER tg_payments_updated_at
  BEFORE UPDATE ON public.payments
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- -----------------------------------------------------------------------------
-- 5. payment_attempts — every checkout attempt, including failures/abandons.
--    Feeds retry UX + funnel analytics; never deleted.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.payment_attempts (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id                UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  subscription_id          UUID REFERENCES public.tenant_subscriptions(id) ON DELETE SET NULL,
  plan_id                  UUID REFERENCES public.subscription_plans(id) ON DELETE SET NULL,
  billing_cycle            TEXT CHECK (billing_cycle IN ('monthly','yearly')),
  razorpay_subscription_id TEXT,
  razorpay_order_id        TEXT,
  amount_inr               NUMERIC(12,2),
  status                   TEXT NOT NULL DEFAULT 'initiated'
                             CHECK (status IN ('initiated','authorized','success','failed','abandoned')),
  attempt_no               SMALLINT NOT NULL DEFAULT 1,
  failure_reason           TEXT,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_payment_attempts_tenant ON public.payment_attempts(tenant_id, created_at DESC);
CREATE TRIGGER tg_payment_attempts_updated_at
  BEFORE UPDATE ON public.payment_attempts
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- -----------------------------------------------------------------------------
-- 6. subscription_history — append-only state-transition log per tenant.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.subscription_history (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  subscription_id UUID REFERENCES public.tenant_subscriptions(id) ON DELETE SET NULL,
  from_status     TEXT,
  to_status       TEXT,
  reason          TEXT,
  actor           TEXT NOT NULL DEFAULT 'system'
                    CHECK (actor IN ('system','webhook','admin','user')),
  metadata_json   JSONB,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_subscription_history_tenant ON public.subscription_history(tenant_id, created_at DESC);

-- -----------------------------------------------------------------------------
-- 7. subscription_reminders — audit of renewal reminders (7/3/1/expiry day).
--    UNIQUE(subscription, stage, period_end) keeps the cron idempotent.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.subscription_reminders (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  subscription_id UUID REFERENCES public.tenant_subscriptions(id) ON DELETE SET NULL,
  stage           TEXT NOT NULL CHECK (stage IN ('day_7','day_3','day_1','expiry','grace_end')),
  period_end      TIMESTAMPTZ NOT NULL,
  sent_via_push   BOOLEAN NOT NULL DEFAULT false,
  sent_via_whatsapp BOOLEAN NOT NULL DEFAULT false,
  sent_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (subscription_id, stage, period_end)
);
CREATE INDEX IF NOT EXISTS idx_subscription_reminders_tenant ON public.subscription_reminders(tenant_id, sent_at DESC);

-- -----------------------------------------------------------------------------
-- 8. razorpay_webhook_events — idempotency. Razorpay redelivers; we process once.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.razorpay_webhook_events (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  razorpay_event_id  TEXT UNIQUE,             -- x-razorpay-event-id header
  event_type         TEXT,
  payload_json       JSONB,
  status             TEXT NOT NULL DEFAULT 'received'
                       CHECK (status IN ('received','processed','failed','ignored')),
  error              TEXT,
  processed_at       TIMESTAMPTZ,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_rzp_webhook_type ON public.razorpay_webhook_events(event_type, created_at DESC);

-- -----------------------------------------------------------------------------
-- 9. RLS. Owners read their tenant's money rows; ALL writes are service-role
--    (no write policy). Control Center operators read via billing:read.
-- -----------------------------------------------------------------------------
ALTER TABLE public.billing_profiles        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoices                ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoice_items           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments                ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_attempts        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscription_history    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscription_reminders  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.razorpay_webhook_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoice_counters        ENABLE ROW LEVEL SECURITY;

-- billing_profiles: the owner may also INSERT/UPDATE their own (signup billing step).
CREATE POLICY billing_profiles_owner_select ON public.billing_profiles
  FOR SELECT USING (public.is_tenant_owner(tenant_id) OR public.platform_has_permission('billing:read'));
CREATE POLICY billing_profiles_owner_write ON public.billing_profiles
  FOR ALL USING (public.is_tenant_owner(tenant_id))
  WITH CHECK (public.is_tenant_owner(tenant_id));

-- invoices / items / payments / attempts: owner-read + operator-read; no client write.
CREATE POLICY invoices_read ON public.invoices
  FOR SELECT USING (public.is_tenant_owner(tenant_id) OR public.platform_has_permission('billing:read'));
CREATE POLICY invoice_items_read ON public.invoice_items
  FOR SELECT USING (EXISTS (
    SELECT 1 FROM public.invoices i WHERE i.id = invoice_id
       AND (public.is_tenant_owner(i.tenant_id) OR public.platform_has_permission('billing:read'))));
CREATE POLICY payments_read ON public.payments
  FOR SELECT USING (public.is_tenant_owner(tenant_id) OR public.platform_has_permission('billing:read'));
CREATE POLICY payment_attempts_read ON public.payment_attempts
  FOR SELECT USING (public.is_tenant_owner(tenant_id) OR public.platform_has_permission('billing:read'));
CREATE POLICY subscription_history_read ON public.subscription_history
  FOR SELECT USING (public.is_tenant_owner(tenant_id) OR public.platform_has_permission('billing:read'));
CREATE POLICY subscription_reminders_read ON public.subscription_reminders
  FOR SELECT USING (public.is_tenant_owner(tenant_id) OR public.platform_has_permission('billing:read'));
-- webhook events + counters: operators only (no tenant scope).
CREATE POLICY razorpay_webhook_events_read ON public.razorpay_webhook_events
  FOR SELECT USING (public.platform_has_permission('billing:read'));
CREATE POLICY invoice_counters_read ON public.invoice_counters
  FOR SELECT USING (public.platform_has_permission('billing:read'));

-- -----------------------------------------------------------------------------
-- 10. billing:* permissions + grants (finance_admin gets them; super_admin via
--     wildcard; read_only auto-gets billing:read via the action='read' rule).
-- -----------------------------------------------------------------------------
INSERT INTO public.platform_permissions (code, resource, action, description) VALUES
  ('billing:read',   'billing', 'read',   'View invoices, payments and refunds.'),
  ('billing:manage', 'billing', 'manage', 'Issue refunds and manage billing records.')
ON CONFLICT (code) DO NOTHING;

WITH r AS (SELECT id, code FROM public.platform_roles),
     p AS (SELECT id, code FROM public.platform_permissions)
INSERT INTO public.platform_role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM r JOIN p ON TRUE
WHERE r.code = 'finance_admin' AND p.code IN ('billing:read','billing:manage')
ON CONFLICT DO NOTHING;

-- read_only role: ensure it picks up billing:read (action=read) too.
WITH r AS (SELECT id FROM public.platform_roles WHERE code = 'read_only'),
     p AS (SELECT id FROM public.platform_permissions WHERE code = 'billing:read')
INSERT INTO public.platform_role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM r CROSS JOIN p
ON CONFLICT DO NOTHING;

-- -----------------------------------------------------------------------------
-- 11. Private storage bucket for invoice PDFs. Access is via signed URLs from
--     the edge functions (service role); no public/anon policies.
-- -----------------------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public)
VALUES ('invoices', 'invoices', false)
ON CONFLICT (id) DO NOTHING;

COMMENT ON TABLE public.invoices IS 'Issued SaaS invoices. Tenant-owner read + billing:read; written only by the Razorpay webhook / edge functions (service role).';

COMMIT;
