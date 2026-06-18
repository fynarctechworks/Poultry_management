# UAT Deployment Checklist — Email Infrastructure

Follow top to bottom. **P0** = required for UAT email to work. **P1** = needed for
billing emails (harder to test; can follow later). Domain: `infynarc.com`,
app `poultryosadmin.infynarc.com`.

---

## Already done (no action needed)
- ✅ `email_messages_log` table + RLS applied to the hosted project.
- ✅ `send-email` Edge Function deployed (ACTIVE v1) — graceful until keys set.
- ✅ All web wiring (welcome, invite, password-changed) — typechecks clean.
- ✅ Dev verification shortcut removed; `enable_confirmations = true`.
- ✅ Branded auth + transactional templates with your real domain.

---

## STEP 1 — Resend account + domain (P0)
1. Sign up at https://resend.com (the signup email becomes your "test" recipient).
2. **Domains → Add Domain →** `poultryosadmin.infynarc.com`.
3. Copy the DNS records Resend shows.

> ⚠️ **Before the domain is verified**, Resend only lets you send **to your own
> account email**. That's fine for a first UAT smoke test. Custom `MAIL_FROM` and
> sending to other testers require the domain to be **verified** (step 2).

## STEP 2 — DNS records at your registrar (P0)
Add the records from Resend under `infynarc.com` (hosts relative to the zone):

| Type | Host | Value |
|---|---|---|
| TXT | `resend._domainkey.poultryosadmin` | DKIM key from Resend |
| TXT | `send.poultryosadmin` | `v=spf1 include:amazonses.com ~all` (Resend's) |
| MX | `send.poultryosadmin` | `feedback-smtp.<region>.amazonses.com` (pri 10) |
| TXT | `_dmarc.poultryosadmin` | `v=DMARC1; p=none; rua=mailto:dmarc@infynarc.com; fo=1` |

Back in Resend → **Verify** → wait for green (minutes to ~1 hour).

## STEP 3 — Resend API key (P0)
**API Keys → Create** (Sending access). Copy once. Used for API **and** SMTP.

## STEP 4 — Supabase Edge Function secrets (P0)
Dashboard → **Project Settings → Edge Functions → Secrets** (or CLI):
```bash
supabase secrets set \
  RESEND_API_KEY=re_xxx \
  "MAIL_FROM=PoultryOS <noreply@poultryosadmin.infynarc.com>" \
  MAIL_REPLY_TO=support@infynarc.com \
  MAIL_SENDER_NAME=PoultryOS \
  MAIL_PRODUCT_NAME=PoultryOS \
  MAIL_APP_URL=https://poultryosadmin.infynarc.com
```
> ⚠️ Make sure `support@infynarc.com` is a real inbox you can read, or change it.

## STEP 5 — Supabase Auth custom SMTP + URLs (P0)
Dashboard → **Authentication → Emails → SMTP Settings → Enable custom SMTP**:
- Host `smtp.resend.com` · Port `465` · User `resend` · Pass = *your API key*
- Sender `noreply@poultryosadmin.infynarc.com` · Name `PoultryOS`

Dashboard → **Authentication → URL Configuration**:
- Site URL: `https://poultryosadmin.infynarc.com`
- Redirect URLs: `https://poultryosadmin.infynarc.com/auth/callback`

Dashboard → **Authentication → Emails → Templates**: paste the contents of
`supabase/templates/{confirmation,recovery,email-change,magic-link,invite}.html`
into the matching template (optional but recommended — these are the branded ones).

## STEP 6 — Web app env on your host (P0)
Set on the deployment for `poultryosadmin.infynarc.com`:
```
NEXT_PUBLIC_SUPABASE_URL=https://jusxngbfdmzhlybohell.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<current anon key from dashboard>
SUPABASE_SERVICE_ROLE_KEY=<current service-role key from dashboard>
NEXT_PUBLIC_SITE_URL=https://poultryosadmin.infynarc.com
```
> ⚠️ Use the **current** keys from the dashboard (Project Settings → API). Older
> local keys in the repo are stale against this project.
> ⚠️ Do **not** set `DEV_EMAIL_VERIFY` anywhere — the shortcut is gone.

Deploy the web app.

## STEP 7 — Redeploy billing functions (P1 — for billing emails)
```bash
supabase link --project-ref jusxngbfdmzhlybohell   # if not linked
supabase functions deploy subscription-lifecycle
supabase functions deploy razorpay-webhook
# optional: re-sync send-email after the domain edits
supabase functions deploy send-email
```
(The CLI bundles `_shared/` automatically.) Skip for the first UAT pass if you're
only testing auth/invite/welcome.

## STEP 8 — Leaked-password protection (P0, 1 click)
Dashboard → **Authentication → Policies → Leaked password protection → On**.

---

## UAT TEST PASS — record results

| # | Flow | How | Expected | Pass? |
|---|---|---|---|---|
| 1 | Verify email | Register a new account | Branded confirmation email arrives; link → onboarding; **welcome** email arrives | ☐ |
| 2 | Forgot password | Forgot-password → email → set new pwd | Recovery email arrives; reset works; **password-changed** alert arrives | ☐ |
| 3 | Invitation | Team → invite with an email | Invitee gets branded invitation | ☐ |
| 4 | Failure path | `send-email` to an invalid address | `email_messages_log` row `failed`, no retry storm | ☐ |
| 5 | (P1) Payment success | Razorpay test charge | Owner gets payment email; log `sent` | ☐ |
| 6 | (P1) Trial/sub expiry | Invoke `subscription-lifecycle` | Owner gets expiry email | ☐ |

**Audit check after any test:**
```sql
select email_type, status, error_message, attempts, created_at
from public.email_messages_log order by created_at desc limit 10;
```

**Quick send-email smoke (after step 4):**
```bash
SRK="<current service-role key>"
curl -s -X POST "https://jusxngbfdmzhlybohell.supabase.co/functions/v1/send-email" \
  -H "Authorization: Bearer $SRK" -H "apikey: $SRK" -H "Content-Type: application/json" \
  -d '{"recipient_email":"<your-resend-account-email>","email_type":"welcome","template_id":"welcome","template_data":{"name":"UAT"}}'
# expect {"sent":true,...} once keys+domain are set; {"sent":false,"reason":"not_configured"} before
```

---

## If something fails
- Email not arriving → check Resend **Logs** (per-message status) + `email_messages_log.error_message`.
- Auth email not arriving → SMTP not enabled/verified in dashboard, or domain not green in Resend.
- Verify link points to wrong host → Site URL/redirect not set (step 5).
- `not_configured` in logs → secrets not set (step 4) or function not redeployed.
- Web email no-op → web app missing `SUPABASE_SERVICE_ROLE_KEY` (step 6).
