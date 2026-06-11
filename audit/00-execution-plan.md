# 00 — Prioritized Execution Plan

_The single document to work from. Synthesizes audits 01–11 into an ordered, dependency-aware build queue. Audit date: 2026-06-11._

## Verdict in one paragraph

PoultryOS is **build-complete and structurally sound** — 23/23 screens routed on both clients, 21 RLS-protected tables, 12 Edge Functions, clean typechecks, 139 passing tests, and real security discipline in the migration history. What stands between this codebase and "best poultry SaaS in the market" is not a rebuild: it is (a) ~2 weeks of sharp-edge fixes (auth, one RLS leak, money-math, dead-ends), (b) launch operations that don't exist yet (git/CI/monitoring/EAS), (c) one missing habit-forming feature (automated market prices), and (d) a UX-states/IA polish pass to reach top-tier SaaS feel.

## Sprint 0 — "Stop the bleeding" (Days 1–3)

| # | Task | Source | Files |
|---|---|---|---|
| 0.1 | `git init`, push to GitHub, branch protection | 01 §4 | repo root |
| 0.2 | CI: typecheck both apps + jest + (later) maestro | 01 §5 | `.github/workflows/` |
| 0.3 | Weather widget → navigate to `/weather` | G6 | [dashboard.tsx:280](PoultryOS/app/(tabs)/dashboard.tsx#L280) |
| 0.4 | Traceability token RPC; drop anon table policy | **H1/G2** | new migration + [traceability page](web/app/traceability/[token]/page.tsx) |
| 0.5 | Webhooks fail closed without secrets | **H2/G3** | razorpay-webhook, aisensy-webhook |
| 0.6 | OWM secret name unified + env asserts | G8 | [fetch-weather-data](supabase/functions/fetch-weather-data/index.ts), [checklist](tasks/phase-5-launch-readiness.md#L54) |
| 0.7 | Server-side role assignment on signup | M3 | migration + [auth-service.ts](PoultryOS/auth/auth-service.ts) |

## Sprint 1 — "Money is correct, login converts" (Days 4–10)

| # | Task | Source |
|---|---|---|
| 1.1 | `amount_paid` column; rewrite `update_buyer_balance()`; backfill; pgTAP test; partial-payment UI fields both clients | **G4/DB1** |
| 1.2 | **Mobile phone OTP** login + register (MSG91 provider), email fallback, resend cooldown; uses already-installed `react-native-otp-entry` | **G1** |
| 1.3 | Password reset flow (web + mobile) | G10 |
| 1.4 | Auth rate limiting config + OTP abuse guards | M1 |
| 1.5 | Strip dead deps (victory-native, skia, Inter, jspdf-autotable, mobile RHF after verify); record AAB + cold-start baseline on physical low-end device | G12/P0-1/P0-2 |
| 1.6 | Sentry on web + Expo; replace silent `catch {}` with logged + user-visible retry states | G5/M5 |
| 1.7 | CHECK constraints: `inventory_movements.quantity > 0`, `financial_transactions.amount > 0` | DB5/DB6 |

## Sprint 2 — "Launchable funnel" (Days 11–20)

| # | Task | Source |
|---|---|---|
| 2.1 | Web free `/dashboard` home (KPIs, weather, alerts — mirror mobile); login redirect there | **G7** |
| 2.2 | `loading.tsx` + `error.tsx` across web route groups; mobile `Skeleton` component on dashboard/lists | G11/D1 |
| 2.3 | Sidebar grouped (Operate/Money/Insights/Setup); mobile More-tab grouped | G15 |
| 2.4 | Role-aware tabs + permission empty-states for workers | G13 |
| 2.5 | **`fetch-market-prices` Edge Fn + daily cron** (NECC rates; manual-curation fallback path) + staleness indicator in MarketPriceStrip | **G9** |
| 2.6 | EAS production config, Play internal track, Vercel prod, push all Edge secrets, cron dead-man monitoring | 01 §4 / G25 |

## Sprint 3 — "Launch + harden" (Days 21–30)

1. Onboard 5 beta farms (2 contract) per [phase-5 checklist §3](tasks/phase-5-launch-readiness.md) — external lead-time items (WABA, Razorpay KYC, MSG91, plan IDs) should have been started Day 1 in parallel.
2. Smoke-test matrix §4 of the checklist, plus new: unsigned-webhook 401, OTP login, partial payment ledger math.
3. E2E: 3 Maestro flows minimum (OTP login → daily log offline → sync; buyer → QR → mark paid; batch close → settlement).
4. Web pagination on transactions/daily-log/health/batches | G16.
5. A11y pass #1 (aria on icon buttons, KPI non-color cues) | G20.

## Quarter plan (Days 31–90) — value depth

Ordered backlog (details in [11-product-roadmap.md](11-product-roadmap.md)):
1. Vernacular GA (hi/ta/te audited + first-run prompt) — biggest adoption lever already half-built.
2. Vet collaboration flow (paid-tier activation).
3. Branded PDF reports + WhatsApp share (bank/integrator artifact).
4. Tariff-card verification UX + feed `feed_item_id` migration + mobile profit calculator.
5. Dashboard summary RPC + focus-cache; multi-farm RPC consolidation; cron chunking (perf P1 set).
6. Responsive web; notifications deep-linking; product analytics instrumentation.

## Dependency notes

- 0.1→0.2 gate everything (no CI = no safe velocity).
- 1.1 (amount_paid) must land **before** beta farms enter real transactions — schema backfills get harder with live data.
- 2.5 market prices and 1.2 OTP are the two items with **external dependencies** (NECC source choice; MSG91 KYC + Supabase SMS provider config) — start vendor setup Day 1.
- WhatsApp template additions (vernacular, new categories) have Meta review lead times — batch submissions ahead of each sprint.

## Success metrics to instrument from Day 1

| Metric | Target |
|---|---|
| Onboarding completion (install → farm created) | > 60% |
| First daily log within 24h of onboarding | > 70% |
| D7 active (≥3 logs/week) | > 40% |
| Freemium gate encounters → upgrade view | track ratio |
| WhatsApp delivery success | > 95% (checklist) |
| Crash-free sessions (Sentry) | > 99.5% |
| Cold start on Redmi 9A | < 3s (measure in 1.5) |

## Document index

| Doc | Contents |
|---|---|
| [01-project-structure.md](01-project-structure.md) | Architecture, infra gaps, dead weight |
| [02-feature-inventory.md](02-feature-inventory.md) | Per-feature status with evidence |
| [03-user-flows.md](03-user-flows.md) | Journey friction, dead ends |
| [04-ui-ux-scorecard.md](04-ui-ux-scorecard.md) | Screen-by-screen 1–10 scores |
| [05-design-system-audit.md](05-design-system-audit.md) | Tokens, typography break, component gaps |
| [06-performance-audit.md](06-performance-audit.md) | P0/P1/P2 perf roadmap |
| [07-security-audit.md](07-security-audit.md) | H1/H2 + medium/low findings |
| [08-database-audit.md](08-database-audit.md) | Schema integrity, migration queue |
| [09-competitor-analysis.md](09-competitor-analysis.md) | Landscape, wedge, revenue options |
| [10-gap-analysis.md](10-gap-analysis.md) | 30-row priority matrix |
| [11-product-roadmap.md](11-product-roadmap.md) | 1wk → 12mo horizons |
