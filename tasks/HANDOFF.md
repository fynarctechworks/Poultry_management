# PoultryOS — Session Handoff (2026-06-15)

Use this to continue in a fresh chat. Companion docs: [product-strategy.md](product-strategy.md), [phase-1-execution-plan.md](phase-1-execution-plan.md).

## Where we are
- **Phase 1 (Correctness & Trust): COMPLETE** — all 4 P0s applied to the remote Supabase project `jusxngbfdmzhlybohell` and verified.
- **Phase 2 (Daily Operations Speed): COMPLETE.** Tail finished this session: mobile partial-harvest modal + multi-collection egg entry (mobile + web). Earlier: date chips, type-aware form, broken eggs, single-batch auto-select, farm-map, broiler partial-harvest (DB + web).
- **Phase 3 (Operational Intelligence): COMPLETE.** breed-standard benchmark foundation (`@poultryos/shared`); Smart Insights (mobile dashboard + web `/batches`); feed intelligence days-of-stock + reorder (mobile + web inventory); **layer HDEP curve** (mobile batch detail SVG + web recharts) + **broiler sell-timing calculator** (mobile + web batch detail). All engines pure + shared; 164 mobile tests green; mobile + frontend tsc clean.
- **Next: Phase 4 — Premium Differentiators** (product-strategy.md Part 7): contract settlement reconciliation, price intelligence (NECC + live-bird), owner trust/transparency report, WhatsApp digest enrichment. Specs for the first two flagship features are in [phase-1-execution-plan.md](phase-1-execution-plan.md) Part B.

## Done this session (2026-06-15, session 2) — all typecheck-clean, 145 mobile tests green
### Phase 2 TAIL
- **Mobile partial-harvest modal**: `mobile-app/components/ui/HarvestBatchModal.tsx` (mirrors TransferBatchModal; calls `record_harvest` RPC), exported from `components/ui/index.ts`, wired into `mobile-app/app/batches/[id].tsx` ("Record harvest / sale" button on active batches; loads buyers for the Khata picker; `onSuccess` → snackbar + reload).
- **Multi-collection egg entry**: layer branch of both daily-log forms now has Morning/Afternoon/Evening inputs that auto-sum into `eggs_collected` (one row/day, no schema change). Mobile: `components/ui/DailyLogForm.tsx`. Web: `frontend/app/(dashboard)/daily-log/new/DailyLogForm.tsx`.
- i18n: added `harvest.*`, `daily_log.egg_slots.*`, `batch_detail.record_harvest` to all 4 locales; JSON validated + key parity confirmed.
- Drive-by fix: typed the `get_traceability_by_token` RPC result in `frontend/app/traceability/[token]/page.tsx` (was 13 `{}`-property tsc errors left by the P0.1 work; runtime was fine).

### Phase 3 foundation
- **Breed benchmarks promoted to shared**: `packages/shared/src/breed-benchmarks.ts` (moved from `mobile-app/lib`, which is now a thin re-export). **Decision: kept as code, NOT a DB table** — static reference data, non-trivial fuzzy-match logic, consumed by both apps from one source, client-side compute keeps the <60s path untouched. Seed a DB table only when owners can edit benchmarks or a server-side digest needs them (Phase 4). Added layer `peakHdepPct` + `feedPerBirdPerDayG` fields.
- **Smart Insights engine**: `packages/shared/src/insights.ts` — pure `computeInsights(batches)` comparing each batch's last 7 days vs prior 7 days (and vs breed standard), emitting FCR drift / mortality change / feed anomaly (intake↑ weight-flat) / layer HDEP drop, each with a signed ₹ impact where feed cost is known. Emits **i18n keys + params** (not composed strings) so each app localizes. Anti-noise floors prevent crying wolf.
- **Mobile UI**: `mobile-app/components/ui/InsightsCard.tsx`, wired into `app/(tabs)/dashboard.tsx` (one daily_logs query now feeds both cumulative FCR and insights; tapping an insight → batch detail). i18n `insights.*` in all 4 locales.
- **Web UI**: `frontend/components/InsightsPanel.tsx` on `/batches`, computed server-side over active batches in farm scope, rendered via shared `formatInsight()` (English).
- **Feed intelligence**: `packages/shared/src/feed-intelligence.ts` + mobile `InventoryItemCard`/`app/inventory/index.tsx` + web `/inventory` page. i18n `inventory.days_left_*` / `inventory.reorder`.
- Tests: `tests/components/insights.test.ts` (8 cases) + `tests/components/feed-intelligence.test.ts` (new). **155 mobile tests green; mobile + frontend tsc clean.**

