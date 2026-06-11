# 01 — Project Structure Audit

_Audit date: 2026-06-11. All findings reference actual files. Verified by full file-tree scan, `tsc --noEmit` on both clients (clean), and a 139-test Jest run (all passing)._

## 1. Top-level layout

```
Poultry_management-main/
├── CLAUDE.md / PRD.md / TRD.md / DESIGN.md   # Spec docs (source of truth)
├── PoultryOS/            # Expo SDK 54 mobile app (Android + RN-web)
├── web/                  # Next.js 14.2.18 App Router web app
├── supabase/
│   ├── functions/        # 12 Deno Edge Functions
│   └── migrations/       # 25 SQL migrations
├── tests/                # Jest unit tests, pgTAP SQL tests, Deno fn tests
├── tasks/                # todo.md, lessons.md, open-items.md, launch checklist
└── .env.example          # Secret template (root)
```

Two parallel clients share one Supabase backend; there is **no custom server** — all server logic is Postgres (RLS, triggers, RPCs) + Edge Functions. This matches CLAUDE.md architecture decision #1.

## 2. Architecture assessment

### Backend (Supabase) — strongest layer
- **Schema**: 21 tables created in one transaction in [20260502000000_initial_schema.sql](supabase/migrations/20260502000000_initial_schema.sql) — 20 spec tables + `subscription_plans` ([20260520000004](supabase/migrations/20260520000004_subscription_plans_and_is_paid.sql)).
- **RLS on every table** with helper functions `is_farm_owner` / `is_farm_member` / `user_role_for_farm` (initial_schema.sql:835–889).
- **Hardening discipline is real**: search_path pinned on all functions ([20260502000001](supabase/migrations/20260502000001_harden_functions_and_extensions.sql)), SECURITY DEFINER RPCs have REVOKE/GRANT pairs, FK covering indexes + RLS initplan fixes applied ([20260522000005](supabase/migrations/20260522000005_perf_fk_indexes_and_rls_initplan.sql)).
- **12 Edge Functions** present: aisensy-webhook, create-razorpay-subscription, create-upi-collect-link, fetch-weather-data, razorpay-webhook, send-daily-digest, send-heat-stress-alert, send-low-stock-alerts, send-payment-reminders, send-push-notification, send-vaccination-reminders, send-whatsapp-message.
- **3 Edge Functions documented in CLAUDE.md are missing**: `fetch-market-prices`, `generate-traceability-pdf`, `generate-report-pdf`. Market prices are manual-entry only (via `upsert_market_price` RPC, [20260520000002](supabase/migrations/20260520000002_upsert_market_price_rpc.sql)); PDFs were moved client-side (jsPDF in [DownloadCertificate.tsx](web/app/traceability/[token]/DownloadCertificate.tsx)).

### Mobile (PoultryOS/) — feature-complete, organized cleanly
- `app/` — expo-router file routing: `(auth)`, `(onboarding)` 5-step wizard, `(tabs)` (Dashboard | Flocks | Log | Khata | More), plus 16 stack route groups (batches, buyers, contract, health, inventory, vaccinations, weather, whatsapp-settings, billing, language, etc.).
- `components/ui/` — 31 reusable primitives ([index.ts](PoultryOS/components/ui/index.ts)) keyed to [theme/tokens.ts](PoultryOS/theme/tokens.ts).
- `lib/` — pure business logic (kpis, batch-pnl, freemium, upi, offline-queue, reports, i18n) — deliberately I/O-free for testability.
- `stores/` — 3 small Zustand stores (auth, farm, onboarding).
- i18n shipped: `locales/en|hi|ta|te/common.json` + language picker (`app/language/`) — note this is *ahead* of CLAUDE.md scope (vernacular UI was listed Phase 6).

### Web (web/) — feature-complete, server-component-first
- App Router with `(auth)`, `(dashboard)` (24 route folders), `/onboarding`, public `/traceability/[token]`.
- Pattern: server component `page.tsx` fetches via [lib/supabase/server.ts](web/lib/supabase/server.ts); interactivity isolated in colocated client components (e.g., `BatchForm.tsx`, `MarkPaidButton.tsx`).
- Session refresh + route protection in [middleware.ts](web/middleware.ts) → [lib/supabase/middleware.ts](web/lib/supabase/middleware.ts).
- Freemium gating via [components/UpgradeGate.tsx](web/components/UpgradeGate.tsx) calling the `is_paid()` RPC.

## 3. Frontend quality signals

