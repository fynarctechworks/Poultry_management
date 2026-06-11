# Control Center — Increment 4 (Revenue Ops + Customer Success/Health) · Results

**Status:** COMPLETE & verified · **Date:** 2026-06-11
**Builds on:** Increments 1–3.

## What shipped

### Database
**`20260611000013_customer_health.sql`**
- `customer_health` (cached 0–100 score + green/yellow/red band + per-signal sub-scores + churn-risk flag).
- `compute_tenant_health(tenant)` — scores from real signals: payment (subscription status, 35%), usage (last daily log, 30%), login (last analytics event, 15%), setup completion (farm/shed/batch/log, 20%); bands at ≥70 / ≥40 / else; churn-risk when red or payment unhealthy. Mirrors the score into `tenants.health_score`.
- `recompute_all_customer_health()` over live tenants. RLS: read gated to `success:read`; writes via SECURITY DEFINER only.

**`20260611000014_revenue_ops.sql`**
- `compute_revenue_metrics()` — live MRR / ARR / ARPU / active / trial / past_due / cancelled / churn_rate / LTV + plan distribution. **CAC returns null** (marketing spend isn't tracked — honest, not fabricated).
- `revenue_snapshots` (daily) + `snapshot_revenue()` so growth/churn **trends accumulate from the first snapshot forward** (no fake history).
- **Nightly pg_cron** `cc-nightly-health-revenue` (00:00 IST) → recompute health + snapshot revenue. RLS: snapshots read gated to `revenue:read`; metric functions granted to `service_role` only.

### Web
- `/admin/revenue` — KPI tiles (MRR/ARR/ARPU/LTV/Active/Trials/Past-due/Churn), plan distribution, recent snapshots. Reads `compute_revenue_metrics()` + `revenue_snapshots` via the service client behind `revenue:read`.
- `/admin/success` — health board: churn-risk count, band filter chips (all/red/yellow/green), per-tenant score + signal breakdown, deep-link to tenant detail. Gated `success:read`.
- Sidebar: Revenue + Customer Success flipped to `ready`.

## Verification
- pgTAP **`health_revenue.test.sql` 9/9 green**: score in range; row created; `tenants.health_score` mirror; active sub → payment_score 100; recompute processes tenants; read-only operator can read board; non-operator blocked (RLS); MRR = ₹499 for one active growth sub; snapshot records today's MRR.
- Web `npm run typecheck` — **exit 0**.
- Local checks: `customer_health` + `revenue_snapshots` have RLS; all 4 new functions pin `search_path`; nightly cron registered.

## Honest caveats / deferred
- **CAC + true churn cohorting** need data not yet captured (marketing spend; historical subscription state transitions). CAC is null; churn is a simple cancelled/(active+cancelled) ratio. Cohort churn improves once snapshots accumulate.
- **Support-health signal** is not yet in the score — support tables arrive in Increment 5; the weighting will fold it in then (currently the 4 signals shown).
- Revenue forecast (brief item) is deferred until enough snapshots exist to project from.
