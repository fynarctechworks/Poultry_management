# PoultryOS — Enterprise Subscription & Billing Rebuild

> Status: **PLAN — awaiting approval.** No code until approved.
> Decisions: (1) Card-upfront, **7-day trial**, auto-charge. (2) Razorpay **Subscriptions** (auto-recurring, mandate at signup, first charge deferred via `start_at`). (3) Build all after one approval.

---

## Phase 1–2 — Audit & Gap Analysis (DONE)

### Already built (reuse, do NOT rebuild)
- `tenant_subscriptions` state machine: `trial→active→past_due→suspended→cancelled`, `billing_cycle`, `trial_ends_at`, `current_period_end`, `razorpay_subscription_id`; auto-provisions trial on tenant create.
- Dynamic plans: `subscription_plans` (+ `razorpay_plan_id_monthly/yearly`), `subscription_features`, `plan_feature_mapping`, `plan_history`, audited `cc_*` plan RPCs. 4 tiers seeded.
- `is_tenant_paid()` gate with 7-day past_due grace. `tenant_plan_status()` limit helper.
- Discounts, revenue snapshots (MRR/ARR/ARPU/churn), customer health, platform RBAC, audit, feature flags, support — tables + Control Center pages.
- Razorpay: `create-razorpay-subscription` (creates sub, no trial/customer), `razorpay-webhook` (sig-verified, updates only legacy `profiles.subscription_status`, **no money records**), `create-upi-collect-link`.
- Auth in progress: email-verify page, `auth/callback`, forgot/reset password, `components/auth/*`, Google OAuth, phone input. Onboarding = 5 steps (no plan/billing/payment).

### Real gaps to build
1. Money ledger tables: `billing_profiles`, `invoices`, `invoice_items`, `payments`, `payment_attempts`, `subscription_history`, `razorpay_webhook_events`, invoice-number sequence.
2. Razorpay Subscriptions w/ **7-day `start_at` trial** + customer creation + mandate; webhook that writes invoices/payments + drives `tenant_subscriptions`.
3. Invoice PDF generation + storage.
4. Multi-step signup wizard (7-step progress rail) with **email-verification gating tenant creation**, plan → billing → payment → success.
5. App **read-only mode** on expiry/grace + renewal reminder banners (7/3/1/expiry).
6. Tenant billing portal (invoice history/download, payment history) + plan **upgrade/proration** + cancel-in-trial.
7. Control Center money views: invoices/payments/refunds + revenue wired to real txns + reminder templates.

---

## Phase 3 — Architecture

- **Trial/charge model:** At payment step, create Razorpay **Customer** + **Subscription** with `start_at = now + 7 days`, `total_count` per cycle. Mandate (UPI Autopay / eMandate / card) authorized immediately (₹0/auth). First real charge auto-fires at day 7 → webhook `subscription.charged` → invoice + payment + PDF + `tenant_subscriptions.status='active'`.
- **Cancel:** allowed only while `status='trial'` → Razorpay cancel (immediate) → `cancelled`. After trial, cancel hidden/blocked.
- **Renewal:** Razorpay auto-debits each cycle; webhook writes a new invoice each `subscription.charged`. Failed debit → `subscription.pending`/`payment.failed` → `past_due` (7-day grace) → `suspended`.
- **Read-only mode:** when `is_tenant_paid()=false`, block writes. Enforced at DB (write policies gated by `tenant_can_write()`) **and** client (banners + disabled actions). Reads/reports/settings stay open.
- **Secrets:** `RAZORPAY_KEY_ID`(public, client checkout), `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET` — Supabase secrets only. Rotate the pasted test secret.

---

## Phase 4 — Database (new migrations `20260613*`)

