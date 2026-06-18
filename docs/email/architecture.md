# Deliverable 2 — Email Architecture Report

## Two layers, one provider (Resend)

```
┌──────────────────────────── LAYER 1: Auth emails (GoTrue) ────────────────────────────┐
│  Supabase Auth owns: verify-email, password recovery, email-change, magic-link, invite │
│  Transport: Resend SMTP (smtp.resend.com:465, user "resend", pass = Resend API key)    │
│  Templates: supabase/templates/*.html  (config.toml [auth.email.template.*])           │
└────────────────────────────────────────────────────────────────────────────────────────┘

┌──────────────────── LAYER 2: App transactional emails (centralized) ───────────────────┐
│  Single path:  caller → send-email Edge Function → Resend HTTP API → email_messages_log │
│  Callers (service-role): web server actions/routes, billing Edge Functions, auth hooks  │
│  Template engine: supabase/functions/_shared/email-templates.ts (branded, a11y, dark)   │
└────────────────────────────────────────────────────────────────────────────────────────┘
```

Layer 1 fixes the broken auth-email path (and makes the dev shortcut deletable).
Layer 2 adds every other transactional email **without scattering provider
calls** — exactly the proven `send-whatsapp-message` pattern, reused.

## Components

| Component | Path | Responsibility |
|---|---|---|
| Template engine | `supabase/functions/_shared/email-templates.ts` | Branded HTML+plaintext renderer + registry of 13 templates; HTML-escapes all data; multi-tenant `brand` param |
| Sender function | `supabase/functions/send-email/index.ts` | Service-role auth, Zod validation, render, Resend POST, bounded retry, audit log, graceful `not_configured` |
| Audit table | `public.email_messages_log` | Immutable log (service-role write; tenant "money" members SELECT own rows) |
| Web helper | `frontend/lib/email/send.ts` | Server-only `sendTransactionalEmail()` — the ONLY web→email path |
| Edge helper | `supabase/functions/_shared/send-email-client.ts` | `dispatchEmail()` + `resolveTenantOwnerEmail()` for other functions |
| Auth SMTP + templates | `supabase/config.toml`, `supabase/templates/*.html` | GoTrue config + branded auth emails |

## Sequence — app transactional email (Layer 2)

```
caller ──POST {recipient, email_type, template_id, data, tenant_id}──▶ send-email
  send-email:
    1. auth: Bearer/apikey == SUPABASE_SERVICE_ROLE_KEY      (else 401)
    2. Zod validate + template_id ∈ registry                 (else 400)
    3. renderEmail(template_id, data, brand)                 (esc all data)
    4. if no RESEND_API_KEY/MAIL_FROM → log 'failed'(not_configured), return  (no throw)
    5. POST api.resend.com/emails, retry 429/5xx ×3 (300/600ms backoff)
    6. INSERT email_messages_log (sent|failed, resend id, attempts)  ALWAYS
    7. return { sent, log_id, resend_message_id }
```

## Sequence — auth email (Layer 1)

```
user action (signup/reset/email-change) ─▶ GoTrue
  GoTrue renders supabase/templates/<type>.html with {{ .ConfirmationURL }} …
  GoTrue sends via Resend SMTP ─▶ inbox
  user clicks link ─▶ /auth/callback?code=…&next=… ─▶ exchangeCodeForSession
      └─ if next=/onboarding → fire 'welcome' via send-email (Layer 2)
```

## Wiring map (which event → which email)

| Trigger | Layer | Template | Wired in |
|---|---|---|---|
| Sign-up | 1 | confirmation | GoTrue + `register/page.tsx` |
| First confirmation | 2 | welcome | `frontend/app/auth/callback/route.ts` |
| Forgot password | 1 | recovery | `forgot-password/page.tsx` |
| Password updated | 2 | password_changed | `reset-password/{page,actions}.tsx` |
| Email change | 1 | email-change | GoTrue (`double_confirm_changes`) |
| Magic link | 1 | magic-link | GoTrue |
| Team invite (email) | 2 | tenant_invitation | `team/{InviteForm,actions}.ts` |
| Trial/sub expiry reminders | 2 | trial_expiring / subscription_expired | `subscription-lifecycle` |
| Payment captured | 2 | payment_success | `razorpay-webhook` |
| Payment failed | 2 | payment_failed | `razorpay-webhook` |
| login_alert / security_alert / trial_started / subscription_activated / system_notification | 2 | (same names) | available in registry; call `send-email` from any future hook |

## Reliability

- **Retry:** bounded (max 3), exponential (300/600ms), only on 429/5xx and
  network errors. 4xx (bad address) does not retry.
- **Idempotency-friendly:** the email layer never decides *whether* to send —
  callers gate that (e.g. `subscription-lifecycle` records an idempotent
  reminder row; `razorpay-webhook` de-dupes by event id). No email storms.
- **Audit:** every attempt logs a row, success or failure, with `attempts`.
- **Graceful degrade:** missing creds → logged `not_configured`, never throws —
  a user flow (signup, payment) is never broken because email isn't wired.

## Multi-tenant / white-label

`send-email` resolves brand from env defaults, then merges a per-call `brand`
override. A second brand/domain needs only: a verified Resend domain, a `brand`
object, and (optionally) a distinct `MAIL_FROM` — **no code change**.
