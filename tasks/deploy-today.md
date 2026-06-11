# Deployment Plan — Today (2026-05-25)

**Scope**: Web → Vercel + Supabase production verification.
**Out of scope today**: Mobile / Play Store (multi-day review), Hostinger VPS (untouched).
**Vercel project name**: `poultryos-app` (unique — will not collide with other projects in your account).

Supabase project is already live: `jusxngbfdmzhlybohell` (ap-south-1, Mumbai).
12 Edge Functions deployed, 50+ migrations applied.

---

## 0. Pre-flight (15 min)

- [ ] Confirm Vercel CLI installed: `npm i -g vercel` (or use dashboard import)
- [ ] Confirm GitHub access token works: `gh auth status`
- [ ] Confirm `web/` builds locally clean:
  ```bash
  cd web && npm ci && npm run typecheck && npm run build
  ```
- [ ] Read advisor warnings (already pulled): all are WARN-level, none block deploy.
  - `extension_in_public: pg_net` — known, Supabase default, leave as-is
  - 12 × `authenticated_security_definer_function_executable` — intentional (these are the RPCs the clients call); EXECUTE already scoped via migration `20260522000004_revoke_anon_execute_on_paid_rpcs.sql`
  - `auth_leaked_password_protection` disabled — toggle ON in Supabase Auth dashboard (1 click)
  - 40+ × `unused_index` + `multiple_permissive_policies` — performance hints, not security; defer

---

## 1. Code freeze + commit (10 min)

Uncommitted on `main`:
```
M web/app/(dashboard)/billing/UpgradeButton.tsx
M web/app/(dashboard)/billing/page.tsx
M web/app/(dashboard)/contract/[id]/page.tsx
M web/app/(dashboard)/contract/new/page.tsx
M web/app/(dashboard)/contract/page.tsx
M web/app/(dashboard)/contract/settlements/page.tsx
M web/app/(dashboard)/multi-farm/page.tsx
?? tasks/phase-5-launch-readiness.md
?? web/components/UpgradeGate.tsx
```

- [ ] `git diff` — confirm only freemium gate / UpgradeGate changes
- [ ] `git add web/ tasks/phase-5-launch-readiness.md`
- [ ] `git commit -m "feat(web): freemium gates on multi-farm, contract, billing"`
- [ ] `git push origin main` _(awaiting your explicit go-ahead per memory rule)_

---

## 2. Supabase production verification (20 min)

Use Supabase MCP throughout — no dashboard work needed.

### 2.1 Secrets — confirm every Edge Function has what it needs
Check the Supabase dashboard → Project Settings → Edge Functions → Secrets, and confirm presence (NOT values):

- [ ] `AISENSY_API_KEY` _(blocks WhatsApp sends — fine to deploy without if no live farms yet)_
- [ ] `AISENSY_WEBHOOK_SECRET`
- [ ] `RAZORPAY_KEY_ID` — TEST mode is OK to start; switch to LIVE once KYC clears
- [ ] `RAZORPAY_KEY_SECRET`
- [ ] `RAZORPAY_WEBHOOK_SECRET`
- [ ] `OPENWEATHER_API_KEY` _(blocks weather widget if missing — instant signup)_
- [ ] `MSG91_AUTH_KEY` _(blocks phone OTP — email fallback works without it)_

> `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` auto-provisioned.

### 2.2 Auth hardening (3 min)

- [ ] Toggle ON "Leaked password protection" in Auth → Policies (clears the advisor warning)
- [ ] Verify OTP rate-limit set conservatively (≤ 10/hour/IP) before MSG91 goes live

### 2.3 Webhook endpoints — Razorpay + AiSensy
Both need to point at the production Edge Function URLs. Format:
`https://jusxngbfdmzhlybohell.supabase.co/functions/v1/razorpay-webhook`
`https://jusxngbfdmzhlybohell.supabase.co/functions/v1/aisensy-webhook`

- [ ] Razorpay dashboard → Webhooks → register URL → events: `subscription.activated`, `subscription.charged`, `subscription.cancelled`, `payment.failed`, `payment.captured`
- [ ] Copy the webhook secret from Razorpay → set as `RAZORPAY_WEBHOOK_SECRET` Supabase secret
- [ ] AiSensy dashboard → Webhooks → register URL → events: `message.status`, `message.received`
- [ ] Copy webhook secret → set as `AISENSY_WEBHOOK_SECRET`

