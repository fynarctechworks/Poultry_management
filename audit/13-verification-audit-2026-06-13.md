# 13 — Independent Verification Audit (vs. "Full Audit & Rebuild" mission)

_Date: 2026-06-13. Auditor pass: live-system verification against the 9-phase rebuild mission brief._
_Method: read prior audit (`audit/00–12`) + execution logs (`execution/*`), then verified claims against the **live Supabase project** via advisors + SQL introspection. Findings below are evidence-backed, not template-derived._

---

## TL;DR — this is a verification + hardening job, not a rebuild

The mission brief is written as if PoultryOS were a broken/greenfield system. The repository contradicts that. The multi-tenant SaaS the brief asks me to *build* has **already been built and claimed-complete** across:

- `audit/00–12` — a 13-doc audit (2026-06-11)
- `execution/saas-upgrade-master-plan.md` — Phases A–E COMPLETE (tenant re-scope, billing, auth, onboarding, dashboard/analytics)
- `execution/control-center-master-plan.md` — Super Admin portal, 6 increments COMPLETE
- 52 migrations + 19 Edge Functions

So the honest deliverable is a **delta**: confirm what's real, expose what's claimed-but-unverified, and list the genuine remaining gaps. Each mission phase is mapped to verified status below.

**Headline verified facts (live DB, 2026-06-13):**
- ✅ **62/62 public tables have RLS enabled. Zero tables unprotected.** (the #1 multi-tenant fact)
- ✅ `tenant_id` present on **every** tenant-owned table; correctly absent only from genuinely global tables (`subscription_plans`, `integrators`, `market_prices`, `platform_*`, `tenants`).
- ✅ Security advisors: **0 ERROR**, 130 WARN.
- ⚠️ Performance advisors: 62 WARN / 61 INFO — real at-scale costs, not blockers.
- 🔴 **128 SECURITY DEFINER functions are executable by `anon`/`authenticated`** — incl. every Control Center admin mutator and a `dev_confirm_email` backdoor. This is the one finding that maps to the mission's stated threats (subscription bypass, admin abuse, privilege escalation). **Triage required — see SEC-1.**

---

## Phase-by-phase verification matrix

| Mission phase | Brief asks for | Verified current state | Verdict |
|---|---|---|---|
| **P1 Frontend audit** | routing/auth/forms/dead screens | `audit/01–05` cover this per-file; 23/23 screens routed both clients | ✅ Done (see prior docs) |
| **P1 Backend audit** | API arch, tenant isolation, race conditions | 19 Edge Functions; `audit/07` + webhook hardening pass | ✅ Mostly; SEC-1 + webhook re-verify outstanding |
| **P1 Database audit** | tables, indexes, FKs, constraints | `audit/08` + 52 migrations; **live: 26 unindexed FKs, 35 unused idx** | ⚠️ Index strategy gap (PERF-2) |
| **P2 Onboarding** | signup→verify→plan→pay→tenant→farm→dashboard | Phase D: atomic `create_tenant_onboarding` RPC + resume + first-success | ✅ Built; needs E2E re-verify |
| **P3 Multi-tenant isolation** | tenant_id everywhere, RLS enforced | **62/62 RLS on; tenant_id complete**; helpers `current_tenant_id/is_tenant_member/tenant_role/is_tenant_admin` exist | ✅ Verified at table level; SEC-1 caveat |
| **P4 Subscription/billing** | webhook-first, server-verified, Razorpay events | `billing_ledger`, `subscription_lifecycle`, `razorpay_webhook_events`, `payment_attempts`, signature verify | ✅ Built webhook-first; SEC-1 affects `cc_change_plan`/`provision_tenant_trial` |
| **P5 DB rebuild** | production schema, ERD | Schema already production-shaped (62 tables) | ➖ No rebuild needed; document ERD only |
| **P6 Security hardening** | RBAC, sessions, lockout, rate-limit, webhook sig | `auth_security_tables`, 2FA/TOTP, sessions, trusted devices, `log_auth_event` | ⚠️ Built; SEC-1 + leaked-password + rate-limit config to confirm |
| **P7 Super Admin Control Center** | tenants, billing, tickets, flags, audit, analytics | `saas-control-center/` + `platform_*` tables + `cc_*` RPCs, 6 increments | ✅ Built; SEC-1 is the lockdown gate |
| **P8 Performance** | queries, indexes, N+1, bundle | `audit/06`; **live advisor deltas below** | ⚠️ PERF-1/2/3 are concrete remaining work |

---

## SECURITY FINDINGS (live advisor + introspection)

Advisors: **130 findings, all WARN, 0 ERROR.**

> **Sprint progress (2026-06-13):** SEC-2 ✅ fixed · SEC-1 ✅ fixed (anon-executable SECURITY
> DEFINER funcs 55→14; all `cc_*` admin RPCs no longer anon-callable; RLS helpers intentionally
> retained — verified RLS still works) · SEC-3 ⚠️ local config hardened, **live dashboard toggle
> still required** · SEC-5 🆕 logged below (deferred). Migrations:
> `20260613170000_drop_dev_confirm_email_backdoor`, `20260613170001_revoke_anon_execute_on_privileged_functions`.

### 🔴 SEC-1 (HIGH) — 128 SECURITY DEFINER functions executable by anon/authenticated
55 are `anon`-executable. The set includes **every Control Center privileged mutator**:
`cc_activate_tenant`, `cc_suspend_tenant`, `cc_soft_delete_tenant`, `cc_restore_tenant`,
`cc_change_tenant_plan`, `cc_change_plan`, `cc_set_subscription_status`, `cc_reset_subscription`,
`cc_apply_tenant_discount`, `cc_extend_trial`, `cc_create_coupon`, `cc_create_plan`, `cc_set_flag`, …
plus `provision_tenant_trial`, `report_error`, `track_event`, and the tenant RLS helpers (`is_tenant_member`, `tenant_role`, …).

- **Why it matters:** the mission explicitly says "assume attackers are actively trying to break the platform" and to prevent *subscription bypass / admin abuse / privilege escalation*. These functions are the exact attack surface. They are presumably guarded internally by `cc_assert_permission`→`is_platform_admin()`, but **executability granted to `anon` is a defense-in-depth failure**: any function with a pre-check side effect, or any future edit that moves work before the assert, becomes directly exploitable by an unauthenticated caller. Established project rule (lessons L3) is to `REVOKE EXECUTE … FROM anon, authenticated, public` for SECURITY DEFINER functions not called via the public API. The newer tenant/billing/Control-Center batch never had L3 applied.
- **Fix:** triage all 128. RLS-helper/trigger functions → REVOKE from anon+authenticated+public (policy/trigger calls bypass grants). Admin RPCs called from the Control Center client → REVOKE anon, GRANT authenticated only, and confirm each asserts `is_platform_admin()` on line 1. **Each `cc_*` must be read to confirm the guard is first-statement.**

### 🔴 SEC-2 (HIGH, pre-launch landmine) — `dev_confirm_email()` is anon-executable
Confirmed live. An unauthenticated caller can self-confirm any email, bypassing verification. Flagged in prior memory as "DROP before launch" — still present and exposed. **Drop the function + unset `DEV_EMAIL_VERIFY` flags before any production traffic.**

### 🔴 SEC-6 (HIGH) — Webhooks fail OPEN when their secret is unset ✅ fixed
Both `razorpay-webhook` and `aisensy-webhook` accepted **unsigned** requests when
`RAZORPAY_WEBHOOK_SECRET` / `AISENSY_WEBHOOK_SECRET` were not configured ("pre-go-live"
convenience). In production that is a **subscription-bypass / payment-fraud** hole: a forged
`subscription.charged` activates a tenant for free; a forged `payment_link.paid` marks any invoice
paid; forged AiSensy inbound flips `whatsapp_opt_in` for any phone. This is the prior audit's
H2/G3, never closed on these two functions.
- **Fix applied (2026-06-13):** both now **fail CLOSED** — unset secret → 401, unless
  `ALLOW_UNSIGNED_WEBHOOKS=true` is explicitly set (dev-only). Signature path (constant-time HMAC,
  idempotency) was already correct.
- **REQUIRES (you):** (1) redeploy both edge functions; (2) set `RAZORPAY_WEBHOOK_SECRET` +
  `AISENSY_WEBHOOK_SECRET` as edge secrets (test-mode signs too); (3) leave `ALLOW_UNSIGNED_WEBHOOKS`
  unset everywhere except local dev. Until redeployed, the live functions still fail open.

### 🟡 SEC-3 (LOW) — Leaked-password protection disabled
`auth_leaked_password_protection` WARN. Enable HaveIBeenPwned check in Auth settings (1 toggle). Free.

### ➖ SEC-4 (accepted) — `extension_in_public` (pg_net)
Known/permanent on Supabase (lessons L5). Accept and document; not fixable.

### 🟡 SEC-5 (MEDIUM, deferred — needs pgTAP gate) — 84/92 RLS policies are scoped `TO public`
Live `pg_policies`: 84 policies apply to `{public}` (the default when no role is named), 7 to
`{authenticated}`, 1 to `{anon}` (the legitimate traceability lookup). `TO public` means the anon
role evaluates tenant-table policies (returning empty because the helper returns `false`), and is
*why* the anon EXECUTE grant on RLS helpers cannot be revoked yet (SEC-1 note). **Defense-in-depth
fix:** re-scope tenant-owned table policies `TO authenticated`, then revoke anon EXECUTE on the
tenant RLS helpers. This is also where PERF-1 (duplicate permissive policies) is resolved — do them
together. **Must be gated by pgTAP tenant-isolation tests** (this is the highest-risk change in the
backlog; a wrong policy = lockout or cross-tenant leak). Not attempted in this sprint.

---

## DATABASE / PERFORMANCE FINDINGS (live advisor)

Performance advisors: **123 findings (62 WARN / 61 INFO).**

> **Sprint progress (2026-06-13):** PERF-2 ✅ (`unindexed_foreign_keys` 26→0) · PERF-3 ✅
> (`auth_rls_initplan` 16→0) · PERF-1 ⏳ deferred (still 46, see SEC-5). `unused_index` rose
> 35→61 — benign, those are the 26 new FK indexes flagged unused on a near-empty DB; **do not
> drop**. Migration `20260613170002_perf_fk_indexes_and_rls_initplan_r2`.

### 🟡 PERF-1 — 46 × `multiple_permissive_policies`
Multiple permissive RLS policies on the same table/role/action are each evaluated per query — a tax that compounds at the "100k farms / millions of rows" scale the brief targets. Likely an artifact of the additive tenant re-scope layering new policies over old. **Fix:** consolidate per-(table,role,action) into single policies; verify isolation unchanged via pgTAP.

### 🟡 PERF-2 — 26 × `unindexed_foreign_keys` + 35 × `unused_index`
- Unindexed FKs cause seq-scan-on-delete/join penalties at scale → add covering indexes. (`audit/08` / migration `…_perf_fk_indexes` addressed v1 tables; the tenant/billing/CC tables added afterward regressed this.)
- 35 "unused" indexes are likely just un-exercised on a near-empty DB — **do not drop blindly**; re-evaluate against production query stats. Flag, don't act.

### 🟡 PERF-3 — 16 × `auth_rls_initplan`
RLS policies calling `auth.uid()` / helper functions per-row instead of `(select …)` once. Migration `20260522000005_perf_fk_indexes_and_rls_initplan` fixed the v1 set; the 16 remaining are on tables created after it. **Fix:** wrap calls in scalar subselects so the planner hoists them to an InitPlan.

---

## What is genuinely NOT done (true gaps, from prior audit, still open)

These are launch-ops / habit-features the prior `00-execution-plan` flagged and that no execution log closed:
1. **No git remote / CI** at mission start (repo is now git-tracked locally; CI workflows not confirmed).
2. **`fetch-market-prices` Edge Function + daily cron** — the missing habit-forming feature.
3. **Sentry / error monitoring** on web + Expo (DB `platform_errors` exists; client SDK wiring unconfirmed).
4. **EAS production build + Play internal track + Vercel prod** config.
5. **Partial-payment money math** (`amount_paid` column) — verify this landed (billing_ledger pass may cover it; re-check).

---

## Recommended next action (the approval gate)

Do **not** rebuild. Execute a focused **Verify-and-Harden sprint**, in this order:

1. **SEC-2** drop `dev_confirm_email` (1 migration, minutes) — pre-launch landmine.
2. **SEC-1** triage + REVOKE/GRANT the 128 SECURITY DEFINER funcs + confirm every `cc_*` asserts admin first (1 migration + read-through). **Highest-value security work.**
3. **SEC-3** enable leaked-password protection (toggle).
4. **PERF-1/2/3** RLS policy consolidation + FK indexes + initplan wrap (1–2 migrations) — pure win, no behavior change.
5. **Re-verify** the claimed-complete flows. NOTE: a pgTAP suite already exists under `tests/db/`
   (incl. `tenant_isolation.test.sql`, `billing_subscription.test.sql`, `platform_rbac_audit.test.sql`,
   `tenant_ops_suspension.test.sql`, +20 more) — so the isolation gate is in place, not missing.
   Gaps to add: a fail-closed webhook test (unsigned → 401, post SEC-6) and an onboarding
   force-fail rollback assertion. Run the suite in CI (currently no CI — prior audit Sprint 0.2).
6. Then resume the prior `00-execution-plan` launch-ops backlog (CI, market-prices cron, Sentry, EAS).

Everything in steps 1–4 is verifiable, low-risk, and directly answers the mission's security/multi-tenant/billing/performance phases against the *actual* system.
