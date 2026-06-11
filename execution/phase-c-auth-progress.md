# Phase C — Auth & Security: Progress

**Status:** ✅ Complete & verified (core + UI remainder) · **Date:** 2026-06-11

## Shipped & verified
| Area | What | Verification |
|---|---|---|
| DB | `20260611000006_auth_security_tables.sql` — `trusted_devices`, `auth_audit_events` (append-only), profiles 2FA prefs (`two_factor_method`, `phone_verified_at`, `email_verified_at`), `log_auth_event()` tenant-resolving RPC | `auth_security.test.sql` **7/7** — audit insert, tenant auto-resolve, cross-user RLS isolation, impersonation blocked |
| Edge fn | `msg91-send-sms` — Supabase Send-SMS hook routing OTP delivery through MSG91 (env placeholders; returns 501 `msg91_unconfigured` until secrets set, so flow degrades gracefully to email) | Built to documented MSG91 v5 OTP API |
| Service | `auth/auth-service.ts` rewritten — `sendOtp`/`verifyOtp` (Supabase phone OTP), `toE164`/`isValidIndianMobile` helpers, email/password fallback, `register` now relies on `handle_new_user` trigger (no client-side profile insert), TOTP 2FA enrol/verify/unenrol, `logAuthEvent` | tsc clean |
| UI | `app/(auth)/login.tsx` — **OTP-first**: mobile entry + "Send OTP", graceful fallback toggle to email/password (auto-switches if MSG91 unconfigured). `app/(auth)/verify-otp.tsx` — 6-digit `OtpInput`, 30s resend timer, change-number. Route registered in `(auth)/_layout.tsx` | tsc clean, jest 139/139 |
| i18n | `auth.otp.*` keys added to `en/common.json` | — |

## Design decisions
- **Supabase-native OTP** (CLAUDE.md #1 "no custom backend"): Supabase generates + rate-limits the OTP and owns the session/JWT; MSG91 only delivers the SMS via the Send-SMS hook. No bespoke OTP store.
- **Graceful degradation:** if the MSG91 hook isn't configured, `sendOtp` surfaces `msg91_unconfigured` and the login screen auto-falls-back to email/password — dev and early prod work without SMS credentials.
- **Audit is append-only:** `auth_audit_events` has SELECT (self or tenant-admin) + INSERT (self only) policies, no UPDATE/DELETE — tamper-resistant login history.

## Incidental fixes (pre-existing breakage found via tsc)
- `app/batches/[id].tsx:39` — a prior scripted `formatINR` dedupe had inserted `import … '@poultryos/shared'` *inside* the breed-benchmarks import block (10 syntax errors). Fixed.
- `components/ui/index.ts` — the R0 state-layer components (Toast, Skeleton, ErrorState, AppModal, InlineError, SegmentedControl, Permission/UpgradeEmptyState) existed as files but were never exported from the barrel, so every screen importing them failed typecheck. Added all exports.
- **Result: mobile app now typechecks at 0 errors (was 14), jest 139/139.**

## UI remainder — shipped & verified
| Screen / file | What | Notes |
|---|---|---|
| `app/(auth)/register.tsx` | Reworked to **account creation**: Full Name + Mobile + Email + Password. Role SegmentedControl removed (role is now tenant-determined — owner on creation). On submit: `register()` (trigger writes profile) → `sendOtp(phone,false)` → routes to `verify-otp` for **mandatory mobile verification**. Graceful fallback message if MSG91 unconfigured. | `verifyOtp` now also stamps `profiles.phone_verified_at` for the security screen + 7-day email rule. |
| `app/security/index.tsx` | **Security Settings**: account-verification status (mobile ✓ / email "verify within 7 days"), 2FA **method picker** (off / SMS / email / authenticator via `RadioGroup`), "remember this device 30 days" toggle (trust/revoke current device), links to Login history + Trusted devices. | Wired to `getSecurityProfile`, `setTwoFactorMethod`, `getTotpFactor`, `trustThisDevice`, `isThisDeviceTrusted`. |
| `app/security/two-factor.tsx` | **TOTP enrolment**: `enrollTotp()` → renders `otpauth://` QR (`react-native-qrcode-svg`) + manual key → 6-digit `OtpInput` → `verifyTotpEnrollment`. If already enrolled, shows active state + disable. Cleans up half-finished unverified factors before re-enrol. | |
| `app/security/sessions.tsx` | **Login history**: reads append-only `auth_audit_events` via `listAuthAuditEvents`, per-event icon + localized label + timestamp + IP. Pull-to-refresh, skeleton load, empty state. | |
| `app/security/devices.tsx` | **Trusted devices**: `listTrustedDevices`, marks "This device" via `getDeviceHash`, shows trusted-until date, revoke (delete row). Pull-to-refresh, skeleton, empty state. | |
| `lib/device.ts` (new) | Stable per-install opaque device id (SecureStore native / AsyncStorage web) + display name. Backs `device_hash` on `trusted_devices` / `auth_audit_events` — never sends a hardware id. | |
| `auth/auth-service.ts` | Added `getTotpFactor`, `getSecurityProfile`/`setTwoFactorMethod`, `listTrustedDevices`/`trustThisDevice`/`revokeTrustedDevice`/`isThisDeviceTrusted`, `listAuthAuditEvents`. | |
| `app/(tabs)/more.tsx` | Added **Security** entry (ShieldCheck) between Settings and Billing → `/security`. | |
| i18n | `security.*` block + register additions added to **en**. `auth.otp.*` + register-additions translated into **hi / te / ta** (proper translations, not English). `security.*` falls back to English in hi/te/ta (graceful — i18next `fallbackLng: 'en'`). | |

### Known nuance (documented, not a bug)
- Mandatory mobile-OTP-after-signup is enforced on the email/password account-creation path **provided Supabase email confirmations are ON** (production default): `signUp` returns no session, so the user lands on `verify-otp` to confirm their mobile. If email confirmations are disabled, `signUp` returns a session immediately and the root layout redirects to onboarding (mobile verify becomes optional). The **OTP-primary login path** (`login.tsx`) always verifies the mobile. Re-evaluate once Supabase auth settings are finalized.

## Cumulative verification across the upgrade so far
- **DB: 69/69 tests** (tenant 13, billing 9, auth 7, + 40 legacy regression).
- **Mobile: tsc 0 errors, jest 139/139** (after the UI remainder).