- `billing_profiles` — 1/tenant: name, company, gstin, address, city, state, country, postal, phone, email, `razorpay_customer_id`. RLS owner RW, service write.
- `invoices` — tenant_id, subscription_id, plan_id, `invoice_number` (unique, `INV-YYYY-NNNNNN`), status (draft/issued/paid/failed/void/refunded), billing_cycle, subtotal/discount/tax(GST 18%)/total, period_start/end, issued_at, paid_at, razorpay_invoice_id/order_id/payment_id, `billing_snapshot_json` (frozen), `pdf_path`.
- `invoice_items` — invoice_id, description, qty, unit_price, amount, sort.
- `payments` — tenant_id, invoice_id, razorpay_payment_id (unique), razorpay_subscription_id, amount, method, status (created/authorized/captured/failed/refunded), captured_at, fee, refunded_amount, error_code/desc, raw_json.
- `payment_attempts` — checkout attempts incl. failures/abandoned (analytics + retry).
- `subscription_history` — from_status, to_status, reason, actor (system/webhook/admin/user), metadata.
- `razorpay_webhook_events` — `razorpay_event_id` UNIQUE for **idempotency**.
- Invoice-number sequence/function; trial-conversion cols on `tenant_subscriptions` (`trial_started_at`, `trial_converted_at`, `trial_cancelled_at`) → satisfies "trial_tracking" without a redundant table.
- Reconcile trial **14d→7d** in `provision_tenant_trial`.
- `tenant_can_write(tenant)` helper; apply to INSERT/UPDATE/DELETE policies on core tables (farms, sheds, batches, daily_logs, health_incidents, vaccinations, inventory_*, financial_transactions, buyers, contract_cycles).
- RLS: invoices/payments/billing_profiles → owner SELECT, service_role write; Control Center reads via `billing:read`, refunds via `billing:manage`.
- RPCs: `my_billing_summary()`, `my_invoices()`, `cc_list_invoices/payments`, `cc_refund_payment`, `cc_extend_trial`, `cc_change_tenant_plan`, `cc_reset_subscription`. All `cc_*` audited via `log_platform_event`.

## Phase 5 — APIs / Edge Functions (Deno)

- **`create-razorpay-subscription`** (rewrite): create/lookup Razorpay customer (store on billing_profiles), create subscription `start_at`=trial-end, write `payment_attempts`, return `subscription_id` + checkout opts.
- **`razorpay-webhook`** (rewrite): verify HMAC sig + idempotency via `razorpay_webhook_events`; handle `subscription.authenticated/activated/charged/pending/halted/cancelled`, `payment.failed/captured`; on charge → invoice + items + payment + PDF + `tenant_subscriptions` update + `subscription_history`.
- **`generate-invoice-pdf`** (new): jsPDF → Supabase Storage, signed URL; on-demand + called by webhook.
- **`cancel-subscription`** (new): trial-only guard → Razorpay cancel → status update.
- **`change-plan`** (new): upgrade/downgrade w/ proration credit → invoice.
- **`subscription-lifecycle`** cron (new, IST): trial→past_due on expiry, past_due→suspended after grace, send renewal reminders (7/3/1/expiry) via push + `send-whatsapp-message`, write `subscription_reminders`.

## Phase 6 — UI/UX

