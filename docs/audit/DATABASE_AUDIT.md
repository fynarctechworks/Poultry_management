# PoultryOS — Database Audit

**Date:** 2026-06-18 · live Supabase `jusxngbfdmzhlybohell` (Postgres 15). Apply changes **via MCP
only** — disk migration versions diverge from real DB timestamps; never `supabase db push`.

## Schema posture
- 66 public tables; **RLS enabled on all** (`relrowsecurity=true`). Denormalised `tenant_id`/`farm_id`
  for JOIN-free policies. Generated columns for derived money/dates (e.g. `total_sale_revenue`,
  `withdrawal_clearance_date`). UNIQUE guards prevent dup daily logs `(batch_id, log_date)` and
  one-traceability-per-batch.
- Hot-path FKs (`daily_logs.batch_id`, `financial_transactions.buyer_id`, etc.) are **all indexed** —
  no unindexed single-column FK on the high-write tables.

## Findings (proposed fixes)

### D-BIND (P1/P2) — trigger binding narrower than the function
Several trigger functions correctly branch on INSERT/UPDATE/DELETE, but the **CREATE TRIGGER** only
bound `AFTER INSERT`, leaving UPDATE/DELETE logic as dead code:
- **M7 ⭐** `update_buyer_balance` — INSERT-only → Mark-paid never recomputes `buyers.current_balance`
  (wrong receivables, UPI amounts, dunning of paid buyers). **Top correctness fix.**
- M6 `apply_inventory_movement` — INSERT-only → deleting a daily log doesn't restore feed stock.
- M3 `check_daily_log_bird_count` — INSERT-only → edits bypass the mortality-vs-birds guard.
Proposed: add the matching `BEFORE/AFTER UPDATE [OR DELETE]` bindings (functions unchanged → low risk).

### D-CALC (P1) — receivables math inconsistency
`get_multi_farm_summary` sums **full `amount`** for `partial` income; canonical `update_buyer_balance`
nets `amount_paid`. Consolidated dashboard overstates receivables vs Khata. Proposed: mirror the
buyer-balance formula in the receivables CTE (M15 D1).

### D-AUTHZ (P1/P2) — SECURITY DEFINER function exposure
See [SECURITY_AUDIT.md](SECURITY_AUDIT.md) S1–S4. Operator read/compute functions are
`authenticated`-executable + ungated. Proposed gate/REVOKE.

### D-CAPS (P1) — no DB-level freemium quantity caps
farm(1)/shed(3)/worker(2)/buyer(10) + vet=paid enforced only in UI. Proposed BEFORE INSERT cap
triggers + `farm_users` worker/vet gate (M2 report SQL + M17 extension).

### D-LOCK (P2) — traceability cert on already-closed batch
`create_traceability_record` inserts `is_locked=false`; if the batch is already `closed` the lock
trigger won't refire. Proposed `is_locked = (status='closed')` at insert (M10 T3).

### D-MISC
- `certificate_pdf_url` column is dead (no generator) — drop it (M10 T4).
- `weather_alerts` member-ack UPDATE is column-wide — replace with `acknowledge_weather_alert` RPC (M12 W2).
- `health_incidents` table-wide UPDATE for vets — narrow to `update_vet_note` (M4).

## Functions / RPC inventory (verified correct)
`close_batch`, `record_harvest`, `transfer_batch`, `generate_batch_code`,
`calculate_contract_settlement` (+`lock_contract_cycle_on_close`), `create_traceability_record`
(+`lock_traceability_on_close`), `upsert_market_price`, `update_vet_note`, `get_multi_farm_summary`,
`set_subscription_status`, `is_paid`/`is_tenant_paid`, `next_invoice_number`. Math + authz reviewed
per module; only the items above need change.

## Advisors
Dominated by informational `*_security_definer_function_executable` lints (by-design for guarded RPCs)
— but that same surface is where S1/S2 hid; treat the lint as a **gate**, not noise. Actionable:
`auth_leaked_password_protection` (enable); `extension_in_public` (pg_net, low risk).

## Operating rules (keep)
Apply via Supabase MCP only · service-role writes for cron/webhooks · never grant owners FOR ALL on
billing tables (column-restrict) · deny-by-default EXECUTE for operator/platform functions.