## Migrations applied this session (all via Supabase MCP `apply_migration`, verified on prod)
1. `20260615000001_traceability_token_scoped_access` — dropped enumerable anon policy; added `get_traceability_by_token()` RPC.
2. `20260615000002_partial_payment_ledger` — `financial_transactions.amount_paid`; rewired `update_buyer_balance` + `check_payment_overdue` to outstanding = amount − amount_paid (status='paid'→0; NULL→legacy 50%/0 fallback).
3. `20260615000003_daily_log_trigger_accuracy` — `deduct_feed_inventory` prefers in-stock item; `farms.mortality_alert_threshold_pct` + `check_mortality_spike` reads it.
4. `20260615000004_daily_log_broken_eggs` — `daily_logs.broken_eggs`.
5. `20260615000005_partial_harvest` — `batch_harvests` table + `record_harvest()` RPC (decrements `current_bird_count`, books an income `financial_transactions` row so P&L picks it up).

## Phase 2 TAIL — precise specs

### A) Mobile partial-harvest modal (parity with web)
- DB is done: call `supabase.rpc('record_harvest', { p_batch_id, p_birds, p_avg_weight_kg, p_price_per_kg, p_date, p_buyer_id, p_payment_status, p_notes })`.
- Build `mobile-app/components/ui/HarvestBatchModal.tsx` mirroring the existing `TransferBatchModal.tsx` pattern; export from `components/ui/index.ts`.
- Wire into `mobile-app/app/batches/[id].tsx`: add a "Record harvest" button (active batches only, next to Transfer), `harvestModalOpen` state, and `onSuccess` → snackbar + `load()`. Mobile P&L already sums `financial_transactions`, so revenue flows in automatically.
- Reference web impl: `frontend/app/(dashboard)/batches/[id]/HarvestForm.tsx`.
- i18n: add keys to all 4 locales (`en/hi/ta/te`) under a `harvest.*` group + buttons. Validate JSON after.

### B) Multi-collection egg entry (layer)
- Goal: let layer farmers enter 2–3 collections/day that sum into `daily_logs.eggs_collected` (one row/day; `UNIQUE(batch_id, log_date)` stays). No schema change needed.
- In the layer branch of the daily-log forms (mobile `components/ui/DailyLogForm.tsx`, web `frontend/app/(dashboard)/daily-log/new/DailyLogForm.tsx`), replace the single "Eggs collected" input with up to 3 optional collection inputs (Morning/Afternoon/Evening) that auto-sum into the stored `eggs_collected`. Keep `broken_eggs` as-is.
- i18n keys for the 3 slot labels in all 4 locales.

