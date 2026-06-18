# Deliverable 8 — Migration Report

Everything changed in the repository for production email infrastructure.

## Database
- **New migration** `supabase/migrations/20260617000000_email_messages_log.sql`
  — `email_messages_log` table (nullable `tenant_id`, 15 email types, status
  enum incl. bounced/complained, attempts), 3 indexes, `updated_at` trigger,
  RLS (`email_log_money_select`). **Applied to hosted project** via MCP.

## Edge Functions
- **New** `supabase/functions/send-email/index.ts` — centralized sender.
  **Deployed** (ACTIVE v1, `verify_jwt=true`).
- **New** `supabase/functions/_shared/email-templates.ts` — branded template
  engine (13 templates + base layout, HTML+plaintext, dark mode, a11y).
- **New** `supabase/functions/_shared/send-email-client.ts` — `dispatchEmail` +
  `resolveTenantOwnerEmail` for inter-function calls.
- **Modified** `supabase/functions/subscription-lifecycle/index.ts` — emails
  `trial_expiring` / `subscription_expired` alongside push.
- **Modified** `supabase/functions/razorpay-webhook/index.ts` — emails
  `payment_success` (on charge) and `payment_failed`.

## Auth (GoTrue)
- **Modified** `supabase/config.toml` — `enable_confirmations = true`;
  `[auth.email.template.*]` → 5 branded templates; documented `[auth.email.smtp]`
  Resend block (disabled locally → Inbucket; enabled in hosted dashboard).
- **New** `supabase/templates/{confirmation,recovery,email-change,magic-link,invite}.html`.

## Web (frontend)
- **New** `frontend/lib/email/send.ts` — server-only `sendTransactionalEmail`.
- **New** `frontend/app/(dashboard)/team/actions.ts` — `sendInvitationEmail`.
- **New** `frontend/app/(auth)/reset-password/actions.ts` — `notifyPasswordChanged`.
- **Modified** `frontend/app/auth/callback/route.ts` — welcome email on first confirm.
- **Modified** `frontend/app/(auth)/reset-password/page.tsx` — fire password-changed alert.
- **Modified** `frontend/app/(dashboard)/team/InviteForm.tsx` — optional email + send.
- **Modified** `frontend/app/(auth)/verify-email/page.tsx` — removed dev button.
- **Deleted** `frontend/app/auth/dev-verify/route.ts`.

## Env / config
- **New** `supabase/.env.example` — canonical Edge Function secret reference.
- **Modified** `frontend/.env.example` — removed `DEV_EMAIL_VERIFY` flags; added
  `NEXT_PUBLIC_SITE_URL` + mail-var documentation.
- **Modified** `saas-control-center/.env.example` — added mail/site-url notes.

## Docs (new `docs/email/`)
`provider-research.md`, `architecture.md`, `code-audit.md`, `security-audit.md`,
`dns-setup.md`, `env-vars.md`, `testing.md`, `migration-report.md`.

## Not done in code (requires your accounts/DNS — see dns-setup.md)
Resend account + domain verification + DNS (SPF/DKIM/DMARC), set secrets
(`RESEND_API_KEY`, `MAIL_FROM`, `RESEND_SMTP_PASSWORD`, …), enable hosted Auth
custom SMTP, redeploy `subscription-lifecycle` + `razorpay-webhook` + web app,
enable leaked-password protection, run live smoke tests.

## Rollback
- Drop table: `DROP TABLE public.email_messages_log;`
- Delete function `send-email` (dashboard) — no other code hard-depends on it
  (callers degrade gracefully).
- Revert `config.toml` `enable_confirmations` to `false` to restore prior auth
  behavior (not recommended — that was the broken state).
