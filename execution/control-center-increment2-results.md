# Control Center — Increment 2 (Tenant Management) · Results

**Status:** COMPLETE & verified · **Date:** 2026-06-11
**Builds on:** Increment 1 (platform RBAC + immutable audit).

## What shipped

### Database — `20260611000010_tenant_ops.sql` (applied + tested on local stack)
- **Lifecycle columns** on `tenants`: `suspended_at`, `suspended_reason`, `deleted_at` (soft delete), `health_score` + `mrr_inr` (cached, populated in Increment 4). Indexes on `status`, `deleted_at`.
- **Suspension enforcement with teeth** — the load-bearing change: `is_tenant_member()` is now status-aware (`status <> 'suspended' AND deleted_at IS NULL`). Because every tenant-owned table's RLS gates on `is_tenant_member()` first, one helper change makes a suspended/soft-deleted tenant go dark across **all ~18 tables at once** — no per-table edits.
- **Owner recovery paths**: owner-direct SELECT policies on `tenants` and `tenant_subscriptions` (OR'd with the member policy) so a suspended owner can still see status + billing and self-recover. Workers/members stay fully blocked.
- **Guarded, audited RPCs** (SECURITY DEFINER, call with the operator JWT — each re-checks `platform_has_permission('tenant:manage')` via `cc_assert_permission` and writes an immutable audit row in the same transaction):
  `cc_suspend_tenant`, `cc_activate_tenant`, `cc_soft_delete_tenant`, `cc_restore_tenant`, `cc_extend_trial`, `cc_change_plan`, `cc_reset_subscription`. Granted to `authenticated`, revoked from `anon`.

### Web (`/admin/tenants`)
- `lib/control/tenants.ts` — server actions wrapping the cc_* RPCs (operator session) + **audited impersonation** via the admin API (generates a one-time magic-link sign-in for the tenant owner; mandatory reason; logged).
- `app/admin/tenants/page.tsx` — tenant list: name, owner, plan, status, MRR, created; name search; total MRR.
- `app/admin/tenants/[id]/page.tsx` — detail with tabs **Overview / Subscription / Users / Farms / Activity** (per-tenant audit trail). Action buttons shown only when the operator holds `tenant:manage`.
- `components/control/TenantActions.tsx` — suspend/activate/soft-delete/restore/extend-trial/change-plan/reset-subscription/impersonate, with reason modals on destructive + impersonation actions.
- `components/control/TenantStatusBadge.tsx`, sidebar Tenants flipped to `ready`.

## Verification
- pgTAP `tests/db/tenant_ops_suspension.test.sql` — **8/8 green**: worker is a member pre-suspend; read-only operator forbidden from suspending (42501); super-admin suspends; **suspension audited**; worker loses membership + all tenant data dark; **suspended owner keeps recovery read**; activation restores membership.
- Regression: existing `tenant_isolation` (13), `billing_subscription` (9), `onboarding_smoke` (10) — all still green after the `is_tenant_member` change.
- Web `npm run typecheck` — **exit 0**.

## Gate (from master plan) — MET
> Suspend a tenant → its users blocked in the customer app within one session; all actions audited.
Proven at the RLS layer (T5/T6) and the audit layer (T4). The customer app reads through the same RLS, so a suspended tenant's members get empty results on their next request — no client change needed.

## Honest caveats / deferred
- **Impersonation** uses a real owner magic-link session (audited). There is no in-app "you are impersonating" banner yet — that needs customer-app awareness and lands with Increment 6 (realtime/flags wiring). Treat the link as a genuine owner login until then.
- `mrr_inr` / `health_score` columns exist but are computed live in the list for now; cached population + the Revenue/Health dashboards are Increment 4.
- Access **management** writes (add/remove operators, edit roles) still deferred to a later pass; the cc_* guarded-action pattern established here is the template.
