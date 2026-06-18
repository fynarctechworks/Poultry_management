# PoultryOS — Platform Security Audit

**Date:** 2026-06-18 · **Scope:** real code + live Supabase `jusxngbfdmzhlybohell` (3 apps + backend).
**Method:** per-module audits (01–19) + global sweep (20). RLS, RPC authz, webhooks, grants, secrets.

---

## Executive summary
The platform's security model is **fundamentally sound** — RLS on 100% of tables, fail-closed
signed webhooks, RBAC-gated operator mutations, and a verified owner billing-write lockdown. The
audit found **one systemic class of defect**: SECURITY DEFINER **read/compute** functions that were
*intended* operator/service-role-only but inherited the default `authenticated` EXECUTE grant and
never added an internal gate — leaking cross-tenant platform data. All findings have proposed,
low-risk fixes. **No tenant can mutate another tenant's data or escalate to operator mutations.**

## ✅ Security group APPLIED to live (2026-06-18)
Migration `security_group_close_securitydefiner_exposure` closed **S1, S2, S4**: the 2 `cc_*` readers
are now `cc_assert_permission('billing:read')`-gated; the 3 `compute_*` dashboards + `compute_tenant_health`
+ `recompute_all_customer_health` + `log_platform_event` are `REVOKE`d from authenticated/anon/public
and `GRANT`ed to `service_role` (Control Center confirmed to call them via the service-role client).
**Verified:** `authed_exec=false` on the dashboards/health/audit fns, `has_gate=true` on the readers,
`service_role=true` on all. The M20 exposure sweep no longer returns any P1 leak. Remaining open:
S3 (4 low-severity caller-owns-tenant guards) and S5 (anon-grant hardening).

## Severity tally (P1 group applied; remainder proposed)
| Sev | Count | Items |
|-----|-------|-------|
| **P1** | 5 fns | `cc_billing_summary`, `cc_tenants_mrr`, `compute_platform_dashboard`, `compute_razorpay_metrics`, `compute_analytics_overview` — cross-tenant revenue/dashboard leak |
| P2 | 5 | `compute_tenant_health`+`recompute_all_customer_health` (churn read/write/DoS); `validate_coupon` (enumeration); `log_platform_event` (audit forgery); anon table grants (latent) |
| P3 | 3 | `create_custom_integrator`, `tenant_can_write`, `tenant_feature` (probe/pollution) |

## Findings

### S1 (P1) — Cross-tenant platform-data leak via ungated SECURITY DEFINER functions
Any authenticated tenant user can `rpc()` the operator reporting/dashboard functions and read
**platform-wide revenue, MRR, churn, analytics, security events** for the whole business.
- **Root cause:** default `GRANT EXECUTE … TO authenticated` + "service-role-only" intent never
  enforced by `REVOKE` or an internal `cc_assert_permission`/`is_platform_admin` gate.
- **Fix:** gate the two `cc_*` readers with `cc_assert_permission('billing:read')`; `REVOKE EXECUTE`
  on the 3 `compute_*` dashboards (service-role-only). See `docs/audit/19-saas-control-center.md`.

### S2 (P2) — Operator/platform-health functions tenant-callable
`compute_tenant_health` (reads **and writes** any tenant's churn) and `recompute_all_customer_health`
(platform-wide write loop → DoS) are authenticated-executable. **Fix:** `REVOKE EXECUTE` (cron/CC use
service-role). See `docs/audit/20-global-platform.md`.

### S3 (P2) — Missing caller-owns-tenant checks
`validate_coupon` (coupon-code enumeration), `tenant_feature`/`tenant_can_write` (cross-tenant boolean
probes). **Fix:** prepend `is_tenant_member(p_tenant)` guard.

### S4 (P2) — `log_platform_event` forgeable
Authenticated-executable audit-log writer → forged operator audit rows. **Fix:** `REVOKE EXECUTE`
(internal definer callers run as `postgres`).

### S5 (P2, latent) — `anon` holds `GRANT ALL` on all 66 tables
Supabase default. **Inert** — RLS enabled everywhere, no anon-satisfiable policy on sensitive tables.
Defense-in-depth `REVOKE` proposed for billing/platform tables. See `docs/audit/18`.

## What's strong (verified, no action)
- **RLS:** 100% table coverage; tenant isolation via denormalised ids + JOIN-free helper predicates;
  no policy trusts `profiles.role` (M17); `physical_counts`/`buyers`/`financials` owner-scoped.
- **Webhooks:** `razorpay-webhook` + `aisensy-webhook` — HMAC-SHA256, **fail-closed** when secret
  unset (SEC-6), constant-time compare, idempotent. Subscription activation only via service-role.
- **Operator mutations:** 35/37 `cc_*` RPCs RBAC-gated (`cc_assert_permission`) + fully audited.
- **Billing:** owner UPDATE column-locked to `plan_id`/`billing_cycle` — no self-grant of `active`.
- **Anon surface:** only the token-scoped `get_traceability_by_token` RPC (exact token, LIMIT 1).
- **Auth:** dev email-verify backdoor dropped + prod-refused (memory); CC MFA-enforced; OTP via MSG91.
- **CSV export** formula-injection hardened (M14); WhatsApp template allow-list (M13).

## Hardening backlog (priority order)
1. **S1** — gate/REVOKE the 5 operator read/dashboard functions (**top priority**).
2. **S2/S4** — REVOKE operator-health + audit-writer functions.
3. **S3** — caller-owns-tenant guards on coupon/feature/can-write.
4. Freemium DB caps bundle (defense-in-depth; see SAAS_UPGRADE_ROADMAP).
5. **S5** — REVOKE anon write grants on billing/platform tables.
6. Enable `auth_leaked_password_protection` (M1).

## Recurring methodology to keep
Run the **SECURITY DEFINER exposure sweep** (M20 §2) in CI: any `authenticated`-executable SECURITY
DEFINER function that references neither `auth.uid()` nor a gate keyword is a review gate.
