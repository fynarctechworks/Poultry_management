# Deliverable 3 — Code Audit Report

## Scope

Full repo sweep for email/auth/SMTP surface across `mobile-app/`, `frontend/`,
`saas-control-center/`, `supabase/`.

## What existed before this change

| Area | Finding |
|---|---|
| Transactional email provider | **None.** No Resend/SES/SMTP/nodemailer anywhere. |
| Auth emails | Routed through Supabase GoTrue with **no custom SMTP** → built-in sender (~2–4/hr, not production-usable). `config.toml` had `enable_confirmations = false`. |
| Dev workaround | `frontend/app/auth/dev-verify/route.ts` + `DEV_EMAIL_VERIFY`/`NEXT_PUBLIC_DEV_EMAIL_VERIFY` flags + a "Verify now (dev)" button on `verify-email/page.tsx` — confirmed accounts via the service-role Admin API, bypassing real email. |
| Forgot/reset | `forgot-password/page.tsx` → `resetPasswordForEmail` (neutral "if an account exists" copy — good, no enumeration). `reset-password/page.tsx` → `updateUser({password})`. Both depended on GoTrue email that never delivered. |
| Invites | `team/InviteForm.tsx` — **phone-based**, inserts `farm_users`; no email at all. |
| Billing/subscription | `subscription-lifecycle` (push only, no email), `razorpay-webhook` (no email). WhatsApp-first per CLAUDE.md. |
| Pattern to reuse | `supabase/functions/send-whatsapp-message/index.ts` — service-role auth, Zod, graceful-degrade, always-audit-log. Mirrored for `send-email`. |
| Audit table precedent | `whatsapp_messages_log` + tenant RLS (`is_tenant_member`/`is_tenant_money`). Mirrored for `email_messages_log`. |

## Issues found & resolved

1. **No real email delivery** → built Layer 1 (Resend SMTP) + Layer 2 (centralized `send-email`).
2. **Dev verification bypass present** → deleted route, flags, and UI button (see security-audit.md).
3. **No app-level transactional email** → added welcome, invite, billing, payment, security templates + wiring.
4. **Scattered-call risk** → enforced single paths: `frontend/lib/email/send.ts` (web), `_shared/send-email-client.ts` (edge). No component calls Resend directly.

## Files created

- `supabase/migrations/20260617000000_email_messages_log.sql`
- `supabase/functions/send-email/index.ts`
- `supabase/functions/_shared/email-templates.ts`
- `supabase/functions/_shared/send-email-client.ts`
- `supabase/templates/{confirmation,recovery,email-change,magic-link,invite}.html`
- `supabase/.env.example`
- `frontend/lib/email/send.ts`
- `frontend/app/(dashboard)/team/actions.ts`
- `frontend/app/(auth)/reset-password/actions.ts`
- `docs/email/*` (8 reports)

## Files modified

- `supabase/config.toml` (enable_confirmations, SMTP block, template refs)
- `supabase/functions/subscription-lifecycle/index.ts` (email dispatch)
- `supabase/functions/razorpay-webhook/index.ts` (payment emails)
- `frontend/app/auth/callback/route.ts` (welcome email)
- `frontend/app/(auth)/verify-email/page.tsx` (removed dev button)
- `frontend/app/(auth)/reset-password/page.tsx` (password-changed alert)
- `frontend/app/(dashboard)/team/InviteForm.tsx` (optional email + send)
- `frontend/.env.example`, `saas-control-center/.env.example`

## Files deleted

- `frontend/app/auth/dev-verify/route.ts`
