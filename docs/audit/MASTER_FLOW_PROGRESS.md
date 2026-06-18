# PoultryOS — Master Flow Audit Progress

Enterprise-grade end-to-end audit of the **real application** (code · live Supabase
DB `jusxngbfdmzhlybohell` · Edge Functions · RLS · cron) — one module at a time.
Per-module reports live in `docs/audit/NN-<module>.md`.

**Mode:** frontend fixes applied directly; DB / RLS / Edge-Function changes are *proposed*
(migration written + shown) before any apply to the live project. Module-by-module checkpoint.

Legend — status: ⬜ not started · 🟡 in progress · ✅ complete (audited + fixes applied/proposed + documented).
Severity: **P0** breaks flow / data loss · **P1** incomplete or inconsistent · **P2** polish / enterprise gap.

| # | Module | Status | Report | P0 | P1 | P2 | Fixed this pass |
|---|--------|--------|--------|----|----|----|-----------------|
| 1 | Auth & Onboarding | ✅ | [01-auth-onboarding.md](01-auth-onboarding.md) | 0 | 1 open + 1 fixed | 4 | Web onboarding location capture (weather/heat-stress enablement) |
| 2 | Farm Setup | ✅ | [02-farm-setup.md](02-farm-setup.md) | 0 | 2 fixed | 5 | Close-batch via validated RPC (anti-oversell); placement capacity + type integrity |
| 3 | Daily Log | ✅ | [03-daily-log.md](03-daily-log.md) | 0 | 1 proposed | 3 | Future-date guard (web); proposed BEFORE UPDATE binding to close edit-path mortality bypass |
| 4 | Health Incidents | ✅ | [04-health.md](04-health.md) | 0 | 2 fixed | 2 | Vet edits via guarded RPC; food-safety withdrawal warning at sale; input sanity |
| 5 | Vaccinations | ✅ | [05-vaccinations.md](05-vaccinations.md) | 0 | 2 proposed | 3 | administered_by recorded; proposed cron fixes (overdue re-reminders + WhatsApp channel) |
| 6 | Inventory | ✅ | [06-inventory.md](06-inventory.md) | 0 | 1 proposed | 3 | Future-date purchase guard; proposed AFTER DELETE binding (stock restore on movement delete) |
| 7 | Transactions | ✅ | [07-transactions.md](07-transactions.md) | 0 | 1 proposed (top apply) | 3 | Future-date guard; proposed UPDATE/DELETE binding so Mark-paid recomputes buyer balance |
| 8 | Khata / UPI | ✅ | [08-khata-upi.md](08-khata-upi.md) | 0 | 1 inherited (T1) | 3 | UPI reminder no longer leaks "(set UPI ID)"; VPA validation verified sound |
| 9 | Contract Farming | ✅ | [09-contract-farming.md](09-contract-farming.md) | 0 | 0 | 4 | Future-date guards on harvest/settlement; proposed RPC authz tightening; F1 verified fixed |
| 10 | Traceability | ✅ | [10-traceability.md](10-traceability.md) | 0 | 1 fixed | 4 | Web cert generation (parity); PDF brand color; anon-leak + M2 lock verified resolved |
| 11 | Market Prices | ✅ | [11-market-prices.md](11-market-prices.md) | 0 | 1 fixed + 1 product (G3) | 1 | Web manual entry fixed (was RLS-blocked direct upsert → RPC); NECC cron verified active |
| 12 | Weather | ✅ | [12-weather.md](12-weather.md) | 0 | 1 fixed | 2 | "Use my location" on farm edit (existing-farm coord backfill); pipeline + push/WhatsApp parity verified |
| 13 | WhatsApp & Notifications | ✅ | [13-whatsapp-notifications.md](13-whatsapp-notifications.md) | 0 | 1 fixed | 1 | Web per-category WhatsApp prefs (parity); webhook fail-closed + freemium cap verified |
| 14 | Reports | ✅ | [14-reports.md](14-reports.md) | 0 | 3 fixed | 2 | Paid gate on export; CSV formula-injection guard; pagination (1000-row truncation fix) |
| 15 | Multi-Farm Dashboard | ✅ | [15-multi-farm-dashboard.md](15-multi-farm-dashboard.md) | 0 | 1 proposed | 1 | Verified airtight tenant scoping + paid gate; proposed receivables-netting fix (Khata consistency) |
| 16 | Farm Integrity | ✅ | [16-farm-integrity.md](16-farm-integrity.md) | 1 fixed | 0 | 2 | Fixed wrong harvest column (false "missing birds" alerts) in web+mobile; clarified push-only delivery |
| 17 | Team & Roles | ✅ | [17-team-roles.md](17-team-roles.md) | 1 fixed | 1 fixed | 1 | profiles.role trust proven harmless (M1); fixed worker shed-assignment (workers couldn't log) + accepted_at |
| 18 | Billing & Subscription | ✅ | [18-billing-subscription.md](18-billing-subscription.md) | 0 | 1 proposed | 1 | Owner write-lockdown + webhook fail-closed/idempotent VERIFIED; consolidated freemium-cap bundle + anon-grant hardening proposed |
| 19 | SaaS Control Center | ✅ | [19-saas-control-center.md](19-saas-control-center.md) | 2 proposed | 0 | 1 proposed | Mutation RBAC verified strong (35/37); found P1 ungated revenue/dashboard RPCs (CC1/CC2) leaking to any tenant |
| 20 | Global Platform Architecture | ✅ | [20-global-platform.md](20-global-platform.md) | 5 (sweep) | 0 | 5 | Platform-wide SECURITY DEFINER sweep + root cause; RLS 100%; hot-path indexing verified |

**✅ ALL 20 MODULES COMPLETE (2026-06-18).** Final deliverables:
[FINAL_PLATFORM_AUDIT.md](FINAL_PLATFORM_AUDIT.md) · [SECURITY_AUDIT.md](SECURITY_AUDIT.md) ·
[DATABASE_AUDIT.md](DATABASE_AUDIT.md) · [GLOBAL_ARCHITECTURE.md](GLOBAL_ARCHITECTURE.md) ·
[PERFORMANCE_AUDIT.md](PERFORMANCE_AUDIT.md) · [SAAS_UPGRADE_ROADMAP.md](SAAS_UPGRADE_ROADMAP.md).
17 frontend fixes shipped (typecheck-clean, web+mobile); backend changes proposed below await one
reviewed apply pass. **Apply order: security group (S1/S2/S4) → M7 buyer-balance → freemium caps.**

## Cross-module backlog (raised during a module, owned elsewhere)
- ~~**[from M1 → M17 Team & Roles]** verify no RLS policy trusts `profiles.role` over
  `farm_users.role`.~~ **RESOLVED (M17):** no policy references `profiles.role`; all authz via
  `farm_users`/`tenant_users` helpers — the `owner` default is harmless.
- ~~**[from M1 → M12 Weather]** existing farm `MAMA` has NULL coords — needs a Settings
  backfill.~~ **RESOLVED (M12):** added "Use my location" to the farm edit form; pipeline + push/
  WhatsApp parity verified. (`MAMA`'s owner must click it once — no real coordinates to seed.)
- **[from M1 → M18 Billing]** Confirm owner column-restricted write on `tenant_subscriptions`
  (plan_id/billing_cycle only) — wizard writes it directly from the client.
- ~~**[from M2 → M10 Traceability]** Web batch lifecycle never reaches `status='closed'`, so
  `lock_traceability_on_close` never fires — certs never freeze.~~ **RESOLVED (M10):**
  `create_traceability_record` itself flips `harvested → closed`, firing the lock.
- **[from M2 → M7 Transactions / M10]** harvested/closed batches are DELETE-able; cascade
  wipes daily_logs + financial_transactions + harvests. Need a BEFORE DELETE guard.
- **[from M2 → all]** DB-level freemium quantity caps (farm/shed/worker/buyer) still missing;
  proposed cap-trigger SQL in audit report 02 — apply platform-wide once approved. **Extend (M17):**
  also gate `farm_users` — free ≤ 2 `worker` rows; `vet` role requires `is_paid`.

## Pending proposed backend changes (await one reviewed apply pass)
SQL/migrations written in the per-module reports, **not yet applied** to the live project.
| From | Change | Risk |
|------|--------|------|
| M1 | Enable `auth_leaked_password_protection` (Auth config) | trivial |
| M2 | `enforce_farm_cap` / `enforce_shed_cap` BEFORE INSERT triggers (free-plan caps) | low |
| M2 | `enforce_batch_placement_capacity` BEFORE INSERT trigger | low |
| M2 | BEFORE DELETE guard on `batches` for harvested/closed | low |
| M3 | `tg_daily_logs_check_bird_count_edit` — bind `check_daily_log_bird_count` BEFORE UPDATE | low (function unchanged) |
| M4 | Narrow `health_incidents_modify` UPDATE policy to owner/admin (vets use `update_vet_note` RPC) | low (frontend already switched) |
| M5 | `send-vaccination-reminders`: include overdue lookback in due query (P1 — re-remind missed doses) | low (Edge deploy) |
| M5 | `send-vaccination-reminders`: add `send-whatsapp-message` call (push+WhatsApp parity) | low (Edge deploy) |
| M6 | `tg_inventory_movements_apply_delete` — bind `apply_inventory_movement` AFTER DELETE (restore stock) | low (function unchanged) |
| **M7 ⭐** | `tg_financial_tx_update_buyer_balance_ud` — bind `update_buyer_balance` AFTER UPDATE OR DELETE (**Mark-paid receivables fix**) | low (function unchanged) — **top priority** |
| M9 | `calculate_contract_settlement`: tighten authz to owner/money (was farm-membership) | low |
| M10 | `create_traceability_record`: set `is_locked = (batch.status='closed')` at insert (lock cert issued on already-closed batch) | low |
| M10 | (cleanup) drop unused `certificate_pdf_url` column + its conditional link — client jsPDF covers PDF | trivial |
| M12 | `acknowledge_weather_alert(p_alert_id)` RPC + drop broad `weather_alerts_member_ack` UPDATE (column-scope ack to `acknowledged_at`) | low |
| M15 | `get_multi_farm_summary`: net `amount_paid` in receivables CTE (reconcile consolidated receivables with Khata buyer-balance) | low (read-path math) |
| **M18 ⭐** | Freemium **cap bundle** (consolidates M2 caps + M17 farm_users worker/vet + decision on `is_paid` in `create_traceability_record`/contract-insert) — apply as ONE reviewed pass | low |
| M18 | (hardening) `REVOKE INSERT,UPDATE,DELETE ON` billing/platform tables `FROM anon` (latent; RLS already covers) | low |
| ~~M19 ⭐ P1~~ ✅**APPLIED 2026-06-18** | Gate `cc_billing_summary` + `cc_tenants_mrr` with `cc_assert_permission('billing:read')` — migration `security_group_close_securitydefiner_exposure`; verified `has_gate=true` | done |
| ~~M19 ⭐ P1~~ ✅**APPLIED 2026-06-18** | `REVOKE EXECUTE` on 3 dashboard RPCs + `GRANT TO service_role` (CC confirmed service_role-only); verified `authed_exec=false`, `service_role=true` | done |
| ~~M19~~ ✅**APPLIED 2026-06-18** | `REVOKE EXECUTE ON log_platform_event FROM authenticated, anon` (+ S2 `compute_tenant_health`/`recompute_all_customer_health`); verified | done |

## Platform-wide notes
- Supabase security advisors: dominated by informational `*_security_definer_function_executable`
  lints (by-design — RPCs guard via `auth.uid()`/role checks internally). Actionable: enable
  `auth_leaked_password_protection`; `extension_in_public` (pg_net) is low risk.
