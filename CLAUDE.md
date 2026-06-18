# PoultryOS — Claude Instructions

## Project Overview

PoultryOS is a cross-platform poultry farm management platform for medium-scale Indian farmers (500–5,000 birds). It digitises daily farm workflows — flock placement to sale — replacing paper logs and Excel sheets with a single source of truth. v2.0 adds 4 India-killer features: **WhatsApp Business integration, UPI Khata, Weather + Heat-stress alerts, and Contract Farming**.

- **Mobile**: Expo SDK 54 (React Native) — Android + Web parallel
- **Web**: Next.js 14 (App Router) on Vercel
- **Backend**: Supabase (PostgreSQL 15, Auth, Storage, Edge Functions, Realtime)
- **Auth**: Mobile OTP (primary) via MSG91 + Email/password (fallback)
- **Payments**: Razorpay (Subscriptions for SaaS billing + UPI Collect for buyer payments)
- **WhatsApp**: AiSensy API (WhatsApp Business Cloud)
- **Weather**: OpenWeatherMap (free tier)
- **Target**: ₹6k–12k Android phones, 2 GB RAM, 4G connections

### Repository structure (see `README.md`)
```
mobile-app/            Expo (React Native) farmer app           (was PoultryOS/)
frontend/              Next.js customer web dashboard            (was web/)  · port 3000
saas-control-center/   Next.js internal operator Control Center  · port 3001 · serves /admin
supabase/              the ONE shared backend (migrations + Edge Functions)
packages/shared/       @poultryos/shared
```
All three apps use the same Supabase backend. The Control Center sits above tenant RLS
(`platform_admins`, not tenant members).

---

## Agent Workflow (PRIMARY — use these for all build work)

PoultryOS uses a multi-agent architecture via Claude Code subagents. Six specialist
agents live in `.claude/agents/` and are the **default** for any non-trivial build task.

### Available Agents
| Agent | Role | Model |
|-------|------|-------|
| `orchestrator` | Reads PRD/TRD/DESIGN/CLAUDE, plans work, decomposes into focused tasks, writes self-contained prompts, delegates | Opus |
| `db-architect` | Raw SQL migrations, RLS policies, DB functions/triggers, generated columns, seed data — applied via Supabase MCP | Sonnet |
| `api-builder` | Supabase Edge Functions (Deno/TS), pg_cron jobs, RPC functions, third-party integrations (AiSensy, Razorpay, OpenWeatherMap, MSG91), webhook signature verification | Sonnet |
| `component-builder` | Reusable UI primitives keyed strictly to DESIGN.md tokens — React Native (mobile) + React (web) | Sonnet |
| `frontend-builder` | Expo Router screens (mobile) + Next.js App Router pages (web); offline queue, push notifications, Supabase queries | Sonnet |
| `test-writer` | pgTAP RLS tests, Deno Edge Function tests, Jest + RNTL component tests, Maestro E2E flows | Sonnet |

### How to Use
1. **Default entry point**: ask `orchestrator` to plan and build a module:
   > "Use the orchestrator to plan and build the Buyer Khata module (Phase 3 Week 9)."
2. The orchestrator reads PRD/TRD/DESIGN.md, decomposes into DB → Edge Functions → Components → Screens → Tests, and delegates to specialists with self-contained prompts.
3. Each specialist works in its own context window and reports back with file paths + outcomes.

### Build Order Per Module (respect dependencies)
**Database → Edge Functions → Components → Screens → Tests**

### When to Skip the Orchestrator
- Single-file bug fixes — call the relevant specialist directly
- Pure documentation edits — handle inline
- Re-running a Supabase advisor — handle inline

### Supplemental Skill Selection (when no agent fits)
For meta-work outside the build pipeline, the in-line skills below can be applied directly:

| Task type | Skill |
|-----------|-------|
| CI/CD, Docker, EAS Build, Vercel deployment | `senior-devops` |
| Security review, RLS audit, vulnerability analysis | `skill-security-auditor` |
| Feature specs, PRDs, user stories | `product-manager-toolkit` |
| Sprint planning, roadmap, delivery | `senior-pm` |
| Pipeline generation, GitHub Actions, EAS workflows | `ci-cd-pipeline-builder` |

Do not announce which agent or skill you are using unless asked.

---

## MCP Servers Required

Activate these MCP servers in VS Code for autonomous workflow:

### Must-Have (activate before starting)
1. **Supabase MCP** — Direct DB access: run SQL, manage tables, RLS policies, Edge Functions, Storage buckets, secrets. No manual Supabase dashboard work needed.
2. **Filesystem MCP** — Read/write project files, navigate codebase.
3. **GitHub MCP** — Repo management, commits, branches, PRs.

### Recommended
4. **Brave Search / Web Search MCP** — Look up Agmarknet API docs, Razorpay API docs, AiSensy template guidelines, Expo SDK docs on the fly.
5. **Memory MCP** — Persist lessons learned, architecture decisions across sessions.

### Setup Commands (run in VS Code terminal)
```bash
# Ensure Claude Code is installed
npm install -g @anthropic-ai/claude-code

# The MCP servers are configured in .claude/settings.json (created below)
```

---

## Workflow Orchestration

### 1. Plan Mode Default
- Enter plan mode for ANY non-trivial task (3+ steps or architectural decisions)
- If something goes sideways, STOP and re-plan immediately — don't keep pushing
- Use plan mode for verification steps, not just building
- Write detailed specs upfront to reduce ambiguity

