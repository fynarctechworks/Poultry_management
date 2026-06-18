# Deliverable 5 — DNS & Go-Live Setup Guide (YOUR action items)

Everything in code is done. These steps require your accounts/DNS and cannot be
done from the codebase.

**Your domain:** `infynarc.com`
**App host:** `poultryosadmin.infynarc.com`
**Email sending domain:** `poultryosadmin.infynarc.com` (one subdomain for both —
keeps PoultryOS mail reputation isolated from your root `infynarc.com` inbox).

## 1. Create a Resend account & add the domain
1. Sign up at https://resend.com.
2. **Domains → Add Domain** → enter `poultryosadmin.infynarc.com`.
3. Resend shows the exact DNS records to add (DKIM key is generated per domain).

## 2. Add the DNS records at your registrar (under infynarc.com)
Resend gives you concrete values; the record **types/hosts** are:

| Purpose | Type | Host/Name | Value (use Resend's exact values) |
|---|---|---|---|
| DKIM (signing) | `TXT` | `resend._domainkey.poultryosadmin` | `p=MIGfMA0…` (DKIM public key from Resend) |
| SPF (authorize sender) | `TXT` | `send.poultryosadmin` | `v=spf1 include:amazonses.com ~all` (Resend's include) |
| Return-Path / bounce | `MX` | `send.poultryosadmin` | `feedback-smtp.<region>.amazonses.com` (from Resend), priority 10 |
| DMARC (policy) | `TXT` | `_dmarc.poultryosadmin` | `v=DMARC1; p=none; rua=mailto:dmarc@infynarc.com; fo=1` |

> Host names are relative to `infynarc.com`. If your DNS panel wants the full
> name, use e.g. `resend._domainkey.poultryosadmin.infynarc.com`.

DMARC ramp: start `p=none` (monitor via the `rua` reports for 1–2 weeks), then
tighten to `p=quarantine`, and finally `p=reject` once SPF + DKIM pass cleanly.

4. Back in Resend, click **Verify**. Wait for all records to go green.

## 3. Create a Resend API key
**API Keys → Create** → scope "Sending access". Copy it (shown once).
This single key is used for **both** the HTTP API and SMTP password.

## 4. Set the Supabase Edge Function secrets (Layer 2)
```bash
supabase secrets set \
  RESEND_API_KEY=re_xxx \
  "MAIL_FROM=PoultryOS <noreply@poultryosadmin.infynarc.com>" \
  MAIL_REPLY_TO=support@infynarc.com \
  MAIL_SENDER_NAME=PoultryOS \
  MAIL_PRODUCT_NAME=PoultryOS \
  MAIL_APP_URL=https://poultryosadmin.infynarc.com
```
(`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are auto-injected in the hosted runtime.)

## 5. Configure Supabase Auth custom SMTP (Layer 1)
Dashboard → **Authentication → Emails → SMTP Settings → Enable custom SMTP**:
- Host: `smtp.resend.com`
- Port: `465`
- Username: `resend`
- Password: *your Resend API key* (same as step 3)
- Sender email: `noreply@poultryosadmin.infynarc.com` · Sender name: `PoultryOS`

Then **Authentication → URL Configuration**:
- Site URL: `https://poultryosadmin.infynarc.com`
- Redirect URLs: add `https://poultryosadmin.infynarc.com/auth/callback`

The branded GoTrue templates in `supabase/templates/*.html` are applied on the
hosted project automatically when you deploy config, or paste their contents
into **Authentication → Emails → Templates** for each type.

## 6. Set the web app env (Vercel / host)
- `NEXT_PUBLIC_SITE_URL=https://poultryosadmin.infynarc.com`
- `SUPABASE_SERVICE_ROLE_KEY` (already required) — used by web→`send-email` calls.
- Ensure `DEV_EMAIL_VERIFY` / `NEXT_PUBLIC_DEV_EMAIL_VERIFY` are **absent**.

## 7. Redeploy callers
The new wiring lives in code that must be deployed:
```bash
supabase functions deploy subscription-lifecycle
supabase functions deploy razorpay-webhook
# send-email is already deployed (v1). Redeploy after any edit:
supabase functions deploy send-email
```
And deploy the web app for the welcome/invite/password-changed wiring.

## 8. Flip on leaked-password protection
Dashboard → **Authentication → Policies → "Leaked password protection" → On**
(clears advisor `auth_leaked_password_protection`).

## 9. Verify
Run the smoke tests in `testing.md`.
