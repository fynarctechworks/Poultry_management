# Control Center — Increment 1 (Foundation + RBAC + Audit) · Results

**Status:** COMPLETE & verified · **Date:** 2026-06-11
**Decisions (locked this session):** CC lives in the existing Next.js app under `/admin`; cross-tenant access via service-role server actions behind an audited guard; first pass = Increment 1 only.

## What shipped

### Database (2 migrations, applied + tested on local stack)
- `20260611000008_platform_rbac.sql` — operator plane above tenant RLS:
  - `platform_roles` (12 seeded), `platform_permissions` (21 seeded, incl. `*` wildcard), `platform_role_permissions` (DB-driven grants), `platform_admins`.
  - Helpers `is_platform_admin(uid)`, `platform_has_permission(perm, uid)` (SECURITY DEFINER, `search_path` set).
  - RLS: catalog readable by active operators; `platform_admins` read gated to `access:read`; **all writes service-role only** (no write policies).
  - `platform_bootstrap_super_admin(email)` — one-time cold start; refuses once any admin exists; service-role only.
- `20260611000009_platform_audit.sql` — `platform_audit_events`:
  - Append-only + **immutable**: `BEFORE UPDATE OR DELETE` trigger hard-rejects (verified), no write policies (service-role insert only), read gated to `audit:read`.
  - `log_platform_event(...)` SECURITY DEFINER writer for in-transaction audit from RPCs.

### Web (`/admin` route group)
- `lib/control/serviceClient.ts` — server-only service-role client (throws if imported in browser).
- `lib/control/guard.ts` — `getPlatformContext()` (layout gate) + `requirePlatformPermission(perm)` (throws `PlatformForbiddenError`).
- `lib/control/audit.ts` — `audit(ctx, input)` writer (IP/UA from headers; throws if the audit write fails — never silent).
- `components/control/AdminShell.tsx` — sidebar (full module map; unbuilt items tagged "soon"), topbar with global search + notification center + admin profile/sign-out.
- `components/control/Forbidden.tsx` — 403 surface.
- `app/admin/layout.tsx` — hard gate (non-operators → `/multi-farm`).
- `app/admin/page.tsx` — operations overview (live tenant/operator/audit counts + recent activity).
- `app/admin/audit/page.tsx` — immutable audit explorer (gated `audit:read`).
- `app/admin/access/page.tsx` — operators + roles + permission count (gated `access:read`).
- `.env.example` — added `SUPABASE_SERVICE_ROLE_KEY` (server-only).

## Verification
- pgTAP `tests/db/platform_rbac_audit.test.sql` — **12/12 green** on the live local DB (`supabase_db_…`): bootstrap once-only, wildcard resolution, read_only scoping, non-operator denial, RLS on `platform_admins`, audit UPDATE/DELETE rejection.
- Web `npm run typecheck` — **exit 0**.
- Standards: RLS enabled on all 5 new tables; every non-trivial function has `SET search_path`; service-role client is server-only.

## Operator activation (run once after deploy)
1. Set `SUPABASE_SERVICE_ROLE_KEY` in the web env.
2. Ensure the intended operator has an `auth.users` row (normal signup).
3. `SELECT public.platform_bootstrap_super_admin('operator@poultryos.app');` (service role / SQL editor).
4. Visit `/admin`.

## Deferred to later increments (by design)
- Tenant management + lifecycle actions + impersonation (Increment 2).
- Dynamic plans, discounts, revenue, support, success/health, errors, flags, system monitoring (Increments 3–6).
- Access **management** (create/edit roles, add/remove admins) — read-only for now; the write actions + RPCs land with Increment 2's guarded-action pattern.
- Global search wiring + notification center data (currently shell placeholders).