### 2. Subagent Strategy
- Offload research, exploration, and parallel analysis to subagents
- For complex problems, throw more compute at it via subagents
- One task per subagent for focused execution
- Keep main context window clean

### 3. Self-Improvement Loop
- After ANY correction from the user: update `tasks/lessons.md` with the pattern
- Write rules for yourself that prevent the same mistake
- Ruthlessly iterate on these lessons until mistake rate drops
- Review lessons at session start

### 4. Verification Before Done
- Never mark a task complete without proving it works
- Run tests, check logs, demonstrate correctness
- Ask yourself: "Would a staff engineer approve this?"
- For Supabase changes: verify RLS policies work by testing as different roles
- For WhatsApp changes: verify message delivery in AiSensy dashboard
- For UPI changes: verify with test UPI ID before live mode

### 5. Demand Elegance (Balanced)
- For non-trivial changes: pause and ask "is there a more elegant way?"
- If a fix feels hacky: "Knowing everything I know now, implement the elegant solution"
- Skip this for simple, obvious fixes — don't over-engineer

### 6. Autonomous Bug Fixing
- When given a bug report: just fix it. Don't ask for hand-holding
- Point at logs, errors, failing tests → then resolve them
- Go fix failing CI / build errors without being told how

---

## Task Management

1. **Plan First**: Write plan to `tasks/todo.md` with checkable items
2. **Verify Plan**: Check in before starting implementation
3. **Track Progress**: Mark items complete as you go
4. **Explain Changes**: High-level summary at each step
5. **Document Results**: Add review to `tasks/todo.md`
6. **Capture Lessons**: Update `tasks/lessons.md` after corrections

---

## Tech Stack Reference (use these exact versions)

### Mobile (Expo / React Native)

> SDK 54 migration note: package versions updated April 2026. Original TRD specified SDK 51 — ignore those versions, use what's in CLAUDE.md.

| Package | Version | Purpose |
|---------|---------|---------|
| expo | ~54.0.33 | Framework |
| babel-preset-expo | ~54.0.10 | Babel preset (must be direct dep, not just nested in expo) |
| react | 19.1.0 | React runtime |
| react-native | 0.81.5 | React Native runtime |
| expo-router | ~6.0.23 | File-based navigation |
| expo-splash-screen | ~31.0.13 | Peer dep of expo-router (re-exports SplashScreen; must be direct dep) |
| expo-linking | ~8.0.12 | Peer dep of expo-router (deep linking) |
| expo-constants | ~18.0.13 | Peer dep of expo-router (app config at runtime) |
| @expo/metro-runtime | ~6.1.2 | Peer dep of expo-router (Metro runtime for web) |
| react-native-gesture-handler | ~2.28.0 | Peer dep of expo-router (swipe gestures in navigation) |
| react-native-screens | ~4.16.0 | Peer dep of expo-router (native screen containers) |
| react-dom | ~19.1.0 | Peer dep of expo-router (required for web target) |
| react-native-web | ~0.21.2 | Peer dep of expo-router (React Native on web) |
| react-native-paper | ^5.15.1 | Material Design 3 UI |
| react-native-safe-area-context | (managed by Expo) | Peer dep of react-native-paper, required for SafeAreaProvider |
| react-hook-form | ^7.75.0 | Form management |
| @hookform/resolvers | 3.x | Zod adapter for react-hook-form |
| zod | ^3.25.76 | Schema validation |
| @supabase/supabase-js | ^2.105.1 | Supabase client |
| @react-native-async-storage/async-storage | 2.2.0 | Offline queue |
| expo-notifications | ~0.32.17 | Push notifications |
| victory-native | 36 | Charts (Skia build) |
| @shopify/react-native-skia | 2.2.12 | Skia renderer (required by victory-native) |
| react-native-svg | 15.12.1 | SVG support (QR + victory-native) |
| react-native-reanimated | ~3.16.7 | Animations (v3 — v4 requires react-native-worklets native module not in Expo Go) |
| react-native-qrcode-svg | ^6.3.21 | QR code display (traceability + UPI) |
| expo-sharing | ~14.0.8 | File sharing (WhatsApp) |
| expo-file-system | ~19.0.22 | File system access |
| expo-network | ~8.0.8 | Network detection |
| zustand | ^4.5.7 | State management |
| expo-secure-store | ~15.0.8 | JWT storage |
| expo-font | ~14.0.11 | Font loading |
| @expo-google-fonts/inter | ^0.4.2 | Inter typeface |
| react-native-otp-entry | ^1.8.5 | Mobile OTP input UI |
| lucide-react-native | ^1.14.0 | Weather + heat-stress icons |

### Web (Next.js)
| Package | Version | Purpose |
|---------|---------|---------|
| next | 14.x | App Router framework |
| shadcn/ui | latest | UI components |
| tailwindcss | 3.x | Styling |
| recharts | 2.x | Charts |
| @supabase/ssr | 0.x | SSR Supabase client |
| react-hook-form + zod | 7.x + 3.x | Forms |
| @hookform/resolvers | 3.x | Zod adapter for react-hook-form |
| jsPDF + jspdf-autotable | 2.x + 3.x | PDF export |
| TanStack Table | 8.x | Data tables |
| qrcode | 1.x | Server-side QR (public traceability) |

