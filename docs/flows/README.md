# PoultryOS — Module Flow Maps

End-to-end flow documentation for every functional module, grounded in the actual
code (routes, RPCs, triggers, Edge Functions, cron). Use this to understand how the
application works start-to-finish, and to find where flows break.

> Apps: `frontend/` (web · port 3000) · `mobile-app/` (Expo) · `saas-control-center/`
> (operator · port 3001) · `supabase/` (the one shared backend).

## How to read a module doc
Each file has: **Purpose · Entry points · Step-by-step · Flow map (Mermaid) · Data &
backend · Cross-app parity · Gaps**. Severity: **P0** breaks the flow / data loss ·
**P1** incomplete or inconsistent · **P2** polish / nice-to-have.

## Modules
| # | Module | Doc | Core dependency of |
|---|--------|-----|--------------------|
| 1 | Auth & Onboarding | [auth-onboarding.md](auth-onboarding.md) | everything |
| 2 | Farm setup (farms → sheds → batches) | [farm-setup.md](farm-setup.md) | all farm data |
| 3 | Daily Log (+ offline queue) | [daily-log.md](daily-log.md) | KPIs, inventory, alerts |
| 4 | Health incidents | [health.md](health.md) | traceability |
| 5 | Vaccinations | [vaccinations.md](vaccinations.md) | traceability |
| 6 | Inventory & feed auto-deduct | [inventory.md](inventory.md) | low-stock alerts |
| 7 | Transactions | [transactions.md](transactions.md) | P&L, khata |
| 8 | Khata / UPI | [khata-upi.md](khata-upi.md) | receivables |
| 9 | Contract Farming | [contract-farming.md](contract-farming.md) | settlements |
| 10 | Traceability | [traceability.md](traceability.md) | — |
| 11 | Market Prices | [market-prices.md](market-prices.md) | digest, P&L benchmark |
| 12 | Weather & heat-stress | [weather.md](weather.md) | alerts |
| 13 | WhatsApp & Notifications | [whatsapp-notifications.md](whatsapp-notifications.md) | all alerts |
| 14 | Reports / exports | [reports.md](reports.md) | — |
| 15 | Multi-farm dashboard | [multi-farm.md](multi-farm.md) | — |
| 16 | Farm Integrity | [farm-integrity.md](farm-integrity.md) | — |
| 17 | Team & roles (RLS) | [team-roles.md](team-roles.md) | all access |
| 18 | Billing / Subscription | [billing-subscription.md](billing-subscription.md) | freemium gates |

## Backend inventory (ground truth)

### Edge Functions (`supabase/functions/`)
`create-upi-collect-link` · `fetch-weather-data` · `send-heat-stress-alert` ·
`send-low-stock-alerts` · `send-payment-reminders` · `send-push-notification` ·
`send-vaccination-reminders` · `send-whatsapp-message` · `msg91-send-sms` ·
`create-razorpay-subscription` · `cancel-subscription` · `change-plan` ·
`razorpay-refund` · `razorpay-plan-backfill` · `generate-invoice-pdf` ·
`aisensy-webhook` · `fetch-necc-egg-rates` · `send-daily-digest` ·
`send-farm-integrity-report` · `subscription-lifecycle` · `razorpay-webhook` ·
`send-email`

### Scheduled jobs (pg_cron, stored in migrations)
| Job | UTC | IST | Calls |
|-----|-----|-----|-------|
| fetch-weather-data | every 4h | — | weather + heat alerts |
| send-vaccination-reminders | 01:30 | 07:00 | vaccination WhatsApp |
| send-low-stock-alerts | 03:00 | 08:30 | low-stock WhatsApp |
| send-daily-digest | 14:30 | 20:00 | daily summary WhatsApp |
| send-payment-reminders | 04:30 | 10:00 | overdue WhatsApp |

### Key DB triggers / functions
- `daily_logs` INSERT → `update_batch_bird_count` · `check_mortality_spike` (→ edge) ·
  `deduct_feed_inventory` · `check_daily_log_bird_count` (guard)
- `daily_logs` UPDATE/DELETE → `update_batch_bird_count_on_edit` ·
  `restore_batch_bird_count_on_delete` · `cleanup_daily_log_movements`
- `batches` INSERT → `generate_batch_code`; UPDATE closed → `lock_traceability_on_close`,
  `prevent_closed_batch_mutation`; closure via `close_batch()` RPC
