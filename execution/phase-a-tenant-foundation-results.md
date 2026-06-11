# Phase A — Tenant Foundation: Results

**Status:** ✅ Complete & verified · **Date:** 2026-06-11

## What shipped
| Migration | Purpose |
|---|---|
| `20260611000000_tenant_foundation.sql` | `tenants`, `tenant_users` (7-role), `onboarding_progress`; nullable `tenant_id` on 17 tenant-owned tables |
| `20260611000001_tenant_backfill.sql` | One tenant per existing owner; backfill all child rows via farm_id; assertions; then `SET NOT NULL` + FK `ON DELETE CASCADE` + per-table tenant_id index |
| `20260611000002_tenant_rls_rescope.sql` | Tenant helpers (`is_tenant_member`, `tenant_role`, `is_tenant_admin`, `is_tenant_money`); every policy re-gated tenant-first while preserving farm/shed/role logic |
| `20260611000003_onboarding_rpc_and_trigger.sql` | `handle_new_user()` trigger (auto-profile) + atomic `create_tenant_onboarding(jsonb)` RPC |
| `20260611000004_autofill_tenant_id.sql` | BEFORE INSERT trigger on 16 child tables: derives `tenant_id` from `farm_id` when not supplied — keeps all existing client + Edge-Function insert sites working with zero code changes |

## Audit P0s fixed (proven by tests)
- **P0-3** (missing profile on signup): `handle_new_user` trigger → test T1/T2 green.
- **P0-2** (orphan farm from non-atomic onboarding): `create_tenant_onboarding` is one transaction; forced failure rolls back fully → test T7/T8 green (no orphan tenant left behind).

## Verification (local Supabase, Docker)
- `supabase db reset` — all 30 migrations apply cleanly, including the 4 new ones.
- **Full DB test suite: 52/52 passing, 0 failures.**
  - `tenant_isolation.test.sql` — **12/12** (trigger, RPC atomicity, cross-tenant SELECT denial on farms/tenants/memberships).
  - `onboarding_smoke.test.sql` — 10/10 (regression: legacy farm-scoped RLS still works under the tenant gate; fixtures made tenant-aware).
  - `mortality_spike_trigger.test.sql` — 6/6 (regression; fixtures tenant-aware).
  - `custom_integrator_rpc` 12/12, `inventory_feed_deduct` 6/6, `update_vet_note_rpc` 6/6 — unchanged, still green.
- Structural check: every `tenant_id`-bearing table has RLS enabled; `tenants`/`tenant_users`/`onboarding_progress` all RLS-on.

## Key design decisions
- **Additive-then-flip**, never drop `farm_id`. Farm remains a sub-scope of tenant, preserving the denormalized-farm_id RLS-perf decision (CLAUDE.md #2). "Full re-scope" = tenant membership is the outer gate on every policy.
- **7-role model** via `tenant_users.role` CHECK; legacy 3 roles mapped in backfill (owner→owner, worker→worker, vet→veterinarian). `farm_users` retained for shed-level assignment.
- **Role buckets in RLS:** `is_tenant_admin` (owner/farm_manager) for structural+ops writes; `is_tenant_money` (owner/farm_manager/accountant) for financials/buyers/contracts/whatsapp log. Existing owner/worker/vet farm-level paths preserved underneath.
- Existing customers grandfathered to `status='active'`; new signups default `trial` (Phase B owns the state machine).

## Fixture changes required by the schema shift (expected, not bugs)
- `mortality_spike_trigger.test.sql` + `onboarding_smoke.test.sql`: added tenant + `tenant_users` + `tenant_id` to all farm-bound inserts. Surfaced two pre-existing latent bugs in `onboarding_smoke` (invalid hex UUID `…s1`; missing `current_bird_count` on a NOT NULL column) — both fixed. Confirms the audit's "no CI" finding: these tests weren't being run.

## Follow-ups deferred to later phases (tracked)
- **App code still queries `farm_users`/`farms` directly** for the user's scope (e.g. `app/_layout.tsx` farm hydration). Works today (farm_users intact), but Phase D will switch the client to tenant-aware hydration + the new onboarding RPC.
- **`is_paid(uid)` is still per-profile.** Phase B re-points freemium gating to per-tenant plan + trial.
- **Edge Functions / existing client inserts** that set only `farm_id`: ✅ **Resolved by migration A6** (`fill_tenant_id_from_farm` BEFORE INSERT trigger). No code changes needed; proven by test T13 (insert with only farm_id → tenant_id auto-populated). New code may still set tenant_id explicitly.

## Final verification
- **DB test suite: 53/53 passing, 0 failures** (added T13 auto-fill proof).
- All 31 migrations apply cleanly via `supabase db reset`.

## Next
Phase B — trial-first billing: plan tiers (Starter/Growth/Professional/Enterprise), per-tenant subscription state machine (trial→active→past_due→suspended→cancelled), and re-point `is_paid` from per-profile to per-tenant + trial-aware.