## Phase 3 — Operational Intelligence (the next process)
Per the roadmap (product-strategy.md Part 7, Phase 3):
1. ✅ **Breed-standard benchmark tables** — DONE. Promoted to `@poultryos/shared` as code (decision: not a DB table — see "Done this session").
2. ✅ **Smart Insights feed** — DONE on **both platforms**. Mobile: `InsightsCard` on dashboard (i18next `insights.*`). Web: `frontend/components/InsightsPanel.tsx` on the **batches list page** (`/batches`), computed server-side over active batches in farm scope. Web has no i18n layer, so it renders English via the shared `formatInsight(insight)` helper — **the canonical English copy lives in `INSIGHT_EN` inside `packages/shared/src/insights.ts`; keep it in sync with the mobile `insights.*` locale entries** (one known dup point).
3. ✅ **Feed intelligence** — DONE (days-of-stock-left + reorder urgency). Engine: `packages/shared/src/feed-intelligence.ts` (`dailyBurnByFeedType`, `inferFeedType`, `feedStockStatus`; critical ≤3d, warning ≤7d or below low-stock threshold). Mobile: `InventoryItemCard` shows "~Nd left" + a tone-coloured Reorder pill; `app/inventory/index.tsx` fetches 7-day feed burn. Web: `/inventory` adds a "Days left" column + Reorder/Reorder-now/OK status (burn scoped per farm). i18n `inventory.days_left_*` + `inventory.reorder` in 4 locales. The feed-anomaly (intake↑/weight-flat) signal already comes from the insights engine. Live FCR already on batch detail.
4. ✅ **Layer HDEP curve + production-drop alert** — DONE. Engine `packages/shared/src/hdep.ts` (`computeHdepSeries`, `currentHdep`). Mobile: `HdepCurveCard` (react-native-svg line) on layer batch detail. Web: `HdepCurve` (recharts) on batch detail. Production-drop alert already flows from the insights engine. Compares vs breed `peakHdepPct`.
5. ✅ **Sell-timing calculator (broiler)** — DONE. Engine `packages/shared/src/sell-timing.ts` (`computeSellTiming` + `deriveSellTimingInput` — marginal feed cost vs marginal weight × latest broiler market price). Mobile: `SellTimingCard` on active broiler batch detail. Web: `SellTimingCard` on batch detail. Both derive ADG / feed-per-bird / feed cost from logs via the shared helper; price = latest `market_prices` for the farm state, falling back to `farms.market_price_override_broiler`.

### Shared engines added (Phase 3) — all pure, in `packages/shared/src/`
`breed-benchmarks.ts` · `insights.ts` (+`formatInsight`) · `feed-intelligence.ts` · `hdep.ts` · `sell-timing.ts`. Tests in `tests/components/{insights,feed-intelligence,hdep-sell-timing}.test.ts`. Mobile UI cards live in `mobile-app/components/ui/`; web surfaces in `frontend/` pages/components.

### Where the new shared logic lives (for the next session)
- `packages/shared/src/breed-benchmarks.ts` — `BREED_BENCHMARKS`, `findBenchmark`, tone helpers.
- `packages/shared/src/insights.ts` — `computeInsights(InsightBatchInput[]) → Insight[]`, `splitWeekWindows`. Insights carry `titleKey`/`detailKey`/`detailParams`/`suffixKey` for i18n. To add a rule, extend `buildInsights`, add `insights.*` keys to all 4 mobile locales, and a test case.

## Conventions & gotchas (IMPORTANT — read before editing)
- **DB changes: apply via Supabase MCP `apply_migration` ONLY. Never `supabase db push`.** Disk migration filenames diverge from the DB's real migration timestamps. Also write the same SQL to a `supabase/migrations/<ts>_<name>.sql` file for version control.
- **Verify each migration on prod** with `execute_sql` (the project is the remote `jusxngbfdmzhlybohell`). MCP runs as admin, so to test RLS-as-anon check `pg_policy` + use the role-aware patterns already in the migrations.
- **SECURITY DEFINER + anon-executable** advisor notices (lints 0028/0029) on `get_traceability_by_token` are INTENTIONAL — ignore.
- **i18n is mandatory across 4 locales** (`mobile-app/locales/{en,hi,ta,te}/common.json`). After edits, validate each parses (`node -e "JSON.parse(...)"`); PATH needs `/c/Program Files/nodejs` + Git usr/bin prepended in the Bash tool.
- **Design tokens only** — import `colors/spacing/typography/radius` from `theme/tokens` (mobile) or `lib/theme/tokens` (web). No hardcoded hex.
- **Daily-log <60s rule** — never add blocking steps or required fields to the hot path; warnings are post-save and non-blocking.
- **Partial-payment semantics** (decided this session): backfill kept existing partials at amount×0.5; `payment_status` is the source of truth for "fully paid"; `amount_paid` only refines partial/pending.
- Nothing has been committed to git — the working tree holds all changes. Recommend a build/run + commit checkpoint.

