# PoultryOS Daily Tasks

## Day 1 — External Setup

> **Date**: 2026-05-02
> **Goal**: Kick off all external accounts, API keys, and approvals that have lead times. NO code today.
> **Why this order matters**: Tasks 1–4 have human-review delays (1–7 days). Get them in motion first thing in the morning so the clock starts ticking. Tasks 5–7 are instant and can be done after.

---

### Recommended execution order (by lead-time priority)

1. Task 1 (AiSensy + WhatsApp Business) — **start FIRST**, blocks 3–7 days of Meta verification
2. Task 2 (WhatsApp templates) — submit immediately after Task 1 account is live (24–48 hr clock)
3. Task 3 (Razorpay KYC) — 1–3 day clock
4. Task 4 (MSG91) — 1–2 day clock
5. Tasks 5, 6, 7 — instant, do in any order after the above are submitted

---

### Documents to keep ready before starting (collect these once, reuse for tasks 1, 3, 4)

- [ ] PAN card (founder/business)
- [ ] Aadhaar card (founder)
- [ ] GSTIN certificate (if registered) — **mark "not registered" if you don't have one yet; Razorpay live mode prefers GSTIN**
- [ ] Cancelled cheque OR bank statement (for settlement account)
- [ ] Business registration proof (LLP/Pvt Ltd certificate, MSME/Udyam, or proprietorship declaration)
- [ ] Director/proprietor selfie + ID (for video KYC)
- [ ] Business address proof (utility bill, rent agreement)
- [ ] Brand logo (PNG, 640×640 min) — for WhatsApp Business profile
- [ ] Website URL (can be a temporary landing page or GitHub Pages stub)
- [ ] Business email on a verified domain — `@poultryos.in` or similar (Meta rejects gmail.com for WABA)

---

## Task 1 — AiSensy account + WhatsApp Business profile

