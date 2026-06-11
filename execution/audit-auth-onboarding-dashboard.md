# Audit — Login → Onboarding → Dashboard (Mobile)

Scope: the first-run user journey. Files audited:
- `auth/auth-service.ts`
- `app/_layout.tsx` (root routing gate)
- `app/(auth)/login.tsx`, `app/(auth)/register.tsx`
- `app/(onboarding)/_layout.tsx`, `step-1-profile.tsx` … `step-5-whatsapp-upi.tsx`
- `app/(tabs)/dashboard.tsx`
- `stores/auth.ts`

---

## 1. Flow as it actually works today

1. **Cold start** → `app/_layout.tsx` loads fonts, hydrates Supabase session, then hydrates the farm via `farm_users` join. Until all three resolve it shows a bare `ActivityIndicator`.
2. **No session** → `<Redirect href="/(auth)/login" />`.
3. **Login** (`signInWithPassword`) or **Register** (`signUp` + `profiles` insert). On success nothing navigates explicitly — the root `onAuthStateChange` re-renders the gate.
4. **Session but no farm** → `<Redirect href="/(onboarding)/step-1-profile" />`.
5. **Onboarding wizard** (5 steps, state held in `useOnboardingStore`). Only **step 5** touches the DB — it writes profile, farm, `farm_users`, links `profiles.farm_id`, sets `currentFarm`, then `router.replace('/setup/sheds')`.
6. **Setup → Dashboard** once a shed/batch exists.

The happy path is coherent and the routing gate is centralized (good). The issues below are ordered by severity.

---

## 2. Findings

### P0 — Correctness / blocking

**P0-1 — Auth is email/password only; CLAUDE.md mandates Mobile OTP as primary.**
`auth-service.ts` has `signInWithPassword`/`signUp` and a commented-out OTP stub (lines 46–48). The product spec ("Mobile OTP (primary) via MSG91") is not implemented. This is the single biggest gap in the journey for the Indian target user. *(Already flagged in the 2026-06 audit as a P0 — still open.)*

**P0-2 — Onboarding write is a 6-step non-atomic sequence with no rollback.**
`step-5-whatsapp-upi.tsx` `onSubmit` runs: custom-integrator RPC → profile update → farm insert → farm_users insert → profile.farm_id update. If any step after the farm insert fails (e.g. `farm_users` RLS or network drop), the user is left with an **orphaned farm row and no `farm_users` link** → on next launch the root gate finds no farm and sends them back to step 1, where re-submitting creates a *second* farm. Should be a single Postgres RPC (`create_farm_onboarding`) wrapped in a transaction.

**P0-3 — `register()` inserts the profile client-side and can half-succeed.**
If `signUp` succeeds but the `profiles` insert throws (line 29), the auth user exists with no profile row. Next login lands them in onboarding, but step 5 does `profiles.update(...).eq('id', ...)` — an update against a non-existent row silently affects 0 rows and the profile is never created. Profile creation should be a DB trigger on `auth.users` (Supabase `handle_new_user`), not client code.

### P1 — Robustness / UX

**P1-1 — Double farm-hydration query.** Both `app/_layout.tsx` (lines 89–105) and `app/(onboarding)/_layout.tsx` (lines 20–32) query `farm_users → farms` on every session change. The onboarding layout's check is redundant with the root gate and causes a flash (`if (!checked) return null;` → blank) before its own `<Redirect>`. Consolidate to the root gate.

**P1-2 — Loading state is a spinner, not skeleton.** Root gate (line 109) and dashboard both use `ActivityIndicator`/implicit spinners. Blueprint R3 mandates skeleton-first loading. Dashboard already imports nothing from `Skeleton.tsx` — `loading` only guards the strip/weather widgets, the KPI grid and batch list pop in without placeholders.

**P1-3 — `step-5` still imports `Snackbar` from `react-native-paper`.** Same for `dashboard.tsx` (line 4). These are part of the in-flight paper removal but currently inconsistent: the journey mixes the new `components/ui` Toast and paper's Snackbar.

**P1-4 — No "session expired mid-onboarding" recovery beyond step 5.** Step 5 re-fetches the live session and warns on mismatch (good), but steps 1–4 read `useAuthStore` without revalidation. If the JWT expires during a long onboarding, steps 1–4 give no feedback.

**P1-5 — Post-onboarding lands on `/setup/sheds`, not the dashboard.** Defensible (you need a shed before the dashboard is useful), but the dashboard's empty state *also* routes to `/setup/sheds`. So a contract farmer who skips shed setup can bounce between an empty dashboard and setup. Confirm the intended terminal screen.

### P2 — Polish / consistency

**P2-1 — `dashboard.tsx` uses `activeBirds.toLocaleString('en-IN')` and `eggsToday.toLocaleString(...)` inline** instead of the shared `formatNumber` from `@poultryos/shared`. Number formatting was deduped everywhere else; the dashboard was missed.

**P2-2 — Hardcoded fallback string `'PoultryOS'`** for `farm_name` (dashboard line 245) bypasses i18n.

**P2-3 — `register.tsx` `roleLabel` style** sets `fontWeight` without the matching `fontFamily` (line 145) — IBM Plex won't apply the semibold face here; it'll synthetic-bold. The font sweep missed this one literal.

**P2-4 — Login/Register have no "forgot password" path** and no loading skeleton on first paint — minor for OTP-bound rework but worth noting.

**P2-5 — Weather widget onPress shows a "coming soon" snackbar** (dashboard line 280) — dead-end interaction; blueprint R1 wants it to deep-link to the Weather screen.

---

## 3. What's already good (keep)

- Centralized routing gate in one file with a 5s failsafe timeout (`app/_layout.tsx:58`).
- Onboarding state in a dedicated store, DB write deferred to the final step (minimizes partial writes *within* the wizard).
- Step 5 revalidates the live JWT before writing — defends against stale store.
- Dashboard load is a single `Promise.all` fan-out (good for 4G latency) and is best-effort (one failed query doesn't blank the screen).
- `keyboardShouldPersistTaps`, `KeyboardAvoidingView`, label-above-field inputs — all per spec.

---

## 4. Recommended remediation order

1. **P0-3 + P0-2 together**: move profile creation to a `handle_new_user` trigger; replace step-5's 6-call sequence with one transactional RPC `create_farm_onboarding(payload jsonb)`. Eliminates orphan-farm and missing-profile classes entirely.
2. **P0-1**: implement MSG91 OTP (`sendOtp`/`verifyOtp`) + OTP entry screen; keep email/password as fallback.
3. **P1-1**: delete the redundant farm check in `(onboarding)/_layout.tsx`.
4. **P1-2 + P2-1**: skeleton states on root gate + dashboard; route numbers through shared `formatNumber`.
5. **P1-3**: finish Snackbar→Toast swap in `step-5` and `dashboard`.
6. **P2-x**: i18n fallback, roleLabel fontFamily, weather deep-link.

---

## 5. Open questions for product

- Is the terminal screen after onboarding meant to be `/setup/sheds` or the dashboard? (affects P1-5)
- Is OTP-primary in scope for this upgrade pass, or do we ship email/password and defer OTP?
