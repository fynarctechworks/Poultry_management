**PoultryOS**

Technical Requirements Document

*v1.0 \| April 2026 \| Vibe-Coding Ready*

  --------------------------------------------------------------------------------------------------------------------------------------
  **Stack**                                  **Platform**               **Budget**       **Build order**   **Team**       **Timeline**
  ------------------------------------------ -------------------------- ---------------- ----------------- -------------- --------------
  Expo EAS + Next.js + Supabase + Razorpay   Android first, Web later   \$10--25/month   Android → Web     2 developers   3--6 months

  --------------------------------------------------------------------------------------------------------------------------------------

  -----------------------------------------------------------------------
  **📊 1. Document Overview**

  -----------------------------------------------------------------------

This TRD translates the PoultryOS PRD into exact technical specifications optimised for AI-assisted development using Claude, Cursor, v0.dev, and Bolt. Every table, field name, API function, and library name in this document is intended to be used verbatim by AI coding tools.

  ------------------------------------------------------------------------------------------
  **Attribute**          **Value**
  ---------------------- -------------------------------------------------------------------
  PRD version            v1.0 (April 2026)

  Target builder         2-person team using AI coding tools (Claude / Cursor / Bolt)

  Mobile framework       Expo SDK 51 with EAS Build (React Native)

  Web framework          Next.js 14 (App Router)

  Backend                Supabase (PostgreSQL 15, Auth, Storage, Edge Functions, Realtime)

  Payment gateway        Razorpay (India-first: UPI, cards, net banking)

  Offline strategy       AsyncStorage queue for daily log entry; syncs on reconnect

  Target device          Android 10+, 2 GB RAM, low-end hardware (₹6k--12k phones)

  Monthly cost target    \$10--25 until 1,000 active farms

  Hosting                Vercel (Next.js web) + Supabase managed (backend)
  ------------------------------------------------------------------------------------------

  -----------------------------------------------------------------------
  **🏗️ 2. System Architecture**

  -----------------------------------------------------------------------

PoultryOS uses a straightforward client-server architecture with no custom backend server --- Supabase replaces the backend entirely. Edge Functions handle scheduled jobs and PDF generation.

  ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
  **Layer**            **Technology**                                                    **Responsibility**
  -------------------- ----------------------------------------------------------------- -------------------------------------------------------------------------------------------------------
  Mobile client        Expo (React Native) + EAS Build                                   All 17 app screens; offline daily-log queue; push notifications via Expo Notifications

  Web client           Next.js 14 App Router on Vercel                                   Web dashboard for owners; public traceability QR pages (no auth required)

  Auth                 Supabase Auth (JWT)                                               Email+password login; role claims stored in user_metadata; RLS enforced at DB level

  Database             Supabase PostgreSQL 15                                            All farm, batch, health, financial, inventory data; Row-Level Security on every table

  File storage         Supabase Storage                                                  PDF certificates and exported reports (signed URLs, 1-hour expiry)

  Edge Functions       Supabase Deno Edge Functions                                      Market price fetch (daily cron), push notification dispatch, PDF generation, Razorpay webhook handler

  Realtime             Supabase Realtime                                                 Push mortality spike alert to owner's device within 30 seconds of worker's save

  Push notifications   Expo Push Notification Service (EPNS)                             Free; no FCM setup needed for Expo-managed workflow

  PDF generation       pdf-lib (in Edge Function)                                        Traceability certificates and report exports

  Charts               Victory Native (mobile) + Recharts (web)                          7-day KPI trend lines; 14-day market price charts

  Market prices        Agmarknet scrape → Supabase Edge Function → market_prices table   Fallback: owner manual entry stored in farm_settings

  Payments             Razorpay Subscriptions API                                        Monthly/yearly freemium upgrade; webhook confirms subscription status in DB
  ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------

  ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
  ⚠️ Architecture constraint: Supabase free tier allows 500 MB DB, 1 GB storage, 50,000 Edge Function invocations/month. This comfortably supports \~200 active farms. Upgrade to Pro (\$25/mo) when approaching 150 farms.

  ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------

  -----------------------------------------------------------------------
  **🛠️ 3. Technology Stack**

  -----------------------------------------------------------------------

**Mobile (Android first)**

  ------------------------------------------------------------------------------------------------------------------------------------------------
  **Component**        **Package / Version**                            **Why this choice**
  -------------------- ------------------------------------------------ --------------------------------------------------------------------------
  Framework            expo@\~51.0.0                                    Managed workflow; EAS Build handles APK/AAB; AI tools know Expo well

  Navigation           expo-router@3.x                                  File-based routing; works with Expo; simplest for AI to scaffold screens

  UI components        react-native-paper@5.x                           Material Design 3; pre-built for low-end Android; accessible; free

  Form management      react-hook-form@7.x                              Minimal re-renders; works on low-end devices; AI generates forms easily

  Form validation      zod@3.x                                          Schema validation; pairs with react-hook-form; type-safe

  Supabase client      \@supabase/supabase-js@2.x                       Official client; works in Expo

  Offline queue        \@react-native-async-storage/async-storage@1.x   Stores pending daily log entries when offline

  Push notifications   expo-notifications@0.x                           Expo-managed; no FCM config needed; free EPNS

  Charts               victory-native@36.x (Skia build)                 Performant on low-end Android; 7-day line charts

  QR display           react-native-qrcode-svg@6.x                      Generates QR code SVG for traceability batch link

  Date picker          react-native-paper (DatePickerModal)             Built into react-native-paper; no extra install

  PDF share            expo-sharing@11.x + expo-file-system@16.x        Download PDF from Supabase Storage signed URL, share via WhatsApp

  Network detection    expo-network@5.x                                 Detect offline state; trigger sync queue on reconnect

  State management     Zustand@4.x                                      Lightweight; AI generates stores easily; no boilerplate

  HTTP requests        \@supabase/supabase-js (built-in)                Use Supabase client directly; no Axios needed

  Secure storage       expo-secure-store@13.x                           Store Supabase JWT on device securely
  ------------------------------------------------------------------------------------------------------------------------------------------------

