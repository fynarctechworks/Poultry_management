# PoultryOS SaaS Control Center — Architecture & Implementation Master Plan

**Status:** Increments 1–6 COMPLETE & verified — all 12 Control Center modules live; 59/59 pgTAP green (see `control-center-increment{1..6}-results.md`). Customer-app integration (P13) dropped by founder direction; security hardening (P14) optional follow-up. · **Date:** 2026-06-11 · **Author:** build agent
**Scope:** Internal operator platform to manage the entire PoultryOS SaaS ecosystem (tenants, subscriptions, revenue, discounts, support, errors, audit, feature flags, RBAC) at 10 → 10,000 tenants with no architecture change.

> This document is the authoritative plan. Implementation proceeds in dependency-ordered
> increments; no increment merges with a broken build, failing RLS test, or partial schema.

---

## 0. Repository reality (what already exists — reuse, do not rebuild)

| Concern | Already shipped | Implication for Control Center |
|---|---|---|
| Tenant model | `tenants`, `tenant_users` (7 roles), tenant-first RLS, `current_tenant_id()`, `is_tenant_admin()` | CC sits **above** tenant RLS — operators are not tenant members |
| Billing | `subscription_plans` (4 tiers + `features_json`), `tenant_subscriptions` (state machine), Razorpay create+webhook wired to tenant subs | Phase 3 extends these; do **not** create a parallel plans table |
| Auth/security | Supabase Auth (OTP+TOTP), `trusted_devices`, `auth_audit_events`, 2FA prefs | Phase 9/14 reuse `auth_audit_events`; add `platform_audit_events` for operator actions |
| Analytics | append-only `analytics_events` + `track_event` RPC | Phase 5/7 read this for funnel/health |
| Web app | Next.js 14 App Router, `web/lib/supabase/{client,server,middleware}.ts`, `web/lib/theme/tokens.ts`, shared components | CC lives in a new route group in the **same** app |
| **Platform admin layer** | **NONE** | Greenfield — this plan builds it |
| Discounts / coupons / promotions / feature flags / support / errors / customer health | **NONE** | All greenfield tables (Phases 4,6,7,8,11) |

The "Gym SaaS reusable modules" referenced in the brief do not exist in this repo (template artifact). All CC modules are designed PoultryOS-native, reusing the primitives above.

---

## 1. Core architectural decisions (the load-bearing ones)

### D1 — Location: route group in the existing Next.js web app
`web/app/(control)/...`, served under host `admin.poultryos.app` (middleware host-gate) or path `/admin`. One deploy, shared Supabase clients, shared `tokens.ts` + components. An internal tool with a handful of operators does not justify a second app/auth stack. Scales to 10k tenants because CC is read-mostly over indexed aggregates, not per-tenant fan-out.

### D2 — Operators live OUTSIDE tenant RLS
A Control Center operator must see **all** tenants. They are NOT `tenant_users`. Access model:
- **`platform_admins`** table = membership in the operator platform (separate identity surface from `tenant_users`).
- **All CC data access goes through Next.js server actions / route handlers using the service-role key** (`web/lib/supabase/server` already has the SSR client; CC adds a `serviceClient` used **server-only**).
- Every CC server action passes through one guard: `requirePlatformPermission(perm)` → checks `platform_admins` + RBAC, then **writes a `platform_audit_events` row**. No exceptions. This is the Stripe/Shopify-admin model: privileged backend + hard permission check + mandatory audit — **not** RLS exceptions sprinkled across 28 tenant tables (which would erode tenant isolation).
- Atomic / sensitive cross-tenant mutations (suspend, plan-change, impersonate, apply-discount) are **`SECURITY DEFINER` RPCs** that re-check platform permission server-side and write audit rows inside the same transaction.

### D3 — Platform RBAC is database-driven (no hardcoded permissions)
`platform_roles`, `platform_permissions`, `platform_role_permissions`, `platform_admins (user_id, role_id)`. 12 seed roles (Super Admin … Read Only). Permissions are `resource:action` strings (e.g. `tenant:suspend`, `discount:create`, `revenue:read`). `platform.has_permission(uid, perm)` helper.

### D4 — Audit is append-only & immutable
`platform_audit_events`: service-role INSERT only, **no UPDATE/DELETE policy**, plus a `BEFORE UPDATE OR DELETE` trigger that `RAISE EXCEPTION`. Optional hash-chain (`prev_hash`) for tamper evidence in the Enterprise hardening pass. Every guarded action logs: actor, permission, target tenant/user, before/after JSON, IP, UA, timestamp.

