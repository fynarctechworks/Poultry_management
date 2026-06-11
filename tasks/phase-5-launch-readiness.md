# Phase 5 — Launch Readiness Checklist

_Created 2026-05-23. Codebase is feature-complete for Phase 5 (Contract Farming + Web + Billing). What remains is human-only: external account activations, secrets provisioning, app-store submission, and beta-farm onboarding._

The Phase 5 gate in CLAUDE.md is:
> **Public launch ready; 2 contract farms onboarded.**

Everything below is required to flip that gate from "code done" to "launched".

---

## 1. External account activations (blocked on human review)

These have human-review delays. Track each via the linked dashboard.

### 1.1 AiSensy + WhatsApp Business Cloud
- [ ] AiSensy "Pro" plan signup complete (₹999/mo, 1,000 conversations) — https://www.aisensy.com
- [ ] Meta WhatsApp Business Account (WABA) green-tick verified — **3–7 day lead**
- [ ] All 6 message templates approved by Meta (status = APPROVED in AiSensy dashboard):
  - [ ] `daily_digest`
  - [ ] `mortality_alert`
  - [ ] `vaccination_reminder`
  - [ ] `heat_stress_alert`
  - [ ] `payment_reminder`
  - [ ] `low_stock_alert`
- [ ] Test send: each template fires successfully against a real device from AiSensy → confirms send-whatsapp-message Edge Function path