**Web (Next.js)**

  --------------------------------------------------------------------------------------------------------------------------------------------------------
  **Component**           **Package / Version**                             **Why this choice**
  ----------------------- ------------------------------------------------- ------------------------------------------------------------------------------
  Framework               next@14.x (App Router)                            Vercel-native; server components reduce bundle; AI tools excel at Next.js

  UI components           shadcn/ui (latest)                                Copy-paste components; works with Tailwind; v0.dev generates shadcn natively

  Styling                 tailwindcss@3.x                                   Utility-first; AI generates Tailwind reliably; no CSS files

  Charts                  recharts@2.x                                      Easiest chart library for AI; declarative; works with shadcn

  Supabase client         \@supabase/ssr@0.x + \@supabase/supabase-js@2.x   SSR-compatible Supabase client for Next.js App Router

  Form management         react-hook-form@7.x + zod@3.x                     Same as mobile; consistent validation logic

  PDF export              jsPDF@2.x + jspdf-autotable@3.x                   Client-side PDF for web reports

  QR code (public page)   qrcode@1.x                                        Server-side QR for traceability public pages

  Table component         TanStack Table@8.x (via shadcn)                   Report tables with sorting and filtering
  --------------------------------------------------------------------------------------------------------------------------------------------------------

**Backend (Supabase)**

  -----------------------------------------------------------------------------------------------------------------------------------
  **Component**    **Service**                            **Why this choice**
  ---------------- -------------------------------------- ---------------------------------------------------------------------------
  Database         Supabase PostgreSQL 15                 Managed; RLS built-in; free up to 500 MB

  Auth             Supabase Auth                          JWT + email/password; role claims in user_metadata; no extra setup

  Storage          Supabase Storage                       PDF and CSV file storage; signed URL expiry; 1 GB free

  Edge Functions   Supabase Deno (TypeScript)             Cron jobs for price fetch; Razorpay webhooks; PDF generation

  Realtime         Supabase Realtime (Postgres changes)   Listens to daily_logs inserts; notifies owner via push if mortality spike

  Scheduled jobs   pg_cron (via Supabase dashboard)       Daily 8 AM IST market price fetch trigger
  -----------------------------------------------------------------------------------------------------------------------------------

  -----------------------------------------------------------------------
  **🗄️ 4. Database Schema**

  -----------------------------------------------------------------------

  --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
  💡 All table and column names below are exact. AI coding tools must use these verbatim. All tables include created_at TIMESTAMPTZ DEFAULT now() and updated_at TIMESTAMPTZ DEFAULT now() unless noted.

  --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------

**Table: profiles**

One row per authenticated user. Linked to Supabase Auth via id = auth.users.id.

  ----------------------------------------------------------------------------------------------------------
  **Column**            **Type**      **Constraints / Notes**
  --------------------- ------------- ----------------------------------------------------------------------
  id                    UUID          PRIMARY KEY, references auth.users(id)

  full_name             TEXT          NOT NULL

  phone                 TEXT          nullable

  role                  TEXT          NOT NULL --- one of: owner \| worker \| vet

  farm_id               UUID          FK → farms.id; nullable for owners not yet onboarded

  subscription_status   TEXT          DEFAULT \'free\' --- one of: free \| active \| cancelled \| past_due

  subscription_id       TEXT          Razorpay subscription ID; nullable

  expo_push_token       TEXT          Expo push token for notifications; nullable

  created_at            TIMESTAMPTZ   DEFAULT now()

  updated_at            TIMESTAMPTZ   DEFAULT now()
  ----------------------------------------------------------------------------------------------------------

**Table: farms**

  ---------------------------------------------------------------------------------------------------------
  **Column**                      **Type**        **Constraints / Notes**
  ------------------------------- --------------- ---------------------------------------------------------
  id                              UUID            PRIMARY KEY DEFAULT gen_random_uuid()

  owner_id                        UUID            NOT NULL, FK → profiles.id

  farm_name                       TEXT            NOT NULL

  owner_name                      TEXT            NOT NULL

  state                           TEXT            NOT NULL --- Indian state name (used for market prices)

  district                        TEXT            NOT NULL

  phone                           TEXT            nullable

  gstin                           TEXT            nullable

  market_price_override_broiler   NUMERIC(10,2)   nullable --- owner manual price override

  market_price_override_egg       NUMERIC(10,2)   nullable

  created_at                      TIMESTAMPTZ     DEFAULT now()

  updated_at                      TIMESTAMPTZ     DEFAULT now()
  ---------------------------------------------------------------------------------------------------------

**Table: sheds**

  ------------------------------------------------------------------------------------------
  **Column**      **Type**      **Constraints / Notes**
  --------------- ------------- ------------------------------------------------------------
  id              UUID          PRIMARY KEY DEFAULT gen_random_uuid()

  farm_id         UUID          NOT NULL, FK → farms.id ON DELETE CASCADE

  shed_name       TEXT          NOT NULL

  capacity        INTEGER       NOT NULL --- max bird count

  poultry_type    TEXT          NOT NULL --- one of: broiler \| layer \| breeder

  status          TEXT          NOT NULL DEFAULT \'active\' --- one of: active \| inactive

  created_at      TIMESTAMPTZ   DEFAULT now()
  ------------------------------------------------------------------------------------------