### 2.4 pg_cron — confirm jobs are scheduled
- [ ] In SQL editor: `SELECT jobname, schedule, active FROM cron.job ORDER BY jobname;`
- [ ] Expect to see: `fetch-market-prices` (daily 08:00), `fetch-weather-data` (hourly Apr–Sep), `send-vaccination-reminders` (daily 07:00), `send-low-stock-alerts` (daily 08:30), `send-daily-digest` (daily 20:00), `send-payment-reminders` (daily 10:00) — all on `Asia/Kolkata` cron strings.

---

## 3. Vercel deploy — `poultryos-app` (30 min)

### 3.1 Create project (don't touch existing projects)
- [ ] In Vercel dashboard → **Add New Project** → import `fynarctechworks/Poultry_management`
- [ ] **Project Name**: `poultryos-app` (verify name does not collide with existing projects)
- [ ] **Framework Preset**: Next.js (auto-detect)
- [ ] **Root Directory**: `web` ← **critical** (repo is monorepo-style; mobile in `PoultryOS/`)
- [ ] **Build Command**: `npm run build` (default)
- [ ] **Install Command**: `npm ci` (default)
- [ ] **Node version**: 20.x (Vercel default for Next 14)

### 3.2 Environment variables (Vercel project settings)
Set for `Production` (and `Preview` if you want preview deploys):

- [ ] `NEXT_PUBLIC_SUPABASE_URL` = `https://jusxngbfdmzhlybohell.supabase.co`
- [ ] `NEXT_PUBLIC_SUPABASE_ANON_KEY` = _(from Supabase → Settings → API → anon public)_

> Server-only secrets (service role key, Razorpay secret, etc.) live in **Supabase** Edge Functions, NOT Vercel. The web client only needs the public Supabase URL + anon key.

### 3.3 First production deploy
- [ ] Trigger deploy → wait for green build
- [ ] Confirm preview URL `poultryos-app.vercel.app` loads `/login`
- [ ] Confirm no console errors (check Network tab for failed Supabase requests)

### 3.4 Custom domain (optional today — can be done later)
- [ ] If domain ready: Vercel → Domains → add `app.poultryos.in` (or your domain)
- [ ] Update DNS at registrar (CNAME → `cname.vercel-dns.com`)
- [ ] Wait for SSL auto-issue (~2 min)

---

## 4. Production smoke test (20 min)

Run against the live Vercel URL. These match the Phase-5 doc §4 critical paths.

### 4.1 Auth
- [ ] Email/password signup → confirm email → land on `/onboarding`
- [ ] OTP login (if MSG91 secret set) — otherwise skip

### 4.2 Free-tier gating
- [ ] Visit `/multi-farm` as free user → UpgradeGate blocks with "Upgrade to Pro"
- [ ] Visit `/contract` as free user → UpgradeGate blocks
- [ ] Visit `/billing` → shows free tier, Monthly/Yearly toggle renders

### 4.3 Razorpay checkout (TEST mode)
- [ ] Click "Upgrade" → Razorpay checkout opens with `plan_xxx` populated
- [ ] Use Razorpay test card (`4111 1111 1111 1111` / `12/30` / `123`)
- [ ] Confirm `razorpay-webhook` fires (check Supabase logs)
- [ ] Confirm `profiles.subscription_status` flips to `active` within 30s

### 4.4 Verify no leakage to other Vercel projects
- [ ] In Vercel dashboard → confirm `poultryos-app` is the only project that just built
- [ ] Other projects' deployments untouched (check their "Last deployed" timestamps)

---

## 5. Monitoring + handover (10 min)

- [ ] Pin Vercel project → Notifications: email on failed deploys
- [ ] Bookmark: Supabase logs URL, Vercel deployments URL, Razorpay dashboard
- [ ] Update `tasks/open-items.md` with anything that didn't ship today

---

## VPS — explicit no-op

Hostinger VPS is **not touched** by this deploy.
- No SSH sessions opened
- No DNS records repointed at the VPS
- No reverse proxy / nginx config touched
- No ports opened/closed

If you ever need the VPS in the path (e.g., self-hosted analytics, status page), it'll be a separate plan that isolates from your existing client projects via a new user + dedicated nginx server block.

---

## Total time estimate: ~1h 45m

Critical path (longest single blocker): the Razorpay live-mode KYC and AiSensy template approvals (both 1–7 days). Today's deploy ships the web app working against **test-mode Razorpay** and a Supabase backend that's already production-ready. WhatsApp/MSG91 paths gracefully degrade until those keys are added — they aren't deploy blockers.