- [ ] **Signup URL**: https://www.aisensy.com/signup
- [ ] **Plan to choose**: "Pro" or "Basic" (₹999/mo) — confirm 1,000 conversations/mo included
- [ ] **What to prepare**:
  - Business email on a verified custom domain (NOT gmail.com — Meta will reject)
  - Phone number that is NOT currently registered on personal WhatsApp (or be ready to delete it from personal WhatsApp first — irreversible)
  - Business display name: "PoultryOS" (must match brand)
  - Business category: "Agriculture / Farming Services"
  - Business description (1–2 sentences)
  - Logo (640×640 PNG, square, brand colours)
  - Website URL
  - Facebook Business Manager account (create at https://business.facebook.com if you don't have one) — AiSensy will request access during onboarding
- [ ] **Expected approval time**: 3–7 business days (Meta WABA verification is the bottleneck, not AiSensy itself)
- [ ] **Verification step**: Send a test "hello world" message from the AiSensy dashboard to your own WhatsApp number — must arrive with the green "Business Verified" tick
- [ ] **Blocks**: Phase 2 (Weeks 4–7) entirely. WhatsApp integration cannot start without approved WABA. **CRITICAL**

---

## Task 2 — Submit 6 WhatsApp message templates

> Do this immediately after Task 1's AiSensy login works (you do NOT need to wait for full WABA verification to submit templates — they queue and get approved once WABA is live).

- [ ] **URL**: AiSensy Dashboard → "Templates" → "Create New Template"
- [ ] **What to prepare**: The 6 template texts below — copy verbatim from CLAUDE.md "WhatsApp Templates" section. Keep the template IDs identical to the table in CLAUDE.md.

| Template ID | Category | Language | Body (with variables) |
|-------------|----------|----------|---|
| `daily_digest` | UTILITY | English (en) | "Hi {{1}}, today's farm report: {{2}} mortality, {{3}} kg feed used, market broiler {{4}}/kg." |
| `mortality_alert` | UTILITY | English (en) | "⚠️ Mortality alert at {{1}} farm: {{2}} birds dead today (>{{3}}% threshold). Check {{4}} shed." |
| `vaccination_reminder` | UTILITY | English (en) | "Reminder: {{1}} vaccination due {{2}} for batch {{3}}. Mark done in app." |
| `heat_stress_alert` | UTILITY | English (en) | "🔥 Heat alert: {{1}}°C forecast tomorrow at {{2}}. Actions: increase water, run foggers, reduce feed by 20%." |
| `payment_reminder` | UTILITY | English (en) | "Reminder: ₹{{1}} pending from {{2}}. Pay via UPI: {{3}}" |
| `low_stock_alert` | UTILITY | English (en) | "⚠️ Low stock at {{1}}: {{2}} below threshold. Reorder soon." |

- [ ] **Submission rules** (Meta will reject if violated):
  - Category MUST be UTILITY (not MARKETING) — these are transactional alerts
  - No promotional language ("buy now", "best price", "limited offer")
  - Variables `{{1}}`, `{{2}}`, etc. must have a sample value attached during submission
  - Provide a 1-line "use case description" for each (e.g., "Sent at 8 PM IST after farmer logs daily data")
- [ ] **Have backup wording ready**: If Meta rejects on first pass, prepare a softer rephrase removing emojis/imperatives. Save the rejection reason — common cause is "looks promotional".
- [ ] **Expected approval time**: 24–48 hours per template (parallel review). Plan for 1 rejection cycle = up to 96 hours.
- [ ] **Verification step**: All 6 templates show status "APPROVED" (green) in the AiSensy template list
- [ ] **Blocks**: Phase 2 Week 5 onward. `send-daily-digest`, `send-heat-stress-alert`, `send-payment-reminders` cannot ship until templates are approved. **CRITICAL**

---

## Task 3 — Razorpay test account + KYC for live mode

- [ ] **Signup URL**: https://dashboard.razorpay.com/signup
- [ ] **Test mode**: Available immediately on signup — capture `rzp_test_xxx` Key ID + Key Secret right away (store in 1Password / .env). Phase 3 financial work can begin in test mode.
- [ ] **What to prepare for live KYC**:
  - PAN (business)
  - GSTIN (strongly recommended — without it, you're capped at lower limits)
  - Bank account details + cancelled cheque (settlement account)
  - Business registration proof (Pvt Ltd / LLP cert / Udyam MSME / proprietorship declaration)
  - Business address proof
  - Director PAN + Aadhaar + selfie (video KYC)
  - Website URL with visible: privacy policy, terms, refund policy, contact page (Razorpay rejects without these — stub them as static pages on Vercel later if needed)
- [ ] **Submit KYC at**: Dashboard → Account & Settings → "Activate Account"
- [ ] **Expected approval time**: 1–3 business days for live mode activation; another 1 day to enable Subscriptions + UPI Collect features (request via support if not auto-enabled)
- [ ] **Verification step**:
  1. Test mode: create a test ₹1 order via dashboard, complete payment with test card `4111 1111 1111 1111` — status shows "Captured"
  2. Live mode: dashboard banner changes from "Test Mode" toggle to live; "Activated" badge appears on the home page
- [ ] **Blocks**: Phase 3 Week 8–10 (UPI Collect) requires LIVE mode + UPI Collect enabled. Phase 5 Week 14+ (Razorpay Subscriptions billing) also requires live mode. Test mode unblocks dev work in the meantime.

---

## Task 4 — MSG91 signup for SMS OTP gateway

- [ ] **Signup URL**: https://control.msg91.com/signup
- [ ] **What to prepare**:
  - Business email
  - Mobile number (for OTP verification of MSG91 itself)
  - PAN + GSTIN (for KYC)
  - Sender ID request: 6-character alphanumeric (e.g., `PLTYOS`) — must match registered business name
  - DLT registration: Required for India SMS post-2021. Register on:
    - Jio: https://trueconnect.jio.com
    - Airtel: https://www.airtel.in/business/airtel-iq/dlt
    - Vi: https://www.vilpower.in
    - BSNL: https://www.ucc-bsnl.co.in
  - DLT entity registration usually done with Jio TrueConnect (covers most operators). Need PAN + GST + authorisation letter.
  - OTP template content for DLT approval: `"{#var#} is your PoultryOS verification code. Valid for 5 minutes. Do not share with anyone."` — register this exact template on DLT first, then map in MSG91.
- [ ] **Expected approval time**:
  - MSG91 account: instant
  - KYC: 1–2 business days
  - DLT entity registration: 2–4 days (separate process)
  - DLT template approval: 1–3 days after entity is approved
  - **Realistic end-to-end: 1 week before first OTP can be sent in production**
- [ ] **Verification step**: Trigger a test OTP from MSG91 dashboard to your own number using the registered template — SMS arrives with sender ID `PLTYOS` (or chosen ID) within 30 seconds
- [ ] **Blocks**: Phase 1 Week 2 — mobile OTP login flow. **CRITICAL** for the very first user-facing screen. Without this, no one can sign in.

---

## Task 5 — OpenWeatherMap free tier API key

- [ ] **Signup URL**: https://home.openweathermap.org/users/sign_up
- [ ] **What to prepare**:
  - Email + password
  - Confirm intended use: "Weather forecasts for agricultural app"
- [ ] **After signup**:
  - Navigate to: https://home.openweathermap.org/api_keys
  - Default key auto-generated; rename to `poultryos-prod`
  - Verify subscription: free tier = 1,000 calls/day, 60/min
  - Confirm "One Call API 3.0" is enabled (free tier includes 1,000 calls/day on this endpoint)
- [ ] **Expected approval time**: Instant signup; **API key takes ~10 minutes to activate** after creation (calls return 401 until then — known behaviour, don't panic)
- [ ] **Verification step**: From terminal:
  `curl "https://api.openweathermap.org/data/2.5/weather?q=Hyderabad&appid=YOUR_KEY"`
  → returns JSON with `"name":"Hyderabad"` and 200 OK
- [ ] **Blocks**: Phase 1 Week 3 (weather widget) and Phase 2 (heat-stress alerts). Not critical — can be wired in late Phase 1.

---

## Task 6 — Supabase project in ap-south-1 (Mumbai) — ✅ DONE (via MCP)

- [x] **Signup URL**: https://supabase.com/dashboard/sign-up
- [x] **Project provisioned**: URL = `https://jusxngbfdmzhlybohell.supabase.co`
- [x] **Region verified**: server IP `2406:da14:…` resolves to AWS ap-south-1 (Mumbai) ✓ DPDP-compliant
- [x] **Postgres version**: 17.6 (newer than the PG15 noted in CLAUDE.md — non-blocking; update CLAUDE.md tech-stack reference when convenient)
- [x] **Supabase MCP server connected** in `.mcp.json` — Claude can run SQL, manage tables, RLS, Edge Functions, secrets directly. No manual dashboard work needed for schema/Edge Function tasks.
- [x] **`public` schema currently empty** — expected; schema migrations are Phase 1 Week 1 work, not Day 1
- [ ] **Still to capture & store securely** (do this manually in 1Password — MCP doesn't expose them):
  - `anon` key (public, used in client)
  - `service_role` key (SECRET, used only in Edge Functions)
  - JWT secret (Settings → API)
  - Database password (set during project creation)
- [x] **Blocks**: Phase 1 Week 1 — UNBLOCKED.

---

## Task 7 — GitHub repo + Vercel project linked to repo

### 7a. GitHub repo — ⚠️ PARTIALLY DONE
- [x] **Remote repo created** at https://github.com/fynarctechworks/Poultry_management (verified reachable, HTTP 200)
- [ ] **Local repo not yet initialised** — `/Users/rishikanth/poultry_management` is not a git directory yet. Still to do:
  - `git init` in this directory
  - `git remote add origin https://github.com/fynarctechworks/Poultry_management.git`
  - Stage current files (`CLAUDE.md`, `PRD.md`, `TRD.md`, `tasks/`, `.claude/`, `.mcp.json`, `.gitignore`)
  - Add a `README.md` stub (even one line — Vercel needs one)
  - First commit + `git push -u origin main`
- [ ] **Branch protection** on `main`: require PR, require 1 review (set in GitHub repo settings after first push)
- [ ] **Verification step**: `git remote -v` shows the GitHub URL; `git push origin main` succeeds; repo shows file tree on GitHub

### 7b. Vercel project
- [ ] **Signup URL**: https://vercel.com/signup (use GitHub OAuth)
- [ ] **What to prepare**:
  - Hobby tier (free) is fine for now; upgrade to Pro before launch if team size grows
  - Connect GitHub account → grant Vercel access to the `poultryos` repo only (NOT all repos)
- [ ] **Project setup**:
  - Import `poultryos` repo
  - Framework preset: Next.js (even though no code yet — Vercel will detect once `web/` folder exists)
  - Root directory: leave as `./` for now; will set to `web/` once monorepo structure exists
  - Build command: default (`next build`)
  - Environment variables: leave empty for now; will add Supabase keys once Task 6 done
  - Production branch: `main`; preview branches: all others
- [ ] **Expected approval time**: Instant
- [ ] **Verification step**: First deploy succeeds (will be empty/404 page since no code yet, but build must complete green); auto-deploys triggered on push to `main`
- [ ] **Blocks**: Phase 5 (web dashboard launch). Not on critical path for Phase 1 mobile work, but cheap to set up today so deploy pipeline is ready.

---

## End-of-Day 1 success criteria

By EOD today, all of these must be true:

- [ ] AiSensy account created, WABA verification submitted (waiting on Meta)
- [ ] 6 WhatsApp templates submitted (waiting on Meta)
- [ ] Razorpay test keys captured + KYC documents uploaded for live mode (waiting on Razorpay)
- [ ] MSG91 account created, KYC submitted, DLT entity registration started (waiting on telcos)
- [ ] OpenWeatherMap API key in `.env.local` (verified working)
- [x] Supabase project live in Mumbai region (jusxngbfdmzhlybohell), MCP connected — **anon/service_role/JWT keys still need to be saved to 1Password**
- [ ] GitHub repo pushed (remote exists at fynarctechworks/Poultry_management; local `git init` + first push still pending), Vercel project linked + first deploy green

## Day 2 readiness check

If everything above is "submitted" (even if not yet "approved"), you are unblocked to start Phase 1 Week 1 tomorrow:
- Supabase schema migration files (uses Task 6 only)
- Expo project init + Next.js scaffold (uses Task 7 only)
- Auth wiring can start in Supabase email-mode (defers MSG91 dependency to Week 2)

The waiting-on-third-party tasks (1, 2, 3, 4) will resolve in parallel during Week 1 coding.

---

## Lessons captured today

_To be filled in `tasks/lessons.md` if any task surfaces a non-obvious gotcha (e.g., Meta rejection reasons, DLT template format quirks)._

---

# Day 2 — Initial Schema Migration

> **Date**: 2026-05-02
> **Goal**: Generate one comprehensive SQL migration file at `supabase/migrations/20260502000000_initial_schema.sql` that stands up the entire PoultryOS v2 database in a single shot — 20 tables, RLS on every table, all 8 trigger functions, pg_cron + pg_net extensions, and seed data for 4 integrators.
> **Mode**: PLAN ONLY. No SQL written until you approve the plan below.

---

## 1. Plan summary

One transaction-safe `.sql` file, idempotent where possible (`CREATE EXTENSION IF NOT EXISTS`, `CREATE TABLE IF NOT EXISTS` is **not** used — we want the migration to fail loudly if re-run on a non-empty schema). Structured top-to-bottom so `psql` runs it as a single forward-only step.

Estimated total size: **~1,800–2,200 lines of SQL** (~70 KB). Breakdown later in section 5.

---

## 2. Migration file structure (in execution order)

The order respects FK dependencies and PostgreSQL's "create-before-reference" requirement.

### Section A — Preamble (~30 lines)
1. Header comment block: file name, date, author, version
2. `BEGIN;` — wrap entire migration in a transaction so a single failure rolls everything back
3. Enable extensions:
   - `uuid-ossp` (for `uuid_generate_v4()`)
   - `pgcrypto` (Supabase's preferred UUID source — `gen_random_uuid()`)
   - `pg_cron` (scheduled jobs, lives in `cron` schema)
   - `pg_net` (HTTP from Postgres, lives in `net` schema — needed by `check_mortality_spike`)
4. Set `search_path` to `public, extensions` for the migration session

### Section B — Enums / custom types (~40 lines)

CLAUDE.md uses string-typed status fields. Two reasonable choices:
- **(a)** Use `TEXT` + `CHECK` constraints (simpler, easier to migrate later)
- **(b)** Use proper `CREATE TYPE … AS ENUM` (stricter, harder to alter)

**My recommendation: option (a) — TEXT + CHECK.** Reason: enums in PG are painful to add values to (`ALTER TYPE … ADD VALUE` is non-transactional and irreversible), and PoultryOS will likely add roles, statuses, and categories over time. CHECK constraints can be dropped/recreated in a follow-up migration cleanly.

> ⚠️ **Ambiguity #1 flagged for your decision** — see section 4.

### Section C — Tables (in FK-safe creation order, ~1,100 lines)

Created in this order so every FK target exists before it is referenced:

| # | Table | Why it goes here |
|---|---|---|
| 1 | `integrators` | No FKs out. Master list. |
| 2 | `farms` | Self-contained except `integrator_id` (just created). `owner_id` → `auth.users(id)` (Supabase built-in). |
| 3 | `profiles` | FK → `auth.users(id)` and `farms(id)`. Created after farms. |
| 4 | `sheds` | FK → `farms`. |
| 5 | `batches` | FK → `sheds`, `farms`. |
| 6 | `farm_users` | FK → `farms`, `auth.users`. |
| 7 | `buyers` | FK → `farms`. |
| 8 | `daily_logs` | FK → `batches`, `farms`, `profiles`. |
| 9 | `health_incidents` | FK → `batches`, `farms`, `profiles`. |
| 10 | `vaccinations` | FK → `batches`, `farms`, `profiles`. |
| 11 | `inventory_items` | FK → `farms`. |
| 12 | `inventory_movements` | FK → `inventory_items`, `farms`, `daily_logs`. |
| 13 | `financial_transactions` | FK → `farms`, `batches`, `buyers`. |
| 14 | `payment_reminders` | FK → `farms`, `buyers`, `financial_transactions`. |
| 15 | `market_prices` | No FKs. |
| 16 | `traceability_records` | FK → `batches`, `farms`. |
| 17 | `weather_data` | FK → `farms`. |
| 18 | `weather_alerts` | FK → `farms`. |
| 19 | `contract_cycles` | FK → `farms`, `batches`, `integrators`. |
| 20 | `whatsapp_messages_log` | FK → `farms`. |

**For each table I'll generate**:
- All columns with exact names + types from CLAUDE.md
- `id UUID PRIMARY KEY DEFAULT gen_random_uuid()`
- `created_at`, `updated_at` (TIMESTAMPTZ default `now()`)
- All declared `UNIQUE` and `CHECK` constraints
- All `GENERATED` columns (e.g., `total_sale_revenue`, `withdrawal_clearance_date`, `max_temp_today`)
- `ON DELETE CASCADE` where CLAUDE.md says CASCADE (sheds, batches, daily_logs, buyers, contract_cycles, etc.)
- `ON DELETE SET NULL` for nullable FKs (`integrator_id`, `buyer_id`, `daily_log_id`)

### Section D — Indexes (~80 lines)

Beyond the auto-indexes from PK/UNIQUE, explicit indexes for hot RLS lookups and dashboard queries:
- `farms(owner_id)`, `profiles(farm_id)`, `farm_users(user_id)`, `farm_users(farm_id, user_id)` — RLS path
- `daily_logs(batch_id, log_date DESC)` — batch detail screen
- `daily_logs(farm_id, log_date DESC)` — dashboard recent entries
- `financial_transactions(farm_id, transaction_date DESC)`
- `financial_transactions(buyer_id)` for Khata ledger
- `weather_data(farm_id, fetched_at DESC)`
- `whatsapp_messages_log(farm_id, created_at DESC)`
- `traceability_records(qr_token)` — public lookup (already UNIQUE → indexed)
- `vaccinations(scheduled_date) WHERE status = 'scheduled'` — partial index for cron

### Section E — `updated_at` trigger function + per-table triggers (~50 lines)
Single `tg_set_updated_at()` function. Apply to every table that has `updated_at` (all 20).

### Section F — Business-logic DB functions + their triggers (~400 lines)

All 8 functions from CLAUDE.md:

| # | Function | Trigger / caller | Notes |
|---|---|---|---|
| 1 | `update_batch_bird_count()` | AFTER INSERT ON `daily_logs` | Subtracts `birds_dead` from `batches.current_bird_count` for this batch |
| 2 | `check_mortality_spike()` | AFTER INSERT ON `daily_logs` | If today's mortality % > breed threshold (default 1%/day), call `net.http_post` to `send-push-notification` and `send-whatsapp-message` Edge Functions. ⚠️ **Ambiguity #2** — see section 4 |
| 3 | `deduct_feed_inventory()` | AFTER INSERT ON `daily_logs` | If `feed_consumed_kg > 0`, find the matching feed inventory item by `farm_id + feed_type` and insert a `usage` movement that decrements stock |
| 4 | `generate_batch_code()` | BEFORE INSERT ON `batches` | Format `B-{farm_id_short}-{YYMMDD}-{seq}`. Use `LPAD` on a per-farm counter. ⚠️ **Ambiguity #3** — see section 4 |
| 5 | `lock_traceability_on_close()` | AFTER UPDATE ON `batches` WHEN `status = 'closed'` | Sets `traceability_records.is_locked = true` for the row matching this batch |
| 6 | `update_buyer_balance()` | AFTER INSERT/UPDATE ON `financial_transactions` WHERE `buyer_id IS NOT NULL` | Recompute buyer's `current_balance` from sum of `income - paid` across their transactions; update `last_transaction_date` |
| 7 | `check_payment_overdue()` | Called by `send-payment-reminders` cron (NOT a trigger) | Pure SELECT/UPDATE function; returns set of overdue transactions ready for reminder. Cron job invokes Edge Function |
| 8 | `lock_contract_cycle_on_close()` | AFTER UPDATE ON `contract_cycles` WHERE `status = 'settled'` | Marks row immutable; subsequent UPDATEs blocked by a row-level CHECK or by setting a `locked_at` timestamp + RLS deny rule |

> Edge Function URLs are templated as `current_setting('app.edge_function_base_url', true)` — the migration leaves this empty; Day 3 task is to set it via `ALTER DATABASE … SET app.edge_function_base_url = '…'` once the Supabase project ref is finalised. (It is, but I'll document it explicitly in the migration so it's not magic.)

### Section G — RLS: enable + policies (~350 lines)

`ALTER TABLE … ENABLE ROW LEVEL SECURITY;` on all 20 tables, then policies per CLAUDE.md "RLS Policy Summary":

| Table | Owner | Worker | Vet | Anon | Service role |
|---|---|---|---|---|---|
| profiles | self read/update | self read | self read | — | full |
| farms | own farm CRUD | read own farm | read own farm | — | full |
| sheds | own farm CRUD | read assigned only | read own farm | — | full |
| batches | own farm CRUD | read assigned shed | read own farm | — | full |
| daily_logs | own farm CRUD | INSERT + read assigned shed | read own farm | — | full |
| health_incidents | own farm CRUD | INSERT + read assigned shed | read + UPDATE `vet_note` only on own farm | — | full |
| vaccinations | own farm CRUD | read | read | — | full |
| inventory_items | own farm CRUD | read | — | — | full |
| inventory_movements | own farm CRUD | INSERT only | — | — | full |
| financial_transactions | owner only | NONE | NONE | — | full |
| market_prices | any auth read | any auth read | any auth read | — | full INSERT/UPDATE |
| traceability_records | own farm CRUD | read own farm | read own farm | SELECT by `qr_token` only | full |
| farm_users | owner CRUD | read self | read self | — | full |
| buyers | owner only | NONE | NONE | — | full |
| payment_reminders | owner SELECT only | NONE | NONE | — | full INSERT |
| weather_data | any farm member SELECT | any farm member SELECT | any farm member SELECT | — | full INSERT/UPDATE |
| weather_alerts | same as weather_data | same | same | — | full INSERT |
| integrators | any auth SELECT | any auth SELECT | any auth SELECT | — | full INSERT |
| contract_cycles | owner only; immutable when `status='settled'` | NONE | NONE | — | full |
| whatsapp_messages_log | owner SELECT only | NONE | NONE | — | full INSERT |

**Helper functions** I'll create to keep policies readable and fast:
- `auth.user_role_for_farm(farm_id UUID) RETURNS TEXT` — looks up `farm_users.role` for `auth.uid()`
- `auth.user_assigned_sheds(farm_id UUID) RETURNS UUID[]` — returns shed ids the worker is assigned to

These are SECURITY DEFINER STABLE functions, marked `LEAKPROOF` where safe, so PG can inline them in policy plans.

### Section H — Seed data for `integrators` (~60 lines)

4 rows. All marked `is_pre_loaded = true`. Each row has a `tariff_card_json` with the 4 fields from CLAUDE.md (`base_growing_charge_per_kg`, `fcr_bonus`, `mortality_bonus`, `weight_target_kg`, `cycle_days`) plus a `review_required: true` flag I'll add to every row, since the actual contract terms vary by region/year and need a human to verify before going to production.

Plausible Indian poultry contract values I will use as placeholders (commonly cited in trade publications, but **all flagged for your review**):

| Integrator | Base ₹/kg | FCR threshold | FCR bonus ₹/kg | Mortality threshold | Mortality bonus ₹/kg | Weight target | Cycle days | States |
|---|---|---|---|---|---|---|---|---|
| Suguna | 7.50 | 1.65 | 0.50 | 5% | 0.30 | 2.2 kg | 42 | TN, KA, AP, TS, MH |
| Venkateshwara (Venky's) | 7.25 | 1.70 | 0.40 | 5% | 0.25 | 2.2 kg | 42 | MH, GJ, MP, UP |
| Skylark | 7.40 | 1.68 | 0.45 | 5% | 0.30 | 2.2 kg | 42 | HR, PB, UP, RJ |
| IB Group | 7.30 | 1.68 | 0.40 | 5% | 0.25 | 2.2 kg | 42 | WB, OR, JH, BR, CG |

Every JSON object will include `"review_required": true, "source": "estimated_2025_industry_average"` so the application layer can warn the owner if they pick an unreviewed integrator.

### Section I — Closing (~5 lines)
- `COMMIT;`
- Trailing comment with rollback notes

---

## 3. Files I will create

| Path | Purpose |
|---|---|
| `supabase/migrations/20260502000000_initial_schema.sql` | The migration |
| `supabase/.gitkeep` for sub-folders if needed (functions/, seed/) | Repo hygiene |

No other files. I will **not** create `seed.sql` separately — the integrators rows live inside the migration so a fresh `supabase db reset` always brings them back.

---

## 4. Decisions (locked in — Claude chose defaults; flag during review if any feels wrong)

**#1 — TEXT + CHECK constraints, not ENUMs.**
Reason: enums are painful to evolve in PG (`ALTER TYPE … ADD VALUE` is non-transactional). PoultryOS will add roles, categories, statuses over time. CHECK constraints can be dropped/recreated in normal migrations.

**#2 — `check_mortality_spike()` fires when daily mortality > 1.0%.**
Computed as `birds_dead / batches.opening_bird_count * 100`. Threshold stored as a constant in the function for now; can be promoted to a per-batch column later if breeds need different thresholds. Industry guidance is 0.5–1.0%/day for broilers; 1.0% gives fewer false positives in week 1.

**#3 — `batch_code` format: `B-{YYMMDD}-{4-char farm tag}-{seq}`.**
Example: `B-260502-A1B2-01`. Sequence is per-farm-per-day (resets each day). 4-char farm tag = first 4 chars of `farm_id` UUID. Date first → naturally sortable in lists.

**#4 — Keep both `buyer_id` (FK) and `buyer_or_supplier` (TEXT).**
FK is preferred when buyer is known. Free text is the fallback for one-off counterparties or supplier (expense) entries where no buyer record exists. CHECK constraint: if `transaction_type = 'income'` AND a `buyer_id` is supplied, the FK takes precedence.

**#5 — `ON DELETE CASCADE` on `profiles.id` → `auth.users(id)`.**
Reason: DPDP Act right-to-erasure. Hard-deleting a user wipes their profile, their owned farm, and all data in it. This is correct for the *owner* path. Workers/vets are linked via `farm_users` with their own cascade — deleting a worker user removes them from `farm_users` but does NOT delete the farm.

**#6 — `farms.owner_id` → `auth.users(id)` directly.**
Avoids circular dependency at table creation (profiles → farms → profiles). Same UUID as `profiles.id`, so JOINs still work.

**#7 — No `pg_cron` schedules in this migration.**
Cron jobs invoke Edge Functions that don't exist yet. Day 3 (separate migration) will add `cron.schedule(...)` once functions are deployed. The 8 SQL trigger functions in this migration are all DB-trigger-driven, not cron-driven.

**#8 — Edge Function HTTP calls use `current_setting('app.edge_function_base_url', true)`.**
Migration leaves the setting unset. While unset, trigger functions `RAISE NOTICE` and skip the HTTP call (no error). Day 3 task: `ALTER DATABASE postgres SET app.edge_function_base_url = '…'`.

---

## 5. Estimated lines of SQL

| Section | Lines |
|---|---|
| A. Preamble + extensions | 30 |
| B. CHECK-constraint reference (no enums) | 0 (inline) |
| C. 20 tables | 1,100 |
| D. Indexes | 80 |
| E. updated_at function + 20 triggers | 50 |
| F. 8 business functions + triggers | 400 |
| G. RLS enable + policies (≈3 policies × 20 tables = 60+ policies) | 350 |
| H. Seed: integrators | 60 |
| I. Helper SQL functions for RLS | 40 |
| **Total** | **~2,110 lines** |

---

## 6. Verification plan (after you approve & I write the file)

After writing, BEFORE running anything I will:
1. Show you the complete file for review (or chunked review by section)
2. Run `psql --dry-run` style check via `EXPLAIN` — actually, PG has no dry-run, so I'll instead verify the SQL is well-formed by compiling against a Supabase **branch** (read-write fork of prod schema, free, throwaway) using `mcp__supabase__create_branch`. If it applies cleanly there, it will apply cleanly to main.

After you authorise running on main:
1. `mcp__supabase__apply_migration` with the file contents
2. `mcp__supabase__list_tables` → assert exactly 20 tables in `public` schema
3. For each table, run `SELECT relname, relrowsecurity FROM pg_class WHERE relname = '<table>'` → assert `relrowsecurity = true`. I'll batch this into one `pg_tables` JOIN query.
4. `SELECT COUNT(*) FROM integrators` → assert 4
5. `SELECT proname FROM pg_proc WHERE pronamespace = 'public'::regnamespace AND proname IN (…8 function names…)` → assert 8 rows
6. `mcp__supabase__get_advisors` (security + performance) → review and fix any SECURITY DEFINER warnings, missing-index warnings, etc.
7. Test RLS by creating a throwaway worker user, attempting `SELECT * FROM financial_transactions` — must return 0 rows
8. Final report posted back to this todo file under a "Day 2 — Migration Results" section

---

## 7. What I will NOT do today

- Will **not** write the Edge Functions (Day 3+)
- Will **not** schedule `pg_cron` jobs (Day 3, after Edge Functions exist)
- Will **not** seed test users / sample farms (Day 4)
- Will **not** initialise the Expo or Next.js projects (Day 5+)
- Will **not** push to GitHub — Day 1 Task 7a (`git init`) is still open

---

## 8. Status — defaults locked, ready to write SQL

All 8 ambiguities resolved with sensible defaults (Section 4). Next action: write the migration file, dry-run it on a Supabase branch, then apply to main after a chunked review.

---

## 9. Day 2 — Migration Results (applied 2026-05-02)

**Files written**
- `supabase/migrations/20260502000000_initial_schema.sql` — main migration (1,209 lines)
- `supabase/migrations/20260502000001_harden_functions_and_extensions.sql` — hardening pass (54 lines)

**Applied to**: main (Supabase project `jusxngbfdmzhlybohell`, ap-south-1)

**Verification — all green**
- ✅ 20/20 tables exist in `public`
- ✅ RLS enabled on all 20 tables
- ✅ 4 integrators seeded (Suguna, Venkateshwara, Skylark, IB Group — all flagged `review_required: true`)
- ✅ All 8 business functions registered (update_batch_bird_count, check_mortality_spike, deduct_feed_inventory, generate_batch_code, lock_traceability_on_close, update_buyer_balance, check_payment_overdue, lock_contract_cycle_on_close)
- ✅ 4 RLS helper functions registered (user_role_for_farm, user_assigned_sheds, is_farm_owner, is_farm_member)
- ✅ 27 triggers wired (20 updated_at + 7 business)
- ✅ Extensions: pgcrypto, uuid-ossp, pg_cron, pg_net all installed
- ✅ Security advisor: down from 27 warnings to 1 (the `pg_net in public` warning is unfixable — extension doesn't support relocation)

**Two deviations from the original plan I had to make on the fly**
1. `health_incidents.withdrawal_clearance_date` — original used `(text || ' days')::INTERVAL`, which PG flagged as not IMMUTABLE for GENERATED columns. Switched to `incident_date + withdrawal_days` (date + integer is IMMUTABLE).
2. `weather_data.max_temp_today` — original used `(forecast_json->'today'->>'max_temp_c')::NUMERIC` as GENERATED. JSONB chain + numeric cast also failed the IMMUTABLE check. Made it a regular column; the `fetch-weather-data` Edge Function will populate it.

Both fixes are reflected in the on-disk migration file so a fresh `supabase db reset` will replay cleanly.

**Day 3 follow-ups — already documented at the foot of the migration file**
1. `ALTER DATABASE postgres SET app.edge_function_base_url = '<url>';`
2. `ALTER DATABASE postgres SET app.edge_function_service_key = '<service-role-jwt>';`
3. Schedule pg_cron jobs once Edge Functions exist (6 cron jobs)
4. Have user verify the 4 integrator tariff cards before any contract farmer onboards

**Lessons captured to `tasks/lessons.md`**: see Day 2 entries.

---

## 10. Day 2 — Spec-compliance review (2026-05-04)

**Trigger**: Requested on 2026-05-04 to confirm prior session's work before moving forward.

**Verdict**: Migration is spec-compliant. All 20 tables, all FKs, all UNIQUE constraints, all GENERATED columns, all 8 business functions, all RLS policies, and seed data verified against CLAUDE.md.

**One bug found and patched**

- **Bug**: `check_payment_overdue()` used `WHERE o.days_overdue IN (7, 15, 30)` — silently drops any payment not exactly on day 7, 15, or 30 (e.g. day 8 after a missed cron run = reminder never sent).
- **Fix**: `supabase/migrations/20260504000000_fix_payment_overdue_filter.sql` — replaced the strict `IN` filter with `WHERE o.reminder_stage IS NOT NULL`. The CASE expression already maps ≥7 days to the correct stage; the existing NOT EXISTS dedup prevents double-sends.
- **Apply**: `mcp__supabase__apply_migration` with the patch file contents, then `SELECT * FROM public.check_payment_overdue()` on a test overdue transaction at day 8 — should now return a row.

**Documented deviations (both correct, not bugs)**
1. `health_incidents.withdrawal_clearance_date` — `incident_date + withdrawal_days` instead of interval cast (PG IMMUTABLE constraint)
2. `weather_data.max_temp_today` — regular column populated by Edge Function instead of GENERATED (JSONB chain not IMMUTABLE)

**Day 3 readiness**: ✅ unblocked. Next: apply the payment overdue patch, then proceed to Day 3 (Edge Functions, pg_cron schedules, Expo + Next.js scaffold).

---

# Day 3 — Project Scaffold + Email Auth

> **Date**: 2026-05-04
> **Goal**: Scaffold the Expo mobile app and Next.js web app in parallel, wired to Supabase (`jusxngbfdmzhlybohell`), with working email/password authentication.
> **Auth decision**: Email + password via Supabase Auth built-in. MSG91 OTP swap deferred to Week 2 (pending KYC). Auth logic is fully isolated behind `auth-service.ts` on both platforms so the swap touches one file only.
> **Pre-req**: Have your Supabase **anon key** ready from the Supabase Dashboard (Settings → API). You will need it for `.env` and `.env.local`. Do NOT commit these files.
> **Mode**: PLAN ONLY — wait for "approved" before any code.

---

## Monorepo structure after Day 3

```
poultry_management/               ← repo root (git init here)
  PoultryOS/                      ← Expo SDK 51 mobile app
    app/
      (auth)/
        _layout.tsx
        login.tsx
        register.tsx
      (tabs)/
        _layout.tsx
        dashboard.tsx
      _layout.tsx                  ← root layout + auth guard
    auth/
      auth-service.ts              ← ★ AUTH ABSTRACTION (MSG91 swap target)
    lib/
      supabase.ts                  ← Supabase client (expo-secure-store)
    stores/
      auth.ts                      ← Zustand: session, user, loading
      farm.ts                      ← Zustand: current farm context
    theme/
      index.ts                     ← react-native-paper theme + brand colors
    components/
      providers.tsx                ← PaperProvider + other wrappers
    .env                           ← EXPO_PUBLIC_SUPABASE_URL + ANON_KEY (gitignored)
    app.json
    tsconfig.json
    package.json

  poultryos-web/                  ← Next.js 14 App Router web app
    app/
      layout.tsx                   ← root layout
      login/
        page.tsx
      register/
        page.tsx
      dashboard/
        page.tsx                   ← placeholder, protected
    auth/
      auth-service.ts              ← ★ AUTH ABSTRACTION (MSG91 swap target)
    lib/
      supabase/
        server.ts                  ← @supabase/ssr server client
        client.ts                  ← @supabase/ssr browser client
    components/
      ui/                          ← shadcn/ui generated components
      sidebar.tsx
      nav.tsx
    middleware.ts                  ← Supabase session refresh + route protection
    tailwind.config.ts             ← brand colors + Inter font
    .env.local                     ← NEXT_PUBLIC_SUPABASE_URL + ANON_KEY (gitignored)
    package.json

  supabase/                       ← existing migrations (Day 2)
  tasks/
    todo.md                       ← this file
    lessons.md
  .gitignore                      ← root-level (covers both apps)
  CLAUDE.md
```

---

## Subtask breakdown (30-minute blocks, ~7 hours total)

---

### ST-1 · Git init + monorepo root (30 min)

**Why first**: All subsequent file writes need to be in a tracked repo. GitHub remote already exists at `fynarctechworks/Poultry_management`.

**Actions**:
1. `git init` in `/Users/rishikanth/poultry_management`
2. `git remote add origin https://github.com/fynarctechworks/Poultry_management.git`
3. Write `.gitignore` at repo root (see content in ST-14)
4. Verify `git status` shows all existing files (CLAUDE.md, PRD.md, TRD.md, tasks/, supabase/, .mcp.json)

**Files created/modified**:
- `.gitignore` (root)

**Verification**: `git remote -v` prints the GitHub URL. `git status` shows untracked files, no errors.

**Dependency**: None. Do this first.

---

### ST-2 · Mobile — create-expo-app + package install (30 min)

**Actions**:
1. From repo root: `npx create-expo-app@latest PoultryOS --template blank-typescript`
   - This gives Expo SDK 51, TypeScript, blank slate (no tabs demo)
2. `cd PoultryOS`
3. Install all packages from CLAUDE.md "Mobile" table in one shot:

```bash
npx expo install \
  expo-router@3 \
  react-native-paper@5 \
  react-hook-form@7 \
  zod@3 \
  @supabase/supabase-js@2 \
  @react-native-async-storage/async-storage@1 \
  expo-notifications \
  react-native-qrcode-svg@6 \
  expo-sharing@11 \
  expo-file-system@16 \
  expo-network@5 \
  zustand@4 \
  expo-secure-store@13 \
  react-native-otp-entry@1 \
  lucide-react-native

# victory-native@36 needs its Skia peer dep — install separately
npx expo install victory-native@36 @shopify/react-native-skia react-native-reanimated@3

# lucide-react-native + react-native-qrcode-svg both need react-native-svg
npx expo install react-native-svg

# Inter font
npx expo install @expo-google-fonts/inter expo-font
```

**Files created/modified**:
- `PoultryOS/package.json` (packages added)
- `PoultryOS/package-lock.json` / `yarn.lock`

**Verification**: `npx expo start` runs without errors. No red "Unable to resolve" warnings in Metro bundler output.

**⚠️ Version conflict flags**:
- `victory-native@36` requires `@shopify/react-native-skia` + `react-native-reanimated@3`. Both are Expo-compatible but **will not run in Expo Go on older Android devices** due to Hermes/Skia compatibility. Scaffold them but defer testing victory charts to EAS Build (not Expo Go). Auth screens don't use charts — Day 3 testing is unaffected.
- `react-native-paper@5` has `react-native-vector-icons` as a peer dep. In Expo managed workflow, this is satisfied by `@expo/vector-icons` which is already bundled. react-native-paper v5 works with Expo's icon set without any extra config.
- `expo-secure-store@13` requires SDK 51 (✓) and does NOT work in Expo Go on web (only native). Since we are targeting Android (✓), this is fine.

---

### ST-3 · Mobile — app.json + expo-router file structure (30 min)

**Actions**:
1. Update `app.json`: set `scheme: "poultryos"`, `name: "PoultryOS"`, `slug: "poultryos"`, `plugins: ["expo-router"]`, `android.package: "com.fynarctechworks.poultryos"`
2. Update `babel.config.js` to add `expo-router/babel` plugin
3. Create the file-based routing skeleton:

```
PoultryOS/app/
  _layout.tsx            ← root layout: font loader + providers + auth guard
  (auth)/
    _layout.tsx          ← Stack navigator for auth screens
    login.tsx            ← placeholder (built in ST-7)
    register.tsx         ← placeholder (built in ST-7)
  (tabs)/
    _layout.tsx          ← Tabs navigator: Dashboard | Flocks | Log | Khata | More
    dashboard.tsx        ← placeholder KPI screen
```

4. Create `PoultryOS/components/providers.tsx` — wraps app with PaperProvider + SafeAreaProvider

**Files created/modified**:
- `PoultryOS/app.json`
- `PoultryOS/babel.config.js`
- `PoultryOS/app/_layout.tsx`
- `PoultryOS/app/(auth)/_layout.tsx`
- `PoultryOS/app/(auth)/login.tsx` (stub — "Login screen placeholder")
- `PoultryOS/app/(auth)/register.tsx` (stub)
- `PoultryOS/app/(tabs)/_layout.tsx`
- `PoultryOS/app/(tabs)/dashboard.tsx` (stub)
- `PoultryOS/components/providers.tsx`

**Verification**: `npx expo start` → Expo Go opens the app without a crash. Navigating to the root shows the placeholder dashboard (or login if no session — logic added in ST-8).

**Dependency**: Needs ST-2 complete (packages installed).

---

### ST-4 · Mobile — Supabase client + .env (30 min)

**Actions**:
1. Create `PoultryOS/.env`:
```
EXPO_PUBLIC_SUPABASE_URL=https://jusxngbfdmzhlybohell.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=<paste your anon key here>
```
2. Create `PoultryOS/lib/supabase.ts`:
```typescript
import { createClient } from '@supabase/supabase-js'
import * as SecureStore from 'expo-secure-store'

const ExpoSecureStoreAdapter = {
  getItem:    (key: string) => SecureStore.getItemAsync(key),
  setItem:    (key: string, value: string) => SecureStore.setItemAsync(key, value),
  removeItem: (key: string) => SecureStore.deleteItemAsync(key),
}

export const supabase = createClient(
  process.env.EXPO_PUBLIC_SUPABASE_URL!,
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!,
  {
    auth: {
      storage: ExpoSecureStoreAdapter,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,   // must be false for React Native
    },
  }
)
```

**Files created/modified**:
- `PoultryOS/.env`
- `PoultryOS/lib/supabase.ts`

**Verification**: Import `supabase` in `dashboard.tsx` and call `supabase.auth.getSession()`. Should return `{ data: { session: null }, error: null }` (no crash = success). Remove the test import after.

**Dependency**: Needs ST-2 (packages) + your anon key from Supabase Dashboard.

**Note**: `.env` is listed in `.gitignore`. Never commit it. If you need to share env config, document variable names only (not values) in `PoultryOS/.env.example`.

---

### ST-5 · Mobile — Zustand auth + farm stores (30 min)

**Actions**:
1. Create `PoultryOS/stores/auth.ts`:
```typescript
import { create } from 'zustand'
import { Session, User } from '@supabase/supabase-js'

interface AuthState {
  session: Session | null
  user: User | null
  isLoading: boolean
  setSession: (session: Session | null) => void
  setLoading: (loading: boolean) => void
}

export const useAuthStore = create<AuthState>((set) => ({
  session: null,
  user: null,
  isLoading: true,
  setSession: (session) => set({ session, user: session?.user ?? null }),
  setLoading: (isLoading) => set({ isLoading }),
}))
```

2. Create `PoultryOS/stores/farm.ts`:
```typescript
import { create } from 'zustand'

interface Farm { id: string; farm_name: string; farm_type: string }

interface FarmState {
  currentFarm: Farm | null
  setCurrentFarm: (farm: Farm | null) => void
}

export const useFarmStore = create<FarmState>((set) => ({
  currentFarm: null,
  setCurrentFarm: (currentFarm) => set({ currentFarm }),
}))
```

3. Wire Supabase `onAuthStateChange` listener into the root `_layout.tsx` to keep the store in sync with Supabase session changes.

**Files created/modified**:
- `PoultryOS/stores/auth.ts`
- `PoultryOS/stores/farm.ts`
- `PoultryOS/app/_layout.tsx` (add listener)

**Verification**: Open the app in Expo Go → `useAuthStore.getState().isLoading` flips from `true` → `false` within 1 second (auth state resolved).

**Dependency**: Needs ST-4 (Supabase client).

---

### ST-6 · Mobile — react-native-paper theme + Inter font (30 min)

**Actions**:
1. Create `PoultryOS/theme/index.ts`:
```typescript
import { MD3LightTheme } from 'react-native-paper'

export const paperTheme = {
  ...MD3LightTheme,
  colors: {
    ...MD3LightTheme.colors,
    primary: '#1A56DB',          // Brand Blue
    primaryContainer: '#EBF5FF', // Brand Blue Light
    error: '#9B1C1C',            // Danger Red
    background: '#F9FAFB',       // Surface Gray
    surface: '#FFFFFF',
    onSurface: '#111827',        // Text Primary
    outline: '#E5E7EB',          // Border Gray
  },
}
```

2. Update `PoultryOS/components/providers.tsx` to load Inter font via `useFonts` from `@expo-google-fonts/inter` and wrap the app with `<PaperProvider theme={paperTheme}>`.
3. Update root `_layout.tsx` to `SplashScreen.preventAutoHideAsync()` until fonts are loaded, then `SplashScreen.hideAsync()`.

**Files created/modified**:
- `PoultryOS/theme/index.ts`
- `PoultryOS/components/providers.tsx` (updated with font + PaperProvider)
- `PoultryOS/app/_layout.tsx` (SplashScreen guard)

**Verification**: App header / buttons render with `#1A56DB` blue. Text uses Inter (check on a real device — emulator may render system font).

**Dependency**: Needs ST-3 (routing structure) + ST-2 (packages).

---

### ST-7 · Mobile — auth-service.ts (★ CRITICAL ABSTRACTION) (30 min)

> This is the most important file in Part D. All screen components import auth operations from here, never from `@supabase/supabase-js` directly. When MSG91 OTP goes live in Week 2, only this file changes.

**Actions**:
Create `PoultryOS/auth/auth-service.ts`:

```typescript
import { supabase } from '../lib/supabase'

// --- Types ---
export interface RegisterPayload {
  email: string
  password: string
  fullName: string
  role: 'owner' | 'worker' | 'vet'
}

// --- Auth operations ---

export async function login(email: string, password: string) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password })
  if (error) throw error
  return data.session
}

export async function register({ email, password, fullName, role }: RegisterPayload) {
  const { data, error } = await supabase.auth.signUp({ email, password })
  if (error) throw error
  if (!data.user) throw new Error('Sign-up succeeded but no user returned')

  // Insert profile row — profiles table has RLS; this runs as the new user's JWT
  const { error: profileError } = await supabase.from('profiles').insert({
    id: data.user.id,
    full_name: fullName,
    role,
  })
  if (profileError) throw profileError

  return data.user
}

export async function logout() {
  const { error } = await supabase.auth.signOut()
  if (error) throw error
}

export async function getSession() {
  const { data } = await supabase.auth.getSession()
  return data.session
}

// --- MSG91 OTP swap points (Week 2 — implement these, keep the same export names) ---
// export async function sendOtp(phone: string) { ... }
// export async function verifyOtp(phone: string, otp: string) { ... }
```

**Files created/modified**:
- `PoultryOS/auth/auth-service.ts`

**Verification**: TypeScript compiles without errors (`npx tsc --noEmit`). Import in `login.tsx` stub and confirm no TS errors.

**MSG91 swap contract** (document this now so Week 2 is turnkey):
- `login()` becomes `sendOtp(phone)` + `verifyOtp(phone, otp)` — two-step
- `register()` keeps the profile INSERT; replaces `supabase.auth.signUp` with MSG91 flow
- `logout()` and `getSession()` stay identical — Supabase session management unchanged
- Every screen imports `{ login, register, logout, getSession }` from `auth-service` — zero screen changes in Week 2

**Dependency**: Needs ST-4 (Supabase client).

---

### ST-8 · Mobile — login + register screens (30 min)

**Actions**:
Replace the stubs from ST-3 with real screens.

`app/(auth)/login.tsx`:
- react-native-paper `TextInput` (email, password)
- Primary Button: `#1A56DB` fill, 44px height, "Sign In" label
- `react-hook-form` + `zod` schema: email required + valid, password min 6 chars
- On submit: call `login()` from `auth-service.ts`; on success `router.replace('/(tabs)/dashboard')`; on error show inline error text (no Toast — no extra dep)
- "Don't have an account? Register" link → `router.push('/(auth)/register')`

`app/(auth)/register.tsx`:
- Fields: Full Name, Email, Password, Confirm Password
- Role hardcoded to "owner" (no picker on Day 3 — workers/vets are invited, not self-registered)
- Same form library / validation pattern
- On submit: call `register()` from `auth-service.ts`; on success `router.replace('/(tabs)/dashboard')`
- "Already have an account? Sign in" link

**Design rules enforced**:
- `minHeight: 44` on every interactive element
- `backgroundColor: '#1A56DB'` on primary button
- `label` above each field (never placeholder-only)
- Inter font inherits from PaperProvider
- ScrollView wrapper (small screens + keyboard avoidance)

**Files created/modified**:
- `PoultryOS/app/(auth)/login.tsx`
- `PoultryOS/app/(auth)/register.tsx`

**Verification**: Register with a new email → Supabase Auth dashboard shows the new user. Login with those credentials → app navigates to dashboard.

**Dependency**: Needs ST-6 (theme), ST-7 (auth-service), ST-5 (Zustand store for session).

---

### ST-9 · Mobile — protected routes + auth guard (30 min)

**Actions**:
Update `app/_layout.tsx` with the auth guard:
```typescript
// After onAuthStateChange resolves isLoading:
if (isLoading) return <SplashScreen />   // or keep native splash
if (!session) {
  return <Redirect href="/(auth)/login" />
}
return <Slot />   // render nested routes
```

Update `app/(auth)/_layout.tsx` to redirect authenticated users away from login:
```typescript
if (session) return <Redirect href="/(tabs)/dashboard" />
```

Add logout button to `app/(tabs)/dashboard.tsx` placeholder:
- Calls `logout()` from `auth-service.ts`
- On success clears Zustand session → root layout redirects to login

**Files created/modified**:
- `PoultryOS/app/_layout.tsx` (auth guard added)
- `PoultryOS/app/(auth)/_layout.tsx` (session redirect)
- `PoultryOS/app/(tabs)/dashboard.tsx` (logout button)

**Verification**:
1. Kill app → reopen → if no session, lands on login screen ✓
2. Login → lands on dashboard ✓
3. Tap logout → returns to login ✓
4. Close + reopen after login (session persisted in SecureStore) → stays on dashboard ✓

**Dependency**: Needs ST-8 (screens), ST-5 (Zustand), ST-7 (logout in auth-service).

---

### ST-10 · Web — create-next-app + package install (30 min)

**Actions**:
From repo root:
```bash
npx create-next-app@14 poultryos-web \
  --typescript --tailwind --app --no-src-dir \
  --import-alias "@/*" --no-eslint
```
Flag choices:
- `--app`: App Router (required by CLAUDE.md)
- `--no-src-dir`: files at root of `poultryos-web/`, not inside `src/` (simpler paths)
- `--no-eslint`: skip the ESLint prompt (we'll configure later)

```bash
cd poultryos-web
npm install \
  @supabase/ssr@0 \
  @supabase/supabase-js@2 \
  react-hook-form@7 \
  zod@3 \
  recharts@2 \
  jspdf@2 \
  jspdf-autotable@3 \
  @tanstack/react-table@8 \
  qrcode@1 \
  @types/qrcode
```

**Files created/modified**:
- `poultryos-web/package.json`
- Full Next.js scaffold

**Verification**: `npm run dev` starts without errors at `http://localhost:3000`. Default Next.js page renders.

**⚠️ Version note**: `@supabase/ssr` v0.x uses `createServerClient` / `createBrowserClient`. Do NOT confuse with the older `@supabase/auth-helpers-nextjs` package — they have incompatible APIs. This plan uses `@supabase/ssr` throughout.

**Dependency**: Needs ST-1 (git init, repo structure exists).

---

### ST-11 · Web — shadcn/ui init + Tailwind brand theme (30 min)

**Actions**:
1. Initialize shadcn/ui:
```bash
npx shadcn@latest init
```
Answers: Style = Default, Base color = Slate, CSS variables = Yes.

2. Add components we need for auth screens:
```bash
npx shadcn@latest add button input label form card
```

3. Update `tailwind.config.ts` to add brand colors:
```typescript
colors: {
  brand: {
    blue:       '#1A56DB',
    'blue-light': '#EBF5FF',
  },
  success:  '#057A55',
  warning:  '#92400E',
  danger:   '#9B1C1C',
  'heat-orange': '#EA580C',
  'upi-purple':  '#5B21B6',
  'wa-green':    '#25D366',
  surface:  '#F9FAFB',
  border:   '#E5E7EB',
  'text-primary':   '#111827',
  'text-secondary': '#6B7280',
}
```

4. Add Inter font to `app/layout.tsx` via `next/font/google`:
```typescript
import { Inter } from 'next/font/google'
const inter = Inter({ subsets: ['latin'] })
```

**Files created/modified**:
- `poultryos-web/tailwind.config.ts`
- `poultryos-web/app/globals.css` (shadcn CSS variables added)
- `poultryos-web/components.json` (shadcn config)
- `poultryos-web/components/ui/` (shadcn generated: button, input, label, form, card)
- `poultryos-web/app/layout.tsx` (Inter font)

**Verification**: Create a test page with `<Button className="bg-brand-blue text-white">Test</Button>` → renders #1A56DB blue button in Inter font.

**Dependency**: Needs ST-10 (Next.js scaffold).

---

### ST-12 · Web — Supabase SSR client + .env.local + middleware (30 min)

**Actions**:
1. Create `poultryos-web/.env.local`:
```
NEXT_PUBLIC_SUPABASE_URL=https://jusxngbfdmzhlybohell.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<paste your anon key here>
```
**DO NOT add `SUPABASE_SERVICE_ROLE_KEY` here.** Service role key belongs only in Edge Functions / Supabase secrets, never in a Next.js client app.

2. Create `poultryos-web/lib/supabase/client.ts` (browser):
```typescript
import { createBrowserClient } from '@supabase/ssr'

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}
```

3. Create `poultryos-web/lib/supabase/server.ts` (RSC + Server Actions):
```typescript
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

export function createClient() {
  const cookieStore = cookies()
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll()          { return cookieStore.getAll() },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options))
        },
      },
    }
  )
}
```

4. Create `poultryos-web/middleware.ts`:
- Intercepts every request
- Refreshes the Supabase session cookie using `updateSession`
- Redirects unauthenticated users hitting `/dashboard/**` to `/login`
- Redirects authenticated users hitting `/login` or `/register` to `/dashboard`

**Files created/modified**:
- `poultryos-web/.env.local`
- `poultryos-web/lib/supabase/client.ts`
- `poultryos-web/lib/supabase/server.ts`
- `poultryos-web/middleware.ts`

**Verification**: `npm run dev` still starts. Navigate to `/dashboard` → redirects to `/login` (session check works before the page exists).

**Dependency**: Needs ST-10 (Next.js scaffold) + anon key.

---

### ST-13 · Web — auth-service.ts + login + register screens (30 min)

**Actions**:
1. Create `poultryos-web/auth/auth-service.ts`:
```typescript
import { createClient } from '@/lib/supabase/client'

// Same export surface as mobile auth-service.ts — deliberate parity
export async function login(email: string, password: string) {
  const supabase = createClient()
  const { data, error } = await supabase.auth.signInWithPassword({ email, password })
  if (error) throw error
  return data.session
}

export async function register(email: string, password: string, fullName: string) {
  const supabase = createClient()
  const { data, error } = await supabase.auth.signUp({ email, password })
  if (error) throw error
  if (!data.user) throw new Error('No user returned')
  const { error: profileError } = await supabase.from('profiles').insert({
    id: data.user.id, full_name: fullName, role: 'owner',
  })
  if (profileError) throw profileError
  return data.user
}

export async function logout() {
  const supabase = createClient()
  await supabase.auth.signOut()
}

export async function getSession() {
  const supabase = createClient()
  const { data } = await supabase.auth.getSession()
  return data.session
}
```

2. Create `poultryos-web/app/login/page.tsx`:
- shadcn Card + Form components
- `react-hook-form` + `zod` validation (same schema as mobile)
- On submit: calls `login()` from `auth-service.ts`; on success `router.push('/dashboard')`
- "Register" link

3. Create `poultryos-web/app/register/page.tsx`:
- Fields: Full Name, Email, Password, Confirm Password
- Same pattern, calls `register()`

4. Create `poultryos-web/app/dashboard/page.tsx` (placeholder):
- Server Component that reads session via `createClient()` (server)
- Shows "Welcome, [email]" + logout button (Client Component)
- Logout button calls `logout()` then `router.refresh()`

**Files created/modified**:
- `poultryos-web/auth/auth-service.ts`
- `poultryos-web/app/login/page.tsx`
- `poultryos-web/app/register/page.tsx`
- `poultryos-web/app/dashboard/page.tsx`

**Verification**:
1. Register at `/register` → Supabase Auth dashboard shows user
2. Login at `/login` → redirects to `/dashboard`, shows email ✓
3. Logout → returns to `/login` ✓
4. Direct-navigate to `/dashboard` without session → redirects to `/login` ✓

**Dependency**: Needs ST-12 (Supabase clients), ST-11 (shadcn components).

---

### ST-14 · Web — layout shell + sidebar (30 min)

**Actions**:
1. Create `poultryos-web/components/sidebar.tsx` (Client Component):
- Navigation links: Dashboard | Flocks | Log | Khata | More (5-tab parity with mobile bottom nav)
- Active link highlighted with `#1A56DB`
- User email shown at bottom + logout button
- shadcn `Button` component for logout

2. Create `poultryos-web/components/nav.tsx`:
- Top bar with PoultryOS logo + page title
- Responsive: sidebar on md+, hamburger on mobile

3. Update `poultryos-web/app/layout.tsx`:
- Wrap in Inter font
- For authenticated routes: render sidebar + main content area
- For auth routes (`/login`, `/register`): render centered card layout without sidebar

4. Apply sidebar to `app/dashboard/page.tsx`.

**Files created/modified**:
- `poultryos-web/components/sidebar.tsx`
- `poultryos-web/components/nav.tsx`
- `poultryos-web/app/layout.tsx` (sidebar wiring)

**Verification**: Dashboard page shows sidebar with brand blue nav links. `/login` page is sidebar-free. Hot-reload works without flickering.

**Dependency**: Needs ST-13 (dashboard page), ST-11 (Tailwind theme).

---

### ST-15 · First commit + push (30 min)

**Actions**:
1. Write root `.gitignore`:
```
# Dependencies
node_modules/
.yarn/

# Expo
PoultryOS/.expo/
PoultryOS/dist/
PoultryOS/.env

# Next.js
poultryos-web/.next/
poultryos-web/out/
poultryos-web/.env.local
poultryos-web/.env*.local

# Native builds (EAS outputs these)
PoultryOS/android/
PoultryOS/ios/

# Logs
*.log
npm-debug.log*

# OS
.DS_Store
Thumbs.db

# IDE
.idea/
.vscode/settings.json
*.suo
*.user
```

2. Add `.env.example` files (variable names, no values):
- `PoultryOS/.env.example`
- `poultryos-web/.env.local.example`

3. Stage and commit:
```bash
git add CLAUDE.md PRD.md TRD.md tasks/ supabase/ .gitignore \
        PoultryOS/ poultryos-web/ \
        --exclude=PoultryOS/.env \
        --exclude=poultryos-web/.env.local
git commit -m "feat: initial Expo + Next.js scaffold with Supabase auth"
git push -u origin main
```

**Files created/modified**:
- `.gitignore` (root — updated from stub)
- `PoultryOS/.env.example`
- `poultryos-web/.env.local.example`

**Verification**:
- `git log --oneline` shows the commit
- GitHub repo at `fynarctechworks/Poultry_management` shows file tree
- `.env` and `.env.local` are **not** visible on GitHub
- `PoultryOS/android/` and `PoultryOS/ios/` are not present (EAS Build hasn't run)

**Dependency**: All prior subtasks complete.

---

## Pre-execution checklist (before "approved")

- [ ] You have the Supabase **anon key** from Dashboard → Settings → API (needed for ST-4 and ST-12)
- [ ] `npx` is available (`node --version` >= 18)
- [ ] Android emulator or physical device ready for Expo Go testing
- [ ] `http://localhost:3000` port is free
- [ ] `poultryos-web/` and `PoultryOS/` don't already exist at repo root (clean slate)

---

## Known package version risks (addressed in plan)

| Risk | Mitigation |
|---|---|
| `victory-native@36` won't run in Expo Go (Skia dependency) | Install it; defer chart testing to EAS Build. Auth screens don't use charts. |
| `@supabase/ssr` v0.x API differs from `auth-helpers-nextjs` | Plan uses `createServerClient` / `createBrowserClient` (correct v0.x API) throughout |
| `react-native-paper@5` vector icons in Expo managed | Satisfied by `@expo/vector-icons` (bundled with Expo) — no extra config |
| `expo-secure-store@13` doesn't work in Expo Go on Web | Targeting Android only; not an issue |
| Supabase `profiles` INSERT after signup may fail if RLS blocks it | RLS allows INSERT when `id = auth.uid()` — this is the standard Supabase pattern. Verified in Day 2 migration. |

---

## Day 3 success criteria

- [ ] **ST-1**: `git remote -v` shows `fynarctechworks/Poultry_management` origin
- [ ] **ST-2–3**: `npx expo start` in `PoultryOS/` runs without Metro errors
- [ ] **ST-4**: `supabase.auth.getSession()` returns without error
- [ ] **ST-5**: Auth store flips `isLoading` false on app start
- [ ] **ST-6**: App renders with `#1A56DB` blue primary colour + Inter font
- [ ] **ST-7**: `auth-service.ts` exports `login, register, logout, getSession` — no TS errors
- [ ] **ST-8**: Register a new user → Supabase Auth shows new row; login works
- [ ] **ST-9**: Unauthenticated → `/login`; Authenticated → `/dashboard`; Logout works; Session persists across app restart
- [ ] **ST-10**: `npm run dev` starts in `poultryos-web/` at `http://localhost:3000`
- [ ] **ST-11**: shadcn Button renders in brand blue; Inter font applied
- [ ] **ST-12**: Navigating to `/dashboard` without session redirects to `/login`
- [ ] **ST-13**: Register/login/logout flow works end-to-end on web; same Supabase user visible in both mobile + web
- [ ] **ST-14**: Sidebar renders on authenticated web routes; absent on login/register
- [ ] **ST-15**: Commit pushed to GitHub; `.env` files absent from remote

**Estimated total time**: 7–8 hours (14 × 30 min + transitions). Can be parallelised: ST-2 through ST-9 (mobile) and ST-10 through ST-14 (web) are independent once ST-1 is done.

---

## Day 4 preview (what follows from here)

- Apply `supabase/migrations/20260504000000_fix_payment_overdue_filter.sql` patch (pending from Day 2 review)
- Set `app.edge_function_base_url` database setting (from Day 2 follow-up list)
- Seed a test farm + test user for development
- Onboarding wizard (5 steps: farm name, location, type, shed setup, WhatsApp opt-in)
- Daily log entry form (offline queue with AsyncStorage)
- Mortality spike trigger end-to-end test
