# 08 — Database Audit

_Audit date: 2026-06-11. Source: 25 migrations in [supabase/migrations/](supabase/migrations/). Schema: 21 tables, 12 trigger/business functions, ~10 RPCs, 6 pg_cron jobs._

## 1. Schema design — verdict: very good

**Strengths (verified):**
- Consistent conventions: UUID PKs (`gen_random_uuid()`), `created_at`/`updated_at` on every table with a single shared `tg_set_updated_at()` trigger applied via DO-loop ([initial_schema.sql:474-492](supabase/migrations/20260502000000_initial_schema.sql#L474)).
- CHECK constraints encode every enum from the spec (statuses, categories, causes) and value sanity (`capacity > 0`, `birds_dead >= 0`, VPA regex on `farms.upi_id` :72-73, E.164-ish regex on `buyers.phone` :163-164).
- Smart generated columns where legal (`total_sale_revenue`, `withdrawal_clearance_date` using IMMUTABLE `date + integer` — the team even documented the immutability lesson at [tasks/lessons.md L1](tasks/lessons.md)).
- Denormalized `farm_id` on child tables for JOIN-free RLS — matches architecture decision #2 and pays off in every policy.
- Correct uniqueness: `UNIQUE(batch_id, log_date)` (offline-sync dedup), `UNIQUE(farm_id, shed_name)`, `UNIQUE(state, price_date)`, `UNIQUE(transaction_id, reminder_stage)` (reminder dedup), `weather_data` UNIQUE(farm_id) added in [20260519000002:40-45](supabase/migrations/20260519000002_schedule_weather_cron.sql#L40).
- Cascade semantics deliberate: farm CASCADE chains; `integrators` RESTRICT on contract_cycles; SET NULL for `logged_by`/`buyer_id`; cascade-safety pass in [20260522000002_cascade_safe_deletes.sql](supabase/migrations/20260522000002_cascade_safe_deletes.sql).

## 2. Indexing — verdict: complete for current scale

24 purposeful indexes in the initial schema (composite `(farm_id, date DESC)` on all hot read paths, partial indexes for `vaccinations WHERE status='scheduled'` and overdue payments), plus a dedicated advisor-driven pass adding 11 FK covering indexes and `(SELECT auth.uid())` initplan rewrites ([20260522000005](supabase/migrations/20260522000005_perf_fk_indexes_and_rls_initplan.sql)). No missing-index findings at this scale.

## 3. Data-integrity findings

| # | Severity | Finding | Evidence |
|---|---|---|---|
| DB1 | 🔴 | **Partial payments are hardcoded as 50% of amount.** `update_buyer_balance()` counts `payment_status='partial'` as `amount * 0.5` — there is no `amount_paid` column anywhere, so the Khata's headline number (`current_balance`) is wrong for any real partial payment. For a product whose pitch is "trustworthy ledger", this is a correctness bug, not a style issue. **Fix**: add `amount_paid NUMERIC` to `financial_transactions`, compute `amount - amount_paid` for partial, backfill 0.5 for legacy rows. | [initial_schema.sql:726](supabase/migrations/20260502000000_initial_schema.sql#L726) |
| DB2 | 🟠 | **`generate_batch_code()` has a COUNT(*)+1 race.** Two simultaneous batch inserts for the same farm+date compute the same sequence → second insert violates `batch_code UNIQUE` and fails with a raw constraint error. Low likelihood (single owner), but the failure mode is user-facing. Fix: per-farm sequence or retry-on-conflict; or append a 4-char random suffix. | initial_schema.sql:655-684 |
| DB3 | 🟠 | **Feed auto-deduct matches inventory by name prefix** (`item_name LIKE feed_type || '%'`) — silently no-ops when names don't align, and picks the *oldest* match when several do. Stock drifts from reality with no signal to the user. Fix: explicit `feed_item_id` on daily_logs or a feed_type column on inventory_items. | initial_schema.sql:620-626 |
| DB4 | 🟠 | **`update_batch_bird_count()` never re-adds birds** on daily_log UPDATE/DELETE in the initial trigger; the edit-sync migration ([20260522000000](supabase/migrations/20260522000000_daily_log_edit_bird_count_sync.sql)) addresses edits — verify it covers DELETE too (the buyer-balance analogue needed its own follow-up, [20260522000001](supabase/migrations/20260522000001_buyer_balance_on_delete.sql)). | migrations 22000000/22000001 |
| DB5 | 🟡 | `inventory_movements.quantity` has **no sign/CHECK constraint** — a negative "purchase" or zero-quantity row is accepted; combined with worker INSERT rights ([07-security M4](07-security-audit.md)) stock can be driven arbitrarily. Add `CHECK (quantity > 0)` and let `movement_type` carry direction. | initial_schema.sql:266-280 |
| DB6 | 🟡 | `financial_transactions.amount` allows negative/zero (no CHECK) and `category` is free text — reporting by category will fragment ("Feed", "feed", "FEED"). Add `CHECK (amount > 0)` + a category enum or lookup table. | initial_schema.sql:283-302 |
| DB7 | 🟡 | `profiles.farm_id` + `farm_users` dual-source of farm membership — `_layout.tsx` hydrates from `farm_users` while web layout checks `profiles.farm_id` ([layout.tsx:16](web/app/(dashboard)/layout.tsx#L16)). Two truth sources will eventually disagree (e.g., multi-farm owners). Document `farm_users` as canonical; treat `profiles.farm_id` as "default farm" only. | both layouts |
| DB8 | 🟡 | `weather_alerts` has no UNIQUE(farm_id, alert_date, alert_type) — repeated cron runs in one day can stack duplicate alerts; the dashboard `.maybeSingle()` on alerts ([dashboard.tsx:116-122](PoultryOS/app/(tabs)/dashboard.tsx#L116)) **throws** on duplicates. Verify the Edge Function dedups; otherwise add the constraint. | initial_schema.sql:372-388 |

## 4. Functions, triggers, RPC layer — verdict: disciplined

- All functions pin `search_path`; trigger-only SECURITY DEFINER helpers had EXECUTE revoked then surgically restored ([20260521000000](supabase/migrations/20260521000000_restore_rls_helper_execute.sql), [20260522000003](supabase/migrations/20260522000003_harden_trigger_function_execute.sql)) — this team reads advisor output.
- The reminder-stage `IN (7,15,30)` → `>= range` bug was caught and fixed ([20260504000000](supabase/migrations/20260504000000_fix_payment_overdue_filter.sql)) with a written lesson (L6).
- RPC surface (`is_paid`, `create_traceability_record`, `update_vet_note`, `low_stock_items`, `upsert_market_price`, `multi_farm_summary`, `calculate_contract_settlement`, custom-integrator) all follow REVOKE/GRANT pattern.
- ⚠️ `tg_post_to_edge_function` depends on DB settings `app.edge_function_base_url` / `app.edge_function_service_key` (initial_schema.sql:507-518) — the service key stored as a database GUC is readable by any role able to run `current_setting()` in that database context; confirm it's set via `ALTER DATABASE … SET` with restricted visibility, and rotate if exposed. Also: nothing in migrations sets it — it's a manual post-step (initial_schema.sql:1199-1200) that, if skipped, **silently disables mortality WhatsApp/push alerts** (trigger RAISEs NOTICE and continues).

## 5. Scheduled jobs (pg_cron)

| Job | Migration | Schedule (UTC→IST) |
|---|---|---|
| fetch-weather-data | [20260519000002](supabase/migrations/20260519000002_schedule_weather_cron.sql) | hourly Apr–Sep, 6×/day otherwise |
| send-vaccination-reminders | [20260519000003](supabase/migrations/20260519000003_schedule_vaccination_reminders.sql) | 01:30 → 07:00 IST |
| send-low-stock-alerts | [20260519000006](supabase/migrations/20260519000006_schedule_low_stock_alerts.sql) | 03:00 → 08:30 IST |
| send-daily-digest | [20260519000007](supabase/migrations/20260519000007_schedule_daily_digest.sql) | 14:30 → 20:00 IST |
| send-payment-reminders | [20260519000008](supabase/migrations/20260519000008_schedule_payment_reminders.sql) | 04:30 → 10:00 IST |
| ~~fetch-market-prices~~ | **missing** — no migration, no function | spec'd daily 08:00 IST in CLAUDE.md |

## 6. Scalability assessment

- Current design comfortably serves the 200-farm / 1,000-farm milestones. Growth tables are `daily_logs` (≤365 rows/batch/yr), `whatsapp_messages_log` (insert-only, indexed by `(farm_id, created_at DESC)`), `weather_data` (1 row/farm — bounded ✅), `inventory_movements`.
- No partitioning needed before ~10⁷ rows; revisit `whatsapp_messages_log` and `daily_logs` then.
- Multi-tenancy via RLS scales fine with the initplan fix already applied.
- Missing for scale: any **archival/retention policy** (weather_alerts and notifications grow forever) and **pg_cron job monitoring** (no `cron.job_run_details` surfacing — a dead job is invisible until a farmer complains their digest stopped).

## 7. Recommended migration queue (ordered)

1. `amount_paid` column + `update_buyer_balance()` rewrite (DB1) + backfill + pgTAP test.
2. Traceability anon policy → token RPC (security H1 — see [07-security-audit.md](07-security-audit.md)).
3. CHECKs: `inventory_movements.quantity > 0`, `financial_transactions.amount > 0` (DB5/DB6).
4. `weather_alerts` UNIQUE(farm_id, alert_date, alert_type) after verifying Edge Fn dedup (DB8).
5. Batch-code collision hardening (DB2).
6. `feed_item_id` link on daily_logs (DB3) — coordinate with mobile/web form changes.
7. `fetch-market-prices` function + cron, or formally descope and update CLAUDE.md.
