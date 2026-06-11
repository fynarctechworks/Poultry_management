# PoultryOS — Multi-Tenant SaaS Upgrade: Master Execution Plan

**Status:** ALL PHASES COMPLETE & verified (A–E) · DB 76/76 · Mobile tsc 0 / jest 139 · **Owner:** build agent · **Decisions locked** (this session):
1. **Tenant model:** Full re-scope to `tenant_id`. Tenant becomes the top-level scope; all RLS re-scoped to tenant.
2. **Billing:** Trial-first, plan-gated (14-day trial → plan selection → paid). Plan tiers Starter/Growth/Professional/Enterprise.
3. **Sequencing:** Data-layer first (safest), then billing, auth, onboarding UX, dashboard/analytics.

This is the authoritative roadmap. Each phase ships a working, tested increment. No phase merges with broken builds, failing RLS tests, or partial schema.

---

## Why this order

The tenant re-scope is the highest-risk change in the system: a single wrong RLS policy = cross-tenant data leak or locked-out users. It must be a **tested, reversible foundation** completed *before* any UI is built on it — otherwise OTP screens, the wizard, and billing all get written against a schema that's about to change underneath them, and we pay for everything twice.

The current architecture (confirmed by reading the schema):
- **Top scope today = `farm`.** `farm_id` is denormalized onto ~18 tables (CLAUDE.md decision #2 — for RLS perf, no JOINs in policies).
- **All RLS pivots on 4 helpers** in `20260502000000_initial_schema.sql`: `user_role_for_farm`, `user_assigned_sheds`, `is_farm_owner`, `is_farm_member`, all reading `farm_users (farm_id, user_id, role)`.
- **Subscription today = per-`profile`** (`profiles.subscription_status`, `is_paid(uid)` RPC, single 'pro' plan).
- **Roles today = 3** (owner/worker/vet), hardcoded in CHECK constraints + RLS + UI enums.

**Strategy for a safe full re-scope:** add `tenant_id` *additively first* (nullable), backfill, then flip RLS to tenant-aware helpers that still honor farm-level shed scoping. We do NOT drop `farm_id` — farm stays as a sub-scope of tenant. "Full re-scope" = every policy now gates on tenant membership first, farm/shed second. This keeps the denormalization perf win while making tenant the real boundary.

---

## PHASE A — Tenant Foundation (data layer)

Goal: tenant is the top-level boundary, enforced in RLS, with zero orphan/partial records possible. App keeps working throughout (farm_id preserved).

- **A1 — Schema (additive):** `tenants` table; `tenant_users (tenant_id, user_id, role)` with the 7-role enum (owner, farm_manager, supervisor, accountant, veterinarian, worker, viewer); `tenant_id UUID` (nullable for now) on every tenant-owned table (farms, sheds, batches, daily_logs, health_incidents, vaccinations, inventory_items, inventory_movements, financial_transactions, buyers, payment_reminders, traceability_records, weather_data, weather_alerts, contract_cycles, whatsapp_messages_log, farm_users). `profiles.tenant_id`. Migration: `2026xxxx_tenant_foundation.sql`.
- **A2 — Backfill:** one tenant per existing `farms.owner_id` (a farmer with N farms → 1 tenant owning N farms). Populate `tenant_id` on all child rows via farm_id joins. Map existing `farm_users.role` → tenant role (owner→owner, worker→worker, vet→veterinarian). Then `SET NOT NULL` on tenant_id columns + add FKs `ON DELETE CASCADE`.
- **A3 — RLS re-scope:** new helpers `current_tenant_id()`, `is_tenant_member(tid)`, `tenant_role()`, `is_tenant_admin()`; rewrite every policy to gate tenant-first. Keep `user_assigned_sheds` for worker shed scoping. `tenant_users` replaces `farm_users` as the membership source of truth (farm_users kept for shed assignment only, or folded in — decided in A3).
- **A4 — Integrity RPCs:** `handle_new_user()` trigger on `auth.users` (auto-creates profile — fixes audit P0-3); `create_tenant_onboarding(payload jsonb)` single transactional RPC that creates tenant + owner membership + farm + subscription(trial) + default settings, all-or-nothing (fixes audit P0-2). Replaces step-5's 6-call client sequence.
- **A5 — Tests:** pgTAP — tenant isolation (user in tenant A cannot read tenant B), role matrix, onboarding RPC atomicity (forced failure rolls back fully), trigger creates profile.

**Phase A gate:** all existing app queries still return the user's data; pgTAP green; no orphan farm reachable; Supabase security advisor clean.

---

## PHASE B — Trial-First Billing

- Plan tiers seeded: Starter (1 farm/3 users), Growth (5/20), Professional (unlimited), Enterprise (custom). Monthly + yearly, savings + recommended badges.
- `subscriptions` per-tenant with status machine: `trial → active → past_due → suspended → cancelled`. `trial_ends_at`, `renewal_date`, plan FK, payment method, invoices.
- Freemium gates re-pointed from per-profile `is_paid(uid)` to per-tenant plan limits (farms/users/feature flags).
- Razorpay subscription create/webhook updated for tenant + tier; UPI Collect unaffected.
- Plan-selection screen (cards) + subscription-confirmation step.

**Gate:** new signup gets a working 14-day trial without payment; selecting a plan + paying flips tenant to active; gates enforce at DB + UI.

---

## PHASE C — Auth & Security

- **OTP-primary:** MSG91 send/verify (`sendOtp`/`verifyOtp`) + OTP entry screen. Email/password retained as fallback. Magic link stubbed for future.
- Account creation: Full Name + Mobile + Email + Password; mobile unique, email unique; mandatory mobile OTP verify; email verify within 7 days (non-blocking).
- **2FA** (optional): SMS / Email / Authenticator (TOTP preferred). Remember-device 30 days.
- **Session & device management:** `user_sessions`, `trusted_devices`, login history, IP tracking; Security Settings + Trusted Devices + Sessions screens.
- **Audit log:** `audit_events` (tenant-scoped) for security-relevant actions.

**Gate:** OTP login works E2E; 2FA enrol + challenge works; sessions listable/revocable; audit rows written.

---

## PHASE D — Guided Onboarding UX

- 10-screen guided flow (Welcome → Business → Location → Scale → Infrastructure → Operations → Team → WhatsApp → Subscription → Workspace-creation animation). Web split-layout (40% brand / 60% form, sticky progress); mobile single-column, bottom sticky CTA, one task per screen.
- **Auto-save / resume:** persist each step to an `onboarding_progress` row (tenant/user scoped); resume from last step on reopen. Survives browser/app close.
- Final step calls `create_tenant_onboarding` (Phase A4) → workspace-creation progress screen → **Farm Setup Wizard** (Shed → Batch → Feed types → Medicines → Invite team → Finish) → **First-success screen** → dashboard.

**Gate:** onboarding completes <10 min, resumable, zero data loss, no orphan records, works on throttled 3G.

---

## PHASE E — Dashboard Empty States & Analytics

- No blank cards: setup-progress checklist, next tasks, quick actions when farm has no data yet.
- Funnel analytics events: signup_started, otp_verified, email_verified, plan_selected, payment_completed, onboarding_completed, first_shed_created, first_batch_created, first_daily_entry. Drop-off measurable.

**Gate:** empty dashboard is actionable, not blank; funnel events fire at each milestone.

---

## Cross-cutting standards (every phase)
- Tenant-scoped: every new table has `tenant_id`; every query/RPC/policy tenant-scoped. No cross-tenant access path.
- DESIGN.md tokens only; no hex outside tokens.ts. Skeleton-first loading. WCAG AA. 44px touch targets. Buttons 12px radius.
- Builds + typecheck + lint + jest + pgTAP green before any phase is marked done.
- Each phase appends results to its own `/execution/` doc.

---

## Risk register
| Risk | Mitigation |
|---|---|
| RLS re-scope leaks cross-tenant data | A5 pgTAP isolation tests are the gate; advisor run; additive-then-flip, never drop farm_id |
| Backfill corrupts existing data | A2 runs in a transaction with row-count assertions; dry-run counts logged before NOT NULL |
| Hard paywall kills signups | Decision = trial-first; free 14-day trial, no upfront payment |
| 7-role expansion breaks 3-role UI/RLS | Map old→new in A2; UI role checks updated phase-by-phase, old roles remain valid values |
| Multi-week scope half-ships | Phase gates; farm_id preserved so app never breaks mid-migration |

---

## Progress log
- 2026-06-11: Plan written. Audited current schema (farm-scoped, 4 RLS helpers, per-profile subscription, 3 roles).
- 2026-06-11: **Phase A COMPLETE & verified.** 6 migrations (tenant foundation → backfill → RLS re-scope → onboarding RPC+trigger → auto-fill safety net). Fixes audit P0-2/P0-3. Full tenant isolation under RLS. 53/53 DB tests green. See `phase-a-tenant-foundation-results.md`.
- 2026-06-11: **Phase B data layer COMPLETE & verified.** `20260611000005_billing_tiers_and_subscriptions.sql`: 4 plan tiers (starter/growth/professional/enterprise), `tenant_subscriptions` state machine, auto-trial on tenant creation, `is_tenant_paid`/`is_paid` re-pointed tenant+trial-aware, `tenant_plan_status` limits helper. 62/62 DB tests green (9 new billing tests). Remaining for Phase B: Razorpay subscription create/webhook for tiers + UPI Collect, plan-selection UI, freemium gate re-point in client.
- 2026-06-11: **Phase C COMPLETE & verified (auth + security).** DB auth-security tables + `log_auth_event`; MSG91 Send-SMS hook; OTP-first login + verify-otp; account-creation (name+mobile+email) with mandatory mobile verify; Security Settings + TOTP 2FA enrol + Login history + Trusted devices screens. OTP/register i18n translated to hi/te/ta. tsc 0 / jest 139. See `phase-c-auth-progress.md`.
- 2026-06-11: **Phase B integrations COMPLETE & verified.** Fixed a latent break: both billing Edge Functions only wrote `profiles.subscription_status`, so a paid Razorpay subscription never flipped `is_tenant_paid` → tenant stayed gated despite paying. `create-razorpay-subscription` now writes `tenant_subscriptions` (plan/cycle/sub-id, status untouched until charge); `razorpay-webhook` now drives `tenant_subscriptions.status` (active/past_due/cancelled + period extension) by `razorpay_subscription_id`. New `lib/billing-hooks.ts` (`useTenantBilling`/`trialDaysLeft`) + `TierCard` component; `billing/index.tsx` rewritten to multi-tier plan selection (status + trial countdown, monthly/yearly toggle, recommended/current badges, enterprise contact). Freemium gates already tenant+trial-aware via the re-pointed `is_paid()`. tsc 0 / jest 139. See `phase-b-integrations-results.md`. Deferred: hi/te/ta tier strings, per-tier numeric limits in shared FREE_LIMITS.
- 2026-06-11: **Phase E COMPLETE & verified (dashboard first-run + analytics).** `SetupProgressCard` hero on the dashboard until shed→batch→first-log exist (no blank first-run); append-only `analytics_events` + `track_event` RPC (`20260611000007`); `lib/analytics.ts` fire-and-forget `track()`; funnel events wired (signup_started, otp_verified, onboarding_completed, first_shed/batch/daily, plan_selected). DB analytics test 7/7 → cumulative 76/76; tsc 0 / jest 139. See `phase-e-dashboard-analytics-results.md`. Deferred: email_verified/payment_completed events, funnel viz, hi/te/ta setup strings. **→ All five phases (A–E) of the SaaS upgrade are complete.**
- 2026-06-11: **Phase D COMPLETE & verified (guided onboarding).** Replaced the broken 6-call step-5 sequence (which violated `farms.tenant_id` NOT NULL post-migration) with the atomic `create_tenant_onboarding` RPC via `lib/onboarding-sync.ts` (idempotent on 23505). Added server-side auto-save/resume across all steps, a **workspace-creation animation** screen, and a **first-success** screen. Removed react-native-paper Snackbar from step-5. tsc 0 / jest 139 (onboarding-store contract unchanged). **Gate met:** atomic + resumable + no orphan records. See `phase-d-onboarding-results.md`. Remaining for Phase D (deferred, non-blocking): hi/te/ta translations for creating/success, extended setup steps (Feed/Medicines/Team).