### Backend (Supabase + Third-party)
- PostgreSQL 15 with RLS on every table
- Supabase Auth (Phone OTP via MSG91 + email/password fallback)
- Supabase Storage (signed URLs, 1-hour expiry)
- Supabase Edge Functions (Deno/TypeScript)
- Supabase Realtime (mortality spike alerts)
- pg_cron + pg_net extensions for scheduled jobs
- **AiSensy** (WhatsApp Business Cloud API) — ₹1,000/mo for 1,000 conversations
- **OpenWeatherMap** (free tier) — 1,000 calls/day
- **MSG91** (SMS OTP) — ₹0.18 per OTP
- **Razorpay** (Subscriptions + UPI Collect) — 2% per transaction

---

## Database Schema (exact table/column names — use verbatim)

All tables include `created_at TIMESTAMPTZ DEFAULT now()` and `updated_at TIMESTAMPTZ DEFAULT now()` unless noted.

### Core Tables (v1)

1. **profiles** — One row per user, linked to auth.users(id). Columns: id (UUID PK), full_name, phone, **whatsapp_phone (NEW)**, **whatsapp_opt_in (NEW, BOOLEAN DEFAULT false)**, role (owner|worker|vet), farm_id (FK→farms), subscription_status (free|active|cancelled|past_due), subscription_id, expo_push_token

