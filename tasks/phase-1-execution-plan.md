# PoultryOS — Phase 1 Execution Plan + Flagship Feature Specs
*Companion to [product-strategy.md](product-strategy.md). Planning artifact — behavior, data, acceptance criteria, risk. No code/migrations here.*
*Created 2026-06-15.*

---

## How to read this
- **Part A** = the Phase 1 "Correctness & Trust" build plan (the four P0s), as checkable items with acceptance criteria and the decisions I need from you.
- **Part B** = deep specs for the two highest-value differentiators: **Contract Settlement Reconciliation** and the **Owner Trust/Transparency Report**. These are P2 in the roadmap but specced now because they define the category and depend on Phase 1 correctness being in place first.

Nothing here rebuilds existing functionality. Every item is additive.

---

# PART A — Phase 1: Correctness & Trust (Days 1–20)

> Principle: you cannot sell "know your real profit / catch cheating" on a wrong ledger and a leaky boundary. Fix the foundation before the intelligence.

### ✅ Decisions I need from you before building (3)
1. **Partial-payment backfill policy** — existing `partial` rows have no recorded paid amount. On migration, do we (a) set `amount_paid = amount × 0.5` to preserve today's numbers, then prompt the owner to review, or (b) set `amount_paid = 0` and let owners re-enter actuals? *(Recommend (a) — least disruptive, with a one-time review nudge.)*
2. **Feed-item linking** — fix the silent feed mis-deduction via (a) an explicit optional "which feed item" selector on the daily log, or (b) keep auto-matching but surface a warning when nothing matches? *(Recommend (a) as the durable fix, (b) as the fallback when the user skips it.)*
3. **Mortality threshold scope (Phase 1 depth)** — minimal per-farm/per-batch configurable threshold now, with the standard-curve-relative version deferred to Phase 3? *(Recommend yes — ship the simple win now.)*

---

### P0.1 — Close the anonymous traceability data leak ✅ DONE (2026-06-15, applied + verified on prod)
- [ ] Replace the table-level anon read with a **token-scoped accessor** (a `SECURITY DEFINER` function that returns exactly one record for an exact `qr_token`, and remove the broad anon SELECT policy on the table).
- [ ] Repoint the public traceability page to fetch via that accessor.
- **Why it matters:** today any anonymous caller can dump every tenant's traceability data (supplier, buyer, harvest dates). It's a cross-tenant privacy breach and a launch-blocking liability.
- **Acceptance criteria:**
  - Anonymous `SELECT *` on the traceability table returns **0 rows**.
  - Accessor with a **valid** token returns exactly **1** record; with an invalid/absent token returns **0**.
  - The public `/traceability/[token]` page renders identically to today for a valid token.
- **Verification:** exercise as the `anon` role directly (not just through the UI).
- **Risk:** Low. Only behavioral change is the public page's data path; everything else is a tightening.

### P0.2 — Real partial-payment ledger ✅ DONE (2026-06-15, applied + verified; backfill = amount×0.5)
- [ ] Introduce a recorded **paid amount** on financial transactions (replacing the hardcoded 50% assumption).
- [ ] Buyer balance = Σ(`amount − amount_paid`) over income transactions that are pending/partial.
- [ ] Recompute all existing buyer balances after the change; backfill per the decision above.
- **Why it matters:** every partial payment currently distorts `buyers.current_balance` — the exact number UPI Khata exists to get right. Reminders (`check_payment_overdue`) inherit the error.
- **Acceptance criteria:**
  - A ₹3,000 partial payment on a ₹10,000 invoice contributes **₹7,000** to the buyer balance (not ₹5,000).
  - Marking a transaction fully paid drops its balance contribution to **₹0**.
  - Overdue-reminder selection reflects true outstanding amounts.
- **Verification:** seed a buyer with one full, one partial, one pending transaction; assert balance = sum of true outstanding.
- **Risk:** Medium — changes `current_balance` semantics; must recompute and communicate the one-time shift to existing owners.

### P0.3 — Feed-deduction accuracy & surfacing ✅ DONE (2026-06-15, applied + verified)
- [ ] Stop the **silent skip** when a logged feed type has no matching inventory item.
- [ ] Per decision #2: allow explicit feed-item selection; otherwise auto-match and **warn (non-blocking)** when no item is found.
- **Why it matters:** feed is 65–70% of cost. Silent stock drift makes feed stock untrustworthy, which breaks the whole feed-intelligence layer downstream.
- **Acceptance criteria:**
  - Logging feed **with** a matching/selected item deducts stock exactly once.
  - Logging feed with **no** match shows "stock not updated — no matching feed item" and **still saves the log** (never blocks entry).
  - Offline queue and the <60s entry path are unaffected.