### D5 — Real-time reflection into the customer app (Phase 13)
CC and the customer app share one Postgres. Plan/limit/suspension changes take effect because:
- The customer app reads `tenant_subscriptions` / `tenants.status` live; add Supabase **Realtime** on those rows so open sessions update without reload.
- **Suspension has teeth**: extend the tenant RLS helpers so `tenants.status IN ('suspended','cancelled')` blocks member access (read-only or hard-block, configurable). This is the enforcement point, not just a flag.
- Feature flags resolve through one `tenant_feature(tenant, flag)` function the app already-or-soon calls; CC writes flag rows, app reads them.

### D6 — Dynamic plans (Phase 3): extend, don't fork
`subscription_plans` already exists with `features_json` + limits. Phase 3 normalizes features into `subscription_features` + `plan_feature_mapping` for admin editability, keeps `subscription_plans` as the canonical row, and adds `plan_history` (append-only) for change tracking. App reads stay backward-compatible via a `plan_effective_limits(plan)` view.

---

## 2. Database migration plan (new tables, dependency-ordered)

All tables: `created_at`/`updated_at`, RLS enabled, service-role-write + platform-permission reads. Prefix `platform_*` for operator-plane tables to keep them visually distinct from tenant tables.

**M1 — Platform identity & RBAC** (`platform_rbac.sql`)
`platform_roles`, `platform_permissions`, `platform_role_permissions`, `platform_admins`; `platform.has_permission()`, `is_platform_admin()`; seed 12 roles + permission catalog.

**M2 — Platform audit** (`platform_audit.sql`)
`platform_audit_events` (immutable, trigger-guarded) + `log_platform_event()` SECURITY DEFINER helper.

**M3 — Tenant lifecycle & ops columns** (`tenant_ops.sql`)
Add to `tenants`: `suspended_at`, `suspended_reason`, `deleted_at` (soft delete), `health_score` (cached), `mrr_inr` (cached). Tenant RLS suspension enforcement (D5). `tenant_action(...)` RPCs: activate/suspend/soft-delete/restore/extend-trial/reset-subscription/change-plan.

**M4 — Dynamic plans** (`plans_dynamic.sql`)
`subscription_features`, `plan_feature_mapping`, `plan_history`; `plan_effective_limits` view; CRUD RPCs (create/edit/duplicate/archive/enable/disable).

**M5 — Discount engine** (`discounts.sql`)
`discounts`, `coupon_codes`, `coupon_redemptions`, `promotions`; rule columns (date range, plan restriction, usage limit, tenant restriction, stacking, first-purchase/renewal-only); `apply_discount(tenant, code|id)` + `validate_coupon()` RPCs.

**M6 — Support & call center** (`support.sql`)
`support_tickets`, `support_calls`, `call_notes`, `customer_followups`, `customer_interactions` (unified timeline), ticket/call state machines.

**M7 — Customer success / health** (`customer_health.sql`)
`customer_health` (cached score + component scores + risk band), `health_score(tenant)` function (login/usage/payment/support/setup signals → 0–100 → green/yellow/red), churn-risk flagging; nightly `pg_cron` recompute.

**M8 — Error monitoring** (`error_monitoring.sql`)
`platform_errors` (tenant, user, module, route, stack, browser, device, severity, status, timestamp), workflow (open/investigating/resolved/ignored), `error_comments`, assignment.

**M9 — Feature flags** (`feature_flags.sql`)
`feature_flags`, `tenant_feature_flags`, `plan_feature_flags`; `tenant_feature(tenant, flag)` resolver (global → plan → tenant override → % rollout by stable hash).

**M10 — Revenue rollups & monitoring** (`revenue_ops.sql`)
Materialized views / rollup tables for MRR/ARR/ARPU/LTV/churn/conversions; `pg_cron` refresh. System-health pulled live (no table) from `pg_stat_*` via SECURITY DEFINER readers.

Each migration ships with pgTAP: platform-permission isolation (non-admin sees nothing), audit immutability (UPDATE/DELETE rejected), RPC permission re-checks, suspension enforcement.

---

## 3. UI map (Control Center route group)

