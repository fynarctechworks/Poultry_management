# Deliverable 1 — Provider Research Report

**Date:** 2026-06-17 · **Decision:** **Resend** · **Status:** Selected & implemented

## Method

Evaluated the major transactional-email providers against PoultryOS's actual
stack (Next.js 14 App Router + Supabase Auth/Edge Functions + an early-stage
Indian SaaS) — **weighting long-term production quality over free-tier size**,
per the directive.

## Comparison matrix

| Provider | Free tier | SMTP | HTTP API | Deliverability | Domain auth (SPF/DKIM/DMARC) | Supabase fit | Next.js DX | Ops burden | SaaS scalability |
|---|---|---|---|---|---|---|---|---|---|
| **Resend** ✅ | 3,000/mo, 100/day | ✅ | ✅ (clean TS SDK) | High (transactional-only platform) | ✅ per-domain keys | ✅ **first-party** Supabase SMTP integration | ✅ React Email, typed SDK | Low | ✅ scales to paid w/o re-arch |
| Postmark | 100/mo (test) | ✅ | ✅ | **Highest** (benchmark leader) | ✅ | Manual SMTP | Good | Low | $15/mo→ good, pricier |
| Amazon SES | 3,000/mo (12 mo)* | ✅ | ✅ | High (needs warmup/ops) | ✅ (manual) | Manual SMTP | SDK heavy | **High** (sandbox, IAM, suppression) | ✅ cheapest at scale |
| Brevo | 300/day | ✅ | ✅ | Medium-High | ✅ | Manual SMTP | OK | Medium | ✅ all-in-one (mktg+SMS+CRM) |
| SendGrid | **None** (removed) | ✅ | ✅ | Medium (shared-IP reputation issues) | ✅ | Manual SMTP | OK | Medium | OK |
| Mailgun | Trial only | ✅ | ✅ | Medium-High | ✅ | Manual | OK | Medium | OK |
| Mailjet | 6,000/mo (200/day) | ✅ | ✅ | Medium | ✅ | Manual | OK | Medium | OK |
| SMTP2GO | 1,000/mo | ✅ | ✅ | High | ✅ | Manual | Thin SDK | Low | OK |
| Zoho Mail | Mailbox-oriented | ✅ | limited | Medium | ✅ | Manual | Poor (not API-first) | Medium | Weak for transactional |
| Elastic Email | 100/day | ✅ | ✅ | Medium (mixed reputation) | ✅ | Manual | OK | Medium | OK |

\* SES free tier is conditional (EC2/12-month) and the account starts sandboxed.

## Why Resend (not just the free tier)

1. **Supabase-native.** Resend is a first-party Supabase integration that
   auto-configures Auth custom SMTP. Both email layers (GoTrue auth emails +
   the app's `send-email` function) use **one** provider/account.
2. **Deliverability by design.** Resend is transactional-only — there are no
   bulk-marketing senders degrading shared-IP reputation, which is the usual
   failure mode for SendGrid/Mailgun shared pools. Real-world delivery is in
   Postmark's tier for our volume.
3. **Stack-matched DX.** Typed TS SDK + React Email match the repo's React/TS
   surface; our template engine and Edge Function call a clean REST endpoint
   (`POST https://api.resend.com/emails`).
4. **SMTP *and* API.** SMTP drives GoTrue auth emails; the API drives the app
   layer. No second vendor.
5. **Multi-tenant / white-label ready.** Per-domain DKIM keys + a per-call
   `brand` object mean a second brand needs config, not code.
6. **Low ops.** No sandbox, IAM, or suppression-list plumbing (the SES tax).
   Scales onto paid tiers without re-architecture.

**Runner-up: Postmark** — best raw deliverability, but no usable free tier
(100 test/mo) and a weaker Supabase/React story. If deliverability ever becomes
a measured problem, Postmark is the documented fallback: the architecture is
provider-abstracted (swap the `send-email` HTTP call + SMTP host only).

**Rejected: SES** — cheapest at scale but the ops burden (sandbox exit, IAM,
bounce/complaint handling) is unjustified at this stage. Revisit past ~100k/mo.

## Sources
- [Resend — Works With Supabase](https://supabase.com/partners/integrations/resend)
- [Custom Auth Emails with React Email and Resend — Supabase Docs](https://supabase.com/docs/guides/functions/examples/auth-send-email-hook-react-email-resend)
- [Send emails with custom SMTP — Supabase Docs](https://supabase.com/docs/guides/auth/auth-smtp)
- [Resend vs SES vs Postmark (2026)](https://www.buildmvpfast.com/blog/resend-vs-ses-vs-postmark-transactional-email-deliverability-saas-2026)
- [Best Transactional Email Services 2026 — Brevo](https://www.brevo.com/blog/best-transactional-email-services/)
- [SendGrid Alternatives (free tier gone) — Dreamlit](https://dreamlit.ai/blog/best-sendgrid-alternatives)