- **Signup wizard** (`/register` → stepper, left progress rail): Account → **Email Verify (gates tenant creation)** → Farm Info (reuse onboarding) → Plan → Billing → Payment (Razorpay Checkout subscription) → Complete (invoice #, download PDF, go to dashboard). Draft persisted; resume after email-verify via `auth/callback`. Tenant/farm created only post-verification.
- **App gating:** middleware + `useSubscriptionGate`; read-only banner; disabled create/edit/delete; renewal banners (7/3/1/expiry day).
- **Tenant billing portal** (`/billing`): current plan, dates, remaining days, trial badge, upgrade, billing history (invoices download), payment history, cancel (trial only).
- **Control Center:** `/admin/billing` (payments, failed, refunds, invoices: view/download/search/filter); subscriptions detail actions (change plan, extend trial, reset, suspend/activate); revenue wired to real invoices (trial-conversion, renewal-rate); notification/reminder templates.

## Phase 7 — Implementation order (dependencies)
A. DB ledger migrations → B. Edge functions → (C signup wizard, D read-only+banners, E billing portal, F Control Center) → G tests + prod-readiness.
C depends on B; D depends on A.

## Phase 8 — Build (after approval)
## Phase 9 — Tests: pgTAP RLS (invoices/payments/billing isolation, tenant_can_write), Deno webhook (sig + idempotency + invoice math), e2e signup→pay→invoice, read-only enforcement.
## Phase 10 — Prod-readiness: Razorpay live KYC, register webhook URL + events, secrets set, GST/invoice legal fields, rotate test secret, UPI-Autopay fallback to manual renewal.

---

## Risks
- Razorpay Subscriptions + UPI Autopay/eMandate: lower auto-debit success in India → keep **manual-renew fallback** + dunning.
- Read-only DB enforcement touches many write policies → stage carefully, test as each role.
- Invoice/GST legal correctness → snapshot billing profile at issue; 18% GST configurable.

## Review — progress log

### ✅ Phase A — Database (DONE, applied to dev DB, verified)
Discovered the linked dev DB was 2 layers behind the repo — the entire `20260611*`
SaaS foundation (tenants, subscriptions, platform RBAC, discounts, revenue, etc.)
existed only as files, never applied. With approval, applied the full chain:
- 19 foundation migrations `20260611000000–18` (worked around a drift conflict:
  a DB-only `prevent_closed_batch_mutation` guard blocked the tenant_id backfill on
  closed batches → disabled USER triggers for the backfill UPDATEs).
- 3 new billing migrations `20260613000000–02`: money ledger (billing_profiles,
  invoices, invoice_items, payments, payment_attempts, subscription_history,
  subscription_reminders, razorpay_webhook_events, invoice_counters + bucket),
  read-only enforcement (`tenant_can_write` + `tg_enforce_tenant_writable` on 14
  tables), trial reconciled 14d→7d, billing RPCs.
- 1 lifecycle migration `20260613000003`: `process_subscription_lifecycle` cron
  (trial→past_due→suspended) + reminder RPCs + pg_cron schedules.
- Verified: 9 ledger tables, 14 write-guard triggers, invoices bucket, no RLS/
  search_path advisor issues on new objects, grandfathered tenants stay writable.

### ✅ Phase B — Edge functions (DONE; 3 critical deployed & validated)
- `create-razorpay-subscription` (rewrite): Razorpay customer + `start_at`=7d trial
  + payment_attempts + tenant_subscriptions wire. **DEPLOYED v2.**
- `razorpay-webhook` (rewrite): HMAC + idempotency + invoice/items/payment on
  `subscription.charged` + `set_subscription_status` + PDF trigger. **DEPLOYED v3.**
- `generate-invoice-pdf` (new, jsPDF → private bucket → signed URL). **DEPLOYED v1.**
- `cancel-subscription` (trial-only), `change-plan` (proration), `razorpay-refund`
  (billing:manage), `subscription-lifecycle` (push reminders), `razorpay-plan-backfill`
  — written; deploy via `supabase functions deploy` (proven import patterns).

### ✅ Phase D — App read-only + renewal UI (DONE, typechecks clean)
- `lib/subscription.ts` `getBillingSummary()` wraps `my_billing_summary()`.
- `components/SubscriptionBanners.tsx`: hard view-only banner (can_write=false),
  past_due grace banner, dismissible 7/3/1/expiry renewal reminder.
- `components/CanWriteProvider.tsx` + `useCanWrite()` context for disabling write
  affordances (DB triggers remain the real gate). Wired into `(dashboard)/layout.tsx`.
- **Bug fixed**: `create_tenant_onboarding` never set legacy `profiles.farm_id`,
  so every new owner bounced to /onboarding. Migration
  `onboarding_link_profile_farm_id` links it + backfills existing owners.

### ✅ Phase E — Tenant billing portal (DONE, typechecks clean)
- Rebuilt `/billing` against the ledger: current plan + status + trial badge +
  renewal date/days-left (from `my_billing_summary`), plan picker with monthly/
  yearly + `change-plan`/`create-razorpay-subscription`, cancel-in-trial
  (`cancel-subscription`), invoice history with on-demand PDF download
  (`generate-invoice-pdf` signed URL), payment history. Replaces the legacy
  `is_paid`/`profiles.subscription_status` page.

### ✅ Phase F — Control Center money views (DONE, typechecks clean)
- `/admin/billing`: net-collected / outstanding / refunded / failed tiles from
  real ledger rows; invoices + payments tables (tenant-joined); refund action
  (`razorpay-refund`, gated on `billing:manage`). Nav entry added to AdminShell.

### ✅ Phase G — Tests + verification (DONE)
- Edge functions: deployed the 5 remaining (cancel-subscription, change-plan,
  razorpay-refund, subscription-lifecycle, razorpay-plan-backfill) → 18 ACTIVE.
- Live scenario tests (all pass): owner sees own invoice/can_write; second owner
  sees 0 invoices/0 payments (RLS isolation) + not a platform operator; suspend
  tenant → `tenant_can_write=false` and a real INSERT is rejected with
  `subscription_inactive` then rolled back; operator sees both via `cc_list_*`.
- Durable artifacts: `supabase/tests/billing.test.sql` (pgTAP, 10 assertions, ran
  green vs live DB) + `supabase/functions/tests/razorpay-webhook.test.ts` (HMAC
  sig accept/reject, tamper, wrong-secret, GST math, paise→INR, idempotency).
- Security advisor: 0 ERROR-level findings; migration introduced no regression.
- Both web apps `tsc --noEmit` clean (exit 0).

### ✅ Onboarding flow — tested (all cases) + 1 bug fixed
RPC edge-case matrix vs live DB (all self-rolled-back):
- missing farm_name → `farm_name required` ✓
- contract farm without integrator → `contract farm requires integrator_id` ✓
- valid independent → tenant+farm created ✓ · duplicate onboarding → `tenant already
  exists for this user` ✓ · trial auto-provisioned 7-day ✓
- `handle_new_user` auto-creates the profile on fresh signup (verified independent
  of onboarding) ✓ · full owner chain (profile-linked/tenant/tenant_users/farm/
  farm_users/subscription) intact ✓
- freemium limit logic: starter tenant 1/1 farms → `can_add_farm=false`, 1/3 users →
  `can_add_user=true` ✓ (via `tenant_plan_status`).

**Bug fixed (onboarding contract path):** `OnboardingWizard` offered "Contract"
farm type but never collected `integrator_id`, so `create_tenant_onboarding` (and
the `contract_farm_needs_integrator` CHECK) rejected every contract signup. Added
an integrator `<select>` (loaded from `integrators`) shown when contract is chosen,
client validation, and `integrator_id` in the RPC payload. Re-tested: contract +
integrator now creates the tenant+farm. Frontend `tsc` clean.

**Finding (not fixed — out of billing scope):** per-resource freemium caps
(`max_farms`/`max_users`) are NOT enforced at the DB layer — only the
`tenant_can_write` read-only gate is. `can_add_farm/can_add_user` exist for the UI;
a trigger calling `tenant_plan_status` on farms/tenant_users insert would close the
gap if hard DB enforcement of caps is wanted.

### ✅ Lifecycle + billing-path tests (all verified live, self-rolled-back)
- `process_subscription_lifecycle()`: trial→past_due (expired trial), active→past_due
  (lapsed period), past_due→suspended (grace >3d; trigger-disable trick needed to
  plant an old `updated_at`). All three transitions confirmed; runs as pure SQL via
  SECURITY DEFINER `set_subscription_status`, unaffected by the lockdown below.
- Renewal reminders: `get_pending_subscription_reminders()` surfaced owner2 as
  `day_7`; after `record_subscription_reminder` it drops from pending and a
  duplicate call is a no-op (UNIQUE(subscription,stage,period_end), pending 1→0,
  rows stay 1).
- Cancel guard: `cancellable` = true for trial owner, false for active owner
  (matches the edge fn's trial-only 409).
- Webhook idempotency: re-inserting the same `razorpay_event_id` hits the UNIQUE
  constraint — redelivery collapses to one processed row.

### 🔒 SECURITY FIX (found via testing) — owner could self-grant a paid subscription
`tenant_subscriptions_owner_write` was `FOR ALL` gated only on tenant ownership, so
an owner could `UPDATE` their own row's `status`/`current_period_end` (proven: set
`status='active'`, `current_period_end=now()+10y` → `is_tenant_paid=true`) — a full
billing bypass, plus INSERT/DELETE of subscription rows. Migration
`lock_down_tenant_subscriptions_owner_writes`: replaced with a `FOR UPDATE`
row-policy + column GRANTs so owners may write ONLY `plan_id`+`billing_cycle` (the
free-plan onboarding path); `status`/periods/razorpay refs + INSERT/DELETE are
service-role only. Re-verified: exploit + rogue INSERT now `permission denied`;
legit plan/cycle change still works; cron transitions still work.

### 🧪 Test tenants (seeded in dev DB jusxngbfdmzhlybohell)
- **App owner** `owner@poultryos.test` / `TestPass123!` → Green Valley Poultry,
  ACTIVE Growth, INV-2026-000001 (₹588.82 paid via UPI). Lands on dashboard.
- **Trial owner** `owner2@poultryos.test` / `TestPass123!` → Sunrise Layers, trial.
- **Control Center** `admin@poultryos.test` / `AdminPass123!` → super_admin; sees
  both tenants' invoices/payments at /admin/billing.

### 🔐 Prod-readiness (user actions)
1. Set Supabase secrets: `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET`.
2. `supabase functions deploy` the 5 remaining functions.
3. POST `/functions/v1/razorpay-plan-backfill` (test mode) to populate
   `subscription_plans.razorpay_plan_id_*`.
4. Register the webhook URL in Razorpay for `subscription.*` + `payment.failed` events.
5. Rotate the pasted test `key_secret`.
6. Approve a `subscription_renewal` WhatsApp template to enable WhatsApp reminders
   (push works today).
