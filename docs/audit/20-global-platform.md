# Module 20 — Global Platform Architecture · Audit Report

**Audited:** 2026-06-18 · against real code + live Supabase project `jusxngbfdmzhlybohell`.
**Status:** ✅ Complete — platform-wide SECURITY DEFINER exposure sweep, RLS coverage, tenant-isolation
invariants, and hot-path performance verified. Surfaced the **systemic root cause** behind the M19
leaks and 2 further cross-tenant function exposures. All fixes proposed (DB).

---

## 1. RLS coverage
- **All 66 public tables have RLS enabled** (`relrowsecurity=true`; zero exceptions). Verified in M18.
- Tenant isolation is denormalised `tenant_id`/`farm_id` + helper predicates
  (`is_tenant_member/admin/money`, `is_farm_owner/member`, `user_role_for_farm`, `user_assigned_sheds`)
  — JOIN-free policies for performance. No policy trusts `profiles.role` (M17).

## 2. SECURITY DEFINER exposure sweep (the key global finding)
Method: every `public` SECURITY DEFINER function that is `authenticated`-EXECUTE-able, returns data
(not trigger), and references **neither `auth.uid()`** (self-scoping) **nor any authz gate**
(`cc_assert_*`, `is_platform_admin`, `platform_has_permission`, `is_tenant_*`, `is_farm_*`, `is_paid`).

**12 hits. Triage:**

| Function | Verdict | Sev |
|----------|---------|-----|
| `cc_billing_summary`, `cc_tenants_mrr` | **Leak** — platform revenue/MRR to any tenant (M19 CC1) | **P1** |
| `compute_platform_dashboard`, `compute_razorpay_metrics`, `compute_analytics_overview` | **Leak** — full exec/revenue/analytics dashboards to any tenant (M19 CC2) | **P1** |
| `compute_tenant_health(p_tenant)` | **Leak + write** — reads *and writes* any tenant's churn/health; cross-tenant + write abuse | **P2** |
| `recompute_all_customer_health()` | **Abuse** — any user triggers a platform-wide health recompute (writes 60+ rows) = DoS | **P2** |
| `validate_coupon(p_code,p_tenant,…)` | **Enumeration** — no caller-owns-tenant check; probe arbitrary coupon codes/values | **P2** |
| `create_custom_integrator(p_name)` | **Pollution** — any user inserts into the global `integrators` list (dedup on name) | **P3** |
| `tenant_can_write`, `tenant_feature` | **Probe** — boolean disclosure of another tenant's plan/flags | **P3** |
| `get_traceability_by_token(p_token)` | **OK by design** — token *is* the auth (public traceability, M10) | — |

### Root cause (architectural)
Operator/platform functions (`cc_*`, `compute_*`, `recompute_*`) were **intended** service-role/admin-only,
but the Supabase default `GRANT EXECUTE ON ALL FUNCTIONS … TO authenticated` re-granted them and the
intent was **never enforced via `REVOKE`** (or an internal gate). The mutating `cc_*` RPCs were saved
only because they each added an explicit `cc_assert_permission` — the read/compute functions that
forgot it are exposed. **The fix is a deny-by-default posture for the operator/platform function set.**

## 3. Tenant-isolation invariants (verified)
- Cross-tenant reads only ever occur through SECURITY DEFINER functions; all *tenant-facing* ones
  self-scope on `auth.uid()`/membership. The exposed set above is exclusively **operator/platform**
  functions that should never have been tenant-callable.
- Webhooks (Razorpay, AiSensy) are service-role + HMAC fail-closed (M13/M18). Cron jobs run as
  service-role. No tenant-reachable write path crosses tenants.

## 4. Performance (hot path)
- **No unindexed single-column FKs** on the high-write tables (`daily_logs`, `financial_transactions`,
  `health_incidents`, `vaccinations`, `batches`, `inventory_movements`, `batch_harvests`,
  `payment_reminders`, `contract_cycles`, `weather_alerts`). RLS predicates are JOIN-free helpers.
- Aggregation is server-side single-round-trip RPCs (`get_multi_farm_summary`, `compute_*`).
- See [PERFORMANCE_AUDIT.md](PERFORMANCE_AUDIT.md) for the full picture + watch-items.

## Proposed (NOT applied — the global security hardening, on top of M19 CC1–CC3)
```sql
-- Deny tenant access to operator/platform-health functions (cron/CC use service_role).
REVOKE EXECUTE ON FUNCTION public.compute_tenant_health(uuid)        FROM authenticated, anon, public;
REVOKE EXECUTE ON FUNCTION public.recompute_all_customer_health()    FROM authenticated, anon, public;

-- Add caller-owns-tenant guards (keep tenant-callable, but scope to the caller's tenant).
-- validate_coupon / tenant_feature / tenant_can_write: prepend
--   IF p_tenant IS NULL OR NOT public.is_tenant_member(p_tenant) THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501'; END IF;
-- create_custom_integrator: require an active paid owner (or rate-limit) before the global insert.
```

## Completion gate
✅ RLS coverage (66/66) · ✅ full SECURITY DEFINER exposure sweep + root cause · ✅ tenant-isolation
invariants · ✅ hot-path indexing · ✅ Documented; global hardening proposed. Final platform deliverables:
[FINAL_PLATFORM_AUDIT.md](FINAL_PLATFORM_AUDIT.md) · [SECURITY_AUDIT.md](SECURITY_AUDIT.md) ·
[DATABASE_AUDIT.md](DATABASE_AUDIT.md) · [GLOBAL_ARCHITECTURE.md](GLOBAL_ARCHITECTURE.md) ·
[PERFORMANCE_AUDIT.md](PERFORMANCE_AUDIT.md) · [SAAS_UPGRADE_ROADMAP.md](SAAS_UPGRADE_ROADMAP.md).