2. **farms** — Columns: id, owner_id (FK→profiles), farm_name, owner_name, state, district, phone, gstin, **farm_type (NEW, independent|contract)**, **integrator_id (NEW, FK→integrators nullable)**, **latitude (NEW, NUMERIC)**, **longitude (NEW, NUMERIC)**, **heat_stress_threshold_celsius (NEW, NUMERIC DEFAULT 35.0)**, **upi_id (NEW, TEXT — owner's VPA)**, market_price_override_broiler, market_price_override_egg

3. **sheds** — Columns: id, farm_id (FK→farms CASCADE), shed_name, capacity, poultry_type (broiler|layer|breeder), status (active|inactive)

4. **batches** — Columns: id, shed_id (FK→sheds CASCADE), farm_id (denormalised), batch_code (auto), breed_name, poultry_type, placement_date, opening_bird_count, current_bird_count, source_supplier, cost_per_bird, status (active|harvested|closed), harvest_date, birds_sold, sale_weight_kg, sale_price_per_kg, total_sale_revenue (GENERATED)

5. **daily_logs** — Core entry table. Columns: id, batch_id (FK→batches CASCADE), farm_id, logged_by (FK→profiles), log_date, birds_dead, death_cause (disease|culled|injury|heat_stress|unknown), feed_consumed_kg, feed_type (starter|grower|finisher|layer|custom), feed_cost_per_kg, eggs_collected, avg_bird_weight_g, notes, is_synced. UNIQUE(batch_id, log_date)

6. **health_incidents** — Columns: id, batch_id, farm_id, reported_by, incident_date, symptom_description, affected_bird_count, vet_consulted, diagnosis, treatment_given, medicine_name, dose, withdrawal_days, withdrawal_clearance_date (GENERATED), vet_note

7. **vaccinations** — Columns: id, batch_id, farm_id, vaccine_name, scheduled_date, administered_date, dose, route (oral|injection|spray), birds_vaccinated, status (scheduled|done|overdue), administered_by

8. **inventory_items** — Columns: id, farm_id, item_name, category (feed|medicine|vaccine|equipment), unit (kg|litres|units), current_stock, low_stock_threshold

9. **inventory_movements** — Columns: id, item_id (FK→inventory_items), farm_id, movement_type (purchase|usage|adjustment), quantity, cost_per_unit, supplier, movement_date, notes, daily_log_id

10. **financial_transactions** — Columns: id, farm_id, batch_id, **buyer_id (NEW, FK→buyers nullable)**, transaction_type (income|expense), category, amount, quantity, price_per_unit, buyer_or_supplier, transaction_date, payment_status (paid|pending|partial), due_date, notes

11. **market_prices** — Columns: id, state, price_date, broiler_price_per_kg, egg_price_per_100, source (agmarknet|nafed|manual). UNIQUE(state, price_date)

12. **traceability_records** — Columns: id, batch_id (UNIQUE), farm_id, qr_token (UNIQUE), supplier_name, placement_date, breed_name, total_vaccinations, health_incidents_count, withdrawal_cleared, harvest_date, buyer_name, certificate_pdf_url, is_locked

13. **farm_users** — Columns: id, farm_id, user_id, role (owner|worker|vet), assigned_shed_ids (UUID[]), invited_at, accepted_at. UNIQUE(farm_id, user_id)

### NEW Tables (v2 — India-killer features)

14. **buyers** — UPI Khata buyer profiles. Columns: id, farm_id (FK→farms CASCADE), buyer_name, phone (E.164), whatsapp_phone, address, gstin, credit_limit, total_business_volume, current_balance (positive = buyer owes farmer), last_transaction_date

15. **payment_reminders** — WhatsApp reminder audit. Columns: id, farm_id, buyer_id (FK→buyers), transaction_id (FK→financial_transactions), reminder_stage (day_7|day_15|day_30), sent_at, whatsapp_message_id, status (sent|delivered|read|failed)

16. **weather_data** — Cached forecasts per farm. Columns: id, farm_id, fetched_at, current_temp_c, current_humidity, forecast_json (JSONB: next 72 hours), max_temp_today (GENERATED), heat_stress_alert_triggered (BOOLEAN)

17. **weather_alerts** — Heat-stress alert log. Columns: id, farm_id, alert_type (heat_stress|cold_stress|heavy_rain), alert_date, severity (warning|critical), max_temp_forecast, humidity_forecast, mitigation_actions_json (JSONB), sent_via_push, sent_via_whatsapp, acknowledged_at

18. **integrators** — Master list of contract integrators. Columns: id, name (UNIQUE: Suguna|Venkateshwara|Skylark|IB Group|Custom), state_presence (TEXT[]), tariff_card_json (JSONB), is_pre_loaded (BOOLEAN DEFAULT true)

19. **contract_cycles** — One row per contract growing cycle. Columns: id, farm_id, batch_id (UNIQUE, FK→batches), integrator_id (FK→integrators), chicks_supplied, chicks_supplied_date, total_feed_supplied_kg, total_medicine_supplied (JSONB), expected_harvest_date, actual_harvest_date, birds_delivered, avg_weight_kg, actual_fcr, actual_mortality_pct, expected_settlement_amount, actual_settlement_amount, settlement_received_date, dispute_notes, status (active|harvest_complete|settled|disputed)

20. **whatsapp_messages_log** — Audit log of all WhatsApp messages. Columns: id, farm_id, recipient_phone, message_type (daily_digest|mortality_alert|vaccination_reminder|low_stock_alert|heat_stress_alert|payment_reminder|invoice|traceability_cert|report), template_id, payload_json, aisensy_message_id, status, error_message

### tariff_card_json schema (integrators table)
```
{
  base_growing_charge_per_kg: number,
  fcr_bonus: { threshold: number, bonus_per_kg: number },
  mortality_bonus: { threshold_pct: number, bonus_per_kg: number },
  weight_target_kg: number,
  cycle_days: number
}
```

### DB Functions (PostgreSQL)
- `update_batch_bird_count()` — AFTER INSERT ON daily_logs
- `check_mortality_spike()` — AFTER INSERT ON daily_logs → calls send-push-notification + send-whatsapp-message Edge Functions
- `deduct_feed_inventory()` — AFTER INSERT ON daily_logs
- `generate_batch_code()` — BEFORE INSERT ON batches
- `lock_traceability_on_close()` — AFTER UPDATE ON batches WHERE status = closed
- **`update_buyer_balance()` (NEW)** — AFTER INSERT/UPDATE ON financial_transactions WHERE buyer_id NOT NULL
- **`check_payment_overdue()` (NEW)** — Called by send-payment-reminders cron
- **`lock_contract_cycle_on_close()` (NEW)** — AFTER UPDATE ON contract_cycles WHERE status = settled

### Edge Functions

**Existing (v1):**
- `fetch-market-prices` — pg_cron daily 08:00 IST
- `send-push-notification` — Called by DB trigger
- `send-vaccination-reminders` — pg_cron daily 07:00 IST
- `send-low-stock-alerts` — pg_cron daily 08:30 IST
- `generate-traceability-pdf` — HTTP POST (authenticated)
- `generate-report-pdf` — HTTP POST (authenticated)
- `razorpay-webhook` — HTTP POST (Razorpay signature verified)
- `create-razorpay-subscription` — HTTP POST (authenticated)

**NEW (v2):**
- `fetch-weather-data` — pg_cron hourly Apr–Sep, 6×/day rest of year. Iterates all farms; calls OpenWeatherMap; upserts weather_data; triggers heat-stress alerts
- `send-heat-stress-alert` — Called by fetch-weather-data. Inserts weather_alerts row; calls send-push-notification + send-whatsapp-message
- `send-whatsapp-message` — Called by other functions. POSTs to AiSensy API; logs to whatsapp_messages_log
- `send-daily-digest` — pg_cron 8 PM IST daily. Compiles per-farm summary; sends via send-whatsapp-message
- `send-payment-reminders` — pg_cron 10 AM IST daily. Day 7/15/30 overdue WhatsApp reminders
- `aisensy-webhook` — HTTP POST (AiSensy signature verified). Updates message status; handles inbound STOP/REPORT
- `calculate-contract-settlement` — Called by client on batch closure. Tariff card lookup + arithmetic
- `create-upi-collect-link` — HTTP POST (authenticated). Razorpay UPI Collect link generation

---

## RLS Policy Summary

Every table has RLS enabled. No table accessible without authenticated JWT except `traceability_records` (anon SELECT on qr_token only).

- **Owner**: Full CRUD on their farm's data; sees buyers, financials, contract cycles
- **Worker**: INSERT daily_logs + health_incidents for assigned sheds; SELECT own farm data; NO financials, NO buyers
- **Vet**: SELECT + UPDATE (vet_note only) on health_incidents; NO financials, NO buyers
- **Anon**: SELECT traceability_records by qr_token only (public traceability page)
- **Service role (Edge Functions)**: Full access for cron jobs, weather data, WhatsApp logging

### NEW v2 RLS specifics
- **buyers**: Owner-only. Other roles get empty result.
- **payment_reminders**: Owner SELECT; service role INSERT only.
- **weather_data + weather_alerts**: Any farm member SELECT; service role INSERT/UPDATE.
- **integrators**: Any authenticated user SELECT (master list); service role only writes.
- **contract_cycles**: Owner of associated farm only; immutable after status = settled.
- **whatsapp_messages_log**: Owner SELECT only; service role INSERT only. Never deleted (audit trail).

---

## Freemium Enforcement

| Limit | Free | Paid |
|-------|------|------|
| Farms | 1 | Unlimited |
| Sheds | 3 | Unlimited |
| Workers | 2 | Unlimited |
| Vet access | No | Yes |
| Buyers (NEW) | 10 | Unlimited |
| WhatsApp alerts/month (NEW) | 5 | Unlimited |
| Contract farming module (NEW) | No | Yes |
| Traceability QR/PDF | No | Yes |
| Multi-farm dashboard | No | Yes |
| Full export | No | Yes |

Enforce at BOTH client UI AND database function / Edge Function level.

---

## Development Phases (v2.0 — 18 weeks)

### Phase 1: Foundation (Weeks 1–3) — Android + Web Parallel
- Supabase project setup, all v1+v2 tables, RLS, seed data
- Day 1 actions: AiSensy WhatsApp template submission, Razorpay KYC, OpenWeatherMap + MSG91 signup
- Expo project init + Next.js parallel; Supabase client; mobile OTP auth (MSG91)
- Onboarding wizard (5 steps incl. farm type, WhatsApp opt-in)
- Farm setup, shed creation, batch creation
- Daily log entry (offline queue with AsyncStorage)
- DB triggers: bird count update, mortality spike check
- Push notifications, mortality spike alert E2E
- **Weather widget on dashboard** (NEW)
- **Gate**: Worker logs <60s; weather data on dashboard

### Phase 2: Core Operations + WhatsApp (Weeks 4–7)
- Health incident form, withdrawal tracker, vet role
- Vaccination scheduler, reminders Edge Function, pg_cron
- Inventory screens, feed auto-deduct, low-stock alerts
- **WhatsApp Business integration** — AiSensy templates approved by now (NEW)
- **send-whatsapp-message Edge Function; aisensy-webhook** (NEW)
- **send-daily-digest cron at 8 PM IST** (NEW)
- **send-heat-stress-alert; weather_alerts table; mitigation UI** (NEW)
- **Gate**: All alerts route via push + WhatsApp

### Phase 3: Financials + UPI Khata (Weeks 8–10)
- Income/expense entry, payment status tracker
- KPI dashboard (FCR, livability, production %), 7-day charts
- **Buyer profiles + Khata ledger screens** (NEW)
- **UPI QR generation (BHIM URI scheme)** (NEW)
- **send-payment-reminders cron (day 7/15/30)** (NEW)
- **Razorpay UPI Collect for auto-confirm** (NEW)
- Batch P&L, batch closure flow, breed benchmarks
- **Gate**: UPI QR generated + WhatsApp reminder sent + auto-confirm works

### Phase 4: Standout Features (Weeks 11–13)
- Market price fetch, pg_cron, dashboard price strip
- 14-day price history chart, profit calculator
- Traceability records, QR codes, PDF certificates, WhatsApp share
- **Gate**: Certificate PDF shareable via WhatsApp

### Phase 5: Contract Farming + Web + Billing (Weeks 14–18)
- **Seed integrators table with Suguna, Venkateshwara, Skylark, IB Group tariff cards** (NEW)
- **Contract cycle screens — input tracking, performance metrics** (NEW)
- **calculate-contract-settlement Edge Function** (NEW)
- **Settlement reconciliation report; WhatsApp share to integrator** (NEW)
- Web dashboard polish; Razorpay subscriptions; freemium gates UI
- Multi-farm consolidated dashboard (web only)
- End-to-end testing with 5 beta farms (incl. 2 contract farms)
- Play Store submission
- **Gate**: Public launch ready; 2 contract farms onboarded

---

## Design System

**`DESIGN.md` (project root) is the single source of truth for tokens.** All UI work
keys to those tokens. Anything below is either (a) a domain colour overlay PoultryOS
needs that DESIGN.md does not cover, or (b) a UX rule that the design system can't
encode. Never hardcode hex values — import from `mobile-app/theme/tokens.ts` (mobile) or `frontend/lib/theme/tokens.ts` / `saas-control-center/lib/theme/tokens.ts` (web) instead.

### Token Quick Reference (from DESIGN.md — ElevenLabs editorial system)

Off-white canvas, warm near-black ink, **NO saturated CTA color**. The primary action is
a near-black **ink pill**; brand voltage comes from pastel **gradient orbs** used as
atmospheric decoration only. Token NAMES are preserved from the prior system (so the ~200
consuming files compile unchanged) — only VALUES were remapped, plus additive tokens.

| Group | Tokens |
|---|---|
| **Primary (Ink pill — NOT a brand color)** | `colors.primary` `#292524` · `colors.primaryDark` `#0c0a09` (press) · `colors.primaryDeep` `#0c0a09` · `colors.primarySubtle` `rgba(41,37,36,0.08)` · `colors.onPrimary` `#ffffff` |
| **Neutrals** | `colors.ink` `#0c0a09` · `colors.body` `#4e4e4e` · `colors.bodySoft`/`muted` `#777169` · `colors.mutedSoft` `#a8a29e` (disabled) · `colors.mute` (hairline) `#e7e5e4` · `colors.hairlineStrong` `#d6d3d1` · `colors.canvas` (card) `#ffffff` · `colors.canvasSoft` (page floor) `#f5f5f5` · `colors.surfaceStrong` `#f0efed` · `colors.surfaceDark` `#0c0a09` |
| **Gradient orbs (signature — decoration ONLY)** | `colors.gradientMint` `#a7e5d3` · `gradientPeach` `#f4c5a8` · `gradientLavender` `#c8b8e0` · `gradientSky` `#a8c8e8` · `gradientRose` `#e8b8c4` — radial blooms behind hero/feature copy. NEVER button fills, NEVER text colors. Web: `.orb-*` utilities. |
| **Semantic** | `colors.success` `#16a34a` · `colors.successInk` `#15803d` · `colors.successSoft` `rgba(22,163,74,0.12)` · `colors.danger` `#dc2626` · `colors.warning` `#92400E` |
| **Typography** | Display = **EB Garamond Light (300)** serif — `displayHero/Xxl/Xl/Lg/Md` weight **300**, negative tracking (editorial; **never bold display**); `displaySm/Xs` step into Inter. Body = **Inter** at 400/500 with **+0.15–0.18px tracking** — `bodyLg/Md/MdStrong/Sm/SmStrong` · `caption/captionUppercase` (uppercase 0.96px) · `buttonMd` (15/500) |
| **Spacing** | `xxs:2 / xs:4 / sm:8 / md:12 / lg:16 / xl:20 / 2xl:24 / 3xl:32 / xxl:48 / section:96` (96px = editorial band rhythm) |
| **Radius** | `none:0 / xs:4 / sm:6 / md:8 (inputs) / lg:12 / card:16 / xl:16 (cards) / xxl:24 (orb cards) / pill:9999 / full:9999` — **CTAs + badges are PILLS** (`pillMd`/`pillLg` remapped to 9999); cards use `xl`/`card` (16px) |
| **Elevation** | Single soft-drop tier: `elevation.subtle` (`rgba(0,0,0,0.04) 0 4px 16px`) · `elevation.micro` (`rgba(0,0,0,0.03) 0 2px 8px`). Depth otherwise = hairline + gradient orbs. |

**Fonts**: DESIGN.md specifies **Waldenburg Light (300)** display + **Inter** body. PoultryOS
substitutes **EB Garamond** (weight 300/400, the documented open-source substitute) for display
and uses **Inter** directly for body/UI. Mobile: `@expo-google-fonts/inter` + `@expo-google-fonts/eb-garamond`,
registered in `app/_layout.tsx`, exported as `fontFamily` / `fontFamilyDisplay` from `theme/tokens.ts`.
Web: `next/font/google` `Inter` (`--font-sans`) + `EB_Garamond` (`--font-display`) in `app/layout.tsx`.
IBM Plex Sans is fully retired.

### PoultryOS Domain Colour Overlay (not in DESIGN.md — additive)

| Token | Hex | Usage |
|-------|-----|-------|
| WhatsApp Green | `#25D366` (`colors.whatsapp`) | WhatsApp share buttons only — external brand, instant recognition |
| Heat Orange | `#EA580C` (`colors.heat`) | Heat-stress alert banners |
| UPI Purple | `#5B21B6` (`colors.upi`) | UPI / payment screens (kept distinct so payment flows stay recognisable) |

> **Note on `colors.primary` vs Danger**: DESIGN.md's primary is the **ink pill**
> (`#292524`) — a calm, near-black action color, NOT urgent and NOT a saturated brand
> hue. There is intentionally no chromatic CTA color. For destructive confirmations
> use `colors.danger` (`#dc2626`) explicitly. Brand voltage lives in the gradient orbs.

### Component Rules
- Theme: Light only (v1). Page bg `colors.canvasSoft` (off-white `#f5f5f5`). Card bg `colors.canvas` (`#ffffff`).
- Cards: `colors.canvas` bg, 1px `colors.mute` (hairline) border, `radius.xl`/`card` (16px), `spacing.lg` (16px) padding, optional `elevation.subtle` (single soft-drop) for raised/hovered cards
- Primary button: `colors.primary` (ink) fill, `colors.onPrimary` text, **`radius.pill` (9999) — the ElevenLabs brand button IS a pill**, ~10px vertical × 20px horizontal padding, 40px height (44px min touch target), font `buttonMd` (15/500)
- Outlined button: transparent bg, 1px `colors.hairlineStrong` border, `colors.ink` text, pill radius
- Subtle button: `colors.primarySubtle` (ink wash) bg, `colors.ink` text, pill radius — for tertiary actions
- **Gradient orb**: atmospheric radial bloom (one of the 5 gradient tokens) behind hero/section copy; `radius.xxl` (24px) orb cards on `canvasSoft`. Decoration only — never content surface, never button fill.
- **WhatsApp share button: `colors.whatsapp` (`#25D366`, NOT brand primary) for instant recognition**
- **UPI QR display: full-screen modal, 250×250px QR via `react-native-qrcode-svg`, amount + buyer name below**
- **Heat-stress alert banner: `colors.heat` bg with thermometer icon; sticky on dashboard during alert window**
- Badges: success uses `colors.successSoft` bg + `colors.successInk` text + 6px radius; neutral uses `colors.muteSoft` bg + `colors.body` text + 8px radius
- Forms: 36px input height, label above field (never placeholder-only)
- Daily log FAB: 56px circular (`radius.full`), `colors.primary`, fixed bottom-right
- Charts: Victory Native (mobile) / Recharts (web), `colors.primary` line on `colors.canvasSoft` background
- Empty states: illustration + description + CTA. No blank screens
- Loading: skeleton screens (not spinners)

### Legacy Cleanup Notes
1. **ElevenLabs migration (2026-06-17):** the Kraken purple system was remapped to the ElevenLabs editorial palette by **rewriting the 3 token files + 2 Tailwind configs + 2 `globals.css` + the Paper theme + fonts** — token NAMES were preserved so consumers compile unchanged. `colors.primary` is no longer purple (`#7132f5`) — it is the ink pill (`#292524`). Buttons are now PILLS (`radius.pillLg`/`pillMd` remapped 12→9999); if a layout relied on the prior 12px button corner, that is intended to change.
2. Display type flipped from IBM Plex **Bold (700)** to **EB Garamond Light (300)** serif via the `typography.display*` tokens. Any component that hardcodes `fontWeight: '700'`/`'bold'` *on display text* will fight the loaded weights (only 400/500 of EB Garamond are registered) — prefer the `typography.display*` tokens, never inline bold on headings.
3. Older eras (Brand Blue `#1A56DB`, Vodafone-red `#e60000`) remain fully retired. The codebase is essentially 100% tokenised — never reintroduce hex literals outside `theme/tokens.ts`.

### Mobile UX
- Minimum touch target: 44 × 44px
- Daily log: 3 taps or fewer after opening form
- Bottom nav: Dashboard | Flocks | Log | **Khata (NEW)** | More (5 tabs)
- Offline banner: yellow strip "Working offline — data will sync when connected"
- All lists: pull-to-refresh
- WhatsApp share button visible on every shareable artefact

---

## Screen Inventory (23 screens — v2.0)

### Existing screens (17)
1. Login / OTP Verify — Mobile OTP (primary) + email fallback
2. Dashboard (Home) — KPI cards, market price strip, **weather widget (NEW)**, alerts, FAB
3. Flock List — Active batches per shed
4. Batch Detail — Stats, daily log history, vaccination timeline, **profit calculator**
5. Daily Log Entry — Single-page form: mortality + feed + eggs + weight
6. Health Incident Form — Symptoms, treatment, withdrawal date
7. Vaccination Scheduler — Timeline of due/completed per batch
8. Inventory — Stock levels, purchase entry, low-stock alerts
9. Financials – Income — Sales, receivables (linked to buyers)
10. Financials – Expenses — By category
11. P&L Summary — Batch and overall P&L
12. Reports — Selector, date filter, PDF/CSV download, **WhatsApp share**
13. Traceability — QR, certificate, export
14. Market Prices — State dashboard, 14-day trend
15. Farm Settings — Profile, sheds, user invite, **WhatsApp opt-in, breed thresholds**
16. Notifications — Push + **WhatsApp alert history**
17. Consolidated Dashboard (web only) — Multi-farm aggregate

### NEW v2 screens (6)
18. **Buyers / Khata** — Buyer list, per-buyer ledger, outstanding receivables view
19. **Buyer Detail** — Transaction history, generate UPI QR, send WhatsApp reminder
20. **Weather** — Current conditions, 3-day forecast, mitigation tips, mortality–temp correlation chart
21. **Contract Farming Dashboard** — Integrator inputs, performance metrics, settlement calculator (Contract farms only)
22. **Settlement History** — Past cycles, expected vs received, reconciliation
23. **WhatsApp Settings** — Notification preferences (per category), STOP/RESUME

---

## WhatsApp Templates (must be pre-approved by Meta via AiSensy)

Submit on Day 1 — 24–48hr approval typical:

| Template ID | Content |
|-------------|---------|
| `daily_digest` | "Hi {{1}}, today's farm report: {{2}} mortality, {{3}} kg feed used, market broiler {{4}}/kg." |
| `mortality_alert` | "⚠️ Mortality alert at {{1}} farm: {{2}} birds dead today (>{{3}}% threshold). Check {{4}} shed." |
| `vaccination_reminder` | "Reminder: {{1}} vaccination due {{2}} for batch {{3}}. Mark done in app." |
| `heat_stress_alert` | "🔥 Heat alert: {{1}}°C forecast tomorrow at {{2}}. Actions: increase water, run foggers, reduce feed by 20%." |
| `payment_reminder` | "Reminder: ₹{{1}} pending from {{2}}. Pay via UPI: {{3}}" |
| `low_stock_alert` | "⚠️ Low stock at {{1}}: {{2}} below threshold. Reorder soon." |

NEVER hallucinate template IDs in code. Use exact IDs approved by AiSensy.

---

## UPI QR Generation (client-side, BHIM URI format)

UPI QR codes generated on-device — no server round-trip needed:

```
upi://pay?pa=[vpa]&pn=[name]&am=[amount]&cu=INR&tn=[note]
```

- `pa`: Farm owner's UPI ID (stored in farms.upi_id) — validate regex `^[\w.-]+@[\w.-]+$`
- `pn`: Farm name
- `am`: Invoice amount (numeric)
- `cu`: INR (always)
- `tn`: "PoultryOS Invoice [batch_code]"

Encode this URI string into QR using `react-native-qrcode-svg`. NO API call needed. NO cost.

For auto-confirmation: pair with Razorpay UPI Collect link via `create-upi-collect-link` Edge Function.

---

## Performance Targets

| Metric | Target |
|--------|--------|
| App cold start (low-end Android) | < 3 seconds |
| Daily log save (online) | < 1 second |
| Daily log save (offline) | Instant (queued) |
| Dashboard KPI load | < 2 seconds on 4G |
| WhatsApp delivery | < 5s from Edge Function call |
| UPI QR display | Instant (client-side, no network) |
| Heat-stress alert latency | < 30s from threshold breach |
| Daily digest job (1,000 farms) | < 30 minutes |
| Push notification delivery | < 30 seconds from insert |
| PDF generation | < 10 seconds |
| Chart render | < 500ms |
| App bundle size | < 50 MB |
| Weather API quota | < 1,000 calls/day on free tier |

---

## Core Principles

- **Simplicity First**: Make every change as simple as possible. Minimal code impact.
- **No Laziness**: Find root causes. No temporary fixes. Senior developer standards.
- **Minimal Impact**: Changes should only touch what's necessary. Avoid introducing bugs.
- **Supabase-Native**: Use Supabase features (RLS, triggers, Edge Functions) instead of building custom backend logic.
- **Offline-Aware**: Daily log entry must work offline. All other features require connectivity.
- **Low-End Device Friendly**: Every UI decision must consider ₹6k Android phones with 2 GB RAM on 4G.
- **WhatsApp-First Communication**: When a notification or document needs to reach the user, prefer WhatsApp over email. Indians live on WhatsApp.
- **UPI-First Payments**: For any payment flow involving Indian buyers, default to UPI QR. Don't suggest credit cards.
- **India Time Zone**: All cron jobs in Asia/Kolkata (IST). All dates display in DD-MMM-YYYY format.

---

## Key Architecture Decisions

1. **No custom backend server** — Supabase replaces the backend entirely
2. **Denormalised farm_id** on most tables — for RLS performance (avoid JOINs in policies)
3. **DB triggers for KPI recalculation** — not client-side computation
4. **Expo managed workflow** — no bare React Native; EAS Build handles native modules
5. **Zustand for state** — lightweight, AI-friendly, no boilerplate
6. **Single Supabase insert for daily log** — triggers handle cascade updates async
7. **Signed URLs for all file access** — 1-hour expiry, no permanent public links
8. **Mobile OTP primary auth** — Indians prefer OTP over email/password
9. **WhatsApp Business via AiSensy** — cheaper than Gupshup, good Indian SLA
10. **Client-side UPI QR generation** — BHIM URI scheme means zero API cost
11. **OpenWeatherMap free tier** — 1,000 calls/day handles 200 farms hourly cache
12. **Pre-loaded integrator tariff cards** — Suguna, Venkateshwara, Skylark, IB Group seeded; owner can add custom
13. **No LLM in MVP** — all intelligence is rule-based (statistical thresholds, lookup tables); Claude API deferred to Phase 6

---

## Day 1 Critical Path (do these BEFORE coding)

These have approval lead times. Start them on Day 1, not when needed:

1. **AiSensy account + WhatsApp Business profile** — Meta verification: 3–7 days
2. **Submit 6 WhatsApp templates** for approval (see WhatsApp Templates section): 24–48 hrs
3. **Razorpay KYC for live mode**: 1–3 days (test mode works immediately)
4. **MSG91 account** for SMS OTP: 1–2 days for KYC
5. **OpenWeatherMap free API key**: instant
6. **Supabase project in ap-south-1 (Mumbai)**: instant — for Indian data residency / DPDP Act
7. **Google Play Developer account**: already paid ($25 one-time)
8. **Test on Redmi 9A or similar 2GB RAM Android device** weekly — emulators lie about performance

---

## Out of Scope (MVP v2.0)

- AI/ML disease detection or predictive models
- IoT sensor integration
- Hatchery/feed mill/processing modules
- Vernacular language UI / voice input (Telugu, Hindi, Tamil) — Phase 6 with Bhashini API
- Vet marketplace / paid consultation booking
- Regional disease outbreak network alerts
- Loan & insurance marketplace
- Accounting software integration (Tally, Zoho Books)
- Marketplace for buying/selling birds or eggs
- iOS app — after 100 paying farms
- Full offline-first sync — MVP: offline queue for daily log only
- Integrator B2B aggregate dashboard (field officer view) — Phase 6 enterprise tier

---

## Risk Awareness (avoid these failure modes)

1. **AiSensy template rejection** — Submit Day 1; follow Meta guidelines strictly; have backup wording
2. **Agmarknet scraper breaking** — Test daily; manual override always available; show "price unavailable" gracefully
3. **WhatsApp opt-in fatigue** — Make value clear during onboarding; allow per-category control
4. **Heat-stress false positives** — Calibrate threshold per breed; track acknowledgement rate
5. **UPI Collect failures** — Pair with manual mark-as-paid fallback; never block income entry
6. **Contract integrator non-adoption** — Direct sales in Phase 5; demo with 10 contract growers first
7. **Low-end Android performance** — Test on Redmi 9A weekly, not just emulators
8. **Data loss on offline sync conflict** — UNIQUE(batch_id, log_date) prevents duplicate entries; last-write-wins fine for our use case
