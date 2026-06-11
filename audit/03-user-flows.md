# 03 — User Flow Audit

_Audit date: 2026-06-11. Flows traced through actual route files and navigation code, not assumptions._

## 1. Owner journey — Mobile (primary persona: 500–5,000-bird farmer, ₹6k Android)

```
Launch → app/_layout.tsx auth gate
  ├─ no session → (auth)/login  ……………………… ❌ EMAIL/PASSWORD ONLY
  ├─ session, no farm → (onboarding)/step-1-profile → … → step-5-whatsapp-upi
  └─ session + farm → (tabs)/dashboard
Dashboard → KPI grid → batch card → batches/[id] → daily log history / close batch
Dashboard FAB → (tabs)/log → save (offline-queued if needed)
Khata tab → buyer list → buyers/[id] → UPI QR / WhatsApp reminder
More tab → 14 destinations (transactions, market-prices, weather, reports, health,
           vaccinations, inventory, contract*, settings, billing, multi-farm,
           notifications, whatsapp-settings, language)
```

### Friction points (mobile)

| # | Severity | Finding | Evidence |
|---|---|---|---|
| M1 | 🔴 Blocker | **First-touch friction: farmers must invent an email + password.** The documented primary auth (phone OTP via MSG91) is a commented stub. For this demographic, email auth is a hard drop-off at the very first screen. | [auth-service.ts:46-48](PoultryOS/auth/auth-service.ts#L46-L48) |
| M2 | 🔴 Dead end | Dashboard weather widget tap → snackbar "weather detail coming" — but `/weather` is fully built. User is told the feature doesn't exist when it does. | [dashboard.tsx:280](PoultryOS/app/(tabs)/dashboard.tsx#L280) vs [app/weather/index.tsx](PoultryOS/app/weather/index.tsx) |
| M3 | 🟠 | "More" tab is a flat list of 14 items with no grouping — daily-use items (Health, Vaccinations, Inventory) sit next to once-a-quarter items (Billing, Language). Violates the "3 taps or fewer" ethos for health/vaccination entry. | [app/(tabs)/more.tsx:42-124](PoultryOS/app/(tabs)/more.tsx#L42-L124) |
| M4 | 🟠 | No account recovery: forgot password = locked out permanently (no `resetPasswordForEmail` flow). Combined with M1 this is a churn machine. | grep across `PoultryOS/app` — zero hits |
| M5 | 🟡 | Errors are swallowed silently (`catch {}` on dashboard load, farm hydration) — when RLS or network fails, the user sees an empty dashboard with no retry CTA. | [dashboard.tsx:178](PoultryOS/app/(tabs)/dashboard.tsx#L178), [_layout.tsx:100](PoultryOS/app/_layout.tsx#L100) |
| M6 | 🟡 | Worker has no tailored experience: same 5 tabs render; Khata/financials simply return empty (RLS), reading as a bug rather than a permission. No "you don't have access" state. | RLS `buyers_owner_only` (initial_schema.sql:1091) + no role-aware UI in [(tabs)/_layout.tsx](PoultryOS/app/(tabs)/_layout.tsx) |

## 2. Owner journey — Web

```
/ (landing) → /login → signInWithPassword OR phone OTP ✅
Login success → middleware redirect → /multi-farm        ❌ PAID-GATED LANDING
(dashboard)/layout.tsx → no farm? → /onboarding (wizard) → farm created
Sidebar (19 flat items) → CRUD screens for every module
Daily log CTA pinned above nav ✅
```

### Friction points (web)

| # | Severity | Finding | Evidence |
|---|---|---|---|
| W1 | 🔴 | **Free users land on an upgrade wall after every login.** `updateSession` redirects authenticated users to `/multi-farm`, which is wrapped in `<UpgradeGate>` (multi-farm dashboard is a paid feature). The post-login home for a free user is "please pay". There is no web equivalent of the mobile Dashboard home. | [middleware.ts:45](web/lib/supabase/middleware.ts#L45), [multi-farm/page.tsx](web/app/(dashboard)/multi-farm/page.tsx), fix log in [phase-5-launch-readiness.md §6.2](tasks/phase-5-launch-readiness.md) |
| W2 | 🟠 | 19 ungrouped sidebar items — Stripe/Linear-class products group into 4–6 sections (Operate / Money / Insights / Setup). Scan cost is high; "Integrators" and "Traceability" sit at the same level as daily-use "Batches". | [Sidebar.tsx:10-30](web/components/Sidebar.tsx#L10-L30) |
| W3 | 🟠 | **No responsive layout**: fixed 240px sidebar with no breakpoint/hamburger. A farmer opening the web app on a phone (the realistic case in India) gets a desktop layout. | [Sidebar.tsx:44](web/components/Sidebar.tsx#L44), only 40 files use any `md:`/`lg:` classes |
| W4 | 🟡 | No `loading.tsx`/`error.tsx` anywhere — server-component pages block on data with a white screen; a thrown Supabase error → Next.js default error page. | `find web/app -name loading.tsx` → 0 |
| W5 | 🟡 | List pages cap at `.limit(100–200)` with no pagination — month 6 of real usage silently truncates transactions/daily-log history. | [transactions/page.tsx:14](web/app/(dashboard)/transactions/page.tsx#L14), [batches/page.tsx:21](web/app/(dashboard)/batches/page.tsx#L21) |

## 3. Worker journey (data-entry persona)

```
Invited via web /team (owner action) → accepts → mobile login
→ Dashboard (full KPI view ✅ allowed by RLS)
→ Log tab → daily log for assigned sheds ✅ (<60s gate: achievable, form is single-page)
→ Health incident ✅ → Khata tab → EMPTY (no explanation) ❌
```

- ✅ The core worker task (daily log in <60s, offline-capable) is genuinely well built: single screen, large touch targets, queue + sync banner ([DailyLogForm.tsx](PoultryOS/components/ui/DailyLogForm.tsx), [OfflineBanner.tsx](PoultryOS/components/ui/OfflineBanner.tsx)).
- ❌ No mobile flow for the owner to invite a worker (web-only [team/InviteForm.tsx](web/app/(dashboard)/team/InviteForm.tsx)) — but the owner is mobile-first. The invite loop forces a desktop detour.
- ❌ Worker sees tabs they can never use (Khata) — see M6.

## 4. Vet journey

```
(theoretical) invited as vet → ??? no invite path on mobile → web team invite
→ login → sees standard owner-shaped UI → health/[id] → VetNoteForm ✅ (web)
```
Status: **half-built**. RLS and RPC are ready (`update_vet_note`, vet SELECT policies), web has the note form, but there is no vet-specific surface (case queue, withdrawal calendar) and no invite/acceptance UX. Matches [open-items.md:19](tasks/open-items.md#L19).

## 5. Buyer journey (external, non-user)

```
Receives WhatsApp payment_reminder → taps UPI link/QR → pays in any UPI app
→ Razorpay webhook flips payment_status → Khata clears ✅
Receives traceability cert link → public /traceability/[token] page ✅ (no login)
```
Clean design. Risk: reminders silently stop if WABA approval lapses; there is no fallback SMS channel.

## 6. Contract-farm owner journey

```
Onboarding step-3 selects integrator → batch → contract/index → cycle detail
→ inputs (chicks/feed) → close batch → settlement calc RPC → reconciliation → WhatsApp share
```
Complete on both clients ([contract/](PoultryOS/app/contract/), [web contract/](web/app/(dashboard)/contract/)). Friction: settlement depends on **unverified seeded tariff cards** (`review_required: true`, initial_schema.sql:1144) — a wrong base rate produces a wrong expected-settlement number, which is the feature's whole value proposition.

## 7. Dead ends & missing actions (consolidated)

1. Weather widget → snackbar instead of `/weather` (M2) — one-line fix.
2. Free-user web login → upgrade wall (W1) — needs a real web Dashboard/home route.
3. Forgot password → nothing (M4).
4. Worker tabs → silent empty screens (M6) — needs role-aware nav or permission empty-states.
5. Mobile owner cannot invite team — web-only detour.
6. Market price strip with no automated source → goes stale after day 1 unless someone manually enters prices daily ([02-feature-inventory §G](02-feature-inventory.md)).
7. `notifications` screen lists alerts but rows are not deep-linked to the relevant batch/buyer (verified: no `router.push` per row in [notifications/index.tsx](PoultryOS/app/notifications/index.tsx)).

## 8. What's genuinely good

- The **log-fast loop** (FAB → single-page form → offline queue → trigger-driven KPIs) is the best flow in the product and hits the <60s gate.
- Onboarding wizard order (profile → farm → integrator → location → WhatsApp/UPI) front-loads the India-killer features and captures lat/long for weather on day 0.
- Khata → buyer detail → UPI QR → WhatsApp reminder is a coherent 3-tap money loop, exactly the differentiator the PRD promises.