| Signal | Mobile | Web |
|---|---|---|
| Typecheck (`tsc --noEmit`) | ✅ clean | ✅ clean |
| Design tokens centralized | ✅ [theme/tokens.ts](PoultryOS/theme/tokens.ts) (only 2 stray hex files) | ✅ [lib/theme/tokens.ts](web/lib/theme/tokens.ts) + tailwind mapping |
| Loading states | Partial (per-widget `loading` props; no skeleton components) | ❌ **zero `loading.tsx` files** |
| Error boundaries | ❌ none | ❌ **zero `error.tsx` / `not-found.tsx`** |
| Accessibility attrs | 64 `accessibilityLabel/Role` hits | ⚠️ only **6** `aria-*`/`role=` hits across the app |
| List virtualization | FlatList in 7 screens | server-rendered tables, `.limit()` caps, **no pagination UI** |
| Responsive layout | n/a (native) | ⚠️ fixed 240px sidebar, no mobile breakpoint ([Sidebar.tsx:44](web/components/Sidebar.tsx#L44)) |

## 4. Infrastructure & operations — the weakest layer

| Area | Status | Evidence |
|---|---|---|
| Git repository | ❌ **not initialized** | workspace `Is a git repository: false`; 17 commits referenced in [tasks/open-items.md:3](tasks/open-items.md#L3) but no `.git` present here |
| CI/CD | ❌ none | no `.github/`, no pipeline config anywhere |
| EAS Build config | ❌ missing | no `PoultryOS/eas.json` (launch checklist [phase-5-launch-readiness.md:83](tasks/phase-5-launch-readiness.md#L83) lists it as unchecked) |
| Vercel config | ⚠️ implicit | no `vercel.json`; env vars documented in checklist only |
| Error monitoring | ❌ none | no Sentry/Crashlytics/PostHog imports anywhere |
| Analytics | ❌ none | no product analytics instrumentation |
| Logging | ⚠️ console-only | Edge Functions log to Supabase function logs; clients swallow errors silently (e.g., bare `catch {}` in [dashboard.tsx:178](PoultryOS/app/(tabs)/dashboard.tsx#L178)) |
| Secrets hygiene | ✅ good | [.env.example](.env.example) template; real `.env` files gitignored; only anon keys in client env files |
| Secret name drift | ❌ bug | launch checklist says set `OPENWEATHER_API_KEY` ([phase-5-launch-readiness.md:54](tasks/phase-5-launch-readiness.md#L54)) but function reads `OPENWEATHERMAP_API_KEY` ([fetch-weather-data/index.ts:286](supabase/functions/fetch-weather-data/index.ts#L286)) — following the runbook will silently break weather |

## 5. Testing architecture

- **Unit**: 14 suites / 139 tests, all passing (`npx jest` in PoultryOS, configured via [jest.config.js](PoultryOS/jest.config.js) + jest-expo). Coverage focuses on pure libs (kpis, batch-pnl, freemium, offline-queue, i18n, reports, contract-report) + 5 component tests.
- **DB**: 5 pgTAP SQL tests in [tests/db/](tests/db/) (mortality trigger, feed deduct, RPCs, onboarding smoke). pgTAP enabled by [20260519000001](supabase/migrations/20260519000001_enable_pgtap.sql).
- **Edge Functions**: 2 Deno tests ([tests/functions/](tests/functions/)) — only whatsapp + aisensy covered; razorpay-webhook (money path) untested.
- **E2E**: ❌ none — no Maestro flows despite CLAUDE.md listing them as test-writer scope.
- **Gap**: no CI runs any of these automatically.

## 6. Dead weight (verified unused)

| Item | Where | Impact |
|---|---|---|
| `victory-native` 36 + `@shopify/react-native-skia` 2.2.12 | [PoultryOS/package.json](PoultryOS/package.json) | zero imports in app code (charts are hand-rolled `react-native-svg` in [market-prices/index.tsx:16](PoultryOS/app/market-prices/index.tsx#L16)); Skia alone adds multiple MB to the bundle |
| `@expo-google-fonts/inter` | loaded in [app/_layout.tsx:4-11](PoultryOS/app/_layout.tsx#L4-L11) | fonts are loaded but **no style ever sets `fontFamily`** — app renders in system font; pure startup cost |
| `jspdf-autotable` | [web/package.json](web/package.json) | never imported (reports export CSV only — [ReportExports.tsx:69](web/app/(dashboard)/reports/ReportExports.tsx#L69)) |
| `@tanstack/react-table` | web devDependencies | never imported |
| `react-hook-form` + `@hookform/resolvers` (mobile) | [PoultryOS/package.json](PoultryOS/package.json) | forms are hand-rolled controlled components; verify before removal |
| Supabase Realtime | nowhere | CLAUDE.md architecture lists "Realtime (mortality spike alerts)" — implemented via push notifications instead; doc drift |

## 7. Verdict

The application layer is in genuinely good shape: a disciplined schema-first backend, two type-clean clients with consistent patterns, and real unit-test coverage of the business math. The structural risks are all **operational**: no git repo in this workspace, no CI, no error monitoring, no EAS config, missing primary auth (mobile OTP — see 02-feature-inventory), and a handful of doc/code drifts (secret names, missing Edge Functions) that will bite exactly at launch time.

**Top 5 structural priorities**
1. Initialize git + push to GitHub; add CI (typecheck + jest + migration lint) — everything else depends on this.
2. Add error monitoring (Sentry for Next.js + sentry-expo) before beta farms generate silent failures.
3. Reconcile CLAUDE.md ↔ code drift: missing 3 Edge Functions, Realtime claim, secret name `OPENWEATHERMAP_API_KEY`.
4. Strip dead dependencies (victory-native, skia, Inter fonts, jspdf-autotable) — direct cold-start and bundle wins on ₹6k Android targets.
5. Add `error.tsx` / `loading.tsx` to the web app and an error boundary to mobile root layout.