**Table: batches**

  ----------------------------------------------------------------------------------------------------------------------------------------------------
  **Column**            **Type**        **Constraints / Notes**
  --------------------- --------------- --------------------------------------------------------------------------------------------------------------
  id                    UUID            PRIMARY KEY DEFAULT gen_random_uuid()

  shed_id               UUID            NOT NULL, FK → sheds.id ON DELETE CASCADE

  farm_id               UUID            NOT NULL, FK → farms.id (denormalised for RLS performance)

  batch_code            TEXT            NOT NULL --- auto-generated e.g. B-2026-001

  breed_name            TEXT            NOT NULL

  poultry_type          TEXT            NOT NULL --- one of: broiler \| layer \| breeder

  placement_date        DATE            NOT NULL

  opening_bird_count    INTEGER         NOT NULL

  current_bird_count    INTEGER         NOT NULL --- updated on each daily_log insert

  source_supplier       TEXT            nullable

  cost_per_bird         NUMERIC(10,2)   NOT NULL

  status                TEXT            NOT NULL DEFAULT \'active\' --- one of: active \| harvested \| closed

  harvest_date          DATE            nullable --- set on closure

  birds_sold            INTEGER         nullable --- set on closure

  sale_weight_kg        NUMERIC(10,2)   nullable --- total kg sold

  sale_price_per_kg     NUMERIC(10,2)   nullable

  total_sale_revenue    NUMERIC(12,2)   GENERATED ALWAYS AS (birds_sold \* sale_weight_kg \* sale_price_per_kg) STORED --- nullable if not harvested

  created_at            TIMESTAMPTZ     DEFAULT now()

  updated_at            TIMESTAMPTZ     DEFAULT now()
  ----------------------------------------------------------------------------------------------------------------------------------------------------

**Table: daily_logs**

Core entry table. One row per shed per day. Triggers KPI recalculation and mortality spike check.

  ------------------------------------------------------------------------------------------------------------------------------------
  **Column**          **Type**        **Constraints / Notes**
  ------------------- --------------- ------------------------------------------------------------------------------------------------
  id                  UUID            PRIMARY KEY DEFAULT gen_random_uuid()

  batch_id            UUID            NOT NULL, FK → batches.id ON DELETE CASCADE

  farm_id             UUID            NOT NULL (denormalised for RLS)

  logged_by           UUID            NOT NULL, FK → profiles.id

  log_date            DATE            NOT NULL

  birds_dead          INTEGER         NOT NULL DEFAULT 0

  death_cause         TEXT            NOT NULL DEFAULT \'unknown\' --- one of: disease \| culled \| injury \| heat_stress \| unknown

  feed_consumed_kg    NUMERIC(10,2)   NOT NULL DEFAULT 0

  feed_type           TEXT            NOT NULL --- one of: starter \| grower \| finisher \| layer \| custom

  feed_cost_per_kg    NUMERIC(10,2)   nullable

  eggs_collected      INTEGER         DEFAULT 0 --- used for layer batches only

  avg_bird_weight_g   NUMERIC(10,2)   nullable --- spot weight check

  notes               TEXT            nullable

  is_synced           BOOLEAN         DEFAULT true --- set false for offline queue rows (mobile only)

  created_at          TIMESTAMPTZ     DEFAULT now()
  ------------------------------------------------------------------------------------------------------------------------------------

  -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
  After each daily_logs INSERT, a Supabase DB Function recalculates batches.current_bird_count. A second function checks if birds_dead / (previous current_bird_count) \> mortality_alert_threshold and triggers push notification via Edge Function if true.

  -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------

**Table: health_incidents**

  --------------------------------------------------------------------------------------
  **Column**                  **Type**      **Constraints / Notes**
  --------------------------- ------------- --------------------------------------------
  id                          UUID          PRIMARY KEY DEFAULT gen_random_uuid()

  batch_id                    UUID          NOT NULL, FK → batches.id

  farm_id                     UUID          NOT NULL (denormalised)

  reported_by                 UUID          FK → profiles.id

  incident_date               DATE          NOT NULL

  symptom_description         TEXT          NOT NULL

  affected_bird_count         INTEGER       nullable

  vet_consulted               BOOLEAN       DEFAULT false

  diagnosis                   TEXT          nullable --- editable by vet role

  treatment_given             TEXT          nullable

  medicine_name               TEXT          nullable

  dose                        TEXT          nullable

  withdrawal_days             INTEGER       nullable

  withdrawal_clearance_date   DATE          GENERATED: incident_date + withdrawal_days

  vet_note                    TEXT          nullable --- appended by vet role only

  created_at                  TIMESTAMPTZ   DEFAULT now()

  updated_at                  TIMESTAMPTZ   DEFAULT now()
  --------------------------------------------------------------------------------------

**Table: vaccinations**

  --------------------------------------------------------------------------------------------------
  **Column**          **Type**      **Constraints / Notes**
  ------------------- ------------- ----------------------------------------------------------------
  id                  UUID          PRIMARY KEY DEFAULT gen_random_uuid()

  batch_id            UUID          NOT NULL, FK → batches.id

  farm_id             UUID          NOT NULL (denormalised)

  vaccine_name        TEXT          NOT NULL

  scheduled_date      DATE          NOT NULL

  administered_date   DATE          nullable --- null = pending

  dose                TEXT          nullable

  route               TEXT          nullable --- one of: oral \| injection \| spray

  birds_vaccinated    INTEGER       nullable

  status              TEXT          DEFAULT \'scheduled\' --- one of: scheduled \| done \| overdue

  administered_by     UUID          FK → profiles.id; nullable

  created_at          TIMESTAMPTZ   DEFAULT now()
  --------------------------------------------------------------------------------------------------

