# PoultryOS — Global Architecture

**As-built, 2026-06-18** (verified against the live system during the 20-module audit).

## Topology
```
mobile-app/   Expo RN (Android + web)         ─┐
frontend/     Next.js 14 (tenant web, :3000)   ├─►  Supabase (Postgres 15 + Auth + Storage
saas-control-center/  Next.js (operators,:3001)─┘       + Edge Functions + Realtime + pg_cron)
                                                        project: jusxngbfdmzhlybohell (ap-south-1)
```
All three apps share **one** Supabase backend. Tenant apps live *under* RLS; the Control Center lives
*above* it (`platform_admins` + RBAC), reaching cross-tenant data only via gated SECURITY DEFINER RPCs.

## Tenancy & authorization model
- **Isolation:** denormalised `tenant_id` (+ `farm_id`) on every data table; RLS on 100% of tables.
- **Predicates (SECURITY DEFINER, JOIN-free):** `is_tenant_member/admin/money(tenant)`,
  `is_farm_owner/member(farm)`, `user_role_for_farm`, `user_assigned_sheds`, `is_paid(uid)`.
- **Two role planes:** `tenant_users.role` (owner/farm_manager/accountant → money/admin) and
  `farm_users.role` (owner/worker/vet → farm-scoped). `profiles.role` is **not** trusted by any policy.
- **Operator plane:** `platform_admins → platform_role_permissions → platform_permissions`;
  `cc_assert_permission(scope)` gates every mutating `cc_*` RPC + audits via `log_platform_event`.

## Write-path doctrine (verified pattern)
Sensitive writes go through **SECURITY DEFINER RPCs**, not raw table writes, so server-side invariants
hold regardless of client: `close_batch`/`record_harvest` (anti-oversell), `update_vet_note`,
`upsert_market_price`, `create_traceability_record`, `calculate_contract_settlement`,
`set_subscription_status` (billing). Triggers maintain derived state (bird counts, buyer balance,
feed deduction, traceability lock). **Audit lesson:** several trigger *functions* handle UPDATE/DELETE
but the trigger *binding* covered only INSERT (M3/M6/M7) — proposed bindings restore the intent.

## Integrations (all server-side, signed/secret-gated)
| Concern | Service | Guard |
|---------|---------|-------|
| WhatsApp | AiSensy | `send-whatsapp-message` (template allow-list, opt-out, 5/mo free cap); `aisensy-webhook` HMAC fail-closed |
| Payments | Razorpay | `razorpay-webhook` HMAC fail-closed + idempotent; activation only via service-role |
| Weather | OpenWeatherMap | `fetch-weather-data` cron (4h), service-role |
| SMS OTP | MSG91 | mobile OTP primary |
| Prices | NECC egg rates | `fetch-necc-egg-rates` cron (08:00 IST) |
| UPI QR | client-side BHIM URI | zero-cost, no network |

## Cron (Asia/Kolkata)
weather (4h) · NECC prices (08:00) · vaccination reminders (07:00) · low-stock (08:30) · daily digest
(20:00) · payment reminders (10:00) · farm-integrity push (Mon 09:00).

## Cross-app parity
RLS makes the data boundary identical across apps. Audit closed several **web-vs-mobile parity gaps**
where a capability existed on one app only (traceability creation, market-price entry, WhatsApp
per-category prefs, worker shed assignment) — now aligned.

## Key decisions (unchanged, validated)
No custom backend (Supabase-native) · denormalised ids for RLS perf · DB triggers for KPI recompute ·
single-insert daily log · signed URLs · OTP-primary auth · client UPI QR · pre-loaded integrator
tariff cards · rule-based intelligence (no LLM in MVP).

## Architectural risks carried
1. **Operator function exposure** (deny-by-default not enforced on SECURITY DEFINER reads) — SECURITY_AUDIT S1/S2.
2. **Trigger-binding vs function coverage** drift — correctness bindings bundle.
3. **Freemium enforced UI-only** at the quantity/role layer — caps bundle.
4. **Deno Edge ↔ `@poultryos/shared` threshold duplication** (farm-integrity) — drift risk.
