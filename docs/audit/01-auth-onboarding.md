# Module 1 — Auth & Onboarding · Audit Report

**Audited:** 2026-06-18 · against real code + live Supabase project `jusxngbfdmzhlybohell`.
**Status:** ✅ Complete — 1 P1 fixed (frontend), 1 P1 + 4 P2 documented.

---

## Flow map

```mermaid
flowchart TD
  subgraph WEB
    RW[register/page.tsx<br/>email+pw / Google] -->|signUp emailRedirectTo=/auth/callback?next=/onboarding| VE[verify-email]
    VE --> CB[auth/callback/route.ts<br/>exchangeCodeForSession + welcome email]
    LW[login/page.tsx] -->|signInWithPassword| MF[/multi-farm/]
    CB --> OW[onboarding/OnboardingWizard.tsx]
    OW -->|step farm → farmType| RPC
    OW -->|step plan → billing| RZ[create-razorpay-subscription<br/>7-day trial mandate]
  end
  subgraph MOBILE
    MB[step-1-profile … step-5-whatsapp-upi] --> CR[creating.tsx<br/>completeOnboarding] --> RPC
  end
  RPC[(create_tenant_onboarding RPC<br/>SECURITY DEFINER)]
  AU[(auth.users insert)] -->|trigger handle_new_user| PR[(profiles row, role=owner)]
  RW --> AU
  LW --> AU
  RPC --> TN[(tenants status=trial)]
  TN -->|trigger provision_tenant_trial| TS[(tenant_subscriptions trial 7d, starter)]
  RPC --> FA[(farms + profiles.farm_id link + farm_users owner)]
  DL[(dashboard)/layout.tsx guard] -->|profiles.farm_id null| OW
  FA --> DL
```

## Entry / exit points
- **Web entry:** `/register`, `/login`, `/forgot-password`, `/reset-password`, `/verify-email`;
  OAuth/confirm callback `app/auth/callback/route.ts`; wizard `app/onboarding/OnboardingWizard.tsx`.
- **Mobile entry:** `(auth)/login|register|verify-otp`; `(onboarding)/step-1..5` + `creating.tsx`.
- **Exit:** web → `/` (dashboard) via layout guard once `profiles.farm_id` set; mobile → `/setup/sheds`.

## Backend touchpoints (verified)
- **Tables:** `auth.users`, `profiles`, `tenants`, `tenant_users`, `farms`, `farm_users`,
  `tenant_subscriptions`, `subscription_history`, `onboarding_progress`, `billing_profiles`,
  `auth_audit_events`, `trusted_devices`.
- **RPCs / functions:** `create_tenant_onboarding(payload jsonb)` (SECURITY DEFINER, atomic:
  tenant→tenant_users→profiles→farms→farm_users→onboarding_progress; guards duplicate tenant,
  farm_name required, contract⇒integrator); `handle_new_user` (trigger on `auth.users`);
  `provision_tenant_trial` (trigger on `tenants` → 7-day starter trial); `fill_tenant_id_from_farm`;
  `log_auth_event`.
- **Edge Functions:** `create-razorpay-subscription` (web billing step), `send-email` (welcome),
  `msg91-send-sms` (mobile OTP).
- **RLS:** every table RLS-enabled; onboarding writes go through the SECURITY DEFINER RPC.

---

## Issues found

| ID | Sev | Area | Finding |
|----|-----|------|---------|
| **A1** | **P1** | Frontend / parity | **Web onboarding captured no farm location.** `OnboardingWizard.tsx` had no lat/long step, so every web-onboarded farm had `latitude=NULL, longitude=NULL` → `fetch-weather-data` / `send-heat-stress-alert` can never run for it. Mobile captured it (`step-4-location.tsx`). Confirmed in DB: farm `MAMA` has NULL coords. |
| A2 | P1 | Infra | Email provider not production-wired (GoTrue SMTP + `send-email` exist; DNS/secrets pending — per project memory). Affects verification + reset deliverability. |
| A3 | P2 | Observability | Web `login/page.tsx` + `Topbar` sign-out do **not** call `log_auth_event`; `auth_audit_events` (login_success/login_failed) is populated by mobile only. Web auth trail incomplete. |
| A4 | P2 | Security hardening | Supabase advisor: `auth_leaked_password_protection` **disabled**. No MFA option for tenant owners (only CC operators are MFA-gated). |
| A5 | P2 | Data model | `handle_new_user` sets `profiles.role='owner'` for **every** new auth user, incl. future invitees. Access is scoped by `farm_users.role`, so not exploitable today, but `profiles.role` is misleading — flagged to Team & Roles (M17). |
| A6 | P2 | UX | OTP resend cooldown / rate-limit on `verify-otp.tsx` unconfirmed. |

## Fixes applied this pass

### A1 — Web onboarding location capture (frontend, applied ✅)
`frontend/app/onboarding/OnboardingWizard.tsx`:
- Added `latitude / longitude / heat_stress_threshold_celsius` to `FarmForm` (+ initial state, threshold default `35`).
- Added a **"Farm location"** section to the farm step with a **"Use my location"** button
  (browser `navigator.geolocation`) and manual lat/long + heat-threshold inputs.
- Range validation in `goToFarmType` (lat ±90, long ±180).
- Wired the three fields into the `create_tenant_onboarding` payload's `farm` object — the RPC
  **already** read them (`v_farm->>'latitude'` etc.), so **no backend change was required**.
- **Verification:** `tsc --noEmit -p tsconfig.json` → exit 0, 0 errors.

## Proposed (NOT applied — backend/config, awaiting approval)
- **A4a:** Enable leaked-password protection in Supabase Auth settings (dashboard/Management API).
- **A3:** Add `supabase.rpc('log_auth_event', …)` on web login-success and before sign-out
  (frontend follow-up; failed-login needs a no-session logging path since `log_auth_event` requires `auth.uid()`).
- **A1-backfill:** Existing farm `MAMA` (pre-fix) still has NULL coords — owner should set location in Settings, or a one-time backfill.

## Enterprise SaaS gap notes (Phase 5)
- ✅ Present: tenant isolation via RLS + denormalised `tenant_id`; atomic onboarding RPC;
  trial provisioning state machine; auth audit table + device table scaffolding; analytics funnel events.
- ➖ Missing / thin: owner-facing MFA; leaked-password protection; complete web auth audit trail;
  signup/OTP rate-limiting; session-management UI (list/revoke devices — `trusted_devices` unused on web).

## Remaining risks
- Weather enablement only *forward*-fixed; pre-existing farms need a location backfill (→ M12).
- Email deliverability still blocks production verification/reset (A2) — infra, not code.

## Completion gate
✅ Flow mapped · ✅ Frontend audited + P1 fixed & typecheck-clean · ✅ Backend/DB/RLS reviewed
(RPCs + triggers read from live DB) · ✅ Mobile parity checked · ✅ Security advisors reviewed ·
✅ Documented. Backend items correctly deferred to *proposed* per operating mode.