**Table: inventory_items**

  -----------------------------------------------------------------------------------------------------
  **Column**            **Type**        **Constraints / Notes**
  --------------------- --------------- ---------------------------------------------------------------
  id                    UUID            PRIMARY KEY DEFAULT gen_random_uuid()

  farm_id               UUID            NOT NULL, FK → farms.id

  item_name             TEXT            NOT NULL

  category              TEXT            NOT NULL --- one of: feed \| medicine \| vaccine \| equipment

  unit                  TEXT            NOT NULL --- one of: kg \| litres \| units

  current_stock         NUMERIC(12,2)   NOT NULL DEFAULT 0

  low_stock_threshold   NUMERIC(12,2)   NOT NULL DEFAULT 0

  created_at            TIMESTAMPTZ     DEFAULT now()

  updated_at            TIMESTAMPTZ     DEFAULT now()
  -----------------------------------------------------------------------------------------------------

**Table: inventory_movements**

  -----------------------------------------------------------------------------------------
  **Column**         **Type**        **Constraints / Notes**
  ------------------ --------------- ------------------------------------------------------
  id                 UUID            PRIMARY KEY DEFAULT gen_random_uuid()

  item_id            UUID            NOT NULL, FK → inventory_items.id

  farm_id            UUID            NOT NULL (denormalised)

  movement_type      TEXT            NOT NULL --- one of: purchase \| usage \| adjustment

  quantity           NUMERIC(12,2)   NOT NULL --- negative for usage

  cost_per_unit      NUMERIC(10,2)   nullable --- set for purchase

  supplier           TEXT            nullable

  movement_date      DATE            NOT NULL

  notes              TEXT            nullable

  daily_log_id       UUID            nullable --- FK → daily_logs.id for auto-deduct link

  created_at         TIMESTAMPTZ     DEFAULT now()
  -----------------------------------------------------------------------------------------

**Table: financial_transactions**

  ----------------------------------------------------------------------------------------------------------------------------------------------------------------------
  **Column**            **Type**        **Constraints / Notes**
  --------------------- --------------- --------------------------------------------------------------------------------------------------------------------------------
  id                    UUID            PRIMARY KEY DEFAULT gen_random_uuid()

  farm_id               UUID            NOT NULL, FK → farms.id

  batch_id              UUID            nullable --- FK → batches.id (null for farm-level expenses)

  transaction_type      TEXT            NOT NULL --- one of: income \| expense

  category              TEXT            NOT NULL --- income: birds \| eggs \| manure \| other; expense: feed \| medicine \| labour \| utilities \| chick_cost \| other

  amount                NUMERIC(12,2)   NOT NULL

  quantity              NUMERIC(12,2)   nullable

  price_per_unit        NUMERIC(10,2)   nullable

  buyer_or_supplier     TEXT            nullable

  transaction_date      DATE            NOT NULL

  payment_status        TEXT            DEFAULT \'paid\' --- one of: paid \| pending \| partial

  due_date              DATE            nullable --- for pending payments

  notes                 TEXT            nullable

  created_at            TIMESTAMPTZ     DEFAULT now()
  ----------------------------------------------------------------------------------------------------------------------------------------------------------------------

**Table: market_prices**

  -------------------------------------------------------------------------------------------------------
  **Column**             **Type**        **Constraints / Notes**
  ---------------------- --------------- ----------------------------------------------------------------
  id                     UUID            PRIMARY KEY DEFAULT gen_random_uuid()

  state                  TEXT            NOT NULL --- Indian state name

  price_date             DATE            NOT NULL

  broiler_price_per_kg   NUMERIC(10,2)   nullable

  egg_price_per_100      NUMERIC(10,2)   nullable

  source                 TEXT            DEFAULT \'agmarknet\' --- one of: agmarknet \| nafed \| manual

  created_at             TIMESTAMPTZ     DEFAULT now()

  UNIQUE                                 (state, price_date)
  -------------------------------------------------------------------------------------------------------

**Table: traceability_records**

One row per batch. Auto-populated as batch events occur. Immutable after batch closure.

  -------------------------------------------------------------------------------------------------------------
  **Column**               **Type**      **Constraints / Notes**
  ------------------------ ------------- ----------------------------------------------------------------------
  id                       UUID          PRIMARY KEY DEFAULT gen_random_uuid()

  batch_id                 UUID          UNIQUE, NOT NULL, FK → batches.id

  farm_id                  UUID          NOT NULL

  qr_token                 TEXT          UNIQUE, NOT NULL --- random slug for public URL: /trace/\[qr_token\]

  supplier_name            TEXT          nullable

  placement_date           DATE          NOT NULL

  breed_name               TEXT          NOT NULL

  total_vaccinations       INTEGER       DEFAULT 0

  health_incidents_count   INTEGER       DEFAULT 0

  withdrawal_cleared       BOOLEAN       DEFAULT false

  harvest_date             DATE          nullable

  buyer_name               TEXT          nullable

  certificate_pdf_url      TEXT          nullable --- Supabase Storage path

  is_locked                BOOLEAN       DEFAULT false --- set true on batch closure; prevents edits

  created_at               TIMESTAMPTZ   DEFAULT now()

  updated_at               TIMESTAMPTZ   DEFAULT now()
  -------------------------------------------------------------------------------------------------------------

