# PoultryOS — Product Strategy & 90-Day Roadmap
*Deep product-thinking exercise. Roles assumed: Poultry Industry Consultant (30y), Enterprise SaaS Product Architect, Senior UX Researcher, Multi-Tenant SaaS CTO, Poultry Farm Owner. No rebuild. Strategy, not code.*

---

## The one idea that should govern everything

Most poultry software treats the farm as a **record-keeping problem**. It is actually a **decision + trust problem**.

A medium Indian poultry farmer does not lie awake wondering "where is my data." He lies awake wondering three things:
1. **Am I making or losing money right now — not at batch end?**
2. **Is my worker/integrator/buyer cheating me?** (feed theft, under-reported mortality, a settlement that feels low, a buyer who won't pay)
3. **When do I act?** (sell, reorder feed, cull, switch ration, call the vet)

Every recommendation below is ranked by how directly it answers those three questions. The winning wedge is one sentence:

> **PoultryOS tells you whether you're losing money and why — today — and lets you prove it to your worker, your integrator, and your buyer.**

That is the 10x. Decisions and trust, not records.

---

## Assumptions I am challenging up front

| Stated assumption | Reality on Indian farms | Implication |
|---|---|---|
| Target = 500–5,000 birds | Medium broiler contract sheds run 5k–20k; Namakkal/AP **layer** farms run 30k–150k+. The "medium" farmer you'll actually convert is bigger and multi-shed. | Multi-shed/per-shed entry and farm-level rollups matter more than per-batch single entry. The free tier (1 farm / 3 sheds) under-serves the buyer who will actually pay. |
| 7 distinct personas | On 80% of target farms, **one person wears 4 hats**. "Feed Manager / Accountant / Sales Manager" = the owner or his spouse until ~15k birds. | Design for *role collapse*. Don't force an org chart on a 2-man farm. |
| Worker is the primary logger | Workers are often low-literacy, migrant, on shared/no smartphone. On many farms the **supervisor or owner** logs. | The data-entry UI must survive low literacy AND be usable by the owner. Voice/number-pad/icons, vernacular. |
| Market price = generic broiler/egg price | Egg farmers live by **NECC zonal rates** (checked daily, religiously). Broiler farmers track **regional live-bird/farm-gate** prices that swing daily. | "Market price" must be NECC-accurate for eggs and regional-live for broiler, or it's ignored. |
| Broiler sale = one event at closure | Broiler **thinning / partial harvest** (selling part of a flock mid-cycle to cut density) is standard. | The model must support multiple/partial sale events, not just closure. |
| Layer is "broiler + eggs" | Layer is an **18–24 month** business measured in **HDEP %** and feed-per-egg, with a totally different mental model. | Layer needs its own intelligence (production curve, light program, cull economics), and it's currently the thinner half of the build = biggest open market. |

---

# PART 1 — User Personas

**Framing insight:** Split everyone into **data PRODUCERS** (worker, supervisor — entry must be frictionless) and **data CONSUMERS** (owner, manager, accountant, sales — output must be glanceable). Existing software optimizes neither: it's a typing burden for producers and a report-dump for consumers. The personas also **collapse by farm size** — I've flagged prevalence.

### 1. Farm Owner — *the buyer, the decision-maker* (exists on 100% of farms)
- **Daily responsibilities:** capital calls (place birds, buy feed, when to sell), cash flow, price negotiation, settlement/receivables, *oversight & verification*.
- **Information needed:** projected/actual profit, today's price (NECC/live), live-bird count, mortality vs normal, feed days-left, receivables outstanding, "is anyone cheating me."
- **Pain points:** can't see the farm when away; doesn't trust worker numbers; settlement disputes; cash trapped in buyer credit; feed-price volatility; profit invisible until batch ends.
- **Mobile pattern:** smartphone + heavy WhatsApp; low patience; reviews in the evening; 40–60yo; prefers regional language; will often consume a **WhatsApp digest without opening the app** (treat that as a win).
- **Top metrics:** projected profit · mortality today vs standard · FCR · feed days-left · today's price · receivables.

### 2. Farm Manager — *runs the day* (medium/large farms)
- **Responsibilities:** assign work, ensure logging happens, feed ordering, vaccination adherence, organise catching/sale day, manage workers.
- **Info needed:** per-shed status, today's tasks (vaccinations due, reorder, sheds not yet logged), mortality by shed, feed vs standard, sick birds.
- **Pain points:** juggling many sheds; remembering schedules; chasing workers for data; explaining variances to owner; no single view.
- **Mobile pattern:** on-farm all day, phone in pocket, moderate tech literacy, will adopt if it's fast.
- **Top metrics:** tasks-due-today · per-shed mortality/feed · vaccination calendar · stock alerts.

### 3. Supervisor — *eyes in the shed* (large farms; = manager on smaller)
- **Responsibilities:** physical checks (birds, water, feed, temp/ventilation), counts mortality, supervises workers, manages heat stress.
- **Info needed:** which sheds need attention, today's mortality, temperature/heat-stress state, feed left in shed.
- **Pain points:** heat management; accurate counting; escalating issues upward.
- **Mobile pattern:** in-shed, dirty hands, wants 1-tap entry; voice ideal.
- **Top metrics:** shed-level mortality · heat alert · shed feed level.

### 4. Worker — *the data producer* (exists everywhere; often invisible to software)
- **Responsibilities:** feeding, watering, litter, egg collection (layer), removing dead birds, dosing medicine.
- **Info needed:** feed quantity per shed, today's medicine, egg count.
- **Pain points:** low literacy; regional language only; shared/no device; repetitive work; *zero interest in analytics*.
- **Mobile pattern:** shared device or supervisor's phone; needs icons + numbers + voice; must finish in seconds.
- **Top metrics:** none — workers need a **task list + number entry**, not dashboards. They are producers, not consumers.

### 5. Accountant — *the ledger* (large farms / owner's spouse)
- **Responsibilities:** income/expense, invoices, GST, buyer ledger, salaries, bank reconciliation.
- **Info needed:** receivables/payables, transaction history, GST-ready exports, batch P&L.
- **Pain points:** matching cash to entries; tracking buyer credit; manual ledgers; GST filing.
- **Mobile pattern:** **prefers web/desktop** — the one role where the Next.js dashboard is primary.
- **Top metrics:** receivables aging · cash position · P&L · expense by category.

### 6. Feed Manager — *the cost center* (large only; 65–70% of cost lives here)
- **Responsibilities:** procurement (maize/soya/concentrate or finished feed), self-mixing/feed mill, ration per stage, dispatch to sheds, storage.
- **Info needed:** stock by feed type, consumption rate, ingredient/feed price trends, reorder timing, FCR.
- **Pain points:** price volatility; spoilage/storage; **theft**; right ration per age; FCR optimisation.
- **Mobile pattern:** warehouse, weighing/scanning.
- **Top metrics:** stock by type · days-left · feed cost per kg gain · FCR · price trend.

### 7. Sales Manager — *the cash collector* (large / = owner elsewhere)
- **Responsibilities:** negotiate with traders/mandi/integrator, schedule catching/egg dispatch, manage buyer relationships & credit, collections.
- **Info needed:** today's price, which batches are sale-ready (target weight), outstanding payments, buyer balances.
- **Pain points:** price-negotiation leverage; collections; matching supply to demand; credit risk.
- **Mobile pattern:** on calls + WhatsApp all day; wants price + ready-stock + receivables.
- **Top metrics:** today's price · sale-ready batches · receivables · buyer balances.

> **The fault line that sells the product:** the Owner↔Worker trust gap. Feed theft and mortality under-reporting are the #1 unspoken owner anxiety. The hidden killer feature is **reconciliation that makes fudging visible** (feed-in vs growth vs mortality). No competitor does this.

---

# PART 2 — Broiler Workflow (chick → settlement)

*~6-week cycle. The grower's mental model: "growing charge + FCR/mortality incentives" (contract, ~80% of market) OR "live-bird price × weight − feed cost" (independent). Decisions are dominated by feed (cost) and timing (when to sell).*

| Stage | Key decisions | Data points | Automation opportunity |
|---|---|---|---|
| **Chick purchase** | Hatchery/breed (Cobb 430 / Ross 308 / Vencobb), count, price, integrator vs independent | chick count, cost/bird, breed, source, placement date, shed | Auto-create batch + opening count; **pre-load breed standard curve** (target wt/FCR by day); auto-generate vaccination + ration schedule from breed+region |
| **Placement / brooding (d0–7)** | Brooding temp (33–35°C, step down), gas/heater, light, water, pre-starter | daily temp, **first-week mortality**, feed | First-week-mortality flag (>2–3% = poor chick quality → raise with hatchery); brooding-temp guidance tied to **weather** |
| **Feeding** | Phase switch (pre-starter→starter→grower→finisher), quantity, brand/mill, reorder timing | daily feed kg, feed type, cost/kg | Phase-switch reminders by age; **feed/bird vs standard**; **days-of-feed-left**; reorder alert; live FCR; **feed anomaly (intake↑ but weight flat = wastage/theft/disease)** |
| **Medication** | Coccidiostat, antibiotics, vitamins, heat-stress electrolytes; dose; withdrawal | medicine, dose, date, withdrawal days → clearance date | Withdrawal clearance auto-calc (exists); **block/flag sale before withdrawal clears**; medicine cost → P&L |
| **Vaccination** | ND/Ranikhet, IBD/Gumboro, (IB); route; age timing | vaccine, scheduled vs administered, birds done | Auto-schedule from template; overdue flags; push + WhatsApp reminder (pipeline exists) |
| **Shed transfer / thinning** | Spread density as birds grow; **partial harvest** to cut density | transfer date, count, from/to shed | `transfer_batch()` now handles location moves; add **density alert** (kg/m²) and **partial-harvest as a sale event** |
| **Weight tracking** | Sample weighing cadence; on-target?; sell timing | sampled avg weight, uniformity | Weight vs standard curve; ADG (daily gain); **projected days-to-target-weight**; sale-readiness alert |
| **Mortality** | Investigate spikes, cull, call vet, change management | daily deaths, cause | Spike alert relative to **standard** (not a hardcoded 1%); cumulative vs standard; cause-pattern detection |
| **Sale** | **When** (every extra day = more feed cost but more weight + price moves), to whom, price, full vs partial | birds sold, weight, price/kg, buyer, revenue | **Sell-day calculator** (marginal feed cost vs marginal weight × today's price); FCR-at-sale; multi/partial sale support |
| **Settlement (contract)** | Verify integrator's number: chick cost, feed supplied, FCR, mortality, growing charge, incentives | chicks/feed supplied, birds delivered, avg wt, FCR, mortality %, charge/kg, bonuses | `calculate-contract-settlement` exists → add **reconciliation (expected vs integrator-stated) + dispute flag**. *This is the single highest-value broiler feature.* |

**Three biggest broiler decision points the software should own:** (1) phase/feed management against standard, (2) the sell-day optimization, (3) settlement reconciliation.

---

# PART 3 — Layer Workflow (chick → spent-hen sale)

*18–24 month cycle. Mental model: **HDEP %** and **feed-cost-per-egg** vs **NECC egg price**. Completely different from broiler — and currently the thinner half of the build, which is exactly why it's the bigger open market (Namakkal, AP, Maharashtra, Punjab).*

**Stages & decisions:**
- **Chick → brooding (0–6 wk):** breed (BV300/Lohmann/Hy-Line), debeaking decision, brooding temp.
- **Growing (6–18 wk):** **body-weight uniformity at 18 wk predicts peak** — the key rearing decision; grower→pre-lay feed switch (calcium); vaccination (layers get *many*: ND, IBD, IB, AE, fowl pox, ILT…).
- **Onset of lay (18–20 wk):** **light program / photostimulation timing** — increasing light triggers lay; mistimed = lost peak. Transfer pullets to layer shed.
- **Climb → peak (28–32 wk, ~90–95% HDEP):** match feed to production; protect peak.
- **Plateau → decline (post 45 wk):** production drop diagnosis (age vs disease vs feed vs light); **force-molting** decision (extend flock life).
- **Culling / spent-hen sale (72–80 wk+):** cull when production value < (break-even + replacement economics); time spent-hen sale to price.

**KPIs to own:**
- **Egg:** HDEP %, HHEP %, eggs/day, egg weight/grade (large/med/small), **cracked/broken %**, saleable %.
- **Feed:** feed/bird/day (~100–115g), **feed per egg / per dozen**, feed cost per egg.
- **Health:** cumulative & weekly mortality, livability, disease incidents, vaccination adherence.
- **Profit:** egg revenue (eggs × NECC), feed cost (dominant), **margin per bird per day**, spent-hen value, point-of-lay bird cost amortisation, **break-even egg price**.

**Automation opportunities:**
- **HDEP auto-calc daily vs breed production curve** (published curves exist per breed).
- **Production-drop alert** (>X% = investigate) — the layer equivalent of the mortality spike.
- **Light-program scheduler/reminders** (onset + step-ups).
- **Feed-per-egg economics + break-even egg price vs today's NECC** ("you are losing ₹X/egg at today's rate").
- **NECC zonal price integration** — the anchor egg farmers actually check.
- **Multi-collection egg entry** (eggs gathered 2–3×/day) + **grade/broken capture**.
- **Cull-decision calculator** (current production value vs replacement flock economics).
- Long, complex **vaccination schedule** automation.

> **Gap reality:** today `daily_logs.eggs_collected` is a single number — no broken eggs, no grade, no HDEP, no production curve. Closing this turns PoultryOS into the first credible *layer* product for the Namakkal/AP belt.

---

# PART 4 — Competitive Advantage (what makes it 10x)

**Why existing poultry software fails (specifically):**
- **Integrator ERPs (Suguna/Venky's/etc.):** built for the *company*, not the grower. The grower gets a settlement SMS and zero tools — and no way to check it.
- **Generic "Poultry Manager" desktop tools:** English-only, desktop-first, feature-bloated, no offline, no WhatsApp, built for record-keeping not decisions.
- **Excel / paper register:** no intelligence, no alerts, error-prone, owner can't see it remotely.
- **None** solve the trust gap, do NECC/price intelligence well, reconcile contract settlements, are genuinely vernacular+voice, or are WhatsApp-native.

**The 10x opportunities, ranked.** (BV = business value to us, UV = user value, Effort = build effort; you already have the data + WhatsApp/push pipeline, which collapses effort.)

| # | Opportunity | Why it's 10x | BV | UV | Effort |
|---|---|---|---|---|---|
| 1 | **Trust & transparency layer** (feed↔growth↔mortality reconciliation, anomaly/theft detection) | Hits the owner's deepest anxiety; nobody does it; it's *the reason he pays* | ★★★★★ | ★★★★★ | ◆◆◆ med |
| 2 | **Contract settlement reconciliation** (broiler, ~80% of market) | Turns a dispute into a defensible number; instantly indispensable to contract growers | ★★★★★ | ★★★★★ | ◆◆◆ med |
| 3 | **Price intelligence** (NECC eggs + regional live-bird) + **sell-timing calculator** | Directly puts money in the farmer's pocket on every cycle | ★★★★☆ | ★★★★★ | ◆◆ low-med |
| 4 | **WhatsApp-first owner experience** (digest + alerts + share) | Matches actual behavior; pipeline already built | ★★★★☆ | ★★★★☆ | ◆ low |
| 5 | **Operational intelligence / insights feed** (vs standard curves, ₹ impact) | Advisory, not reports; "you're behind standard, costing ₹X" | ★★★★☆ | ★★★★☆ | ◆◆◆ med |
| 6 | **Feed intelligence** (days-left, FCR live, anomaly) | Feed = 65–70% of cost; tiny gains = big money | ★★★★☆ | ★★★★☆ | ◆ low |
| 7 | **Vernacular + voice / number-pad-only worker entry** | Unblocks the data-production bottleneck (literacy) → everything else works | ★★★☆☆ | ★★★★★ | ◆◆◆ med |

**The wedge to market with:** #1 + #2 + #3. "Know if you're losing money and why — and prove it to your worker, integrator, and buyer."

---

# PART 5 — UX Strategy: the ideal <60s daily workflow

Design principle: **producers get a 1-screen number pad; consumers get a 1-screen glance.** Nobody scrolls to do their job.

### Owner — *consumption, ~20s (often 0s — reads WhatsApp)*
Flow:
1. 8 PM **WhatsApp digest** arrives → owner reads profit + mortality + price without opening the app. (Best case: he never opens it.)
2. If he opens → **Home = "Farm at a glance"**: hero card *Projected profit this batch* (big number + ▲/▼), color-coded KPI row (live birds · mortality today vs normal · FCR · feed days-left · today's price · receivables), then a **"Needs attention"** list showing *red items only*.
3. Tap a red item → drill to the cause. Done.

Wireframe (text):
```
[ Good evening, Ramesh ▾ (farm switcher) ]
┌─────────────────────────────────────────┐
│  PROJECTED PROFIT — Batch B-240615        │
│           ₹ 1,84,200   ▲ 6%               │
│  vs standard: on track · 12 days to sale  │
└─────────────────────────────────────────┘
[Live 4,820][Mort 0.3%✓][FCR 1.62✓][Feed 4d⚠]
[Price ₹118/kg ▲][Receivables ₹62,000 ⚠]
NEEDS ATTENTION
• Feed stock 4 days left — reorder        →
• Shankar owes ₹62,000 (18 days overdue)  →
[ 🟢 Shed map ]
```

### Farm Manager — *action, ~45s*
Flow:
1. **Home = "Today"** task checklist: vaccinations due, feed reorder, **sheds not yet logged**, overdue items.
2. **Farm map / shed grid** below → tap a shed for quick status.
3. Review any flagged feed/mortality variance.

Wireframe:
```
TODAY ─ 3 tasks
☐ Vaccinate Shed 2 — Gumboro (due)        →
☐ Reorder finisher feed (4 days left)     →
☐ Shed 4 not logged today                 →
SHEDS
[S1 B001 1,980 ✓][S2 B002 2,050 💉]
[S3 empty       ][S4 — not logged ⚠]
```

### Worker — *production, <60s, the critical path*
Flow:
1. Open **Log** (or supervisor hands phone).
2. **Visual shed picker** (big tiles, names/photos — not a dropdown).
3. Per shed: **3 big stepper inputs** — Dead 🐔 · Feed (kg) 🌾 · Eggs 🥚 (layer only) — plus an optional Medicine toggle. Date is a **Today/Yesterday chip** (never typed). Number-pad + icons, minimal text, in their language.
4. One **big green SAVE** → confirmation in vernacular ("Saved ✓ शेड 1").
5. Next shed. Offline-safe (queues).

Wireframe (one shed, full screen):
```
   SHED 1 · Batch B001        [Today][Yest]
   🐔 Dead birds
        [ − ]    3    [ + ]
   🌾 Feed used (kg)
        [ − ]  180   [ + ]
   🥚 Eggs (layer only)
        [ − ] 1,740  [ + ]
   💊 Medicine given?  ( toggle )
   ┌───────────────────────────────┐
   │            SAVE  ✓             │
   └───────────────────────────────┘
```
Key behaviors: type-aware (broiler hides eggs / shows weight on weigh-days; layer shows eggs + broken); auto-select the only active batch; steppers for low-literacy; no free-text date; voice-entry as the P3 upgrade.

---

# PART 6 — Feature Prioritization (additive only — nothing here is a rebuild)

### P0 — Must Have (Correctness & Trust)
- **Fix anonymous traceability data leak** (security; cross-tenant exposure today).
- **Real partial-payment ledger** (`amount_paid`) — replaces the hardcoded 50% that corrupts every buyer balance.
- **Feed-deduction accuracy + surfacing** (no more silent skip when no matching item).
- **Mortality alert relative to breed standard**, not a hardcoded 1%/day.
*Measure:* zero cross-tenant reads; buyer-balance accuracy; feed-stock drift eliminated.

### P1 — Important (Daily Operations Speed)
- **Date Today/Yesterday chips + native picker** (kills the biggest <60s blocker).
- **Type-aware morning-ops form** (broiler vs layer; **broken eggs**; weigh-day weight).
- **Auto-select single active batch.**
- **Farm map / shed-occupancy dashboard** (incl. empty sheds).
- **Multi-collection egg entry + broiler partial-harvest/thinning** as real sale events.
*Measure:* median daily-entry time < 60s on a low-end device; % of farms logging daily.

### P2 — Premium (Differentiators)
- **Smart Insights feed** (week-over-week deltas vs standard, with ₹ impact).
- **Feed intelligence** (days-left, live FCR, **anomaly/theft detection**).
- **Contract settlement reconciliation** (expected vs integrator-stated + dispute).
- **Price intelligence:** NECC zonal egg rates + regional live-bird + **sell-timing calculator**.
- **Owner trust/transparency reconciliation report.**
*Measure:* paid conversion lift; insight→action click-through; settlement disputes resolved.

### P3 — Future Vision
- **Voice + full vernacular** worker entry.
- **Breed-standard benchmark library** powering advisory across both species.
- **Disease early-warning** (pattern/cluster), vet marketplace.
- **IoT** (shed temp, auto-weighing), **B2B marketplace**, **embedded finance/insurance**, **integrator field-officer tier**.

---

# PART 7 — 90-Day Roadmap

### Phase 1 — Correctness & Trust (Days 1–20)
*You cannot sell "know your real profit / catch cheating" while the ledger and security are wrong.*

| Item | Why it matters | User impact | Business impact | Complexity |
|---|---|---|---|---|
| Traceability anon leak fix (token-scoped access) | Cross-tenant privacy breach today | Invisible but protects every customer | Removes a launch-blocking liability | Low |
| Real partial-payment ledger (`amount_paid`) | The Khata receivable number is currently fiction | Owner finally trusts "who owes me" | Makes UPI Khata (a paid headline) credible | Medium |
| Feed-deduction accuracy + surfacing | Silent stock drift breaks feed intelligence | Stock numbers become trustworthy | Foundation for #6 feed intelligence | Low–Med |
| Mortality alert vs breed standard | A flat 1% misfires for different breeds/ages | Fewer false alarms → alerts stay trusted | Protects the whole alerting franchise | Low |

### Phase 2 — Daily Operations Speed (Days 21–45)  ◀ IN PROGRESS (2026-06-15)
*Adoption lives or dies on the daily-entry path. If workers won't log, nothing downstream exists.*
> Status: date chips ✅ · type-aware form + broken eggs ✅ · auto-select single batch ✅ · farm-map (mobile + web) ✅ · partial harvest (DB + web) ✅ · **TAIL REMAINING: mobile harvest modal + multi-collection egg entry** (see tasks/HANDOFF.md).

| Item | Why it matters | User impact | Business impact | Complexity |
|---|---|---|---|---|
| Date chips + native picker | Typed dates are the #1 friction on a ₹6k phone | Entry drops toward <60s | Higher daily-active logging = retention | Low |
| Type-aware form (broiler/layer, broken eggs) | One generic form fits neither species well | Relevant fields only; layer becomes first-class | Unlocks the layer market | Medium |
| Auto-select single batch | Most small farms have one active batch | Removes a needless tap | Marginal but compounding | Low |
| Farm map / shed grid | Owners think in sheds, not lists | 10-second farm comprehension | Demo "wow"; reduces churn | Medium |
| Multi-collection eggs + partial harvest | Matches real layer & broiler behavior | Data finally matches reality | Accurate P&L; credibility with serious farms | Medium |

### Phase 3 — Operational Intelligence (Days 46–70)
*Turn the trustworthy data into decisions. This is where "software" becomes "advisor."*

| Item | Why it matters | User impact | Business impact | Complexity |
|---|---|---|---|---|
| Breed-standard benchmark tables | The reference every insight compares against | "Am I behind standard?" answerable | Data moat; powers everything advisory | Medium |
| Smart Insights feed (₹ impact) | Farmers want decisions, not reports | "FCR drifted, costing ₹X" → action | Core premium hook | Medium |
| Feed intelligence (days-left + anomaly/theft) | Feed = 65–70% of cost; theft is real | Reorder on time; catch wastage/theft | The trust wedge, monetizable | Medium |
| HDEP curve + production-drop alert (layer) | Layer's equivalent of the spike alert | Protect peak production | Wins the layer segment | Medium |
| Sell-timing calculator (broiler) | The highest-leverage single decision | Sell on the right day → more ₹/bird | Tangible ROI story for marketing | Low–Med |

### Phase 4 — Premium Differentiators (Days 71–90)
*The features competitors structurally can't or won't build. These justify the paid tier and define the category.*

| Item | Why it matters | User impact | Business impact | Complexity |
|---|---|---|---|---|
| Contract settlement reconciliation | ~80% of broiler is integration; disputes are constant | "Prove your settlement is wrong" | Indispensable to contract growers; defensible | Medium |
| Price intelligence (NECC + live-bird) | The number farmers check daily, done right | Better price decisions every cycle | Daily-open habit; retention engine | Medium |
| Owner trust/transparency report | The Owner↔Worker fault line | Owner sees feed/growth/mortality reconciled | The reason the owner pays — and renews | Medium |
| WhatsApp digest enrichment | Owners live in WhatsApp | Value with zero app-opens | Lowest-friction retention surface | Low |

---

## Closing strategic note
Sequence is deliberate: **trustworthy data (P1) → fast capture (P2) → decisions (P3) → defensible moat (P4).** Skipping ahead to shiny intelligence on top of a wrong ledger and an unloggable form is how poultry software has failed for 20 years. Win the boring layer first; the category-leading product is the reward.

*Nothing in this plan rebuilds existing functionality. Every item is additive and measurable.*
