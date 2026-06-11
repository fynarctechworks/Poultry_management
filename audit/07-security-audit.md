# 07 — Security Audit

_Audit date: 2026-06-11. Scope: RLS policies, Edge Function auth, webhook verification, secrets handling, input validation, abuse surfaces. Severity: 🔴 High · 🟠 Medium · 🟡 Low · ✅ Strength._

## Executive summary

The security posture is **above average for a pre-launch product** — RLS on all 21 tables, pinned `search_path` on every function, REVOKE discipline on SECURITY DEFINER RPCs, HMAC-verified webhooks with constant-time comparison, and RLS-scoped Edge Function reads. There is **one high-severity data-exposure bug** (anon traceability enumeration), a class of **fail-open webhook defaults** that must be flipped before production, and the standard pre-launch gaps (no rate limiting, no abuse controls on auth).

---

## 🔴 H1 · Anonymous users can enumerate the entire traceability_records table

**Policy** ([initial_schema.sql:1073-1074](supabase/migrations/20260502000000_initial_schema.sql#L1073)):
```sql
CREATE POLICY traceability_anon_select ON public.traceability_records
  FOR SELECT TO anon USING (qr_token IS NOT NULL);
```
`qr_token` is `NOT NULL DEFAULT …` for every row, so this predicate is **always true** — any holder of the public anon key (it ships in both client bundles) can run
`GET /rest/v1/traceability_records?select=*` and dump **all farms'** records: supplier names, breed, placement/harvest dates, health-incident counts, buyer names, and every `qr_token` (defeating the unguessable-token design). RLS cannot express "only when filtered by token".

**Fix (pick one):**
1. Drop the anon policy; replace the public page's read with a SECURITY DEFINER RPC `get_traceability_by_token(p_token TEXT)` returning one row (and `REVOKE`/`GRANT EXECUTE TO anon`). Update [web/app/traceability/[token]/page.tsx:11-15](web/app/traceability/[token]/page.tsx#L11) to call `.rpc()`.
2. Or a `security_invoker=false` view exposing only token-matched lookups.

Option 1 matches the codebase's existing RPC patterns. Effort: ~1 hour including a pgTAP test.

## 🔴 H2 · Webhooks fail open when secrets are unset

Both inbound-money/state webhooks accept **unauthenticated** requests when their secret env var is missing:
- [razorpay-webhook/index.ts:107-111](supabase/functions/razorpay-webhook/index.ts#L107) — unsigned request can mark arbitrary `financial_transactions` paid (attacker needs only a transaction UUID) and flip any `profiles.subscription_status` to `active` given a guessed/known `subscription_id`.
- [aisensy-webhook/index.ts:155-158](supabase/functions/aisensy-webhook/index.ts#L155) — unsigned status spoofing + STOP/RESUME manipulation.

The "deploy before vendor is live" intent is documented in-file, but this is exactly the config that ships to production by accident (the secrets are unchecked items in [phase-5-launch-readiness.md §1.5](tasks/phase-5-launch-readiness.md)).
**Fix**: add `REQUIRE_WEBHOOK_SIGNATURES=true` (default on) or simply fail closed with 503 when the secret is unset; add a launch-checklist smoke test that an unsigned POST returns 401.

---

## 🟠 M1 · No rate limiting or abuse controls

- Auth: no CAPTCHA on register/login; password endpoints are brute-forceable at Supabase's defaults. When MSG91 OTP ships, an unthrottled `signInWithOtp` becomes an **SMS-cost attack** (₹0.18/OTP × bot traffic). Mitigate via Supabase Auth rate limits + per-phone cooldown UI.
- Edge Functions: `create-upi-collect-link` and `create-razorpay-subscription` are authenticated but unthrottled — a hostile paid user can spam Razorpay link creation.

## 🟠 M2 · CORS is `*` on every Edge Function

All 12 functions return `Access-Control-Allow-Origin: *` (e.g., [send-whatsapp-message:74](supabase/functions/send-whatsapp-message/index.ts#L74)). For service-role-gated functions this is mostly cosmetic, but for the user-JWT functions (`create-upi-collect-link`, `create-razorpay-subscription`) restricting origins to the app domains reduces token-replay surface from malicious web pages. Low effort, do it at domain-setup time.

## 🟠 M3 · `profiles` INSERT trusts the client for `role`

[auth-service.ts:24-29](PoultryOS/auth/auth-service.ts#L24) inserts the profile with a client-chosen `role` (`owner|worker|vet`), and the RLS policy `profiles_insert_self` only checks `id = auth.uid()` (initial_schema.sql:925-926). Role currently gains nothing without a `farm_users` row (which only owners can create), so there is **no practical escalation today** — but it's a latent foot-gun: any future logic keying off `profiles.role` alone becomes exploitable. Set role server-side (DB default `'owner'` + strip from client insert, or a `handle_new_user` trigger).

## 🟠 M4 · Workers can write inventory movements for any shed and unassigned batches' health incidents

- `inventory_movements_insert_member` lets any worker insert movements farm-wide (initial_schema.sql:1050-1054) — no shed scoping, and `quantity` is unconstrained (negative allowed), letting a worker arbitrarily adjust stock through raw API calls even though the UI only offers purchases/usage.
- `health_incidents_insert_member` (initial_schema.sql:1010-1014) has no assigned-shed restriction, unlike `daily_logs_insert_member` which checks `assigned_shed_ids`. Inconsistent scoping — likely intentional for health urgency, but document it or align it.

## 🟡 L1 · Token storage on RN-web falls back to localStorage
[lib/supabase.ts:5-10](PoultryOS/lib/supabase.ts#L5) — standard practice for SPA Supabase, but worth noting XSS ⇒ token theft on the web build; CSP headers are not configured in [next.config.mjs](web/next.config.mjs) (no `headers()` at all — add CSP/HSTS/X-Frame-Options).

## 🟡 L2 · `PoultryOS/.gitignore` doesn't ignore plain `.env`
Only `.env*.local` ([PoultryOS/.gitignore:34](PoultryOS/.gitignore#L34)). The root `.gitignore` covers it **only if** the repo is initialized at project root. [PoultryOS/.env](PoultryOS/.env) holds just the anon key (public-safe), but the pattern invites a future service-key paste. Add `.env` to the app-level ignore before `git init`.

## 🟡 L3 · Razorpay webhook returns 200 on DB errors
[razorpay-webhook:152-157](supabase/functions/razorpay-webhook/index.ts#L152) intentionally suppresses retries on DB failure — a transient DB outage during `payment_link.paid` silently loses the payment confirmation (buyer paid, Khata still shows pending). Prefer 500 (let Razorpay retry) for *transient* errors, 200 only for permanent ones (`transaction_not_found`).

## 🟡 L4 · `aisensy-webhook` updates rows by `aisensy_message_id` without tenant scoping
Acceptable (IDs are vendor-issued), but a spoofed body when H2 is unfixed can flip arbitrary message statuses; fixing H2 resolves this.

---

## ✅ Strengths worth preserving

| Area | Evidence |
|---|---|
| RLS everywhere, owner/worker/vet matrix implemented as specified, financials/buyers owner-only | initial_schema.sql §H–I |
| All SECURITY DEFINER functions have pinned `search_path`; RLS-helper EXECUTE revoked from API roles and restored only where needed | [20260502000001](supabase/migrations/20260502000001_harden_functions_and_extensions.sql), [20260521000000](supabase/migrations/20260521000000_restore_rls_helper_execute.sql), lessons L3/L4 in [tasks/lessons.md](tasks/lessons.md) |
| Paid-feature RPCs revoked from anon | [20260522000004](supabase/migrations/20260522000004_revoke_anon_execute_on_paid_rpcs.sql) |
| Constant-time HMAC compares in both webhooks | [razorpay-webhook:72-79](supabase/functions/razorpay-webhook/index.ts#L72) |
| `create-upi-collect-link` reads under the **caller's** RLS before acting — clean confused-deputy defense | [index.ts:75-83](supabase/functions/create-upi-collect-link/index.ts#L75) |
| Zod validation + template-ID allowlist + E.164 regex in send-whatsapp-message; freemium enforced server-side | [index.ts:31-66,143-151](supabase/functions/send-whatsapp-message/index.ts#L31) |
| Insert-only, never-deleted WhatsApp audit log; settled contract cycles hard-locked by trigger | initial_schema.sql:417-436, 807-828 |
| Secrets template hygiene + no service key anywhere in client code (grepped) | [.env.example](.env.example) |

## Remediation order

1. **H1** traceability RPC swap (1 hr) — before any beta farm creates a certificate.
2. **H2** fail-closed webhooks + unsigned-request smoke test (1 hr).
3. **M3** server-side role assignment (1–2 hrs incl. test).
4. **M1** auth rate limits + OTP cooldown (config + UI, half day) — must land with mobile OTP.
5. **M4** constrain inventory_movements (CHECK quantity > 0 for purchase/usage; shed-scope or document).
6. **L1** add security headers in `next.config.mjs`; **L2** gitignore line; **L3** retry semantics; **M2** CORS pinning at domain setup.
7. Re-run `mcp__supabase__get_advisors` after the above (the launch checklist already requires this).