**Table: farm_users (worker assignments)**

  ----------------------------------------------------------------------------------
  **Column**          **Type**      **Constraints / Notes**
  ------------------- ------------- ------------------------------------------------
  id                  UUID          PRIMARY KEY DEFAULT gen_random_uuid()

  farm_id             UUID          NOT NULL, FK → farms.id

  user_id             UUID          NOT NULL, FK → profiles.id

  role                TEXT          NOT NULL --- one of: owner \| worker \| vet

  assigned_shed_ids   UUID\[\]      nullable --- array; null = access to all sheds

  invited_at          TIMESTAMPTZ   DEFAULT now()

  accepted_at         TIMESTAMPTZ   nullable

  UNIQUE                            (farm_id, user_id)
  ----------------------------------------------------------------------------------

  -----------------------------------------------------------------------
  **🔌 5. API Design**

  -----------------------------------------------------------------------

  -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
  All client--server communication uses the Supabase JS client directly (no custom REST API). Edge Functions are used only for: market price fetch, push notification dispatch, PDF generation, and Razorpay webhooks. The table below lists all Supabase Edge Functions.

  -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------

**5.1 Supabase Edge Functions**

  ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
  **Function name**              **Trigger**                                                      **Input**                                                 **Output / Side effect**
  ------------------------------ ---------------------------------------------------------------- --------------------------------------------------------- ------------------------------------------------------------------------------------------------------------------------------------
  fetch-market-prices            pg_cron daily at 08:00 IST                                       None (reads from environment)                             Upserts today's row into market_prices for all Indian states

  send-push-notification         Called by DB trigger after daily_logs insert (mortality spike)   { user_id, title, body, data }                            Calls Expo Push API; returns { status }

  send-vaccination-reminders     pg_cron daily at 07:00 IST                                       None                                                      Queries vaccinations where scheduled_date = today or today+2 and status = scheduled; calls send-push-notification for each owner

  send-low-stock-alerts          pg_cron daily at 08:30 IST                                       None                                                      Queries inventory_items where current_stock ≤ low_stock_threshold; sends push to farm owners

  generate-traceability-pdf      HTTP POST (authenticated)                                        { batch_id }                                              Generates PDF using pdf-lib; uploads to Supabase Storage; updates traceability_records.certificate_pdf_url; returns { signed_url }

  generate-report-pdf            HTTP POST (authenticated)                                        { farm_id, report_type, date_from, date_to, batch_id? }   Generates report PDF; uploads to storage; returns { signed_url } expiring in 1 hour

  razorpay-webhook               HTTP POST (Razorpay webhook)                                     Razorpay event payload                                    On subscription.charged: sets profiles.subscription_status = active. On subscription.cancelled: sets = cancelled

  create-razorpay-subscription   HTTP POST (authenticated)                                        { plan_id, user_id }                                      Creates Razorpay subscription; returns { subscription_id, short_url } for payment link
  ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------

**5.2 Database Functions (PostgreSQL)**

  ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
  **Function name**              **Trigger**                                     **Logic**
  ------------------------------ ----------------------------------------------- --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
  update_batch_bird_count()      AFTER INSERT ON daily_logs                      Sets batches.current_bird_count = current_bird_count - NEW.birds_dead for the relevant batch_id

  check_mortality_spike()        AFTER INSERT ON daily_logs                      If (NEW.birds_dead / prev_bird_count) \> farm mortality_alert_threshold (default 0.03): calls net.http_post to invoke send-push-notification Edge Function with owner's expo_push_token

  deduct_feed_inventory()        AFTER INSERT ON daily_logs                      Finds inventory_item where farm_id = NEW.farm_id AND category = feed AND item_name matches NEW.feed_type; inserts inventory_movements row with movement_type = usage and quantity = -NEW.feed_consumed_kg; updates inventory_items.current_stock

  generate_batch_code()          BEFORE INSERT ON batches                        Sets batch_code = 'B-' \|\| EXTRACT(YEAR FROM NOW()) \|\| '-' \|\| LPAD(sequence::text, 3, '0')

  lock_traceability_on_close()   AFTER UPDATE ON batches WHERE status = closed   Sets traceability_records.is_locked = true, harvest_date, buyer_name for the matching batch
  ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------

**5.3 Client-side Supabase calls (key patterns)**

These are the primary data access patterns AI tools will implement using the Supabase JS client:

  --------------------------------------------------------------------------------------------------------------------------------------------------------------------
  **Operation**              **Table / Method**                                 **Key filters**
  -------------------------- -------------------------------------------------- --------------------------------------------------------------------------------------
  Get dashboard KPIs         batches + daily_logs aggregate                     WHERE farm_id = currentFarm AND status = active

  Submit daily log           daily_logs.insert()                                batch_id, log_date UNIQUE constraint prevents duplicate same-day entry per batch

  Get vaccination timeline   vaccinations.select()                              WHERE batch_id = ? ORDER BY scheduled_date ASC

  Get market price           market_prices.select()                             WHERE state = farm.state AND price_date = today ORDER BY created_at DESC LIMIT 1

  Get batch P&L              financial_transactions.select() + SUM aggregates   WHERE batch_id = ? GROUP BY transaction_type

  Get inventory status       inventory_items + inventory_movements              WHERE farm_id = ? with computed current_stock

  Public traceability page   traceability_records.select() (anon key)           WHERE qr_token = slug (no auth required)

  Multi-farm switch          farms.select()                                     WHERE owner_id = user.id --- returns list; client stores selected farm_id in Zustand
  --------------------------------------------------------------------------------------------------------------------------------------------------------------------

  -----------------------------------------------------------------------
  **🔒 6. Security & Rate Limiting**

  -----------------------------------------------------------------------

