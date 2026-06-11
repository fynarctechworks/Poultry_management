-- =============================================================================
-- PoultryOS — Initial schema migration (v2.0)
-- File: 20260502000000_initial_schema.sql
-- Created: 2026-05-02
-- Purpose: Stand up entire PoultryOS database in one transaction:
--          20 tables, RLS on every table, 8 trigger functions,
--          extensions (pg_cron, pg_net), seed data for 4 integrators.
-- Notes:
--   * Wrapped in a single transaction. Any failure rolls everything back.
--   * Idempotent on extensions only; tables fail loudly if re-run.
--   * Edge-Function HTTP calls read base URL from
--     current_setting('app.edge_function_base_url', true). Until set,
--     trigger functions RAISE NOTICE and skip the HTTP call.
-- =============================================================================

BEGIN;

-- =============================================================================
-- A. EXTENSIONS
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";        -- gen_random_uuid()
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";       -- legacy support
CREATE EXTENSION IF NOT EXISTS "pg_cron";         -- scheduled jobs (cron schema)
CREATE EXTENSION IF NOT EXISTS "pg_net";          -- HTTP from Postgres (net schema)

-- =============================================================================
-- B. HELPER: updated_at trigger function (used by every table)
-- =============================================================================

CREATE OR REPLACE FUNCTION public.tg_set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

-- =============================================================================
-- C. TABLES (in FK-safe order)
-- =============================================================================

