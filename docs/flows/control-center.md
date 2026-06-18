# SaaS Control Center (Operator Plane)

## Purpose
The internal operator console (`saas-control-center/`, port 3001, serves `/admin`) that sits
**above** tenant RLS to run the business: tenants, subscriptions, billing, plans/flags, support,
errors, revenue. Operators are `platform_admins`, not tenant members.

## Entry points
- App: `saas-control-center/app/admin/*` (dashboard, tenants, subscriptions, billing, revenue,
  plans, flags, support, errors, security).
- Backend: `platform_admins` + RBAC (`platform_roles`, `platform_permissions`,
  `platform_role_permissions`); helpers `is_platform_admin`, `platform_has_permission`,
  `cc_assert_permission`; 37 `cc_*` operator RPCs; `compute_platform_dashboard`,
  `compute_revenue_metrics`, `log_platform_event` (audit).

## Authorization model
`platform_admins(status='active') → role_id → platform_role_permissions → platform_permissions(code)`.
Every **mutating** `cc_*` RPC calls `cc_assert_permission('<scope>')` (e.g. `tenant:manage`,
`subscription:manage`, `billing:read`) which raises `42501` for non-admins, then writes, then
`log_platform_event(before, after)`. Operators authenticate in the shared Supabase auth pool but are
gated by `platform_admins`; `/register` is removed; TOTP MFA is enforced.

## Gaps
- **P1 (proposed, CC1)** — `cc_billing_summary()` + `cc_tenants_mrr()` are SECURITY DEFINER,
  `authenticated`-executable, **ungated** → any tenant user can read platform-wide collections / MRR.
  Fix: add `cc_assert_permission('billing:read')` (report 19).
- **P1 (proposed, CC2)** — `compute_platform_dashboard()` is `authenticated`-executable with no gate
  (memory claimed service_role-only; the grant doesn't enforce it) → full exec dashboard leak. Fix:
  `REVOKE EXECUTE FROM authenticated, anon` (or internal `is_platform_admin()` guard) (report 19).
- **P2 (proposed, CC3)** — `log_platform_event()` is `authenticated`-executable → forgeable audit
  rows. Fix: `REVOKE EXECUTE` (internal definer callers unaffected) (report 19).
- **VERIFIED** — all 35 mutating `cc_*` RPCs are RBAC-gated + audited; no mutation escalation path.
