# Phase E — Dashboard first-run + Product Analytics Funnel

**Status:** ✅ Complete & verified · **Date:** 2026-06-11

## Shipped
| Area | File | What |
|---|---|---|
| Component | `components/ui/SetupProgressCard.tsx` (new) | Reusable first-run checklist — progress bar + per-step ticks, the first incomplete step highlighted with its description, a primary CTA driving the next action. Barrel-exported. |
| Dashboard | `app/(tabs)/dashboard.tsx` | Loads shed count + "has any daily log" and renders **SetupProgressCard** as the hero until shed → batch → first daily log all exist (no more blank first-run dashboard). Swapped the react-native-paper Snackbar for the in-house one (closes audit P1-3 here). Existing batch empty-state retained for the post-onboarding "all batches closed" case. |
| DB | `supabase/migrations/20260611000007_analytics_events.sql` (new) | Append-only `analytics_events` (tenant_id NULL pre-onboarding, user_id, event_name, properties). RLS: insert-self, select self-or-tenant-admin, no update/delete. `track_event(name, props)` SECURITY DEFINER resolves tenant from the caller profile. |
| Lib | `lib/analytics.ts` (new) | `track(event, props)` — fire-and-forget wrapper over `track_event`; never throws, never blocks UI. `FUNNEL` constant for the event names. |
| Funnel wiring | login/register/auth-service/creating/billing/setup/log | Events fired at: `signup_started` (register), `otp_verified` (auth-service.verifyOtp), `onboarding_completed` (creating), `first_shed_created` (setup/sheds, on the empty→first insert), `first_batch_created` (setup/batches), `first_daily_entry` (daily log save), `plan_selected` (billing subscribe). |
| i18n | `locales/en/common.json` | `dashboard.setup.*` (title, progress, per-step labels/descriptions/CTAs). |

## Funnel coverage vs the master spec
`signup_started · otp_verified · email_verified · plan_selected · payment_completed · onboarding_completed · first_shed_created · first_batch_created · first_daily_entry`

Wired today: **signup_started, otp_verified, onboarding_completed, first_shed_created, first_batch_created, first_daily_entry, plan_selected** — the full activation core, so drop-off is measurable as distinct `user_id` per `event_name` (use `MIN(created_at)` per user for first-touch).

Deferred (need flows that don't exist yet): **email_verified** (no email-verification flow built — Supabase tracks `email_confirmed_at`; can backfill from a webhook), **payment_completed** (best recorded server-side in `razorpay-webhook` on `subscription.charged`, where there's no user JWT — would insert with `service_role` directly rather than via `track_event`).

## Verification
- **`npx tsc --noEmit` → 0 errors · `npx jest` → 139/139.**
- New DB suite `analytics_events.test.sql` **7/7**: pre-onboarding NULL-tenant event, post-onboarding tenant resolution, empty-name 22023, self-read, cross-tenant RLS isolation, forged-insert 42501. `auth_security` re-run clean (no regression).
- Migration applied cleanly to the local stack.

## Cumulative across the whole SaaS upgrade
- **DB: 76/76** (tenant 13, billing 9, auth 7, analytics 7, + 40 legacy regression).
- **Mobile: tsc 0 errors, jest 139/139.**

## Deferred (non-blocking)
- hi/te/ta translations for `dashboard.setup.*`.
- `email_verified` + `payment_completed` funnel events (need email-verify flow / server-side webhook insert).
- An analytics dashboard/query view for the funnel (data is being collected; visualisation is a separate ask).