-- ---------- 1. integrators ---------------------------------------------------
CREATE TABLE public.integrators (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name              TEXT NOT NULL UNIQUE,
  state_presence    TEXT[] NOT NULL DEFAULT '{}',
  tariff_card_json  JSONB NOT NULL,
  is_pre_loaded     BOOLEAN NOT NULL DEFAULT true,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------- 2. farms ---------------------------------------------------------
CREATE TABLE public.farms (
  id                              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id                        UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  farm_name                       TEXT NOT NULL,
  owner_name                      TEXT NOT NULL,
  state                           TEXT NOT NULL,
  district                        TEXT,
  phone                           TEXT,
  gstin                           TEXT,
  farm_type                       TEXT NOT NULL DEFAULT 'independent'
                                    CHECK (farm_type IN ('independent', 'contract')),
  integrator_id                   UUID REFERENCES public.integrators(id) ON DELETE SET NULL,
  latitude                        NUMERIC(9, 6),
  longitude                       NUMERIC(9, 6),
  heat_stress_threshold_celsius   NUMERIC(4, 1) NOT NULL DEFAULT 35.0,
  upi_id                          TEXT
                                    CHECK (upi_id IS NULL OR upi_id ~ '^[\w.\-]+@[\w.\-]+$'),
  market_price_override_broiler   NUMERIC(10, 2),
  market_price_override_egg       NUMERIC(10, 2),
  created_at                      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                      TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT contract_farm_needs_integrator
    CHECK (farm_type = 'independent' OR integrator_id IS NOT NULL)
);

-- ---------- 3. profiles ------------------------------------------------------
CREATE TABLE public.profiles (
  id                    UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name             TEXT NOT NULL,
  phone                 TEXT,
  whatsapp_phone        TEXT,
  whatsapp_opt_in       BOOLEAN NOT NULL DEFAULT false,
  role                  TEXT NOT NULL DEFAULT 'owner'
                          CHECK (role IN ('owner', 'worker', 'vet')),
  farm_id               UUID REFERENCES public.farms(id) ON DELETE SET NULL,
  subscription_status   TEXT NOT NULL DEFAULT 'free'
                          CHECK (subscription_status IN ('free', 'active', 'cancelled', 'past_due')),
  subscription_id       TEXT,
  expo_push_token       TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------- 4. sheds ---------------------------------------------------------
CREATE TABLE public.sheds (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  farm_id       UUID NOT NULL REFERENCES public.farms(id) ON DELETE CASCADE,
  shed_name     TEXT NOT NULL,
  capacity      INTEGER NOT NULL CHECK (capacity > 0),
  poultry_type  TEXT NOT NULL
                  CHECK (poultry_type IN ('broiler', 'layer', 'breeder')),
  status        TEXT NOT NULL DEFAULT 'active'
                  CHECK (status IN ('active', 'inactive')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (farm_id, shed_name)
);

-- ---------- 5. batches -------------------------------------------------------
CREATE TABLE public.batches (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shed_id               UUID NOT NULL REFERENCES public.sheds(id) ON DELETE CASCADE,
  farm_id               UUID NOT NULL REFERENCES public.farms(id) ON DELETE CASCADE,
  batch_code            TEXT NOT NULL UNIQUE,
  breed_name            TEXT NOT NULL,
  poultry_type          TEXT NOT NULL
                          CHECK (poultry_type IN ('broiler', 'layer', 'breeder')),
  placement_date        DATE NOT NULL,
  opening_bird_count    INTEGER NOT NULL CHECK (opening_bird_count > 0),
  current_bird_count    INTEGER NOT NULL CHECK (current_bird_count >= 0),
  source_supplier       TEXT,
  cost_per_bird         NUMERIC(10, 2),
  status                TEXT NOT NULL DEFAULT 'active'
                          CHECK (status IN ('active', 'harvested', 'closed')),
  harvest_date          DATE,
  birds_sold            INTEGER CHECK (birds_sold IS NULL OR birds_sold >= 0),
  sale_weight_kg        NUMERIC(10, 2),
  sale_price_per_kg     NUMERIC(10, 2),
  total_sale_revenue    NUMERIC(12, 2)
                          GENERATED ALWAYS AS (
                            COALESCE(sale_weight_kg, 0) * COALESCE(sale_price_per_kg, 0)
                          ) STORED,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------- 6. farm_users ----------------------------------------------------
CREATE TABLE public.farm_users (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  farm_id             UUID NOT NULL REFERENCES public.farms(id) ON DELETE CASCADE,
  user_id             UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role                TEXT NOT NULL
                        CHECK (role IN ('owner', 'worker', 'vet')),
  assigned_shed_ids   UUID[] NOT NULL DEFAULT '{}',
  invited_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  accepted_at         TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (farm_id, user_id)
);

-- ---------- 7. buyers --------------------------------------------------------
CREATE TABLE public.buyers (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  farm_id                 UUID NOT NULL REFERENCES public.farms(id) ON DELETE CASCADE,
  buyer_name              TEXT NOT NULL,
  phone                   TEXT
                            CHECK (phone IS NULL OR phone ~ '^\+?[0-9]{10,15}$'),
  whatsapp_phone          TEXT,
  address                 TEXT,
  gstin                   TEXT,
  credit_limit            NUMERIC(12, 2) DEFAULT 0,
  total_business_volume   NUMERIC(14, 2) NOT NULL DEFAULT 0,
  current_balance         NUMERIC(12, 2) NOT NULL DEFAULT 0,
  last_transaction_date   DATE,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------- 8. daily_logs ----------------------------------------------------
CREATE TABLE public.daily_logs (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id            UUID NOT NULL REFERENCES public.batches(id) ON DELETE CASCADE,
  farm_id             UUID NOT NULL REFERENCES public.farms(id) ON DELETE CASCADE,
  logged_by           UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  log_date            DATE NOT NULL,
  birds_dead          INTEGER NOT NULL DEFAULT 0 CHECK (birds_dead >= 0),
  death_cause         TEXT
                        CHECK (death_cause IS NULL OR death_cause IN
                          ('disease', 'culled', 'injury', 'heat_stress', 'unknown')),
  feed_consumed_kg    NUMERIC(10, 2) NOT NULL DEFAULT 0 CHECK (feed_consumed_kg >= 0),
  feed_type           TEXT
                        CHECK (feed_type IS NULL OR feed_type IN
                          ('starter', 'grower', 'finisher', 'layer', 'custom')),
  feed_cost_per_kg    NUMERIC(10, 2),
  eggs_collected      INTEGER NOT NULL DEFAULT 0 CHECK (eggs_collected >= 0),
  avg_bird_weight_g   NUMERIC(8, 2),
  notes               TEXT,
  is_synced           BOOLEAN NOT NULL DEFAULT true,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (batch_id, log_date)
);

-- ---------- 9. health_incidents ---------------------------------------------
CREATE TABLE public.health_incidents (
  id                            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id                      UUID NOT NULL REFERENCES public.batches(id) ON DELETE CASCADE,
  farm_id                       UUID NOT NULL REFERENCES public.farms(id) ON DELETE CASCADE,
  reported_by                   UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  incident_date                 DATE NOT NULL,
  symptom_description           TEXT NOT NULL,
  affected_bird_count           INTEGER CHECK (affected_bird_count IS NULL OR affected_bird_count >= 0),
  vet_consulted                 BOOLEAN NOT NULL DEFAULT false,
  diagnosis                     TEXT,
  treatment_given               TEXT,
  medicine_name                 TEXT,
  dose                          TEXT,
  withdrawal_days               INTEGER CHECK (withdrawal_days IS NULL OR withdrawal_days >= 0),
  -- date + integer is IMMUTABLE; (text || ' days')::INTERVAL is not
  withdrawal_clearance_date     DATE
                                  GENERATED ALWAYS AS (
                                    CASE
                                      WHEN withdrawal_days IS NOT NULL
                                        THEN incident_date + withdrawal_days
                                      ELSE NULL
                                    END
                                  ) STORED,
  vet_note                      TEXT,
  created_at                    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------- 10. vaccinations -------------------------------------------------
CREATE TABLE public.vaccinations (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id            UUID NOT NULL REFERENCES public.batches(id) ON DELETE CASCADE,
  farm_id             UUID NOT NULL REFERENCES public.farms(id) ON DELETE CASCADE,
  vaccine_name        TEXT NOT NULL,
  scheduled_date      DATE NOT NULL,
  administered_date   DATE,
  dose                TEXT,
  route               TEXT
                        CHECK (route IS NULL OR route IN ('oral', 'injection', 'spray')),
  birds_vaccinated    INTEGER CHECK (birds_vaccinated IS NULL OR birds_vaccinated >= 0),
  status              TEXT NOT NULL DEFAULT 'scheduled'
                        CHECK (status IN ('scheduled', 'done', 'overdue')),
  administered_by     UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------- 11. inventory_items ---------------------------------------------
CREATE TABLE public.inventory_items (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  farm_id                 UUID NOT NULL REFERENCES public.farms(id) ON DELETE CASCADE,
  item_name               TEXT NOT NULL,
  category                TEXT NOT NULL
                            CHECK (category IN ('feed', 'medicine', 'vaccine', 'equipment')),
  unit                    TEXT NOT NULL
                            CHECK (unit IN ('kg', 'litres', 'units')),
  current_stock           NUMERIC(12, 2) NOT NULL DEFAULT 0,
  low_stock_threshold     NUMERIC(12, 2) NOT NULL DEFAULT 0,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (farm_id, item_name, category)
);

-- ---------- 12. inventory_movements -----------------------------------------
CREATE TABLE public.inventory_movements (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id         UUID NOT NULL REFERENCES public.inventory_items(id) ON DELETE CASCADE,
  farm_id         UUID NOT NULL REFERENCES public.farms(id) ON DELETE CASCADE,
  movement_type   TEXT NOT NULL
                    CHECK (movement_type IN ('purchase', 'usage', 'adjustment')),
  quantity        NUMERIC(12, 2) NOT NULL,
  cost_per_unit   NUMERIC(10, 2),
  supplier        TEXT,
  movement_date   DATE NOT NULL DEFAULT CURRENT_DATE,
  notes           TEXT,
  daily_log_id    UUID REFERENCES public.daily_logs(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------- 13. financial_transactions ---------------------------------------
CREATE TABLE public.financial_transactions (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  farm_id               UUID NOT NULL REFERENCES public.farms(id) ON DELETE CASCADE,
  batch_id              UUID REFERENCES public.batches(id) ON DELETE SET NULL,
  buyer_id              UUID REFERENCES public.buyers(id) ON DELETE SET NULL,
  transaction_type      TEXT NOT NULL
                          CHECK (transaction_type IN ('income', 'expense')),
  category              TEXT NOT NULL,
  amount                NUMERIC(12, 2) NOT NULL,
  quantity              NUMERIC(12, 2),
  price_per_unit        NUMERIC(10, 2),
  buyer_or_supplier     TEXT,
  transaction_date      DATE NOT NULL DEFAULT CURRENT_DATE,
  payment_status        TEXT NOT NULL DEFAULT 'paid'
                          CHECK (payment_status IN ('paid', 'pending', 'partial')),
  due_date              DATE,
  notes                 TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------- 14. payment_reminders -------------------------------------------
CREATE TABLE public.payment_reminders (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  farm_id               UUID NOT NULL REFERENCES public.farms(id) ON DELETE CASCADE,
  buyer_id              UUID NOT NULL REFERENCES public.buyers(id) ON DELETE CASCADE,
  transaction_id        UUID NOT NULL REFERENCES public.financial_transactions(id) ON DELETE CASCADE,
  reminder_stage        TEXT NOT NULL
                          CHECK (reminder_stage IN ('day_7', 'day_15', 'day_30')),
  sent_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  whatsapp_message_id   TEXT,
  status                TEXT NOT NULL DEFAULT 'sent'
                          CHECK (status IN ('sent', 'delivered', 'read', 'failed')),
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (transaction_id, reminder_stage)
);

-- ---------- 15. market_prices -----------------------------------------------
CREATE TABLE public.market_prices (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  state                   TEXT NOT NULL,
  price_date              DATE NOT NULL,
  broiler_price_per_kg    NUMERIC(10, 2),
  egg_price_per_100       NUMERIC(10, 2),
  source                  TEXT NOT NULL DEFAULT 'manual'
                            CHECK (source IN ('agmarknet', 'nafed', 'manual')),
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (state, price_date)
);

-- ---------- 16. traceability_records ----------------------------------------
CREATE TABLE public.traceability_records (
  id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id                    UUID NOT NULL UNIQUE REFERENCES public.batches(id) ON DELETE CASCADE,
  farm_id                     UUID NOT NULL REFERENCES public.farms(id) ON DELETE CASCADE,
  qr_token                    TEXT NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(16), 'hex'),
  supplier_name               TEXT,
  placement_date              DATE,
  breed_name                  TEXT,
  total_vaccinations          INTEGER NOT NULL DEFAULT 0,
  health_incidents_count      INTEGER NOT NULL DEFAULT 0,
  withdrawal_cleared          BOOLEAN NOT NULL DEFAULT false,
  harvest_date                DATE,
  buyer_name                  TEXT,
  certificate_pdf_url         TEXT,
  is_locked                   BOOLEAN NOT NULL DEFAULT false,
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------- 17. weather_data ------------------------------------------------
CREATE TABLE public.weather_data (
  id                              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  farm_id                         UUID NOT NULL REFERENCES public.farms(id) ON DELETE CASCADE,
  fetched_at                      TIMESTAMPTZ NOT NULL DEFAULT now(),
  current_temp_c                  NUMERIC(5, 2),
  current_humidity                NUMERIC(5, 2),
  forecast_json                   JSONB NOT NULL,
  -- Set by fetch-weather-data Edge Function. JSONB chained ops + ::numeric
  -- aren't accepted as IMMUTABLE for a GENERATED column on PG 15+.
  max_temp_today                  NUMERIC(5, 2),
  heat_stress_alert_triggered     BOOLEAN NOT NULL DEFAULT false,
  created_at                      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------- 18. weather_alerts ----------------------------------------------
CREATE TABLE public.weather_alerts (
  id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  farm_id                     UUID NOT NULL REFERENCES public.farms(id) ON DELETE CASCADE,
  alert_type                  TEXT NOT NULL
                                CHECK (alert_type IN ('heat_stress', 'cold_stress', 'heavy_rain')),
  alert_date                  DATE NOT NULL DEFAULT CURRENT_DATE,
  severity                    TEXT NOT NULL
                                CHECK (severity IN ('warning', 'critical')),
  max_temp_forecast           NUMERIC(5, 2),
  humidity_forecast           NUMERIC(5, 2),
  mitigation_actions_json     JSONB,
  sent_via_push               BOOLEAN NOT NULL DEFAULT false,
  sent_via_whatsapp           BOOLEAN NOT NULL DEFAULT false,
  acknowledged_at             TIMESTAMPTZ,
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------- 19. contract_cycles ---------------------------------------------
CREATE TABLE public.contract_cycles (
  id                              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  farm_id                         UUID NOT NULL REFERENCES public.farms(id) ON DELETE CASCADE,
  batch_id                        UUID NOT NULL UNIQUE REFERENCES public.batches(id) ON DELETE CASCADE,
  integrator_id                   UUID NOT NULL REFERENCES public.integrators(id) ON DELETE RESTRICT,
  chicks_supplied                 INTEGER NOT NULL CHECK (chicks_supplied > 0),
  chicks_supplied_date            DATE NOT NULL,
  total_feed_supplied_kg          NUMERIC(12, 2) NOT NULL DEFAULT 0,
  total_medicine_supplied         JSONB NOT NULL DEFAULT '[]'::JSONB,
  expected_harvest_date           DATE,
  actual_harvest_date             DATE,
  birds_delivered                 INTEGER CHECK (birds_delivered IS NULL OR birds_delivered >= 0),
  avg_weight_kg                   NUMERIC(6, 3),
  actual_fcr                      NUMERIC(5, 3),
  actual_mortality_pct            NUMERIC(5, 2),
  expected_settlement_amount      NUMERIC(12, 2),
  actual_settlement_amount        NUMERIC(12, 2),
  settlement_received_date        DATE,
  dispute_notes                   TEXT,
  status                          TEXT NOT NULL DEFAULT 'active'
                                    CHECK (status IN ('active', 'harvest_complete', 'settled', 'disputed')),
  locked_at                       TIMESTAMPTZ,
  created_at                      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------- 20. whatsapp_messages_log ---------------------------------------
CREATE TABLE public.whatsapp_messages_log (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  farm_id             UUID NOT NULL REFERENCES public.farms(id) ON DELETE CASCADE,
  recipient_phone     TEXT NOT NULL,
  message_type        TEXT NOT NULL
                        CHECK (message_type IN (
                          'daily_digest', 'mortality_alert', 'vaccination_reminder',
                          'low_stock_alert', 'heat_stress_alert', 'payment_reminder',
                          'invoice', 'traceability_cert', 'report'
                        )),
  template_id         TEXT,
  payload_json        JSONB,
  aisensy_message_id  TEXT,
  status              TEXT NOT NULL DEFAULT 'sent'
                        CHECK (status IN ('sent', 'delivered', 'read', 'failed')),
  error_message       TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- =============================================================================
-- D. INDEXES (beyond auto-indexes from PK / UNIQUE)
-- =============================================================================

CREATE INDEX idx_farms_owner_id ON public.farms(owner_id);
CREATE INDEX idx_profiles_farm_id ON public.profiles(farm_id);
CREATE INDEX idx_farm_users_user_id ON public.farm_users(user_id);
CREATE INDEX idx_sheds_farm_id ON public.sheds(farm_id);
CREATE INDEX idx_batches_farm_id_status ON public.batches(farm_id, status);
CREATE INDEX idx_batches_shed_id ON public.batches(shed_id);
CREATE INDEX idx_daily_logs_batch_date ON public.daily_logs(batch_id, log_date DESC);
CREATE INDEX idx_daily_logs_farm_date ON public.daily_logs(farm_id, log_date DESC);
CREATE INDEX idx_health_incidents_farm_date ON public.health_incidents(farm_id, incident_date DESC);
CREATE INDEX idx_health_incidents_batch_id ON public.health_incidents(batch_id);
CREATE INDEX idx_vaccinations_farm_status ON public.vaccinations(farm_id, status);
CREATE INDEX idx_vaccinations_scheduled_pending
  ON public.vaccinations(scheduled_date) WHERE status = 'scheduled';
CREATE INDEX idx_inventory_items_farm ON public.inventory_items(farm_id);
CREATE INDEX idx_inventory_movements_item ON public.inventory_movements(item_id, movement_date DESC);
CREATE INDEX idx_financial_tx_farm_date ON public.financial_transactions(farm_id, transaction_date DESC);
CREATE INDEX idx_financial_tx_buyer ON public.financial_transactions(buyer_id) WHERE buyer_id IS NOT NULL;
CREATE INDEX idx_financial_tx_overdue
  ON public.financial_transactions(due_date)
  WHERE payment_status IN ('pending', 'partial');
CREATE INDEX idx_payment_reminders_buyer ON public.payment_reminders(buyer_id, sent_at DESC);
CREATE INDEX idx_buyers_farm ON public.buyers(farm_id);
CREATE INDEX idx_weather_data_farm ON public.weather_data(farm_id, fetched_at DESC);
CREATE INDEX idx_weather_alerts_farm ON public.weather_alerts(farm_id, alert_date DESC);
CREATE INDEX idx_contract_cycles_farm ON public.contract_cycles(farm_id, status);
CREATE INDEX idx_whatsapp_log_farm ON public.whatsapp_messages_log(farm_id, created_at DESC);
CREATE INDEX idx_market_prices_state_date ON public.market_prices(state, price_date DESC);

-- =============================================================================
-- E. updated_at TRIGGERS on every table
-- =============================================================================

DO $$
DECLARE
  t TEXT;
BEGIN
  FOR t IN
    SELECT unnest(ARRAY[
      'profiles','farms','sheds','batches','daily_logs','health_incidents',
      'vaccinations','inventory_items','inventory_movements','financial_transactions',
      'market_prices','traceability_records','farm_users','buyers','payment_reminders',
      'weather_data','weather_alerts','integrators','contract_cycles','whatsapp_messages_log'
    ])
  LOOP
    EXECUTE format(
      'CREATE TRIGGER tg_%I_updated_at BEFORE UPDATE ON public.%I
         FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();',
      t, t
    );
  END LOOP;
END $$;

-- =============================================================================
-- F. BUSINESS-LOGIC FUNCTIONS + TRIGGERS
-- =============================================================================

-- ---------- F.0 Helper: post to Edge Function via pg_net (no-op if URL unset) -
CREATE OR REPLACE FUNCTION public.tg_post_to_edge_function(
  p_function_name TEXT,
  p_payload JSONB
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  base_url TEXT := current_setting('app.edge_function_base_url', true);
BEGIN
  IF base_url IS NULL OR base_url = '' THEN
    RAISE NOTICE 'Edge function base URL not configured. Skipping call to %.', p_function_name;
    RETURN;
  END IF;

  PERFORM net.http_post(
    url := base_url || '/' || p_function_name,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('app.edge_function_service_key', true)
    ),
    body := p_payload
  );
END;
$$;

-- ---------- F.1 update_batch_bird_count -------------------------------------
CREATE OR REPLACE FUNCTION public.update_batch_bird_count()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.birds_dead > 0 THEN
    UPDATE public.batches
       SET current_bird_count = GREATEST(0, current_bird_count - NEW.birds_dead),
           updated_at = now()
     WHERE id = NEW.batch_id;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER tg_daily_logs_update_bird_count
  AFTER INSERT ON public.daily_logs
  FOR EACH ROW EXECUTE FUNCTION public.update_batch_bird_count();

-- ---------- F.2 check_mortality_spike ---------------------------------------
CREATE OR REPLACE FUNCTION public.check_mortality_spike()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_opening INTEGER;
  v_pct NUMERIC;
  v_threshold NUMERIC := 1.0;  -- > 1.0% / day default
  v_batch_code TEXT;
  v_farm_id UUID;
BEGIN
  IF NEW.birds_dead = 0 THEN
    RETURN NEW;
  END IF;

  SELECT opening_bird_count, batch_code, farm_id
    INTO v_opening, v_batch_code, v_farm_id
    FROM public.batches
   WHERE id = NEW.batch_id;

  IF v_opening IS NULL OR v_opening = 0 THEN
    RETURN NEW;
  END IF;

  v_pct := (NEW.birds_dead::NUMERIC / v_opening::NUMERIC) * 100.0;

  IF v_pct > v_threshold THEN
    PERFORM public.tg_post_to_edge_function(
      'send-push-notification',
      jsonb_build_object(
        'event', 'mortality_spike',
        'farm_id', v_farm_id,
        'batch_id', NEW.batch_id,
        'batch_code', v_batch_code,
        'birds_dead', NEW.birds_dead,
        'mortality_pct', v_pct,
        'log_date', NEW.log_date
      )
    );
    PERFORM public.tg_post_to_edge_function(
      'send-whatsapp-message',
      jsonb_build_object(
        'event', 'mortality_alert',
        'farm_id', v_farm_id,
        'batch_id', NEW.batch_id,
        'batch_code', v_batch_code,
        'birds_dead', NEW.birds_dead,
        'mortality_pct', v_pct
      )
    );
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER tg_daily_logs_check_mortality
  AFTER INSERT ON public.daily_logs
  FOR EACH ROW EXECUTE FUNCTION public.check_mortality_spike();

-- ---------- F.3 deduct_feed_inventory ---------------------------------------
CREATE OR REPLACE FUNCTION public.deduct_feed_inventory()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_item_id UUID;
BEGIN
  IF NEW.feed_consumed_kg IS NULL OR NEW.feed_consumed_kg = 0
     OR NEW.feed_type IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT id INTO v_item_id
    FROM public.inventory_items
   WHERE farm_id = NEW.farm_id
     AND category = 'feed'
     AND lower(item_name) LIKE lower(NEW.feed_type) || '%'
   ORDER BY created_at ASC
   LIMIT 1;

  IF v_item_id IS NULL THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.inventory_movements (
    item_id, farm_id, movement_type, quantity, cost_per_unit,
    movement_date, daily_log_id, notes
  ) VALUES (
    v_item_id, NEW.farm_id, 'usage', NEW.feed_consumed_kg, NEW.feed_cost_per_kg,
    NEW.log_date, NEW.id,
    'Auto-deducted from daily log'
  );

  UPDATE public.inventory_items
     SET current_stock = GREATEST(0, current_stock - NEW.feed_consumed_kg),
         updated_at = now()
   WHERE id = v_item_id;

  RETURN NEW;
END;
$$;

CREATE TRIGGER tg_daily_logs_deduct_feed
  AFTER INSERT ON public.daily_logs
  FOR EACH ROW EXECUTE FUNCTION public.deduct_feed_inventory();

-- ---------- F.4 generate_batch_code -----------------------------------------
CREATE OR REPLACE FUNCTION public.generate_batch_code()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_seq INTEGER;
  v_farm_tag TEXT;
BEGIN
  IF NEW.batch_code IS NOT NULL AND length(NEW.batch_code) > 0 THEN
    RETURN NEW;
  END IF;

  v_farm_tag := upper(substring(replace(NEW.farm_id::TEXT, '-', ''), 1, 4));

  SELECT COUNT(*) + 1 INTO v_seq
    FROM public.batches
   WHERE farm_id = NEW.farm_id
     AND placement_date = NEW.placement_date;

  NEW.batch_code := 'B-' ||
                    to_char(NEW.placement_date, 'YYMMDD') || '-' ||
                    v_farm_tag || '-' ||
                    lpad(v_seq::TEXT, 2, '0');
  RETURN NEW;
END;
$$;

CREATE TRIGGER tg_batches_generate_code
  BEFORE INSERT ON public.batches
  FOR EACH ROW EXECUTE FUNCTION public.generate_batch_code();

-- ---------- F.5 lock_traceability_on_close ----------------------------------
CREATE OR REPLACE FUNCTION public.lock_traceability_on_close()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.status = 'closed' AND (OLD.status IS DISTINCT FROM 'closed') THEN
    UPDATE public.traceability_records
       SET is_locked = true,
           updated_at = now()
     WHERE batch_id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER tg_batches_lock_traceability
  AFTER UPDATE ON public.batches
  FOR EACH ROW EXECUTE FUNCTION public.lock_traceability_on_close();

-- ---------- F.6 update_buyer_balance ----------------------------------------
CREATE OR REPLACE FUNCTION public.update_buyer_balance()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_buyer_id UUID;
  v_balance NUMERIC;
  v_volume NUMERIC;
  v_last_date DATE;
BEGIN
  v_buyer_id := COALESCE(NEW.buyer_id, OLD.buyer_id);
  IF v_buyer_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT
    COALESCE(SUM(
      CASE
        WHEN transaction_type = 'income' AND payment_status = 'pending' THEN amount
        WHEN transaction_type = 'income' AND payment_status = 'partial' THEN amount * 0.5
        ELSE 0
      END
    ), 0),
    COALESCE(SUM(CASE WHEN transaction_type = 'income' THEN amount ELSE 0 END), 0),
    MAX(transaction_date)
    INTO v_balance, v_volume, v_last_date
    FROM public.financial_transactions
   WHERE buyer_id = v_buyer_id;

  UPDATE public.buyers
     SET current_balance = v_balance,
         total_business_volume = v_volume,
         last_transaction_date = v_last_date,
         updated_at = now()
   WHERE id = v_buyer_id;

  RETURN NEW;
END;
$$;

CREATE TRIGGER tg_financial_tx_update_buyer_balance
  AFTER INSERT OR UPDATE ON public.financial_transactions
  FOR EACH ROW
  WHEN (NEW.buyer_id IS NOT NULL)
  EXECUTE FUNCTION public.update_buyer_balance();

-- ---------- F.7 check_payment_overdue (cron-callable, not a trigger) --------
CREATE OR REPLACE FUNCTION public.check_payment_overdue()
RETURNS TABLE (
  transaction_id UUID,
  farm_id UUID,
  buyer_id UUID,
  amount NUMERIC,
  due_date DATE,
  days_overdue INTEGER,
  reminder_stage TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  WITH overdue AS (
    SELECT
      ft.id          AS transaction_id,
      ft.farm_id,
      ft.buyer_id,
      ft.amount,
      ft.due_date,
      (CURRENT_DATE - ft.due_date)::INTEGER AS days_overdue
    FROM public.financial_transactions ft
    WHERE ft.payment_status IN ('pending', 'partial')
      AND ft.due_date IS NOT NULL
      AND ft.buyer_id IS NOT NULL
      AND ft.transaction_type = 'income'
      AND CURRENT_DATE > ft.due_date
  )
  SELECT
    o.transaction_id, o.farm_id, o.buyer_id, o.amount, o.due_date, o.days_overdue,
    CASE
      WHEN o.days_overdue >= 30 THEN 'day_30'
      WHEN o.days_overdue >= 15 THEN 'day_15'
      WHEN o.days_overdue >= 7  THEN 'day_7'
      ELSE NULL
    END AS reminder_stage
  FROM overdue o
  WHERE o.days_overdue IN (7, 15, 30)
    AND NOT EXISTS (
      SELECT 1 FROM public.payment_reminders pr
      WHERE pr.transaction_id = o.transaction_id
        AND pr.reminder_stage = CASE
          WHEN o.days_overdue >= 30 THEN 'day_30'
          WHEN o.days_overdue >= 15 THEN 'day_15'
          ELSE 'day_7'
        END
    );
END;
$$;

-- ---------- F.8 lock_contract_cycle_on_close --------------------------------
CREATE OR REPLACE FUNCTION public.lock_contract_cycle_on_close()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  -- Block any change to a row where OLD.status was already 'settled'
  IF TG_OP = 'UPDATE' AND OLD.status = 'settled' AND OLD.locked_at IS NOT NULL THEN
    RAISE EXCEPTION 'contract_cycles row % is settled and locked; updates not permitted', OLD.id;
  END IF;

  -- On transition into 'settled', stamp locked_at
  IF NEW.status = 'settled' AND (OLD.status IS DISTINCT FROM 'settled') THEN
    NEW.locked_at := now();
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER tg_contract_cycles_lock_on_settle
  BEFORE UPDATE ON public.contract_cycles
  FOR EACH ROW EXECUTE FUNCTION public.lock_contract_cycle_on_close();

-- =============================================================================
-- G. RLS HELPER FUNCTIONS
-- =============================================================================

-- Returns the role of the current authenticated user for a given farm
CREATE OR REPLACE FUNCTION public.user_role_for_farm(p_farm_id UUID)
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role
    FROM public.farm_users
   WHERE farm_id = p_farm_id
     AND user_id = auth.uid()
   LIMIT 1;
$$;

-- Returns shed IDs the current user is assigned to within a farm
CREATE OR REPLACE FUNCTION public.user_assigned_sheds(p_farm_id UUID)
RETURNS UUID[]
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(assigned_shed_ids, '{}')
    FROM public.farm_users
   WHERE farm_id = p_farm_id
     AND user_id = auth.uid()
   LIMIT 1;
$$;

-- Returns true if the current user is owner of the given farm
CREATE OR REPLACE FUNCTION public.is_farm_owner(p_farm_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.farms WHERE id = p_farm_id AND owner_id = auth.uid()
  );
$$;

-- Returns true if the current user is any role on the given farm
CREATE OR REPLACE FUNCTION public.is_farm_member(p_farm_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.farm_users
     WHERE farm_id = p_farm_id AND user_id = auth.uid()
  ) OR public.is_farm_owner(p_farm_id);
$$;

-- =============================================================================
-- H. ENABLE RLS ON EVERY TABLE
-- =============================================================================

ALTER TABLE public.profiles                ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.farms                   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sheds                   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.batches                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.daily_logs              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.health_incidents        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vaccinations            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_items         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_movements     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.financial_transactions  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.market_prices           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.traceability_records    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.farm_users              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.buyers                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_reminders       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.weather_data            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.weather_alerts          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.integrators             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contract_cycles         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whatsapp_messages_log   ENABLE ROW LEVEL SECURITY;

-- =============================================================================
-- I. RLS POLICIES
-- =============================================================================

-- ---------- profiles --------------------------------------------------------
CREATE POLICY profiles_select_self ON public.profiles
  FOR SELECT USING (id = auth.uid());
CREATE POLICY profiles_update_self ON public.profiles
  FOR UPDATE USING (id = auth.uid()) WITH CHECK (id = auth.uid());
CREATE POLICY profiles_insert_self ON public.profiles
  FOR INSERT WITH CHECK (id = auth.uid());

-- ---------- farms -----------------------------------------------------------
CREATE POLICY farms_select_member ON public.farms
  FOR SELECT USING (public.is_farm_member(id));
CREATE POLICY farms_insert_self ON public.farms
  FOR INSERT WITH CHECK (owner_id = auth.uid());
CREATE POLICY farms_update_owner ON public.farms
  FOR UPDATE USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());
CREATE POLICY farms_delete_owner ON public.farms
  FOR DELETE USING (owner_id = auth.uid());

-- ---------- sheds -----------------------------------------------------------
CREATE POLICY sheds_select_member ON public.sheds
  FOR SELECT USING (
    public.is_farm_owner(farm_id)
    OR (
      public.user_role_for_farm(farm_id) IN ('worker', 'vet')
      AND (
        public.user_role_for_farm(farm_id) = 'vet'
        OR id = ANY(public.user_assigned_sheds(farm_id))
      )
    )
  );
CREATE POLICY sheds_owner_write ON public.sheds
  FOR ALL USING (public.is_farm_owner(farm_id))
  WITH CHECK (public.is_farm_owner(farm_id));

-- ---------- batches ---------------------------------------------------------
CREATE POLICY batches_select_member ON public.batches
  FOR SELECT USING (
    public.is_farm_owner(farm_id)
    OR (
      public.user_role_for_farm(farm_id) IN ('worker', 'vet')
      AND (
        public.user_role_for_farm(farm_id) = 'vet'
        OR shed_id = ANY(public.user_assigned_sheds(farm_id))
      )
    )
  );
CREATE POLICY batches_owner_write ON public.batches
  FOR ALL USING (public.is_farm_owner(farm_id))
  WITH CHECK (public.is_farm_owner(farm_id));

-- ---------- daily_logs ------------------------------------------------------
CREATE POLICY daily_logs_select_member ON public.daily_logs
  FOR SELECT USING (
    public.is_farm_owner(farm_id)
    OR (
      public.user_role_for_farm(farm_id) IN ('worker', 'vet')
      AND (
        public.user_role_for_farm(farm_id) = 'vet'
        OR EXISTS (
          SELECT 1 FROM public.batches b
          WHERE b.id = daily_logs.batch_id
            AND b.shed_id = ANY(public.user_assigned_sheds(farm_id))
        )
      )
    )
  );
CREATE POLICY daily_logs_insert_member ON public.daily_logs
  FOR INSERT WITH CHECK (
    public.is_farm_owner(farm_id)
    OR (
      public.user_role_for_farm(farm_id) = 'worker'
      AND EXISTS (
        SELECT 1 FROM public.batches b
        WHERE b.id = daily_logs.batch_id
          AND b.shed_id = ANY(public.user_assigned_sheds(farm_id))
      )
    )
  );
CREATE POLICY daily_logs_owner_modify ON public.daily_logs
  FOR UPDATE USING (public.is_farm_owner(farm_id))
  WITH CHECK (public.is_farm_owner(farm_id));
CREATE POLICY daily_logs_owner_delete ON public.daily_logs
  FOR DELETE USING (public.is_farm_owner(farm_id));

-- ---------- health_incidents ------------------------------------------------
CREATE POLICY health_incidents_select_member ON public.health_incidents
  FOR SELECT USING (
    public.is_farm_owner(farm_id)
    OR public.user_role_for_farm(farm_id) IN ('worker', 'vet')
  );
CREATE POLICY health_incidents_insert_member ON public.health_incidents
  FOR INSERT WITH CHECK (
    public.is_farm_owner(farm_id)
    OR public.user_role_for_farm(farm_id) IN ('worker', 'vet')
  );
CREATE POLICY health_incidents_owner_modify ON public.health_incidents
  FOR UPDATE USING (
    public.is_farm_owner(farm_id)
    OR public.user_role_for_farm(farm_id) = 'vet'
  )
  WITH CHECK (
    public.is_farm_owner(farm_id)
    OR public.user_role_for_farm(farm_id) = 'vet'
  );
CREATE POLICY health_incidents_owner_delete ON public.health_incidents
  FOR DELETE USING (public.is_farm_owner(farm_id));

-- ---------- vaccinations ----------------------------------------------------
CREATE POLICY vaccinations_select_member ON public.vaccinations
  FOR SELECT USING (public.is_farm_member(farm_id));
CREATE POLICY vaccinations_owner_write ON public.vaccinations
  FOR ALL USING (public.is_farm_owner(farm_id))
  WITH CHECK (public.is_farm_owner(farm_id));

-- ---------- inventory_items -------------------------------------------------
CREATE POLICY inventory_items_select_member ON public.inventory_items
  FOR SELECT USING (
    public.is_farm_owner(farm_id)
    OR public.user_role_for_farm(farm_id) = 'worker'
  );
CREATE POLICY inventory_items_owner_write ON public.inventory_items
  FOR ALL USING (public.is_farm_owner(farm_id))
  WITH CHECK (public.is_farm_owner(farm_id));

-- ---------- inventory_movements ---------------------------------------------
CREATE POLICY inventory_movements_select ON public.inventory_movements
  FOR SELECT USING (
    public.is_farm_owner(farm_id)
    OR public.user_role_for_farm(farm_id) = 'worker'
  );
CREATE POLICY inventory_movements_insert_member ON public.inventory_movements
  FOR INSERT WITH CHECK (
    public.is_farm_owner(farm_id)
    OR public.user_role_for_farm(farm_id) = 'worker'
  );
CREATE POLICY inventory_movements_owner_modify ON public.inventory_movements
  FOR UPDATE USING (public.is_farm_owner(farm_id))
  WITH CHECK (public.is_farm_owner(farm_id));
CREATE POLICY inventory_movements_owner_delete ON public.inventory_movements
  FOR DELETE USING (public.is_farm_owner(farm_id));

-- ---------- financial_transactions (OWNER ONLY) ------------------------------
CREATE POLICY financial_tx_owner_only ON public.financial_transactions
  FOR ALL USING (public.is_farm_owner(farm_id))
  WITH CHECK (public.is_farm_owner(farm_id));

-- ---------- market_prices (any authenticated SELECT) -----------------------
CREATE POLICY market_prices_auth_select ON public.market_prices
  FOR SELECT TO authenticated USING (true);
-- Writes only via service_role (bypasses RLS by default)

-- ---------- traceability_records --------------------------------------------
-- Public anon read by qr_token only
CREATE POLICY traceability_anon_select ON public.traceability_records
  FOR SELECT TO anon USING (qr_token IS NOT NULL);
CREATE POLICY traceability_member_select ON public.traceability_records
  FOR SELECT TO authenticated USING (public.is_farm_member(farm_id));
CREATE POLICY traceability_owner_write ON public.traceability_records
  FOR ALL TO authenticated USING (public.is_farm_owner(farm_id))
  WITH CHECK (public.is_farm_owner(farm_id));

-- ---------- farm_users ------------------------------------------------------
CREATE POLICY farm_users_self_select ON public.farm_users
  FOR SELECT USING (
    user_id = auth.uid() OR public.is_farm_owner(farm_id)
  );
CREATE POLICY farm_users_owner_write ON public.farm_users
  FOR ALL USING (public.is_farm_owner(farm_id))
  WITH CHECK (public.is_farm_owner(farm_id));

-- ---------- buyers (OWNER ONLY) ---------------------------------------------
CREATE POLICY buyers_owner_only ON public.buyers
  FOR ALL USING (public.is_farm_owner(farm_id))
  WITH CHECK (public.is_farm_owner(farm_id));

-- ---------- payment_reminders (owner SELECT only; service_role writes) ------
CREATE POLICY payment_reminders_owner_select ON public.payment_reminders
  FOR SELECT USING (public.is_farm_owner(farm_id));
-- INSERT/UPDATE/DELETE only via service_role

-- ---------- weather_data ----------------------------------------------------
CREATE POLICY weather_data_member_select ON public.weather_data
  FOR SELECT USING (public.is_farm_member(farm_id));
-- Writes only via service_role

-- ---------- weather_alerts --------------------------------------------------
CREATE POLICY weather_alerts_member_select ON public.weather_alerts
  FOR SELECT USING (public.is_farm_member(farm_id));
CREATE POLICY weather_alerts_member_ack ON public.weather_alerts
  FOR UPDATE USING (public.is_farm_member(farm_id))
  WITH CHECK (public.is_farm_member(farm_id));

-- ---------- integrators (any auth SELECT) -----------------------------------
CREATE POLICY integrators_auth_select ON public.integrators
  FOR SELECT TO authenticated USING (true);
-- Writes only via service_role

-- ---------- contract_cycles (OWNER ONLY) ------------------------------------
CREATE POLICY contract_cycles_owner_only ON public.contract_cycles
  FOR ALL USING (public.is_farm_owner(farm_id))
  WITH CHECK (public.is_farm_owner(farm_id));

-- ---------- whatsapp_messages_log (owner SELECT only) -----------------------
CREATE POLICY whatsapp_log_owner_select ON public.whatsapp_messages_log
  FOR SELECT USING (public.is_farm_owner(farm_id));
-- INSERT only via service_role

-- =============================================================================
-- J. SEED DATA — integrators
-- All tariff_card_json entries flagged review_required=true; verify before
-- production use. Values are estimated 2025 industry averages.
-- =============================================================================

INSERT INTO public.integrators (name, state_presence, tariff_card_json, is_pre_loaded) VALUES
(
  'Suguna',
  ARRAY['TN','KA','AP','TS','MH'],
  jsonb_build_object(
    'base_growing_charge_per_kg', 7.50,
    'fcr_bonus', jsonb_build_object('threshold', 1.65, 'bonus_per_kg', 0.50),
    'mortality_bonus', jsonb_build_object('threshold_pct', 5.0, 'bonus_per_kg', 0.30),
    'weight_target_kg', 2.2,
    'cycle_days', 42,
    'review_required', true,
    'source', 'estimated_2025_industry_average'
  ),
  true
),
(
  'Venkateshwara',
  ARRAY['MH','GJ','MP','UP'],
  jsonb_build_object(
    'base_growing_charge_per_kg', 7.25,
    'fcr_bonus', jsonb_build_object('threshold', 1.70, 'bonus_per_kg', 0.40),
    'mortality_bonus', jsonb_build_object('threshold_pct', 5.0, 'bonus_per_kg', 0.25),
    'weight_target_kg', 2.2,
    'cycle_days', 42,
    'review_required', true,
    'source', 'estimated_2025_industry_average'
  ),
  true
),
(
  'Skylark',
  ARRAY['HR','PB','UP','RJ'],
  jsonb_build_object(
    'base_growing_charge_per_kg', 7.40,
    'fcr_bonus', jsonb_build_object('threshold', 1.68, 'bonus_per_kg', 0.45),
    'mortality_bonus', jsonb_build_object('threshold_pct', 5.0, 'bonus_per_kg', 0.30),
    'weight_target_kg', 2.2,
    'cycle_days', 42,
    'review_required', true,
    'source', 'estimated_2025_industry_average'
  ),
  true
),
(
  'IB Group',
  ARRAY['WB','OR','JH','BR','CG'],
  jsonb_build_object(
    'base_growing_charge_per_kg', 7.30,
    'fcr_bonus', jsonb_build_object('threshold', 1.68, 'bonus_per_kg', 0.40),
    'mortality_bonus', jsonb_build_object('threshold_pct', 5.0, 'bonus_per_kg', 0.25),
    'weight_target_kg', 2.2,
    'cycle_days', 42,
    'review_required', true,
    'source', 'estimated_2025_industry_average'
  ),
  true
);

-- =============================================================================
-- K. COMMIT
-- =============================================================================

COMMIT;

-- =============================================================================
-- POST-MIGRATION TODO (Day 3+):
--   1. ALTER DATABASE postgres SET app.edge_function_base_url = '<supabase fn url>';
--   2. ALTER DATABASE postgres SET app.edge_function_service_key = '<service-role-jwt>';
--   3. Schedule pg_cron jobs after Edge Functions are deployed:
--        cron.schedule('fetch-market-prices', '30 2 * * *', ...);   -- 08:00 IST
--        cron.schedule('send-vaccination-reminders', '30 1 * * *', ...);  -- 07:00 IST
--        cron.schedule('send-low-stock-alerts', '0 3 * * *', ...);  -- 08:30 IST
--        cron.schedule('fetch-weather-data', '0 * * * *', ...);     -- hourly
--        cron.schedule('send-daily-digest', '30 14 * * *', ...);    -- 20:00 IST
--        cron.schedule('send-payment-reminders', '30 4 * * *', ...);-- 10:00 IST
--   4. Have user verify integrator tariff cards (review_required=true).
-- =============================================================================