---

## ▶ PROMPT TO PASTE IN THE NEW CHAT (Phase 4 → launch)

> Continue the PoultryOS build. Read `tasks/HANDOFF.md`, `tasks/product-strategy.md`, and `tasks/phase-1-execution-plan.md` first for full context. **Phases 1–3 are COMPLETE** (correctness/trust, daily-ops speed, operational intelligence — five pure engines now live in `@poultryos/shared`: breed-benchmarks, insights, feed-intelligence, hdep, sell-timing; 164 mobile tests green; mobile + frontend tsc clean). Nothing is committed to git yet.
>
> **0. Commit checkpoint first.** Branch off `main` and commit the existing working tree in coherent commits (Phase 2 tail, Phase 3 engines+UI). Do NOT push unless I ask. Then continue.
>
> **Build Phase 4 — Premium Differentiators** (product-strategy.md Part 7 + flagship specs in phase-1-execution-plan.md Part B), one coherent unit at a time, verifying each before moving on. Order by value:
>
> 1. **Contract settlement reconciliation** (SPEC 1, phase-1-execution-plan.md). `contract_cycles` + `calculate-contract-settlement` + seeded tariff cards already exist. Add: capture the integrator-stated figures (mortality %, FCR, avg weight, birds lifted, settlement amount, received date, dispute notes); a line-by-line **expected (your data) vs integrator-stated** comparison with the ₹ impact of each gap; force the grower to confirm/edit actual tariff terms before first use; a WhatsApp-shareable dispute summary (reuse the existing share pipeline). Put the reconciliation math in a pure `@poultryos/shared` module with tests; surface on mobile + web contract screens.
> 2. **Price intelligence** — NECC zonal egg rates + regional live-bird prices (replace the generic broiler/egg price), and feed the broiler sell-timing calculator the real live-bird price. Likely a new fetch Edge Function/cron + a price source field; verify quota/scraper resilience with a graceful "price unavailable" fallback.
> 3. **Owner trust/transparency report** (SPEC 2) — feed/growth/mortality + bird-count reconciliation with lightweight physical spot-counts; weekly "Farm Integrity" summary via the existing WhatsApp/push pipeline; owner-only, non-accusatory framing. Reconciliation math in `@poultryos/shared` with tests.
> 4. **WhatsApp digest enrichment** — fold the Phase-3 insights + price + receivables into the 8 PM `send-daily-digest`. Note the insight English copy source-of-truth is `INSIGHT_EN` in `packages/shared/src/insights.ts`; Deno Edge Functions can't import the shared TS, so mirror the small copy/format there or expose it another way.
>
> **Then pre-launch hardening** (see MEMORY.md): DROP `dev_confirm_email()` + unset `DEV_EMAIL_VERIFY`; confirm Control Center operator MFA enrollment; re-run Supabase advisors; final low-end Android pass.
>
> **Follow all conventions in HANDOFF.md** — apply DB changes via Supabase MCP `apply_migration` ONLY (never `db push`) and write a matching `supabase/migrations/<ts>_<name>.sql` file; verify each migration on the remote project `jusxngbfdmzhlybohell`; keep the daily-log path <60s; key all UI to design tokens; i18n mandatory across en/hi/ta/te (validate JSON + key parity after edits); put reusable logic in `@poultryos/shared` with tests in `tests/components/`; typecheck both apps and run `jest` before declaring a unit done.
