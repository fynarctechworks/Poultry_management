# Phase B Integrations — Razorpay tiers + plan-selection UI + freemium re-point

**Status:** ✅ Complete & verified · **Date:** 2026-06-11

## The bug this also fixed
After the Phase B *data layer* re-pointed `is_paid()` to read `tenant_subscriptions`, **both billing Edge Functions still only wrote `profiles.subscription_status`** — so a successful Razorpay payment would update the legacy column but **never flip `is_tenant_paid` → true**, leaving the user gated despite paying. Same class of latent break as the onboarding `tenant_id` bug. Fixed here.

## Shipped
| Layer | File | What |
|---|---|---|
| Edge fn | `create-razorpay-subscription/index.ts` | After creating the Razorpay subscription, resolves the caller's tenant (`profiles.tenant_id`) and writes `tenant_subscriptions` = chosen `plan_id` + `billing_cycle` + `razorpay_subscription_id`. **Status is left untouched** (stays trial) — access is granted only when the webhook confirms a real charge, so we never unlock on an unpaid "created" subscription. |
| Edge fn | `razorpay-webhook/index.ts` | Subscription lifecycle events now update `tenant_subscriptions.status` (the gating source of truth) matched by `razorpay_subscription_id` — `activated/charged/resumed` → `active` (+ extends `current_period_end` by the billing cycle), `cancelled/completed` → `cancelled` (+ `cancelled_at`), `halted/pending/paused` → `past_due`. Legacy `profiles` mirror retained for back-compat. |
| Hook | `lib/billing-hooks.ts` (new) | `useTenantBilling()` — current plan code, status, trial countdown (`trialDaysLeft`), and per-tier limits/usage from the `tenant_plan_status` RPC. |
| Component | `components/ui/TierCard.tsx` (new) | Presentational multi-tier pricing card — recommended / current-plan badges, price for the selected cycle, feature highlights, configurable CTA. Barrel-exported. |
| Screen | `app/billing/index.tsx` (rewritten) | **Multi-tier plan selection**: status card (trial days left / active / past-due warning), global monthly/yearly toggle with savings badge, one `TierCard` per active tier ordered by `sort_order`, recommended + current-plan states, Enterprise "Contact sales" (mailto), Starter shown as the free baseline. Subscribe → `create-razorpay-subscription`. Replaced the deactivated single-`pro` fetch and the react-native-paper Snackbar (closes audit P1-3 here). |
| i18n | `locales/en/common.json` | `billing.tiers.*` — cycle labels, statuses (with trial-day plurals), tier badges/CTAs, and feature-highlight strings (with `_one/_other` plurals for farms/users/buyers/WhatsApp). |

## Freemium gate re-point
No gate call-sites needed changes: `useIsPaid` consumes the re-pointed `is_paid()` RPC, which now resolves the user's tenant and returns true while **trialing, active, or within the 7-day past-due grace** — so `canAddShed/canAddBuyer/canAddWorker/hasContractAccess/...` are already tenant + trial aware. The screen-level numeric tier limits (Starter 10 buyers vs Growth 500) are now readable via `useTenantBilling().planStatus.can_add_*`; wiring those exact per-tier numbers into the shared `FREE_LIMITS` helpers is a deferred refinement (the binary free/paid gate — which covers most of the freemium matrix — is correct today).

## Verification
- **`npx tsc --noEmit` → 0 errors.**
- **`npx jest` → 139/139.**
- No Edge Function test regressions (only `aisensy-webhook` / `send-whatsapp-message` Deno tests exist; untouched).

## Deferred (non-blocking)
- Razorpay test/live keys + per-tier `razorpay_plan_id_monthly/yearly` are env placeholders — the function already degrades to `{ ok:false, reason:"not_configured" / "plan_not_configured" }` and the UI surfaces a friendly message until they're set.
- hi/te/ta translations for `billing.tiers.*` (English fallback for now).
- Per-tier numeric limit enforcement in shared `FREE_LIMITS` (binary gate correct today).
- UPI Collect (`create-upi-collect-link`) is already implemented from v2; no tier change needed.