- `financial_transactions` I/U/D → `update_buyer_balance`; `check_payment_overdue()`
- `contract_cycles` settle → `lock_contract_cycle_on_close`; `calculate_contract_settlement()` RPC
- `inventory_movements` INSERT → `apply_inventory_movement`
- `auth.users` INSERT → `handle_new_user` (creates profile); `create_tenant_onboarding()` RPC
- `tenants` INSERT → `provision_tenant_trial`; gating via `is_paid()` / `tenant_plan_status()`

## Consolidated gap register (verified 2026-06-18)

This pass traced each flow against real code and resolved the prior round's unverified
"verify…" items. Open items below are code-confirmed.

### Fixed this pass
| ID | Module | Was | Fix |
|----|--------|-----|-----|
| F1 | Contract Farming | **P1** | Web had **no auto-settlement** — the harvest form took a *manual* "Expected settlement" while mobile computed it via `calculate_contract_settlement`. Added a "Calculate expected settlement" action on web (`contract/[id]/CycleActions.tsx`) that calls the RPC, persists `expected_settlement_amount`, refreshes, and shows the ₹. Parity restored. |
| F2 | Market Prices | P2 | Empty-state copy promised a non-existent `fetch-market-prices` cron. Corrected to reflect reality (NECC egg auto-fetch + manual broiler entry) in `market-prices/page.tsx`. |

### Verified RESOLVED (prior gaps that were already correct in code)
| Module | Prior concern | Reality |
|--------|---------------|---------|
| Daily Log | offline unique-key collision → silent loss | `offline-queue.ts` flushes with `upsert(onConflict: batch_id,log_date)` — last-write-wins, no loss; retries to `MAX_ATTEMPTS=5`. |
| Farm Setup | shed transfer loses count / no re-point | `transfer_batch()` RPC writes `batch_transfers` history + repoints `shed_id` atomically; `current_bird_count` travels with the batch. |
| WhatsApp/Notif | `expo_push_token` not captured | `hooks/usePushToken.ts` writes it; invoked in `app/_layout.tsx:54` after auth. |
| WhatsApp/Notif | per-category opt-out not honored | `send-whatsapp-message:220` enforces `whatsapp_preferences` centrally; delegating senders inherit it. |
| Market Prices | NECC fetch not scheduled | `fetch-necc-egg-rates` scheduled in `20260616000003` (~08:00 IST). |
| Team & Roles | invitee stuck "Pending" → no access | RLS gates on `farm_users` row existence, not `accepted_at` — access is immediate; the label is cosmetic only. |

### Still open (code-confirmed)
| ID | Module | Sev | Gap |
|----|--------|-----|-----|
| G1 | Traceability | **P2 (was P1)** | No `generate-traceability-pdf` Edge Function and `certificate_pdf_url` is never populated, so the conditional server-PDF link never renders. **Flow is not broken** — the client-side `DownloadCertificate` (jsPDF) generates the cert. The dead `<a>` is a harmless forward-compat hook. |
| G2 | Reports | P2 | No `generate-report-pdf` Edge Function — reports are **client-side CSV only**. No dead PDF button exists; flow is complete as CSV. |
| G3 | Market Prices | **P1** | No broiler price source (`fetch-market-prices` doesn't exist); broiler is manual entry only. Product decision: build a source or keep manual. (UI copy now honest — see F2.) |
| G4 | WhatsApp | P1 | The **5 WhatsApp alerts/month free cap is not enforced** in `send-whatsapp-message` (no monthly count check) — UI/plan expectation only. |
| G5 | Freemium (Farm/Shed/Team/Buyers) | P2 | Quantity caps (1 farm / 3 sheds / 2 workers / 10 buyers) are enforced **UI-only** (`UpgradeGate`); no DB `BEFORE INSERT` cap triggers exist. DB gates only *paid features* via `is_paid()`. Direct API insert bypasses caps (RLS still tenant-scopes). |
| G6 | Team & Roles | P2 | Invite never sets `accepted_at`, so web team list shows "Pending" forever and `get_multi_farm_summary` excludes such members. Cosmetic; set `accepted_at` at insert/first-load to fix. |
| G7 | Contract | P2 | `calculate_contract_settlement` uses the cycle's typed harvest FCR/mortality, not daily-log-derived KPIs — pre-fill from KPIs to avoid reconciliation drift. |

> Verified by reading real code on 2026-06-18. Edge-Function *absence* (G1–G3) confirmed
> against `supabase/functions/` on disk — re-confirm via Supabase MCP `list_edge_functions`
> before building, as a function could exist remotely but not on disk.
