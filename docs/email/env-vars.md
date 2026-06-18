# Deliverable 6 — Environment Variable Documentation

All secrets are **server-only**. None carry a `NEXT_PUBLIC_` prefix.
Canonical reference file: `supabase/.env.example`.

## Layer 2 (send-email Edge Function) — Supabase Edge Function secrets

| Variable | Required | Example | Purpose |
|---|---|---|---|
| `RESEND_API_KEY` | ✅ | `re_xxx` | Resend HTTP API auth. Absent → function logs `not_configured`, never throws. |
| `MAIL_FROM` | ✅ | `PoultryOS <noreply@poultryosadmin.infynarc.com>` | Verified sender. Must be on a Resend-verified domain. |
| `MAIL_REPLY_TO` | ✅ | `support@infynarc.com` | Reply-to + footer "need help?" + `support@` in templates. |
| `MAIL_SENDER_NAME` | optional | `PoultryOS` | Brand `fromName`. |
| `MAIL_PRODUCT_NAME` | optional | `PoultryOS` | Brand product name in templates. |
| `MAIL_APP_URL` | optional | `https://poultryosadmin.infynarc.com` | Base URL for links inside emails. |
| `SUPABASE_URL` | auto | — | Injected in hosted runtime. |
| `SUPABASE_SERVICE_ROLE_KEY` | auto | — | Injected in hosted runtime; also the caller auth token. |

## Layer 1 (GoTrue auth emails) — Supabase Auth SMTP

| Variable | Where | Example | Purpose |
|---|---|---|---|
| `RESEND_SMTP_PASSWORD` | `supabase/.env` (local) / dashboard (hosted) | `re_xxx` | SMTP password = a Resend API key. Local `config.toml [auth.email.smtp]` reads `env(RESEND_SMTP_PASSWORD)`; hosted uses the dashboard SMTP form. |

> SMTP host/port/user are constants (`smtp.resend.com` / `465` / `resend`) set
> in `config.toml` and the dashboard — not env vars.

## Web apps (frontend / saas-control-center)

| Variable | Required | Example | Purpose |
|---|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | ✅ | `https://<ref>.supabase.co` | Supabase client. |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | ✅ | `eyJ…` | Supabase client (public). |
| `SUPABASE_SERVICE_ROLE_KEY` | ✅ | `eyJ…` | Server-only; authorizes web→`send-email` calls. |
| `NEXT_PUBLIC_SITE_URL` | ✅ | `https://poultryosadmin.infynarc.com` | Absolute links in invitation emails / callbacks. |

## Removed (do not set anywhere)

| Variable | Reason |
|---|---|
| `DEV_EMAIL_VERIFY` | Dev verification shortcut deleted — real email is the only path. |
| `NEXT_PUBLIC_DEV_EMAIL_VERIFY` | Same. |