**Row-Level Security (RLS) policies**

Every table has RLS enabled. No table is accessible without an authenticated JWT except traceability_records (anon select on qr_token only).

  ---------------------------------------------------------------------------------------------------------------------------------------------------------------------
  **Table**                **SELECT**                                  **INSERT**                          **UPDATE**                           **DELETE**
  ------------------------ ------------------------------------------- ----------------------------------- ------------------------------------ -----------------------
  farms                    owner_id = auth.uid() OR farm_user exists   auth.uid() is owner                 owner_id = auth.uid()                owner_id = auth.uid()

  sheds                    farm_user exists for farm_id                owner role only                     owner role only                      owner role only

  batches                  farm_user exists for farm_id                owner role only                     owner role only                      owner role only

  daily_logs               farm_user exists for farm_id                worker or owner role                owner role only                      owner role only

  health_incidents         farm_user exists                            owner or vet role                   owner or vet (vet_note field only)   owner only

  vaccinations             farm_user exists                            owner role                          owner role                           owner role

  inventory_items          owner role only                             owner role only                     owner role only                      owner role only

  financial_transactions   owner role only                             owner role only                     owner role only                      owner role only

  market_prices            any authenticated user                      service role only (Edge Function)   service role only                    never

  traceability_records     anon on qr_token; farm_user for full row    service role only (trigger)         service role only                    never

  profiles                 own row only                                own row (on signup)                 own row only                         own row only
  ---------------------------------------------------------------------------------------------------------------------------------------------------------------------

**Freemium enforcement**

  ------------------------------------------------------------------------------------------------------------------------------------------------------------------
  **Limit**                     **Where enforced**           **Logic**
  ----------------------------- ---------------------------- -------------------------------------------------------------------------------------------------------
  Max 3 sheds (free)            Client + DB check function   Before shed insert: COUNT sheds WHERE farm_id = ? --- if \>= 3 and subscription_status = free: reject

  Max 1 farm (free)             Client + DB check function   Before farm insert: COUNT farms WHERE owner_id = ? --- if \>= 1 and free: reject

  Max 2 workers (free)          Client + DB check function   Before farm_users insert: COUNT workers WHERE farm_id = ? --- if \>= 2 and free: reject

  Traceability QR (paid only)   Client gate + RLS function   generate-traceability-pdf Edge Function checks subscription_status before running

  Multi-farm dashboard (paid)   Client-side gate             Consolidated dashboard screen hidden; multi-farm switcher disabled if free
  ------------------------------------------------------------------------------------------------------------------------------------------------------------------

**Rate limiting**

  ----------------------------------------------------------------------------------------------------------------------------------------------------
  **Endpoint / Operation**                   **Limit**                               **Method**
  ------------------------------------------ --------------------------------------- -----------------------------------------------------------------
  Daily log submit                           1 per batch per day (hard constraint)   UNIQUE constraint on (batch_id, log_date) in daily_logs

  Edge Function: generate-report-pdf         10 per user per hour                    Supabase Edge Function rate limit header check

  Edge Function: generate-traceability-pdf   5 per batch (idempotent)                Check if certificate_pdf_url already exists before regenerating

  Razorpay webhook                           Verified by Razorpay signature          X-Razorpay-Signature header validation in Edge Function

  Supabase Auth: login attempts              5 per 15 minutes                        Supabase Auth built-in brute-force protection

  Market price fetch                         1 per day per state                     UNIQUE constraint on (state, price_date) with UPSERT
  ----------------------------------------------------------------------------------------------------------------------------------------------------

  -----------------------------------------------------------------------
  **🤖 7. AI Integration**

  -----------------------------------------------------------------------

PoultryOS MVP does not use any LLM or generative AI APIs. All intelligence is rule-based (DB functions and Edge Functions). This section documents the planned Phase 6 integration for reference.

  ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
  **Feature**                     **Planned approach**                                                                                                                     **Phase**
  ------------------------------- ---------------------------------------------------------------------------------------------------------------------------------------- ---------------------------
  Mortality anomaly detection     Statistical model: compare daily mortality to rolling 7-day average per batch age; Z-score \> 2 = alert. No LLM required.                Phase 2 (rule-based, MVP)

  Disease risk scoring            Rule-based scoring: mortality spike + feed drop + health incident in past 3 days → score 0--100. Implemented as PostgreSQL function.     Phase 2 (rule-based, MVP)

  AI farm assistant chatbot       Claude API (claude-sonnet-4-6); system prompt includes farm context JSON; user asks natural language questions about their batch data.   Phase 6

  Feed optimisation suggestions   Rule-based: compare actual FCR to breed-standard FCR; flag if \>10% above standard. No LLM.                                              Phase 3 (rule-based, MVP)

  Predictive harvest timing       Simple regression using historical price data + batch age + current weight. Implemented in Edge Function with mathjs.                    Phase 6
  ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------

  ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
  For Phase 6 Claude API integration: use the claude-sonnet-4-6 model. Pass a structured system prompt with the current farm's batch data, last 7 daily logs, and KPI summary as JSON context. Max 1,000 output tokens. Cost at 1,000 users: \~\$15--30/month if 30% of paid users chat daily.

  ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------

  -----------------------------------------------------------------------
  **🚀 8. Deployment Strategy**

  -----------------------------------------------------------------------

