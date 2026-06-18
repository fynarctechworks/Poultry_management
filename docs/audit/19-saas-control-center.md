# Module 19 — SaaS Control Center (Operator Plane) · Audit Report

**Audited:** 2026-06-18 · against real code + live Supabase project `jusxngbfdmzhlybohell`.
**Status:** ✅ Complete — operator **mutation** RBAC verified strong (35/37 RPCs gated), but found a
**P1 cluster of ungated read RPCs leaking platform-wide financials to any authenticated tenant user**.
All fixes are DB changes → proposed, not applied.

---

## Architecture (verified)
The Control Center sits **above** tenant RLS. Operator authority is an RBAC model:
`platform_admins (status='active') → role_id → platform_role_permissions → platform_permissions`.
- `is_platform_admin(uid)` = active row in `platform_admins`.
- `platform_has_permission(perm, uid)` = active admin whose role grants `perm` (or `*`).
- `cc_assert_permission(perm)` / `cc_assert_any_permission(perms[])` raise `42501` when missing.

## What's correct / verified (strong)
- **All 35 mutating `cc_*` RPCs** (`cc_suspend_tenant`, `cc_change_tenant_plan`,
  `cc_set_subscription_status`, `cc_reset_subscription`, `cc_create_plan`, flags, tickets, …) call
  `cc_assert_permission('<scope>')` **first**, then write, then `log_platform_event(before/after)`.
  A non-admin tenant user calling any of them gets `42501 forbidden`. **No mutation escalation path.**
- `set_subscription_status` is **not** authenticated-executable (only definer/service-role) — correct.
- Granular permission scopes (`tenant:manage`, `subscription:manage`, `billing:read`, …) + full
  before/after audit via `platform_audit_events`.

## Issues found

| ID | Sev | Area | Finding |
|----|-----|------|---------|
| **CC1** | **P1** | Cross-tenant leak | **`cc_billing_summary()` and `cc_tenants_mrr()` are SECURITY DEFINER, EXECUTE-able by `authenticated`, with NO authz gate.** Any logged-in farmer can `rpc('cc_billing_summary')` → total platform **net collected / refunded / outstanding**, and `rpc('cc_tenants_mrr')` → total platform **MRR** (probeable per-tenant via the `p_search` name filter). Their sibling readers `cc_list_invoices`/`cc_list_payments` correctly gate on `cc_assert_permission('billing:read')` — these two simply omitted it. |
| **CC2** | **P1** | Cross-tenant leak | **All three exec-dashboard aggregators — `compute_platform_dashboard()`, `compute_razorpay_metrics()`, `compute_analytics_overview()` — are SECURITY DEFINER, EXECUTE-able by `authenticated`, with NO gate.** Any tenant user can read the **entire executive dashboard** (tenants, MRR + 30-day change, churn, payment success, security events), the **Razorpay command-center metrics**, and the **analytics overview** (growth / funnel / cohorts / revenue / engagement). (Project memory recorded these as "service_role only" — the grant does **not** enforce that; the intent never reached the grant.) The internal helper `compute_revenue_metrics()` is correctly **not** authenticated-executable. |
| **CC3** | P2 | Audit integrity | **`log_platform_event()` is EXECUTE-able by `authenticated`** with no gate. A tenant user could **forge or spam operator audit-trail rows** (`platform_audit_events`), polluting the security record. Internal callers are SECURITY DEFINER (run as `postgres`), so they don't need the caller to hold EXECUTE. |

## Proposed (NOT applied — DB, awaiting approval)

```sql
-- CC1 — gate the two revenue readers like their siblings (billing:read).
CREATE OR REPLACE FUNCTION public.cc_billing_summary()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public','pg_temp' AS $$
BEGIN
  PERFORM public.cc_assert_permission('billing:read');
  RETURN jsonb_build_object(
    'collected_net', coalesce((select sum(amount_inr - coalesce(refunded_amount_inr,0)) from public.payments where status='captured'),0),
    'refunded',      coalesce((select sum(coalesce(refunded_amount_inr,0)) from public.payments),0),
    'failed_count',  coalesce((select count(*) from public.payments where status='failed'),0),
    'outstanding',   coalesce((select sum(total_inr) from public.invoices where status in ('issued','failed')),0));
END; $$;

CREATE OR REPLACE FUNCTION public.cc_tenants_mrr(p_search text DEFAULT NULL)
RETURNS numeric LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public','pg_temp' AS $$
BEGIN
  PERFORM public.cc_assert_permission('billing:read');
  RETURN coalesce((
    select sum(case when ts.status='active' then
      case when ts.billing_cycle='yearly' then round(coalesce(sp.yearly_price_inr,0)/12.0)
           else coalesce(sp.monthly_price_inr,0) end else 0 end)
    from public.tenants t
    join public.tenant_subscriptions ts on ts.tenant_id=t.id
    join public.subscription_plans sp on sp.id=ts.plan_id
    where (p_search is null or p_search='' or t.name ilike '%'||p_search||'%')),0)::numeric;
END; $$;

-- CC2 — enforce the documented "service_role only" for ALL THREE dashboard aggregators.
REVOKE EXECUTE ON FUNCTION public.compute_platform_dashboard()  FROM authenticated, anon, public;
REVOKE EXECUTE ON FUNCTION public.compute_razorpay_metrics()    FROM authenticated, anon, public;
REVOKE EXECUTE ON FUNCTION public.compute_analytics_overview()  FROM authenticated, anon, public;
-- (If the CC calls any of these with the operator's JWT rather than service_role, instead wrap the
--  body in a plpgsql guard: IF NOT public.is_platform_admin() THEN RAISE 42501. Verify CC call path.)

-- CC3 — audit-log writer is internal-only (definer callers run as postgres).
REVOKE EXECUTE ON FUNCTION public.log_platform_event(text,text,text,uuid,uuid,jsonb,jsonb,text) FROM authenticated, anon, public;
```

## Follow-ups
- **Global sweep (→ SECURITY_AUDIT.md):** enumerate **all** SECURITY DEFINER functions with
  `has_function_privilege('authenticated', …, 'EXECUTE')` that read cross-tenant/platform data and
  lack an internal gate — CC1/CC2/CC3 were found this way; a full pass belongs in the final audit.
- **Memory correction:** update `control-center-dashboard-rpc` — `compute_platform_dashboard` is **not**
  service_role-restricted at the grant level today (CC2).

## Completion gate
✅ Architecture + RBAC model read from live DB · ✅ All 37 `cc_*` RPCs swept for the permission assert
(found the 2 gaps) · ✅ Mutation plane verified non-escalatable · ✅ Documented; **CC1/CC2 P1 leaks +
CC3 proposed (top security priority of the pending bundle)**. No frontend change (defect is DB grants).
