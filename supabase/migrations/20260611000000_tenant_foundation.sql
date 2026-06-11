-- =============================================================================
-- PoultryOS — Multi-Tenant SaaS Upgrade · Phase A1: Tenant Foundation (additive)
-- File: 20260611000000_tenant_foundation.sql
-- =============================================================================
-- Introduces the TENANT as the new top-level scope above farms. This migration
-- is strictly ADDITIVE and REVERSIBLE:
--   * creates `tenants`, `tenant_users` (7-role model), `onboarding_progress`
--   * adds a NULLABLE `tenant_id` column to every tenant-owned table
-- Backfill (A2), NOT NULL + FKs, and the RLS re-scope (A3) follow in separate
-- migrations. Until then the app keeps working unchanged on farm_id scoping.
--
-- Why additive-first: a tenant_id NOT NULL + FK + RLS flip in one shot would
-- break every existing row and lock users out. We add, backfill, verify, then
-- enforce — each step independently reversible.
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- 1. Role enum (7 roles). Created as a TEXT CHECK domain-style for parity with
--    the rest of the schema (which uses TEXT + CHECK, not native enums).
-- -----------------------------------------------------------------------------
-- Canonical tenant roles. Legacy farm roles map: owner→owner, worker→worker,
-- vet→veterinarian (done in A2 backfill).
--   owner          full control, billing
--   farm_manager   manage farms/sheds/batches/team (no billing)
--   supervisor     operations on assigned farms/sheds
--   accountant     financials, buyers, invoices (no operations)
--   veterinarian   health incidents + vet notes
--   worker         daily logs on assigned sheds
--   viewer         read-only

-- -----------------------------------------------------------------------------
-- 2. tenants — the company / farm-group. One per customer account.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.tenants (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name               TEXT NOT NULL,
  -- denormalized owner for fast "my tenant" lookups + onboarding bootstrap
  owner_id           UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  business_type      TEXT
                       CHECK (business_type IS NULL OR business_type IN
                         ('broiler', 'layer', 'breeder', 'hatchery', 'feed_mill', 'mixed')),
  country            TEXT NOT NULL DEFAULT 'IN',
  timezone           TEXT NOT NULL DEFAULT 'Asia/Kolkata',
  currency           TEXT NOT NULL DEFAULT 'INR',
  -- lifecycle: trial is the default on creation (Phase B owns the state machine)
  status             TEXT NOT NULL DEFAULT 'trial'
                       CHECK (status IN ('trial', 'active', 'past_due', 'suspended', 'cancelled')),
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tenants_owner_id ON public.tenants(owner_id);

CREATE TRIGGER tg_tenants_updated_at
  BEFORE UPDATE ON public.tenants
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- -----------------------------------------------------------------------------
-- 3. tenant_users — membership + role (the new source of truth for access).
--    farm_users is retained for shed-level assignment scoping (A3 decides
--    whether it folds in; for now both coexist).
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.tenant_users (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  user_id      UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role         TEXT NOT NULL DEFAULT 'viewer'
                 CHECK (role IN
                   ('owner', 'farm_manager', 'supervisor', 'accountant',
                    'veterinarian', 'worker', 'viewer')),
  -- which farms this member may touch; empty = all farms in tenant (for
  -- owner/manager). Sub-farm shed scoping stays in farm_users.
  assigned_farm_ids UUID[] NOT NULL DEFAULT '{}',
  invited_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  accepted_at  TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_tenant_users_user_id ON public.tenant_users(user_id);
CREATE INDEX IF NOT EXISTS idx_tenant_users_tenant_id ON public.tenant_users(tenant_id);

CREATE TRIGGER tg_tenant_users_updated_at
  BEFORE UPDATE ON public.tenant_users
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- -----------------------------------------------------------------------------
-- 4. onboarding_progress — auto-save / resume for the guided wizard (Phase D).
--    One row per user; holds the furthest step reached + a JSON draft of all
--    answers so a closed browser/app resumes exactly where it left off.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.onboarding_progress (
  user_id        UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  current_step   SMALLINT NOT NULL DEFAULT 1 CHECK (current_step BETWEEN 1 AND 10),
  draft_json     JSONB NOT NULL DEFAULT '{}'::jsonb,
  completed_at   TIMESTAMPTZ,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TRIGGER tg_onboarding_progress_updated_at
  BEFORE UPDATE ON public.onboarding_progress
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- RLS for onboarding_progress: strictly self-owned (no tenant yet at this point).
ALTER TABLE public.onboarding_progress ENABLE ROW LEVEL SECURITY;
CREATE POLICY onboarding_progress_self ON public.onboarding_progress
  FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- -----------------------------------------------------------------------------
-- 5. Add NULLABLE tenant_id to profiles + every tenant-owned table.
--    Nullable now; A2 backfills; A3 sets NOT NULL + adds FK + RLS.
-- -----------------------------------------------------------------------------
ALTER TABLE public.profiles               ADD COLUMN IF NOT EXISTS tenant_id UUID;
ALTER TABLE public.farms                  ADD COLUMN IF NOT EXISTS tenant_id UUID;
ALTER TABLE public.sheds                  ADD COLUMN IF NOT EXISTS tenant_id UUID;
ALTER TABLE public.batches                ADD COLUMN IF NOT EXISTS tenant_id UUID;
ALTER TABLE public.farm_users             ADD COLUMN IF NOT EXISTS tenant_id UUID;
ALTER TABLE public.buyers                 ADD COLUMN IF NOT EXISTS tenant_id UUID;
ALTER TABLE public.daily_logs             ADD COLUMN IF NOT EXISTS tenant_id UUID;
ALTER TABLE public.health_incidents       ADD COLUMN IF NOT EXISTS tenant_id UUID;
ALTER TABLE public.vaccinations           ADD COLUMN IF NOT EXISTS tenant_id UUID;
ALTER TABLE public.inventory_items        ADD COLUMN IF NOT EXISTS tenant_id UUID;
ALTER TABLE public.inventory_movements    ADD COLUMN IF NOT EXISTS tenant_id UUID;
ALTER TABLE public.financial_transactions ADD COLUMN IF NOT EXISTS tenant_id UUID;
ALTER TABLE public.payment_reminders      ADD COLUMN IF NOT EXISTS tenant_id UUID;
ALTER TABLE public.traceability_records   ADD COLUMN IF NOT EXISTS tenant_id UUID;
ALTER TABLE public.weather_data           ADD COLUMN IF NOT EXISTS tenant_id UUID;
ALTER TABLE public.weather_alerts         ADD COLUMN IF NOT EXISTS tenant_id UUID;
ALTER TABLE public.contract_cycles        ADD COLUMN IF NOT EXISTS tenant_id UUID;
ALTER TABLE public.whatsapp_messages_log  ADD COLUMN IF NOT EXISTS tenant_id UUID;

-- NOTE: integrators and market_prices are GLOBAL master data (shared across
-- tenants), so they intentionally get NO tenant_id. Access stays as-is.

COMMIT;

-- =============================================================================
-- Reversal (manual, if ever needed before A2):
--   DROP TABLE public.onboarding_progress, public.tenant_users, public.tenants CASCADE;
--   ALTER TABLE ... DROP COLUMN tenant_id;  (per table above)
-- =============================================================================
