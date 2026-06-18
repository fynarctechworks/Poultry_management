# Deliverable 7 — Testing Report

## A. Verified now (in this implementation)

| Check | Result |
|---|---|
| Migration applied to hosted project (`jusxngbfdmzhlybohell`) | ✅ `email_messages_log` created |
| RLS enabled + policy present | ✅ `relrowsecurity = true`; policy `email_log_money_select` (SELECT) |
| Prerequisites exist (`tenants`, `is_tenant_member`, `is_tenant_money`, `tg_set_updated_at`) | ✅ confirmed pre-apply |
| Security advisor for new table | ✅ **no** advisory for `email_messages_log` |
| `send-email` Edge Function deployed | ✅ status `ACTIVE`, version 1, `verify_jwt = true` |
| Dev verification shortcut removed | ✅ route deleted; only a "REMOVED" comment remains in `config.toml`; no `DEV_EMAIL_VERIFY` in any `.env.example` |
| `verify-email` page dev button removed | ✅ |
| No hardcoded provider secrets in tracked code | ✅ grep clean (placeholders only in `.env.example`) |
| Single email paths enforced | ✅ all callers go through `sendTransactionalEmail` / `dispatchEmail` / `send-email` |

## B. `send-email` graceful-degrade test (no key needed)

The function is live but `RESEND_API_KEY`/`MAIL_FROM` are not yet set, so it
returns `not_configured` and logs a `failed` row — proving the safe path. Run
after you have the service-role key (it is the caller token):

```bash
SRK="<SUPABASE_SERVICE_ROLE_KEY>"
curl -s -X POST "https://jusxngbfdmzhlybohell.supabase.co/functions/v1/send-email" \
  -H "Authorization: Bearer $SRK" -H "apikey: $SRK" -H "Content-Type: application/json" \
  -d '{"recipient_email":"you@example.com","email_type":"welcome","template_id":"welcome","template_data":{"name":"Test"}}'
# expected before keys: {"sent":false,"reason":"not_configured","log_id":"…"}
# expected after  keys: {"sent":true,"log_id":"…","resend_message_id":"…"}
```
Then confirm the audit row:
```sql
select email_type, status, error_message, attempts, created_at
from public.email_messages_log order by created_at desc limit 5;
```

## C. Local auth-email test (no provider account needed)

`enable_confirmations = true` + local Inbucket:
```bash
supabase start
# register at http://127.0.0.1:3000/register
# open Inbucket http://127.0.0.1:54324 → confirmation email → click link
# → redirected to /auth/callback?next=/onboarding → onboarding loads
```
This exercises the branded confirmation template and the welcome-email trigger
end to end without Resend.

## D. Live smoke tests (you, after dns-setup.md)

| Flow | How | Pass criteria |
|---|---|---|
| Verify email | Register a new account | Branded confirmation email arrives; link confirms; welcome email arrives |
| Forgot/reset password | Forgot-password → email → set new password | Recovery email arrives; reset works; **password-changed** alert arrives |
| Tenant invitation | Team → invite with an email | Invitee receives branded invitation |
| Payment success/failed | Razorpay test charge / failed mandate | Owner receives payment email; `email_messages_log` row `sent` |
| Trial/subscription expiry | Trigger `subscription-lifecycle` (cron or manual invoke) | Owner receives expiry email |
| Failure path | Send to an invalid address | `email_messages_log` row `failed`, no retry storm (`attempts` ≤ 3) |

Record results inline here after the live run (date, flow, sent/failed, Resend
message id).

## E. Negative/security tests

| Test | Expected |
|---|---|
| Call `send-email` without service-role token | `401 Unauthorized` |
| Unknown `template_id` | `400 Unknown template_id` |
| `notifyPasswordChanged` with spoofed body | Ignores body; uses session email only |
| `sendInvitationEmail` for a farm you don't own | `{ sent:false, reason:'not_farm_owner' }` |
| Read another tenant's `email_messages_log` rows | Empty (RLS) |
