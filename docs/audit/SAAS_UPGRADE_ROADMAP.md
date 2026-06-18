# PoultryOS — SaaS Upgrade Roadmap

Derived from the 20-module audit. Ordered by risk/impact. "Apply" = the proposed-backend bundle that
awaits one reviewed pass (frontend fixes already shipped + typecheck-clean).

---

## Phase 0 — Apply the security group (this week, ship-blocking)
1. **S1 — gate operator read/dashboard functions** (M19 CC1/CC2): `cc_assert_permission('billing:read')`
   on `cc_billing_summary`/`cc_tenants_mrr`; `REVOKE EXECUTE` on `compute_platform_dashboard`/
   `compute_razorpay_metrics`/`compute_analytics_overview`. *Stops live cross-tenant revenue leak.*
2. **S2/S4** — `REVOKE EXECUTE` on `compute_tenant_health`, `recompute_all_customer_health`,
   `log_platform_event`.
3. **M7 ⭐ buyer-balance binding** — `AFTER UPDATE OR DELETE` so Mark-paid recomputes receivables.

## Phase 1 — Correctness & freemium integrity (next sprint)
4. Bindings: M3 (edit mortality guard), M6 (stock restore on movement delete).
5. M15 — receivables-netting in `get_multi_farm_summary` (reconcile with Khata).
6. **Freemium DB caps bundle (M18 B1):** farm/shed/worker/buyer BEFORE INSERT caps; `farm_users`
   worker(≤2)/vet(=paid) gate; decide `is_paid` gating inside `create_traceability_record` + contract
   insert (vs page-gate sufficiency).
7. S3 — caller-owns-tenant guards on `validate_coupon`/`tenant_feature`/`tenant_can_write`.

## Phase 2 — Reliability & ops (2–4 weeks)
8. M5 — `send-vaccination-reminders`: overdue lookback + WhatsApp channel (push+WA parity).
9. M10 — lock cert on already-closed batch; drop dead `certificate_pdf_url`.
10. M12 — `acknowledge_weather_alert` RPC (column-scope the ack write).
11. M1 — enable `auth_leaked_password_protection`; S5 — REVOKE anon writes on billing/platform tables.
12. Email go-live (Resend DNS/secrets) — unblocks dunning + invitations (M1/M18 dependency).

## Phase 3 — Scale & polish
13. Cache/materialise `compute_*` dashboards before tenant growth (PERF-2).
14. Generate Deno Edge thresholds from `@poultryos/shared` (kill farm-integrity drift, M16 I2).
15. Per-breed heat-stress threshold calibration (M12 W3); canonical month-mortality % (M15 D2).
16. Mobile invite UI parity; backfill `MAMA` + any NULL-coord farms via the new location capture.

## Standing engineering guardrails (adopt)
- **CI security gate:** fail on any `authenticated`-executable SECURITY DEFINER fn lacking `auth.uid()`
  or a gate keyword (the M20 sweep).
- **CI perf gate:** fail on any unindexed single-column FK on high-write tables.
- **Trigger-coverage check:** assert trigger bindings match the function's handled TG_OP branches.
- **Parity check:** new tenant-facing capability must land on web *and* mobile (audit closed 5 gaps).
- Apply DB changes via Supabase MCP only; never grant owners FOR ALL on billing tables.

## Product opportunities surfaced (not defects)
- Automated **broiler** price source (only NECC eggs auto-fetch today; manual broiler by decision).
- Server-rendered traceability **PDF** if buyers demand it (client jsPDF covers MVP).
- Operator B2B integrator dashboard (explicitly out of MVP scope).