- **Verification:** log feed on a farm with zero feed items (expect warning, log saved), then with a matching item (expect deduction).
- **Risk:** Low–Med — must not regress the offline flow or add a blocking step.

### P0.4 — Mortality alert relative to a configurable threshold ✅ DONE (2026-06-15, applied + verified)
- [ ] Replace the hardcoded 1%/day with a **per-farm/per-batch threshold** (sensible default preserves today's behavior).
- [ ] Keep existing alert dedup and the push + WhatsApp fan-out.
- **Why it matters:** a flat 1% misfires across breeds/ages; false alarms erode trust in *all* alerts, which is the franchise.
- **Acceptance criteria:**
  - A farm can set its threshold; the alert fires at the configured value.
  - Unset → behaves exactly as today (1%).
  - No duplicate alerts for the same batch/day.
- **Verification:** set a 0.5% threshold, log a 0.7% mortality day → alert; set 2% → no alert for the same input.
- **Risk:** Low. (Standard-curve-relative thresholds are explicitly deferred to Phase 3.)

**Phase 1 exit gate:** zero cross-tenant traceability reads · buyer balances provably correct · feed stock no longer drifts silently · mortality alerts configurable and de-noised.

---

# PART B — Flagship Feature Specs (the category-defining two)

Both are **reconciliation engines** — "expected vs actual, with the rupee impact of the gap." They share a UX pattern and should reuse it. One faces *outward* (you vs your integrator); one faces *inward* (the truth vs what was logged).

---

## SPEC 1 — Contract Settlement Reconciliation
*Serves ~80% of broiler growers (the integration model). The single most indispensable feature for that segment.*

**The farmer problem.** A contract grower raises birds using chicks, feed, and medicine supplied by an integrator (Suguna, Venky's, Skylark, IB Group…). His income is a **growing charge per kg of live bird lifted**, plus/minus **performance incentives** (better FCR and lower mortality earn bonuses; worse incurs penalties). Weeks after lifting, the integrator sends a settlement statement with *their* figures for mortality, FCR, average weight, birds lifted, and the final amount. The grower has **no independent way to check it** and is usually paid before he can argue.

**How farmers solve it offline today.** A paper diary of daily mortality and feed bags; a mental tally; an argument with the field supervisor on lifting day; and — most often — quiet acceptance of the integrator's number because the relationship (and next batch of chicks) depends on the integrator.

**Why existing software fails.** Integrator ERPs are built for the *integrator*, are one-sided, and give the grower a statement, not a checker. Generic farm tools don't model the **tariff card** (charge/kg, FCR thresholds, mortality thresholds, weight target) at all, so they can't compute an independent expectation.

**What PoultryOS does (it already has the raw material).** The grower logs placement, feed received, mortality, and weights daily; `contract_cycles` + `calculate-contract-settlement` + seeded tariff cards already exist. The new layer:
1. **Auto-compute the expected settlement** from the grower's own data + the integrator's tariff card — zero extra effort.
2. At settlement, let the grower **enter the integrator-stated figures** (mortality %, FCR, avg weight, birds lifted, amount) — a handful of fields.
3. Show a **line-by-line side-by-side**: PoultryOS-computed vs integrator-stated, with deltas highlighted and the **₹ impact of each gap** spelled out — e.g. *"Integrator FCR 1.78 vs your 1.71 → ₹0.50/kg bonus on 22,000 kg = ₹X you may be owed."*
4. **Generate a dispute summary** shareable on WhatsApp to the field officer (your existing share pipeline).

**Data points.** From the grower (mostly already captured): chicks supplied, feed supplied (kg), birds delivered, avg weight, computed FCR, computed mortality %, expected settlement. Newly captured: integrator-stated equivalents + settlement amount, settlement received date, dispute notes.

**ROI for the farmer.** On a 10,000-bird batch at ~2.2 kg (~22,000 kg lifted), a 0.05 FCR or 1% mortality discrepancy swings the settlement by thousands of rupees per cycle at typical bonus rates. Catching or defending one discrepancy a year pays for the subscription many times over — and even when he never disputes, he gains the confidence of knowing his number.

**Implementation complexity.** Medium. The data model and settlement math largely exist; the new work is capturing the integrator-stated side, the comparison view, the ₹-impact calculation, and the WhatsApp dispute share. No heavy new infrastructure.

**Adoption risk & mitigations.** Medium.
- *Tariff accuracy:* seeded tariff cards are flagged `review_required`; a wrong card produces a wrong expectation and destroys trust. **Mitigation:** force the grower to confirm/edit their actual contract terms before first use.
- *Relationship fear:* growers fear that disputing endangers their next chick supply. **Mitigation:** position as **"know your number"** first; make disputing optional. The value is confidence, not confrontation.
- *Entry friction:* **Mitigation:** pre-fill the entire expected side automatically; only ask for the integrator's numbers; lead with the "you may be owed ₹X" payoff.

---

## SPEC 2 — Owner Trust / Transparency Report
*The feature owners will pay for but won't say out loud. It is the precondition for them trusting every other number in the app.*

**The farmer problem.** The owner is rarely on-farm daily. He suspects — often correctly — that **feed is being skimmed and sold**, **mortality is mis-reported** (dead birds quietly sold or live birds stolen and covered as "died"), or numbers are simply made up. Because the dashboard just echoes whatever the worker typed, the owner doesn't trust the dashboard either. This distrust is the #1 reason poultry software gets abandoned.

**How farmers solve it offline today.** Surprise visits, physically counting feed bags and birds, gut feel, and periodically firing workers. Crude, stressful, and reactive.

**Why existing software fails.** It treats the worker's entry as ground truth — garbage in, garbage out — with **no internal consistency check**. It never reconciles what was logged against physical and biological reality, so it can't earn the owner's trust.

**What PoultryOS does — cross-check the worker's own entries against reality.** Four reconciliations, all rule-based (consistent with the no-LLM architecture decision):
1. **Feed reconciliation.** Feed purchased − feed consumed = expected stock on hand. A periodic **physical stock count** (owner/supervisor enters the real number) vs system stock → variance = potential theft/wastage. Flag with ₹ value.
2. **Feed-to-growth consistency.** Feed consumed should track weight gain at roughly standard FCR. **High feed but low weight gain** (not explained by mortality) = feed leaving without entering birds.
3. **Bird-count reconciliation.** Opening − cumulative deaths − sold/transferred = expected current count. Periodic physical count vs system → variance = unreported mortality or theft of live birds. Pattern signals (deaths always on the same weekday, suspiciously round numbers) raise a soft flag.
4. **Entry-behavior signals.** Logs backfilled in bulk, identical repeated values, entries at odd hours, biologically impossible weight jumps.

**Output.** A weekly **"Farm Integrity / Flock & Feed Accuracy"** summary (WhatsApp + app), e.g.: *"This week — feed variance: 120 kg unaccounted (₹3,600). Bird count: physical 4,810 vs system 4,820 (−10). 2 logs backfilled. FCR drifting above standard."* Each line drillable. Framing is **non-accusatory** ("variances to review"), but the owner instantly knows where to look.

**Data points.** Mostly already present: feed purchases, feed consumption, mortality, sales/transfers, log timestamps. Newly captured: lightweight **physical spot-counts** (feed stock + bird count) entered occasionally by owner/supervisor.

**ROI for the farmer.** Feed is 65–70% of cost; even 2–3% shrinkage on a 10k-bird batch is large money. Catching one theft pattern pays for years of subscription. The deeper ROI: it makes the owner **trust the dashboard**, unlocking adoption of everything else PoultryOS does.

**Implementation complexity.** Medium. Computations sit on existing data; new work is the lightweight physical-count entry, the reconciliation math, the anomaly heuristics (rules), and the weekly digest (existing WhatsApp/push pipeline).

**Adoption risk & mitigations.** Medium-high and *socially subtle* — this feature changes the owner↔worker dynamic.
- *Worker resentment / gaming:* surveillance can make workers resist logging or game entries. **Mitigation:** surface findings to the **owner only**, never as a worker-facing accusation; brand it operationally ("feed & flock accuracy," not "catch the thief").
- *False positives:* legitimate wastage or a miscount could wrongly implicate an honest worker and wreck morale. **Mitigation:** require a **physical count to confirm** before any conclusion; present **₹ variance, not blame**; show trends, not verdicts.

---

## Why these two, now
Phase 1 makes the data *trustworthy*; these two features make that trustworthy data *prove things* — to the integrator (Spec 1) and to the owner about his own farm (Spec 2). They are the defensible moat no competitor structurally builds, and they reuse one reconciliation pattern. Sequence them **after** Phase 1 lands, because a reconciliation engine built on a wrong ledger reconciles to the wrong answer.
