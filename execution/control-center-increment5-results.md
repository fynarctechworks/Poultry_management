# Control Center — Increment 5 (Support / Call Center + Error Monitoring) · Results

**Status:** COMPLETE & verified · **Date:** 2026-06-11
**Builds on:** Increments 1–4.

## What shipped

### Database
**`20260611000015_support.sql`** — support desk:
- `support_tickets` (open/pending/escalated/resolved/closed, priority, assignment), `support_calls`, `call_notes`, `customer_followups`, and a unified **`customer_interactions`** timeline (one row per meaningful event).
- Guarded+audited RPCs (`support:manage`): `cc_create_ticket`, `cc_set_ticket_status`, `cc_assign_ticket`, `cc_log_call`, `cc_create_followup`, `cc_complete_followup` — each appends to the timeline + writes an audit row.
- RLS: read gated to `support:read` (timeline also visible to `success:read`); writes via RPC only.

**`20260611000016_error_monitoring.sql`** — error center:
- `platform_errors` (source/module/route/stack/browser/device/severity/status + assignment) with **fingerprint dedup**: a partial unique index on active rows + `report_error()` that bumps `occurrence_count`/`last_seen` on repeats instead of duplicating. `error_comments`.
- `report_error(payload)` — callable by any authenticated client (the app reports its own errors) via SECURITY DEFINER (no insert policy exposed).
- Triage workflow RPCs (`error:manage`, audited): `cc_set_error_status` (open→investigating→resolved→ignored), `cc_assign_error`, `cc_add_error_comment`.

### Web
- `lib/control/support.ts`, `lib/control/errors.ts` — server actions over the guarded RPCs.
- `/admin/support` — `SupportConsole`: new ticket + log call forms, ticket queue with inline status changes, recent calls, open follow-ups.
- `/admin/errors` — error inbox with status tabs (open/investigating/resolved/ignored) + severity, grouped by fingerprint; `/admin/errors/[id]` — detail with the triage workflow (`ErrorWorkflow`: status, assign-to-me, comments), stack, metadata.
- Tenant detail **Activity tab** now shows the per-tenant interaction timeline above the operator audit trail.
- Sidebar: Support + Errors flipped to `ready`.

## Verification
- pgTAP **`support_errors.test.sql` 9/9 green**: read-only forbidden from opening a ticket; support operator opens one; timeline row appended; audit written; status→resolved sets resolved_at; `report_error` ingests; **repeat fingerprint dedups (occurrence_count→2)**; read-only forbidden from triage; operator resolves.
- Web `npm run typecheck` — **exit 0**.
- Local checks: all 7 new tables have RLS; all new SECURITY DEFINER functions pin `search_path`.

## Honest caveats / deferred
- **Client-side error reporting not yet wired.** `report_error()` exists and is granted to `authenticated`, but the mobile/web apps don't call it on their global error boundaries yet — that wiring is part of the Phase-13 frontend-integration pass. Until then the inbox populates only from errors reported deliberately.
- **Support-health signal** can now fold into the customer-health score (open tickets exist) — deferred to a follow-up tweak of `compute_tenant_health` to avoid re-running the Increment-4 gate here.
- Call queue is a logged-call list (post-hoc logging), not a live dialer/telephony integration — out of scope for the MVP control center.