**Blocks**: all WhatsApp cron jobs (`send-daily-digest`, `send-heat-stress-alert`, `send-payment-reminders`, `send-vaccination-reminders`, `send-low-stock-alerts`) and the WhatsApp share buttons (which work without WABA but won't log delivery).

### 1.2 Razorpay live mode + Subscriptions
- [ ] Razorpay test mode keys captured (`rzp_test_xxx`) — work today
- [ ] Live mode KYC submitted (PAN, GSTIN, bank, business registration, address proof, video KYC) — **1–3 day lead**
- [ ] Subscriptions + UPI Collect features enabled on live account (request via Razorpay support if not auto-enabled)
- [ ] Live Razorpay Plans created in the Razorpay dashboard:
  - [ ] Monthly Pro plan → copy `plan_xxx` id
  - [ ] Yearly Pro plan → copy `plan_xxx` id
- [ ] UPDATE `subscription_plans` SET `razorpay_plan_id_monthly = '<id>'`, `razorpay_plan_id_yearly = '<id>'` WHERE code = 'pro';
- [ ] Subscribe flow end-to-end test: mobile + web both reach Razorpay checkout, payment captured, `razorpay-webhook` updates `profiles.subscription_status = 'active'`

**Blocks**: the entire billing flow on both mobile (`PoultryOS/app/billing/index.tsx`) and web (`web/app/(dashboard)/billing/UpgradeButton.tsx`). Without `razorpay_plan_id_monthly` / `_yearly` populated, both clients show the "plan_not_configured" error.

### 1.3 MSG91 (SMS OTP for primary auth)
- [ ] MSG91 account + KYC complete — **1–2 day lead**
- [ ] Sender ID approved (DLT registration for India)
- [ ] OTP template registered + approved
- [ ] Auth secret pushed into Supabase Auth provider config

**Blocks**: phone OTP login on first-time users. Email/password fallback works without it but is not the documented primary path.

### 1.4 OpenWeatherMap API key
- [ ] Account created, free-tier key issued (instant) — https://home.openweathermap.org/api_keys
- [ ] Secret pushed:
  ```bash
  supabase secrets set OPENWEATHER_API_KEY=<key>
  ```
- [ ] `fetch-weather-data` Edge Function runs without "missing key" warning

**Blocks**: weather widget + heat-stress alert pipeline.

### 1.5 Edge Function secrets — Supabase project
Push all of these once the external accounts are live. Names are what the Edge Functions read at runtime — do not rename.

```bash
supabase secrets set \
  AISENSY_API_KEY=<...> \
  AISENSY_WEBHOOK_SECRET=<...> \
  RAZORPAY_KEY_ID=<live key id> \
  RAZORPAY_KEY_SECRET=<live key secret> \
  RAZORPAY_WEBHOOK_SECRET=<webhook secret from Razorpay dashboard> \
  OPENWEATHER_API_KEY=<...> \
  MSG91_AUTH_KEY=<...>
```

`SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` are auto-provisioned — do not set manually.

---

## 2. App distribution

### 2.1 Mobile — Google Play Store
- [ ] Google Play Developer account active ($25 one-time) — verify on https://play.google.com/console
- [ ] Production keystore generated + checked into 1Password (NOT into git)
- [ ] EAS Build production profile configured (`eas.json` → `production`)
- [ ] First production AAB built: `eas build --profile production --platform android`
- [ ] Internal testing track populated with 5 testers
- [ ] Store listing assets ready:
  - [ ] App icon 512×512 PNG
  - [ ] Feature graphic 1024×500 PNG
  - [ ] Phone screenshots ×3 minimum (1080×1920)
  - [ ] Short description (80 chars)
  - [ ] Long description (4,000 chars)
  - [ ] Privacy policy URL — must be live on the marketing site
- [ ] Data Safety form submitted (PII collected: phone, location, business name, financial data)
- [ ] First production release rolled out to internal track → closed beta → production

### 2.2 Web — Vercel
- [ ] Vercel project created, GitHub repo connected to `main`
- [ ] Production env vars set in Vercel:
  - `NEXT_PUBLIC_SUPABASE_URL`
  - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- [ ] Custom domain attached (`app.poultryos.in` or similar)
- [ ] SSL certificate auto-issued + verified
- [ ] First production deploy green; `/multi-farm`, `/contract`, `/billing` all gated correctly for free-tier user

---

## 3. Beta-farm onboarding (Phase 5 gate)

The CLAUDE.md gate is **2 contract farms onboarded**. Five total beta farms is the target. Recruit + onboard:

- [ ] **Farm 1** — Independent broiler, Tamil Nadu (or wherever you have a relationship)
- [ ] **Farm 2** — Independent layer
- [ ] **Farm 3** — Independent broiler/breeder (geographic spread)
- [ ] **Farm 4** — **Contract** — Suguna or Venkateshwara grower
- [ ] **Farm 5** — **Contract** — Skylark or IB Group grower

For each beta farm: complete the 5-step onboarding wizard, run the app for 7 consecutive days, verify daily-log offline-queue works, confirm WhatsApp digest arrives at 8 PM IST.

---

## 4. Pre-launch smoke tests (run before flipping production)

End-to-end paths a real user touches on launch day. Each should pass against the live Supabase project with all secrets configured.

### 4.1 Auth + onboarding
- [ ] Phone OTP via MSG91 delivers in <10s
- [ ] 5-step onboarding wizard completes; farm + sheds + batches inserted
- [ ] Free-tier user lands on dashboard, sees weather widget

### 4.2 Daily log + alerts
- [ ] Daily log save online: <1s, KPIs update
- [ ] Daily log save offline: queued; flushes on reconnect; no duplicates
- [ ] Mortality spike (>5%) triggers push notification AND WhatsApp message via `mortality_alert` template
- [ ] Heat-stress alert fires when forecast >threshold; banner appears on dashboard

### 4.3 UPI Khata
- [ ] Add buyer → outstanding balance ledger reflects pending invoices
- [ ] Generate UPI QR for an invoice → BHIM URI scans correctly in any UPI app
- [ ] Razorpay UPI Collect link → status auto-flips to paid on webhook receipt
- [ ] Day-7 / Day-15 / Day-30 payment reminder cron fires `payment_reminder` template

### 4.4 Contract farming (Phase 5 critical path)
- [ ] Contract farm onboarded with integrator selected from seeded list (Suguna / Venkateshwara / Skylark / IB Group)
- [ ] Contract cycle created on a contract-type batch
- [ ] Inputs tracked (chicks, feed kg)
- [ ] On batch closure: `calculate_contract_settlement` RPC returns breakdown
- [ ] Settlement reconciliation shareable to integrator via WhatsApp
- [ ] Cycle locks after `status = settled` (immutable; verified by RLS)

### 4.5 Billing
- [ ] Free-tier limits enforced on mobile + web (1 farm, 3 sheds, 2 workers, 10 buyers, 5 WhatsApp/month)
- [ ] `/multi-farm` (web) and `/contract*` (web) blocked behind UpgradeGate for free users
- [ ] Razorpay subscribe → success → `subscription_status = 'active'` within 30s of webhook
- [ ] `past_due` after a failed charge → user keeps access for 7-day grace, banner shown, then locked

### 4.6 Reports + traceability
- [ ] Reports PDF generation works on web
- [ ] Traceability cert: QR scans to public page; consumer-facing data shown
- [ ] WhatsApp share of cert delivers via `traceability_cert` template

---

## 5. Post-launch monitoring (first 7 days)

- [ ] Supabase advisors clean (no security/performance warnings — re-run `mcp__supabase__get_advisors`)
- [ ] Edge Function logs clean (`mcp__supabase__get_logs`) for the daily 8 PM IST window
- [ ] Razorpay webhook delivery success rate >99%
- [ ] AiSensy delivery rate >95% (rest is "user has no WhatsApp" — expected)
- [ ] Daily-active beta farms ≥ 4/5 by day 3
- [ ] No P0 issues open for 48 consecutive hours

---

## 6. Bugs caught + fixed during Phase 5 audit (2026-05-23)

Logged here so the launch-day reviewer can see what was tightened:

1. **`web/UpgradeButton.tsx`** — was calling `create-razorpay-subscription` with no body → Edge Function rejected with 400. Now passes `{ plan_code, billing_cycle }` and surfaces the structured `{ ok:false, reason }` shape with sensible per-reason messaging. Adds a Monthly / Yearly toggle.
2. **`web/multi-farm/page.tsx`** — had no client-side freemium gate. Now wrapped in `<UpgradeGate>` that calls `is_paid()` RPC server-side.
3. **`web/contract/page.tsx` + `contract/[id]` + `contract/new` + `contract/settlements`** — also lacked freemium gates (mobile has `hasContractAccess`, web had nothing). All four pages now use `<UpgradeGate>`.
4. **`web/billing/page.tsx`** — was checking `subscription_status === 'active'` directly, ignoring the 7-day `past_due` grace window the DB `is_paid()` RPC implements. Now calls the RPC. Status badge now distinguishes "active" from "past_due · grace window" so the user knows they're inside the grace.
5. **`web/components/UpgradeGate.tsx`** — new shared server component for paid-only pages.
