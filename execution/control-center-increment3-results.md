# Control Center — Increment 3 (Dynamic Plans + Discounts) · Results

**Status:** COMPLETE & verified · **Date:** 2026-06-11
**Builds on:** Increments 1–2 (platform RBAC, audit, tenant lifecycle).

## What shipped

### Database
**`20260611000011_plans_dynamic.sql`** — plans editable from the Control Center, app reads unchanged:
- `subscription_features` (typed catalog, seeded), `plan_feature_mapping` (editable normal form, **backfilled** from existing `features_json`), `plan_history` (append-only).
- `rebuild_plan_features_json(plan)` keeps the canonical `subscription_plans.features_json` in sync, so the app + `tenant_plan_status()` keep reading correct values (backward compatible).
- Guarded+audited RPCs (`subscription:manage`, write `plan_history` + audit): `cc_create_plan`, `cc_update_plan`, `cc_set_plan_active` (enable/archive), `cc_set_plan_feature`, `cc_duplicate_plan`. Added `archived_at` to `subscription_plans`.

**`20260611000012_discounts.sql`** — discount engine:
- `discounts` (flat/percentage, scope, duration, plan + tenant restrictions, date window, global + first-purchase/renewal rules, stacking), `coupon_codes`, `coupon_redemptions`, `promotions`.
- `validate_coupon(code, tenant, plan?, is_first?)` — the rule engine (SECURITY DEFINER so tenant checkout validates without read access to the discount tables; prevents coupon enumeration).
- Guarded+audited RPCs (`discount:manage`): `cc_create_discount`, `cc_create_coupon`, `cc_apply_tenant_discount`.
- Discount tables are operator-read-only (`discount:read`); no client read path except the RPC.

### Web
- `lib/control/plans.ts`, `lib/control/discounts.ts` — server actions over the cc_* RPCs (operator JWT) + a `previewCoupon` that reuses `validate_coupon`.
- `/admin/subscriptions` — plans list + create + activate/archive + duplicate (`PlanManager`); `/admin/subscriptions/[id]` — plan detail with live **feature editor** (`PlanFeatureEditor`, boolean toggles + numeric/∞ limits) + change history.
- `/admin/discounts` — create discount, create coupon, validate-a-code preview (`DiscountTools`) + discount & coupon tables.
- Sidebar: Plans + Discounts flipped to `ready`. Action controls hidden unless the operator holds the matching `*:manage` permission.

## Verification
- pgTAP **`plans_dynamic.test.sql` 6/6** (read-only forbidden; create; plan_history; audit; features_json rebuilt on feature set; existing plans backfilled) and **`discounts_engine.test.sql` 7/7** (valid; plan restriction; expired; first-purchase-only; global limit; per-tenant limit; create permission gate) — all green on the live local DB.
- Regression: `billing_subscription` (9) still green after the `subscription_plans` changes.
- Web `npm run typecheck` — **exit 0**.
- Local security checks: all 12 new tables have RLS; all new SECURITY DEFINER functions pin `search_path`.

## Honest caveats / deferred
- **Client freemium re-point still pending.** `packages/shared/src/freemium.ts` `FREE_LIMITS` remain hardcoded and the client gates on a binary `isPaid`. The DB is now the source of truth (`subscription_plans` + `tenant_plan_status()`); moving the mobile + web clients onto it is a cross-cutting change deferred to the Phase-13 frontend-integration pass to avoid destabilising the shipping app. Operators CAN edit plans now; the app honours price/feature changes via `features_json`, but the numeric free-tier caps in the client still read the hardcoded constants until that re-point.
- Promotions have tables + are creatable via discount scope, but a dedicated promotions UI (banners/scheduling) is deferred.
- `cc_update_plan` exists (RPC) but the plan-detail edit form is read-only display for now; field editing wires next pass.
