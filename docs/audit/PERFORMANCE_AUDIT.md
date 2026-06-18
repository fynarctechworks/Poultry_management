# PoultryOS — Performance Audit

**Date:** 2026-06-18 · target device: ₹6–12k Android, 2 GB RAM, 4G.

## Verified-good
- **Hot-path indexing:** no unindexed single-column FK on the high-write tables (`daily_logs`,
  `financial_transactions`, `health_incidents`, `vaccinations`, `batches`, `inventory_movements`,
  `batch_harvests`, `payment_reminders`, `contract_cycles`, `weather_alerts`). RLS uses JOIN-free
  SECURITY DEFINER predicates over denormalised `tenant_id`/`farm_id` — no policy-time JOIN fan-out.
- **Server-side aggregation:** dashboards are single-round-trip RPCs (`get_multi_farm_summary`,
  `compute_*`) rather than N client queries — good for 4G latency.
- **Daily log = single insert**; triggers cascade derived updates async. Matches the <1s save target.
- **Client-side UPI QR** (BHIM URI) — zero network, instant.
- **Weather cron** every 4h keeps OpenWeatherMap within the 1k/day free quota up to ~160 farms (the
  Edge function logs a warning past that).

## Findings / watch-items

### PERF-1 (P1, fixed) — unbounded export → was also a correctness bug
Report CSV export issued a single un-paginated query (silently capped at PostgREST 1000 rows). Fixed
with a `.range()` `fetchAll` loop (M14 R3). For very large farms this can pull many thousands of rows
into a 2 GB device — acceptable for an explicit "export" action, but consider server-side streaming if
exports grow.

### PERF-2 (P2) — `compute_platform_dashboard` is heavy
~13 CTEs scanning tenants/payments/subscriptions/tickets/errors/auth events on each call. Fine at
current scale; as tenant count grows, back it with `revenue_snapshots`-style materialisation or a
short-TTL cache rather than recomputing per page load.

### PERF-3 (P2) — multi-farm sparkline N+1-ish read
`/multi-farm` pulls 7-day `daily_logs` for all farms then buckets client-side — fine for a handful of
farms; for operators/large owners, push the bucketing into the RPC.

### PERF-4 (P3) — farm-integrity reads all-time deaths per active batch
`buildFarmIntegrityReport` path reads all-time `daily_logs` deaths for reconciliation. Bounded by
active-batch count; fine today, watch if batches accumulate long histories.

## Targets vs posture
| Target | Posture |
|--------|---------|
| Daily log save <1s online | ✅ single insert |
| Dashboard KPI <2s on 4G | ✅ single-RPC aggregation |
| UPI QR instant | ✅ client-side |
| Weather quota <1k/day | ✅ 4h cron, ≤160 farms (warns past) |
| App bundle <50 MB | not measured here — verify in EAS build |
| PDF gen <10s | client jsPDF (traceability) — fine; no server PDF path |

## Recommendations
1. Add a short-TTL cache / snapshot for `compute_*` dashboards before scaling tenant count.
2. Keep the hot-path FK-index invariant as a CI check (the sweep query in DATABASE_AUDIT).
3. Measure mobile bundle size + cold start on a real Redmi-class device (CLAUDE.md mandate) — not
   covered by this DB/code audit.
