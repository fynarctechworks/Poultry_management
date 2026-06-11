# 06 — Performance Audit

_Audit date: 2026-06-11. Method: static analysis of dependencies, query patterns, render structure, and cron design. No runtime profiling was possible in this environment — bundle/startup numbers below are flagged for on-device measurement (CLAUDE.md mandates weekly Redmi 9A testing; none is recorded in tasks/)._

## Performance targets vs current state

| CLAUDE.md target | Assessment |
|---|---|
| Cold start < 3s on 2GB Android | **At risk** — see P0-1, P0-2 |
| Daily log save < 1s online / instant offline | ✅ likely met (single insert; queue write is local) |
| Dashboard KPI < 2s on 4G | ⚠️ 8 queries; acceptable but improvable (P1-3) |
| UPI QR instant | ✅ client-side ([lib/upi.ts](PoultryOS/lib/upi.ts)) |
| Weather quota < 1,000 calls/day | ✅ modeled in code ([fetch-weather-data/index.ts:15-16](supabase/functions/fetch-weather-data/index.ts#L15)) with farm-count guard at :337 |
| Daily digest < 30 min @ 1,000 farms | ⚠️ sequential loop, self-documented risk ([send-daily-digest/index.ts:22-23](supabase/functions/send-daily-digest/index.ts#L22)) |
| Bundle < 50 MB | **At risk** — dead native deps (P0-1) |

---

## P0 — fix before launch

### P0-1 · Dead heavyweight native dependencies in the mobile bundle
`victory-native@36` + `@shopify/react-native-skia@2.2.12` are declared ([package.json:17,50](PoultryOS/package.json#L17)) but have **zero imports** anywhere in `app/` or `components/` (all charts are hand-rolled `react-native-svg` — [market-prices/index.tsx:16](PoultryOS/app/market-prices/index.tsx#L16)). Skia ships large native binaries into every AAB and inflates cold-start initialization. Removing both is a free multi-MB bundle cut on the exact ₹6k-phone target.
**Also**: `react-hook-form` + `@hookform/resolvers` appear unused on mobile (forms are controlled components) — verify and drop.

### P0-2 · Five Inter font weights downloaded at startup, never rendered
[app/_layout.tsx:38-44](PoultryOS/app/_layout.tsx#L38-L44) loads 5 weights via `useFonts`; no style applies them ([05-design-system-audit.md §2](05-design-system-audit.md)). This blocks/делays first paint for zero visual effect. Delete the loader + `@expo-google-fonts/inter`, or wire fonts properly.

### P0-3 · Web ships zero streaming/loading states
No `loading.tsx` in any of 24 dashboard route folders → every navigation blocks on full server fetch with a frozen UI (multi-second perceived latency on 4G). Add `loading.tsx` skeletons; consider `<Suspense>` boundaries around the heavy panels in [multi-farm/page.tsx](web/app/(dashboard)/multi-farm/page.tsx) (its per-farm loop is the slowest page — see P1-1).

---

## P1 — fix in the first 30 days

### P1-1 · Multi-farm page: sequential per-farm query fan-out
[multi-farm/page.tsx](web/app/(dashboard)/multi-farm/page.tsx) loops farms and issues per-farm queries (`.limit(50)` inside the loop at :61) in addition to the `multi_farm_summary` RPC. For an owner with N farms this is N+1 round-trips server-side. Fold the remaining per-farm reads into the RPC ([20260520000005](supabase/migrations/20260520000005_multi_farm_summary_rpc.sql)).

### P1-2 · Unbounded-growth list pages with hard caps, no pagination
All web list pages cap (100–200 rows) without `range()` pagination or cursor: [transactions:14](web/app/(dashboard)/transactions/page.tsx#L14), [daily-log:12](web/app/(dashboard)/daily-log/page.tsx#L12), [health:12](web/app/(dashboard)/health/page.tsx#L12), [batches:21](web/app/(dashboard)/batches/page.tsx#L21). Payload + render cost grows to the cap on every visit, then data silently truncates. Add server-side pagination (the perf-index migration already covers the needed `(farm_id, date)` indexes).

### P1-3 · Mobile dashboard issues 8 queries per focus
[dashboard.tsx:95-184](PoultryOS/app/(tabs)/dashboard.tsx#L95-L184): 7 parallel + 1 dependent (FCR logs) — re-run on **every** tab focus via `useFocusEffect`. On 4G this is ~8 sequential TLS round-trips worth of latency at worst. Options: (a) one `dashboard_summary` RPC (matches the existing multi_farm pattern), (b) stale-while-revalidate cache in the farm store so focus re-entry paints instantly. Also: the FCR follow-up query fetches **all** daily_logs for active batches unbounded (`.in('batch_id', …)` with no date filter at :168-171) — a 42-day broiler cycle is fine, but layer batches run 70+ weeks → growing payload. Bound it or compute FCR in SQL.

### P1-4 · Mobile lists: 7 screens use FlatList, but several render via `.map()` inside ScrollView
24 files use `.map((` rendering; for ledger/transaction histories this skips virtualization. Audit the two highest-cardinality screens — buyer ledger ([buyers/[id].tsx](PoultryOS/app/buyers/[id].tsx)) and transactions ([transactions/index.tsx](PoultryOS/app/transactions/index.tsx)) — and convert to FlatList/SectionList.

### P1-5 · Edge cron fan-out is sequential by design
- [fetch-weather-data:342-348](supabase/functions/fetch-weather-data/index.ts#L342): sequential per-farm OWM calls — fine to ~166 farms (free-tier math is in-code), but wall-clock time grows linearly; Edge Functions have execution limits. Chunked `Promise.allSettled` (size 5–10) keeps quota safety with 5–10× faster runs.
- [send-daily-digest:173](supabase/functions/send-daily-digest/index.ts#L173): same pattern; the file itself recommends chunking at >1,000 farms. Implement the chunking now (it also reduces the 8 PM IST burst latency, which the launch checklist monitors).

---

## P2 — scale-phase items

| # | Item | Evidence |
|---|---|---|
| P2-1 | `whatsapp_messages_log` freemium count query does an exact `count` per send for free farms — fine now; at scale switch to a monthly counter column or partial index on `(farm_id, created_at) WHERE status != 'failed'` | [send-whatsapp-message:264-269](supabase/functions/send-whatsapp-message/index.ts#L264) |
| P2-2 | `update_buyer_balance()` recomputes via full SUM over a buyer's transactions on every insert/update/delete — correct-by-construction, O(n) per write; acceptable until buyers have thousands of transactions | initial_schema.sql:707-745 |
| P2-3 | `traceability/[token]` page is `force-dynamic` — public certificate pages are perfect ISR/cache candidates (token-addressed, immutable once locked) | [page.tsx:6](web/app/traceability/[token]/page.tsx#L6) |
| P2-4 | No HTTP caching / `revalidate` strategy anywhere on web; every dashboard view refetches | grep `revalidate` → 0 |
| P2-5 | `weather_data.forecast_json` stores 72h of forecast per farm, refetched hourly Apr–Sep — JSONB churn + dead tuples; consider trimming payload to what the UI reads | [fetch-weather-data:116](supabase/functions/fetch-weather-data/index.ts#L116) |
| P2-6 | Hermes/`newArchEnabled: true` is set ([app.json:10](PoultryOS/app.json#L10)) — good; but no bundle-size CI guard exists to keep the <50 MB target honest | — |

## Database-side performance (cross-ref 08-database-audit)

Already strong: composite indexes on every hot path (initial_schema.sql:442-468), 11 FK covering indexes + `(SELECT auth.uid())` initplan rewrites applied ([20260522000005](supabase/migrations/20260522000005_perf_fk_indexes_and_rls_initplan.sql)), partial indexes for pending vaccinations and overdue payments. No further index work needed at current scale.

## Memory-leak / re-render review

- Subscriptions cleaned up correctly (auth listener unsubscribe at [_layout.tsx:76-79](PoultryOS/app/_layout.tsx#L76)); `cancelled` flags on async farm hydration — no obvious leaks.
- Zustand selectors used granularly (`useAuthStore((s) => s.user)`) — avoids store-wide re-renders. ✅
- `useFocusEffect(useCallback(...))` dependency on `load` (which depends on `currentFarm`/`user`) is correct.
- Risk: none observed beyond the refetch-on-focus cost (P1-3).

## Optimization roadmap

1. **Week 1 (P0)**: remove dead deps → rebuild → measure AAB + cold start on Redmi 9A; delete font loading; add web `loading.tsx` set. _Expected: −several MB bundle, −300–800ms cold start, perceived web nav 2× faster._
2. **Days 8–30 (P1)**: dashboard_summary RPC + focus cache; pagination on 4 web lists; fold multi-farm loop into RPC; chunk the two cron fan-outs; FlatList conversion ×2.
3. **Quarter (P2)**: ISR for traceability, monthly WhatsApp counters, bundle-size CI budget, forecast JSON trim.