**Step-by-step: Android (Expo EAS)**

1.  Run: npx create-expo-app PoultryOS \--template blank-typescript

2.  Install expo-router, react-native-paper, \@supabase/supabase-js, and all packages from stack table

3.  Create eas.json with build profiles: development \| preview \| production

4.  Run: eas build \--platform android \--profile development --- generates APK for testing

5.  Set environment variables in EAS dashboard: SUPABASE_URL, SUPABASE_ANON_KEY, RAZORPAY_KEY_ID

6.  Internal testing: share APK via eas build URL with 5 beta farmers

7.  Production: eas build \--platform android \--profile production --- generates AAB

8.  Submit to Google Play: eas submit \--platform android (requires Google Play Developer account, \$25 one-time fee)

9.  Enable OTA updates: eas update for JS-only hotfixes without new Play Store submission

**Step-by-step: Web (Next.js on Vercel)**

10. Run: npx create-next-app@14 poultryos-web \--typescript \--tailwind \--app

11. Install shadcn/ui: npx shadcn@latest init

12. Install \@supabase/ssr, \@supabase/supabase-js, recharts, jspdf

13. Connect GitHub repo to Vercel; set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in Vercel env vars

14. Every git push to main auto-deploys to Vercel; preview deployments on PRs

15. Set custom domain in Vercel dashboard (e.g. app.poultryos.com)

16. Public traceability pages (/trace/\[token\]) are statically rendered; no auth required

**Step-by-step: Supabase backend**

17. Create Supabase project in ap-south-1 (Mumbai) region

18. Run all CREATE TABLE statements from Section 4 in SQL Editor

19. Enable RLS on every table; apply policies from Section 6

20. Create PostgreSQL functions from Section 5.2 in SQL Editor

21. Deploy Edge Functions: supabase functions deploy fetch-market-prices (and all others)

22. Set Edge Function secrets: RAZORPAY_WEBHOOK_SECRET, EXPO_ACCESS_TOKEN

23. Enable pg_cron extension; set cron jobs for 08:00 IST and 07:00 IST jobs

24. Create Supabase Storage bucket: reports (private) with signed URL policy

25. Point Razorpay webhook URL to: https://\[project-ref\].supabase.co/functions/v1/razorpay-webhook

  -----------------------------------------------------------------------
  **📊 9. Performance Requirements**

  -----------------------------------------------------------------------

  ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
  **Metric**                                   **Target**                                             **Strategy to achieve**
  -------------------------------------------- ------------------------------------------------------ ------------------------------------------------------------------------------------------------------
  App cold start (low-end Android)             \< 3 seconds                                           Expo bundle splitting; lazy-load non-dashboard screens; defer chart library load

  Daily log save (online)                      \< 1 second                                            Single Supabase insert; DB triggers run async; no client-side wait for KPI recalc

  Daily log save (offline)                     Instant (queued)                                       Write to AsyncStorage immediately; show success; sync when back online

  Dashboard KPI load                           \< 2 seconds on 4G                                     Pre-computed KPI columns on batches table; single SELECT (no aggregation at read time)

  Push notification delivery                   \< 30 seconds from daily_logs insert                   DB trigger → Edge Function → Expo Push API chain; target P95 under 30s

  PDF generation                               \< 10 seconds                                          Run in Edge Function (Deno); upload to Supabase Storage; return signed URL

  Chart render (7-day trend)                   \< 500ms                                               Max 7 data points; Victory Native renders in JS thread; avoid unnecessary re-renders with React.memo

  Market price fetch                           Daily at 08:00 IST; stale-while-revalidate on client   Client reads from market_prices table; never calls Agmarknet directly

  App bundle size (Android APK)                \< 50 MB                                               Expo managed build; exclude unused native modules; use expo-asset for images

  Concurrent farms supported (Supabase free)   Up to 150 active farms                                 Upgrade to Supabase Pro (\$25/mo) at 150 farms; PostgreSQL handles 500+ easily
  ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------

  -----------------------------------------------------------------------
  **💰 10. Cost Estimate**

  -----------------------------------------------------------------------

  ---------------------------------------------------------------------------------------------------------------------------------------------------------------
  **Service**                  **Free tier**                        **Cost at 50 farms**          **Cost at 200 farms**   **Cost at 1,000 farms**
  ---------------------------- ------------------------------------ ----------------------------- ----------------------- ---------------------------------------
  Supabase                     500 MB DB, 50k Edge Fn calls/mo      \$0 (free tier sufficient)    \$25/mo (Pro)           \$25--75/mo (Pro + compute)

  Vercel (Next.js)             Unlimited hobby projects             \$0 (free sufficient)         \$0 (free sufficient)   \$20/mo (Pro for team)

  Expo EAS Build               30 free builds/month                 \$0                           \$0                     \$29/mo (Production plan)

  Razorpay                     No monthly fee; 2% per transaction   \$0 + 2% of revenue           \$0 + 2% of revenue     \$0 + 2% of revenue

  Domain (app.poultryos.com)   N/A                                  \~\$12/year                   \~\$12/year             \~\$12/year

  Google Play Developer        One-time \$25                        \$25 one-time                 \$0                     \$0

  Agmarknet scraping           Free (public data)                   \$0                           \$0                     \$0 (or \$10/mo for proxy if blocked)

  Total estimated              ---                                  \~\$2/month + \$25 one-time   \~\$25--37/month        \~\$65--85/month
  ---------------------------------------------------------------------------------------------------------------------------------------------------------------

  ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
  💹 Revenue model: Free plan = 0 revenue. Paid plan target = ₹499/month per farm. At 50 paid farms: ₹24,950/month (≈\$300). Infrastructure cost at 50 paid farms: \~\$2/month. Very healthy unit economics.

  ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------

  -----------------------------------------------------------------------
  **📋 11. Development Checklist**

  -----------------------------------------------------------------------

