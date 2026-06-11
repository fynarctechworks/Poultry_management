-- =============================================================================
-- PoultryOS — Multi-Tenant SaaS Upgrade · Phase A2: Tenant Backfill + Enforce
-- File: 20260611000001_tenant_backfill.sql
-- =============================================================================
-- Backfills tenant_id across all existing rows, then enforces NOT NULL + FK.
-- Runs in a single transaction. Row-count assertions abort the whole migration
-- if any tenant_id remains NULL after backfill — we never half-enforce.
--
-- Backfill model: ONE tenant per existing farm OWNER. A farmer who owns N farms
-- gets one tenant owning all N. Legacy roles map owner→owner, worker→worker,
-- vet→veterinarian.
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- 1. One tenant per distinct farm owner. Name from the owner's first farm.
-- -----------------------------------------------------------------------------
INSERT INTO public.tenants (id, name, owner_id, country, timezone, currency, status, created_at)
SELECT
  gen_random_uuid(),
  -- tenant name: owner's farm_name if exactly one farm, else "<owner_name>'s Farms"
  CASE
    WHEN count(*) = 1 THEN max(f.farm_name)
    ELSE COALESCE(max(f.owner_name), 'My') || '''s Farms'
  END,
  f.owner_id,
  'IN', 'Asia/Kolkata', 'INR',
  'active',                                  -- existing customers grandfathered active
  min(f.created_at)
FROM public.farms f
GROUP BY f.owner_id
ON CONFLICT DO NOTHING;

-- -----------------------------------------------------------------------------
-- 2. farms.tenant_id ← the owner's tenant
-- -----------------------------------------------------------------------------
UPDATE public.farms f
   SET tenant_id = t.id
  FROM public.tenants t
 WHERE t.owner_id = f.owner_id
   AND f.tenant_id IS NULL;

-- -----------------------------------------------------------------------------
-- 3. profiles.tenant_id ← via the profile's farm, else via owned tenant.
--    Owners get their owned tenant; members get the tenant of their farm.
-- -----------------------------------------------------------------------------
-- 3a. owners (a tenant exists with owner_id = profile.id)
UPDATE public.profiles p
   SET tenant_id = t.id
  FROM public.tenants t
 WHERE t.owner_id = p.id
   AND p.tenant_id IS NULL;

-- 3b. members — resolve tenant through their farm_users → farm → tenant
UPDATE public.profiles p
   SET tenant_id = f.tenant_id
  FROM public.farm_users fu
  JOIN public.farms f ON f.id = fu.farm_id
 WHERE fu.user_id = p.id
   AND p.tenant_id IS NULL
   AND f.tenant_id IS NOT NULL;

-- -----------------------------------------------------------------------------
-- 4. tenant_users ← derived from farm_users (membership) with role mapping.
--    A user appearing on multiple farms of the same tenant collapses to one
--    membership; we take the highest-privilege role (owner > rest).
-- -----------------------------------------------------------------------------
INSERT INTO public.tenant_users (tenant_id, user_id, role, assigned_farm_ids, invited_at, accepted_at)
SELECT
  f.tenant_id,
  fu.user_id,
  -- map + collapse: owner wins; else map vet→veterinarian, worker→worker
  CASE
    WHEN bool_or(fu.role = 'owner') THEN 'owner'
    WHEN bool_or(fu.role = 'vet')   THEN 'veterinarian'
    ELSE 'worker'
  END,
  array_agg(DISTINCT fu.farm_id),
  min(fu.invited_at),
  max(fu.accepted_at)
FROM public.farm_users fu
JOIN public.farms f ON f.id = fu.farm_id
WHERE f.tenant_id IS NOT NULL
GROUP BY f.tenant_id, fu.user_id
ON CONFLICT (tenant_id, user_id) DO NOTHING;

-- 4b. Ensure every tenant owner has an owner membership even if no farm_users row
INSERT INTO public.tenant_users (tenant_id, user_id, role, accepted_at)
SELECT t.id, t.owner_id, 'owner', now()
FROM public.tenants t
ON CONFLICT (tenant_id, user_id) DO NOTHING;

-- -----------------------------------------------------------------------------
-- 5. Child tables ← tenant_id via farm_id join. farm_users + everything
--    carrying farm_id resolves through farms.tenant_id.
-- -----------------------------------------------------------------------------
UPDATE public.farm_users x             SET tenant_id = f.tenant_id FROM public.farms f WHERE f.id = x.farm_id AND x.tenant_id IS NULL;
UPDATE public.sheds x                  SET tenant_id = f.tenant_id FROM public.farms f WHERE f.id = x.farm_id AND x.tenant_id IS NULL;
UPDATE public.batches x                SET tenant_id = f.tenant_id FROM public.farms f WHERE f.id = x.farm_id AND x.tenant_id IS NULL;
UPDATE public.buyers x                 SET tenant_id = f.tenant_id FROM public.farms f WHERE f.id = x.farm_id AND x.tenant_id IS NULL;
UPDATE public.daily_logs x             SET tenant_id = f.tenant_id FROM public.farms f WHERE f.id = x.farm_id AND x.tenant_id IS NULL;
UPDATE public.health_incidents x       SET tenant_id = f.tenant_id FROM public.farms f WHERE f.id = x.farm_id AND x.tenant_id IS NULL;
UPDATE public.vaccinations x           SET tenant_id = f.tenant_id FROM public.farms f WHERE f.id = x.farm_id AND x.tenant_id IS NULL;
UPDATE public.inventory_items x        SET tenant_id = f.tenant_id FROM public.farms f WHERE f.id = x.farm_id AND x.tenant_id IS NULL;
UPDATE public.inventory_movements x    SET tenant_id = f.tenant_id FROM public.farms f WHERE f.id = x.farm_id AND x.tenant_id IS NULL;
UPDATE public.financial_transactions x SET tenant_id = f.tenant_id FROM public.farms f WHERE f.id = x.farm_id AND x.tenant_id IS NULL;
UPDATE public.payment_reminders x      SET tenant_id = f.tenant_id FROM public.farms f WHERE f.id = x.farm_id AND x.tenant_id IS NULL;
UPDATE public.traceability_records x   SET tenant_id = f.tenant_id FROM public.farms f WHERE f.id = x.farm_id AND x.tenant_id IS NULL;
UPDATE public.weather_data x           SET tenant_id = f.tenant_id FROM public.farms f WHERE f.id = x.farm_id AND x.tenant_id IS NULL;
UPDATE public.weather_alerts x         SET tenant_id = f.tenant_id FROM public.farms f WHERE f.id = x.farm_id AND x.tenant_id IS NULL;
UPDATE public.contract_cycles x        SET tenant_id = f.tenant_id FROM public.farms f WHERE f.id = x.farm_id AND x.tenant_id IS NULL;
UPDATE public.whatsapp_messages_log x  SET tenant_id = f.tenant_id FROM public.farms f WHERE f.id = x.farm_id AND x.tenant_id IS NULL;

-- -----------------------------------------------------------------------------
-- 6. ASSERTIONS — abort if any farm-bound row still lacks a tenant_id.
--    profiles is excepted: a brand-new auth user with no farm yet legitimately
--    has tenant_id NULL until onboarding completes, so profiles stays NULLABLE.
-- -----------------------------------------------------------------------------
DO $$
DECLARE
  tbl TEXT;
  bad BIGINT;
  tables TEXT[] := ARRAY[
    'farms','sheds','batches','farm_users','buyers','daily_logs',
    'health_incidents','vaccinations','inventory_items','inventory_movements',
    'financial_transactions','payment_reminders','traceability_records',
    'weather_data','weather_alerts','contract_cycles','whatsapp_messages_log'
  ];
BEGIN
  FOREACH tbl IN ARRAY tables LOOP
    EXECUTE format('SELECT count(*) FROM public.%I WHERE tenant_id IS NULL', tbl) INTO bad;
    IF bad > 0 THEN
      RAISE EXCEPTION 'Backfill incomplete: % rows in public.% have NULL tenant_id', bad, tbl;
    END IF;
  END LOOP;
END$$;

-- -----------------------------------------------------------------------------
-- 7. Enforce NOT NULL + FK (ON DELETE CASCADE) now that data is clean.
--    profiles.tenant_id: FK only, stays NULLABLE (pre-onboarding users).
-- -----------------------------------------------------------------------------
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_tenant_id_fkey FOREIGN KEY (tenant_id)
  REFERENCES public.tenants(id) ON DELETE SET NULL;

DO $$
DECLARE
  tbl TEXT;
  tables TEXT[] := ARRAY[
    'farms','sheds','batches','farm_users','buyers','daily_logs',
    'health_incidents','vaccinations','inventory_items','inventory_movements',
    'financial_transactions','payment_reminders','traceability_records',
    'weather_data','weather_alerts','contract_cycles','whatsapp_messages_log'
  ];
BEGIN
  FOREACH tbl IN ARRAY tables LOOP
    EXECUTE format('ALTER TABLE public.%I ALTER COLUMN tenant_id SET NOT NULL', tbl);
    EXECUTE format(
      'ALTER TABLE public.%I ADD CONSTRAINT %I FOREIGN KEY (tenant_id)
         REFERENCES public.tenants(id) ON DELETE CASCADE',
      tbl, tbl || '_tenant_id_fkey');
    EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON public.%I(tenant_id)',
      'idx_' || tbl || '_tenant_id', tbl);
  END LOOP;
END$$;

COMMIT;