```
web/app/(control)/
  layout.tsx                 # CC shell: sidebar + topbar + global search + notif center + admin profile; platform-permission gate
  page.tsx                   # Operations overview (KPIs, alerts, churn-risk, error rate)
  tenants/                   # list, [id]/ (overview, health, activity, subscription, billing, users, farms, usage), actions
  subscriptions/             # plans CRUD, plan features, plan history
  discounts/                 # discounts, coupons, promotions, redemptions
  revenue/                   # MRR/ARR/ARPU/LTV/CAC, trends, forecast, plan distribution, failed payments
  support/                   # ticket queue, call queue, customer lookup, ticket/call detail, follow-ups
  success/                   # health board, churn-risk list, customer timeline
  errors/                    # error inbox, detail, assignment, workflow
  audit/                     # immutable audit log explorer (filter by actor/tenant/action)
  access/                    # platform roles, permissions, admins (RBAC admin)
  flags/                     # feature flags, rollouts, per-tenant overrides
  system/                    # live system health (db/api/queue/webhook/storage/error rates)
components/control/          # AdminShell, KpiTile, TenantTable, HealthBadge, AuditTable, ConfirmDangerModal, ImpersonationBanner …
```
All keyed to `web/lib/theme/tokens.ts`; skeleton-first; WCAG AA; destructive actions require typed confirmation + reason (audited).

## 4. API / server-action map

`web/lib/control/`:
- `guard.ts` — `requirePlatformPermission(perm)` (auth → platform_admins → RBAC → returns serviceClient + actor; throws 403 otherwise).
- `audit.ts` — `audit(actor, action, target, before, after)` (always called by guarded mutations).
- `serviceClient.ts` — server-only service-role Supabase client (never imported by client components).
- one module per domain (`tenants.ts`, `plans.ts`, `discounts.ts`, `support.ts`, `health.ts`, `errors.ts`, `flags.ts`, `revenue.ts`) exposing server actions that call guarded RPCs.

Mutations that cross tenants or must be atomic → **RPC** (SECURITY DEFINER, re-checks permission). Reads → service-role select through the guard.

---

## 5. Build increments (dependency-ordered; each is shippable & tested)

> Phases in the brief are reordered into buildable increments because Foundation, RBAC,
> and Audit are dependencies of everything else.

- **Increment 1 — Operator plane foundation** (brief P1+P10+P9): M1 RBAC, M2 audit, CC shell (layout/sidebar/topbar/search/notifs/profile), `guard.ts`/`audit.ts`/`serviceClient.ts`, platform login + permission gate, audit explorer, access-control (roles/permissions/admins) UI. **Gate:** only seeded super-admin can enter; every action audited; non-admin 403.
- **Increment 2 — Tenant management** (brief P2): M3 lifecycle columns + RPCs, suspension enforcement, tenant list + detail tabs + all actions (incl. audited impersonation). **Gate:** suspend a tenant → its users blocked in the customer app within one session; all actions audited.
- **Increment 3 — Dynamic plans + discounts** (brief P3+P4): M4 + M5; plans CRUD, feature mapping, discount/coupon engine; app reads stay backward-compatible. **Gate:** no plan value hardcoded; coupon validates + applies; gates enforce at DB+UI.
- **Increment 4 — Revenue + customer success + health** (brief P5+P7): M7 + M10; revenue dashboard, health board, churn flags. **Gate:** MRR matches sum of active subs; health recompute nightly.
- **Increment 5 — Support / call center + errors** (brief P6+P8): M6 + M8; ticket/call queues, customer timeline, error inbox. **Gate:** ticket lifecycle + error workflow E2E.
- **Increment 6 — Feature flags + system monitoring + realtime wiring** (brief P11+P12+P13): M9; flag resolver wired into customer app; realtime on tenant status/subs; system-health page. **Gate:** flip a flag → customer app reflects without redeploy.
- **Increment 7 — Security hardening** (brief P14): rate limiting on CC actions, impersonation time-box + banner, access reviews, security alerts, audit hash-chain. **Gate:** security review clean.

---

## 6. Cross-cutting standards
- Service-role client is **server-only**; never shipped to the browser. CC client components call server actions only.
- Every guarded mutation: permission check → action → audit row, in that order; destructive actions need typed confirmation + reason.
- DESIGN.md tokens only. Skeleton-first. WCAG AA. 44px targets. Buttons 12px radius.
- pgTAP + tsc + lint + jest green before any increment is marked done.
- No hardcoded plans, permissions, or limits — all DB-driven.
- Each increment appends results to its own `/execution/control-center-incrementN-*.md`.

## 7. Risk register
| Risk | Mitigation |
|---|---|
| Service-role client leaks to browser → full data breach | server-only module, lint rule / import guard, code review gate |
| Operator action bypasses audit | audit is inside the guard + inside SECURITY DEFINER RPCs; no direct table writes from CC |
| Suspension flag without enforcement | D5 RLS helper change is the gate, tested in pgTAP |
| Platform RBAC drift / privilege creep | DB-driven perms + access-review pass (Increment 7) |
| 28 new tables slow tenant app | platform_* tables isolated; revenue/health are rollups refreshed by cron, not live fan-out |
| Impersonation abuse | time-boxed, reason-required, audited, banner-visible |
```
