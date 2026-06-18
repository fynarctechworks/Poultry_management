# Deliverable 4 — Email Security Audit

## Summary

| Control | Status | Notes |
|---|---|---|
| Dev verification bypass removed | ✅ | Route, env flags, and UI button deleted. The anon DB backdoor was already dropped (migration `20260613170000`); this removes the remaining service-role shortcut entirely. |
| Email enumeration (forgot-password) | ✅ Safe | UI shows neutral *"If an account exists for X…"* regardless of outcome. Supabase `resetPasswordForEmail` does not reveal existence. |
| Email enumeration (signup) | ⚠️ Inherent | Supabase returns a distinguishable response on duplicate email — a platform-level behavior, not introduced here. Mitigation: rate-limit (Supabase Auth default) + monitor. |
| Credential exposure | ✅ | `RESEND_API_KEY`, `RESEND_SMTP_PASSWORD`, `SUPABASE_SERVICE_ROLE_KEY` are server-only / Edge Function secrets. No `NEXT_PUBLIC_` prefix. `.env.example` files carry placeholders only. Verified by grep (see testing.md). |
| `send-email` authorization | ✅ | Service-role Bearer/apikey only (verbatim with `send-whatsapp-message`); `verify_jwt = true` at the gateway too. No user JWT path. |
| Recipient spoofing (security emails) | ✅ | `notifyPasswordChanged` reads the email from the **server session**, not client input. `sendInvitationEmail` verifies the caller **owns** the target farm before sending. |
| HTML injection in emails | ✅ | All interpolated data passes through `esc()` (HTML-entity escaping) in the template engine. |
| Audit trail integrity | ✅ | `email_messages_log` has no client INSERT/UPDATE/DELETE policy → immutable from clients; service-role writes only; SELECT limited to tenant "money" members of the owning tenant. NULL-tenant rows visible to service role only. |
| Reset/verify flow integrity | ✅ | `enable_confirmations = true`; recovery + confirmation links are single-use, time-limited GoTrue tokens delivered over authenticated SMTP (TLS 465). |
| Email-change protection | ✅ | `double_confirm_changes = true` — confirmation required on both old and new address. |
| SMTP transport | ✅ | Implicit TLS on port 465 to `smtp.resend.com`. |
| Leaked-password protection | ⚠️ TODO (you) | HaveIBeenPwned check is a hosted Auth setting (advisor `auth_leaked_password_protection`), still OFF. Enable in dashboard — see dns-setup.md step 8. |

## Residual risks / follow-ups

1. **Leaked-password protection** — enable in the Supabase dashboard (one toggle).
2. **Signup enumeration** — accept platform behavior or add a generic
   "check your email" response on the register page (low priority).
3. **Bounce/complaint feedback** — optional: add a Resend webhook → update
   `email_messages_log.status` to `bounced`/`complained` (schema already supports
   these statuses). Not required for launch.

## Verified clean

- `get_advisors(security)` reports **no** advisory for `email_messages_log`
  (RLS enabled + policy present).
- No secrets committed (grep over tracked files — see testing.md).
