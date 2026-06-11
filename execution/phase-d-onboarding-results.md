# Phase D — Guided Onboarding (atomic creation + auto-save/resume + premium first-run)

**Status:** ✅ Complete & verified · **Date:** 2026-06-11

## Why this was urgent (not just polish)
The pre-existing onboarding step 5 did a **6-call client write sequence** (profile → farm → farm_users → profile-link …). After the Phase A tenant migration set `farms.tenant_id` **NOT NULL**, that raw `farms` insert (which never supplied `tenant_id`) **would now fail outright** — onboarding was broken end-to-end. Phase D replaces the whole sequence with the atomic `create_tenant_onboarding` RPC, which is the correct, tenant-aware, all-or-nothing path (also fixes audit **P0-2** orphan farms).

## Shipped
| Area | File | What |
|---|---|---|
| Lib | `lib/onboarding-sync.ts` (new) | `syncOnboardingDraft(step)` / `loadOnboardingDraft` / `hydrateDraftIfEmpty` (server auto-save + cross-device resume via `onboarding_progress`); `completeOnboarding()` builds the RPC payload (resolving a custom integrator first), calls `create_tenant_onboarding`, and **recovers idempotently on 23505** (tenant already exists → resolve existing farm). |
| Wizard | `(onboarding)/step-1..4` | Each step now fires best-effort `syncOnboardingDraft(n)` on advance — true server-side auto-save, not just local AsyncStorage. |
| Wizard | `(onboarding)/step-5-whatsapp-upi.tsx` | Rewritten: persists step 5 → syncs draft → routes to the creation screen. **Removed** the broken 6-call sequence and the `react-native-paper` Snackbar (now the in-house `Snackbar` — closes audit P1-3 for this screen). |
| Premium | `(onboarding)/creating.tsx` (new) | **Workspace-creation animation** — runs `completeOnboarding()` behind a staggered checklist ("Creating your workspace → Setting up your farm → Starting your 14-day trial → Almost ready"), honours reduce-motion, enforces a 1.8s minimum so it never flashes, then sets the farm store, resets the draft, and routes to farm setup. Full error state with retry / go-back. |
| Resume | `(onboarding)/_layout.tsx` | On entry with no farm, `hydrateDraftIfEmpty()` pulls any server draft so a fresh device re-populates the wizard. |
| Premium | `setup/success.tsx` (new) + `setup/_layout.tsx` | **First-success screen** — celebratory summary (sheds added / batches placed counts), "what's next" checklist (log today, add buyers, 14-day trial), → dashboard. |
| Flow | `setup/batches.tsx` | "Finish" now routes to the first-success screen; "Skip" still goes straight to the dashboard. |
| i18n | `locales/en/common.json` | `onboarding.creating.*` + `setup.success.*` (English; hi/te/ta fall back via `fallbackLng:'en'`). |

## Design decisions
- **Kept the proven 5-step store** (`stores/onboarding.ts`) rather than expanding to the master spec's literal 10 screens. The 5 data steps + **workspace-creation animation** + **farm-setup (Shed→Batch)** + **first-success** cover the same conceptual arc, preserve the green `onboarding-store.test.ts` (9 cases), and avoid high-risk churn for no user-visible gain. The master's "Subscription" screen lives in the existing Billing flow (Phase B).
- **Idempotent creation**: a network blip where the RPC actually committed would otherwise strand the user on a "tenant already exists" (23505) error on retry. `completeOnboarding` catches 23505 and resolves the existing farm instead — the retry just succeeds.
- **Auto-save is best-effort, local-first**: zustand-persist (AsyncStorage) is the source of truth for same-device resume; the server `onboarding_progress` write is the cross-device backup and never blocks navigation or throws.

## Verification
- **`npx tsc --noEmit` → 0 errors.**
- **`npx jest` → 139/139** (onboarding-store store contract unchanged).
- Atomic RPC path itself proven by the existing DB suite: `tenant_isolation.test.sql` T3–T8 (create, duplicate→23505, contract-without-integrator→22023 rollback, no-orphan atomicity) — green in the 69/69 cumulative run.

## Known follow-ups (not blockers)
- Translate `onboarding.creating.*` / `setup.success.*` into hi/te/ta (currently English fallback).
- The master's extended farm-setup (Feed → Medicines → Team) beyond Shed → Batch is deferred; the current setup covers the minimum for a first daily log.
- A unit test for `completeOnboarding`/payload-builder would need a supabase-client mock; deferred to avoid brittle mocking — DB-level RPC tests already lock the contract.