**Phase 1: Foundation (Weeks 1--3) --- Android**

-   Week 1, Day 1--2: Supabase project setup, all tables from Section 4, RLS policies, seed data

-   Week 1, Day 3--5: Expo project init, expo-router screens scaffold, Supabase client config, auth flow (login/register/onboarding wizard)

-   Week 2, Day 1--3: Farm setup screen, shed creation, batch creation, batch list screen

-   Week 2, Day 4--5: Daily log entry screen (offline queue with AsyncStorage), confirmation screen

-   Week 3, Day 1--2: DB trigger for bird count update and mortality spike check

-   Week 3, Day 3--5: Push notifications (expo-notifications setup, send-push-notification Edge Function), mortality spike alert end-to-end test

-   Phase 1 gate: worker completes daily log in \< 60 seconds; offline queue syncs correctly

**Phase 2: Core Operations (Weeks 4--6)**

-   Week 4: Health incident form, withdrawal tracker, vet role access, health incident list per batch

-   Week 5: Vaccination scheduler screen, schedule builder, vaccination reminders Edge Function, pg_cron setup

-   Week 6: Inventory screens (item list, stock levels, purchase entry), deduct_feed_inventory DB function, low-stock alert Edge Function

-   Phase 2 gate: all 13 core features functional end-to-end on Android

**Phase 3: Financials + KPIs (Weeks 7--9)**

-   Week 7: Income and expense entry screens, financial_transactions table queries, payment status tracker

-   Week 8: KPI dashboard (FCR, livability, production % cards), 7-day trend charts with Victory Native

-   Week 9: Batch P&L screen, batch closure flow, cumulative calculations, breed benchmark comparison

-   Phase 3 gate: owner sees real-time projected profit on dashboard

**Phase 4: Standout Features (Weeks 10--12)**

-   Week 10: Market price fetch Edge Function, pg_cron cron job, market_prices table, dashboard price strip, manual override

-   Week 11: 14-day price history chart (Victory Native), profit calculator card on batch detail

-   Week 12: Traceability records (auto-populate on batch events), QR code generation (react-native-qrcode-svg), generate-traceability-pdf Edge Function, PDF share via WhatsApp

-   Phase 4 gate: traceability certificate PDF shareable via WhatsApp from mobile

**Phase 5: Web Dashboard + Billing (Weeks 13--16)**

-   Week 13: Next.js project setup, Vercel deploy, Supabase SSR auth, login/dashboard screens with shadcn/ui

-   Week 14: Web versions of reports (Recharts), export to PDF (jsPDF), export to CSV, public traceability page (/trace/\[token\])

-   Week 15: Razorpay subscription integration (create-razorpay-subscription Edge Function, razorpay-webhook Edge Function), freemium gate UI

-   Week 16: Multi-farm consolidated dashboard (web only), farm switcher, end-to-end beta testing with 5 farms, Play Store submission

-   Phase 5 gate: public launch ready; Razorpay billing tested end-to-end

  -----------------------------------------------------------------------
  **🎯 12. Technical Success Criteria**

  -----------------------------------------------------------------------

**The build is technically done when all of these pass:**

  -----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
  **Criterion**                                      **How to verify**                                                                                 **Pass / Fail**
  -------------------------------------------------- ------------------------------------------------------------------------------------------------- ------------------------------------------------------------------------
  Daily log saved offline and synced on reconnect    Kill network, submit log, restore network, verify row in daily_logs                               Pass = row appears within 10s of reconnect

  Mortality spike push in \< 30s                     Submit daily_log with birds_dead \> 3% threshold; measure time to push notification               Pass = notification received on owner device in \< 30s

  RLS: worker cannot read financials                 Log in as worker; attempt to query financial_transactions via Supabase client                     Pass = empty result set (not 403, but RLS returns 0 rows)

  Traceability PDF generated and shared              Close a batch; tap Generate Certificate; share via WhatsApp                                       Pass = PDF opens in WhatsApp with correct batch data

  Market price shows on dashboard                    Run fetch-market-prices Edge Function; open dashboard                                             Pass = price strip shows today's date and non-null price

  Razorpay upgrade flow                              Start as free user; tap Upgrade; complete Razorpay payment; verify subscription_status = active   Pass = paid features unlock within 60s of payment

  App loads in \< 3s on low-end Android              Test on Redmi 9A (2 GB RAM, Android 10); measure from app icon tap to dashboard interactive       Pass = \< 3 seconds on 4G

  No data loss on 10-shed, 5-batch, 90-day dataset   Seed 10 sheds, 5 batches, 90 daily entries; run all report screens                                Pass = no errors; all KPIs calculate correctly

  Freemium gates enforced                            On free account: try to add 4th shed, 2nd farm, 3rd worker                                        Pass = all blocked with upgrade prompt

  PDF export signed URL expires in 1 hour            Generate report; note signed URL; access URL after 1 hour                                         Pass = URL returns 403 after expiry

  Public traceability page loads without auth        Open /trace/\[token\] in incognito browser                                                        Pass = page loads with correct batch data; no financial fields visible
  -----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------

*PoultryOS TRD v1.0 --- April 2026 --- Confidential --- Vibe-Coding Edition*

All table names, column names, and package names in this document are exact and intended for direct use by AI coding tools.
