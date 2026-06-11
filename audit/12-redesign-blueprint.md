# 12 — SaaS Redesign Blueprint

_Created 2026-06-11. Strategy document only — no code. Synthesizes audits 01–11 into a single redesign spec covering IA, navigation, design system, layouts, workflows, components, dashboard, mobile, and premium UX patterns. Every decision traces to an audit finding (G# = [10-gap-analysis.md](10-gap-analysis.md), D# = [05-design-system-audit.md](05-design-system-audit.md), W#/M# = [03-user-flows.md](03-user-flows.md))._

---

## 0. Redesign thesis

**This is a refinement, not a reskin.** The token system, the offline daily-log loop, the Khata money loop, and the backend are keepers. The redesign fixes four systemic problems:

1. **Flat IA** — 19 web sidebar items / 14 mobile More items with no hierarchy (G15).
2. **Missing states layer** — no skeletons, no error boundaries, silent empties (G11, G13).
3. **Broken foundations quietly shipped** — fonts loaded but unused, paid-gated landing page, dead-end widgets (D-fonts, G6, G7).
4. **No premium "feel" layer** — no optimistic UI, no data-freshness cues, no command surface, no role awareness.

### Non-negotiable constraints (inherited, do not redesign)

| Constraint | Source |
|---|---|
| Kraken Purple token palette; DESIGN.md remains token source of truth | CLAUDE.md design section |
| Light theme only (v1); dark mode deferred | CLAUDE.md |
| ₹6k Android / 2GB RAM / 4G performance budget; cold start <3s | CLAUDE.md perf targets |
| Daily log ≤3 taps after opening form; worker logs <60s | Phase 1 gate |
| 44×44px minimum touch targets; buttons 12px radius (never pill); cards 16px | DESIGN.md rules |
| WhatsApp green for share actions only; UPI purple distinct from brand | Domain overlay |
| Bottom nav stays 5 tabs: Dashboard · Flocks · Log · Khata · More | CLAUDE.md mobile UX |

### Design principles for everything below

1. **One glance, one action** — every screen answers "what changed?" and offers "what should I do next?" above the fold.
2. **States are features** — loading, empty, error, offline, permission-denied, and stale-data are designed surfaces, never accidents.
3. **Money is sacred** — anything showing ₹ gets freshness timestamps, explicit pending/paid semantics, and confirmation affordances.
4. **Role shapes the surface** — owner, worker, and vet see different products, not the same product with holes.
5. **Vernacular-ready by construction** — no text in images, no width-assuming layouts, all strings through i18n (the hi/ta/te files already exist).

---

## 1. Information Architecture 2.0

### 1.1 The domain model users think in

Farmers don't think in 19 modules. They think in four mental buckets, which become the universal IA:

| Group | Mental model | Modules |
|---|---|---|
| **Operate** | "Run my birds today" | Dashboard/Home, Flocks & Batches, Daily Log, Health, Vaccinations, Inventory, Weather |
| **Money** | "Who owes me, what did I earn" | Khata (buyers), Transactions, Batch P&L, Contract & Settlements, Market Prices |
| **Insights** | "How am I doing" | Reports, Traceability, Multi-Farm (paid), Notifications/Activity |
| **Setup** | "Configure once, touch rarely" | Farm & Sheds, Team, Integrators, WhatsApp Settings, Billing, Language, Profile |

### 1.2 Web sidebar — from 19 flat items to 4 groups

Replaces [Sidebar.tsx:10-30](web/components/Sidebar.tsx#L10-L30).

```
┌──────────────────────────┐
│ ▸ PoultryOS      [farm ▾]│  ← farm switcher (multi-farm owners), not buried in settings
│ ⌕ Search… (Ctrl+K)       │  ← command palette trigger
│ [＋ Log entry]            │  ← keep: primary CTA pinned (it's the product's heartbeat)
├──────────────────────────┤
│ OPERATE                  │
│   ⌂ Home                 │  ← NEW: free-tier dashboard home (fixes G7/W1)
│   🐔 Flocks               │  ← batches list; sheds nested inside
│   ♥ Health                │  ← health + vaccinations merged surface (2 tabs inside)
│   📦 Inventory            │
│   ☁ Weather               │
├──────────────────────────┤
│ MONEY                    │
│   ₹ Khata                │  ← buyers + aging inside
│   ⇄ Transactions          │
│   🤝 Contract             │  (hidden for independent farms — farm_type aware)
│   📈 Market Prices        │
├──────────────────────────┤
│ INSIGHTS                 │
│   📊 Reports              │
│   🔗 Traceability         │
│   🗂 Multi-Farm  [PRO]    │  ← gated items show badge, never hide (upsell visibility)
├──────────────────────────┤
│ ⚙ Settings               │  ← single entry; Setup group lives INSIDE settings
│ 🔔 Activity      (3)      │  ← notifications with unread count
│ ◷ user name · Sign out   │
└──────────────────────────┘
```

**Rules:**
- Collapsible groups, persisted per user (localStorage). Default: all expanded.
- ≤6 items visible per group. Integrators, Team, WhatsApp, Billing, Language move *inside* Settings (they were never daily-use — G15).
- Active state: `bg-primary-subtle text-primary` (current pattern is correct, keep).
- `farm_type === 'independent'` hides Contract; `role === 'worker'` renders only Operate + (own) Activity — see §1.4.
- <1024px: sidebar becomes an overlay drawer with hamburger in a new top bar (fixes G19/W3). <640px: bottom tab bar mirroring mobile's 5 tabs.

### 1.3 Mobile IA — keep the 5 tabs, redesign "More"

Tabs stay (audit confirms the tab choice is right; the More tab is the problem — M3). "More" becomes a **grouped grid hub**, not a flat list:

```
┌─ More ────────────────────────────┐
│  OPERATE                          │
│  [♥ Health] [💉 Vaccines] [📦 Inv] │
│  [☁ Weather] [📈 Prices]           │
│  MONEY                            │
│  [⇄ Transactions] [🤝 Contract]    │
│  INSIGHTS                         │
│  [📊 Reports] [🔗 Trace] [🗂 Multi]│
│  ───────────────────────────────  │
│  ⚙ Settings  · 🔔 Activity         │
│  💬 WhatsApp · 🌐 भाषा/Language    │
│  💳 Billing                        │
└───────────────────────────────────┘
```
2-column tappable tiles (icon + label, 44px+), grouped under eyebrow headers. Order within groups = usage frequency. Contract tile hidden for independent farms; PRO-gated tiles show lock badge.

### 1.4 Role-aware IA matrix (fixes M6/G13)

| Surface | Owner | Worker | Vet |
|---|---|---|---|
| Tabs (mobile) | All 5 | Dashboard · Flocks · Log · **More(reduced)** — Khata tab removed | Dashboard(read) · **Cases** · More(reduced) |
| Money group | ✅ | ✖ hidden entirely | ✖ hidden |
| Health | full | create incidents (assigned sheds) | **Case queue** home: open incidents, add vet_note, withdrawal calendar |
| Inventory | full | view + purchase/usage entry | ✖ |
| Settings | full | profile + language only | profile + language only |
| Anything RLS-denied that must remain visible | — | **PermissionEmptyState** component ("Only the owner can see buyer ledgers") — never a silent blank | same |

The Vet "Cases" surface is new (G14): it's the role's entire product — list of incidents across farms that invited them, each opening to incident detail + `update_vet_note` RPC + withdrawal date confirmation.

### 1.5 Route map (old → new, web)

| Old | New | Note |
|---|---|---|
| login redirect → `/multi-farm` | → `/home` | new free dashboard (G7) |
| `/farms`, `/sheds/*` | `/settings/farm` | setup, not daily nav |
| `/team`, `/integrators`, `/whatsapp-settings`, `/billing` | `/settings/{team,integrators,whatsapp,billing}` | consolidated |
| `/vaccinations` | `/health?tab=vaccinations` | one Health surface, two tabs |
| `/khata/aging` | `/khata?view=aging` | view toggle, not separate nav |
| everything else | unchanged paths | avoid breaking deep links/bookmarks; old paths 301 |

---

## 2. Navigation patterns

### 2.1 Web top bar (new)

A slim 48px top bar appears at all breakpoints (today there is none):
`[☰ <1024px] [Breadcrumb: Money / Khata / Ramesh Traders] ··· [⌕ Ctrl+K] [+ Quick actions ▾] [🔔3] [avatar]`
- **Breadcrumbs**: group / module / record — gives the "where am I" Linear-grade orientation that 24 flat routes currently lack.
- **Quick actions menu**: Log entry · Add transaction · Add buyer · Record purchase — the 4 highest-frequency creates, available from anywhere.

### 2.2 Command palette (web, premium pattern)

`Ctrl+K`: fuzzy search over routes, batches (by batch_code), and buyers (by name). Actions inline: "Mark paid…", "Generate UPI QR for…". This single feature does more for the "Linear feel" than any visual polish. (Mobile equivalent: search field at top of Flocks and Khata lists only — no global palette on mobile.)

### 2.3 Mobile navigation conventions

- Stack screens keep the existing `HeaderBackButton`; titles use `displayXs`.
- The FAB stays exclusive to daily log (heartbeat action) — do **not** turn it into a multi-action FAB; secondary creates live in each screen's header (`＋` icon).
- Deep links: every notification row navigates to its subject (`/batches/[id]`, `/buyers/[id]`, `/weather`) — fixes G27 and the weather dead-end pattern class (G6).
- Pull-to-refresh on every list (already standard — keep).

---

## 3. Design System 2.0

Token values stay (DESIGN.md). The redesign adds the **missing layers**: a real font decision, semantic state tokens, and component tokens.

### 3.1 Typography — make the decision (fixes D-fonts)

**Decision: bundle IBM Plex Sans properly on mobile; load it via `next/font` on web. Delete Inter.**
- Mobile: `@expo-google-fonts/ibm-plex-sans` (400/500/600/700), registered names baked into each typography token (`fontFamily: 'IBMPlexSans_600SemiBold'` style — RN needs exact family names, not CSS stacks — see [05 §2](05-design-system-audit.md)).
- Web: `next/font` self-hosted IBM Plex Sans, mapped to Tailwind `font-sans`.
- Devanagari/Tamil/Telugu scripts: IBM Plex covers Devanagari; for ta/te fall back to **Noto Sans Tamil/Telugu** — declare per-locale fallback in the i18n layout rules (§8.5).
- Budget guard: 4 weights max, subset latin+latin-ext (+devanagari when hi active). If cold-start measurement (audit 06 P0-2) shows >150ms regression on the Redmi baseline, fall back to system font *as an explicit documented decision* and delete all font loading.

### 3.2 Color — additions, not changes

| New semantic token | Value | Use |
|---|---|---|
| `colors.info` / `infoSoft` | `#1d4ed8` / `rgba(29,78,216,0.12)` | neutral notices, sync status |
| `colors.pendingInk` / `pendingSoft` | reuse `warningInk`/`warningSoft` aliased | payment `pending`/`partial` chips — money states get named tokens so they're never improvised per page (audit found 3 divergent badge stylings — D2) |
| `colors.offline` | `#B45309` on `#FEF3C7` | offline banner (formalizes current yellow strip) |
| `colors.stale` | `bodySoft` + clock icon rule | data-freshness labels (§10.4) |
| Contrast fix | `bodySoft` `#9497a9` → restricted to ≥16px text; captions on soft backgrounds use `body` `#686b82` | WCAG AA (D-contrast, G20) |

### 3.3 State & interaction tokens (new layer)

```
state.hover      = 4% ink overlay          (web only)
state.pressed    = 8% ink overlay / scale 0.98 (mobile)
state.focus      = 2px ring colors.primary, offset 2 (visible keyboard focus everywhere — currently absent)
state.disabled   = 40% opacity + no elevation
motion.fast      = 120ms ease-out  (hover, press)
motion.base      = 200ms ease-out  (panels, accordions)
motion.entrance  = 240ms ease-out + 8px translate-y (modals, sheets)
Reduced-motion: respect OS setting; skeleton shimmer → static block.
```

### 3.4 Iconography

lucide everywhere (already true on both platforms ✅). Sizes: 16 inline, 18 nav, 22 tabs, 24 feature. Stroke 2. Never color-only meaning (pair with text — G20).

---

## 4. Component Library 2.0

### 4.1 Shared logic package (pre-requisite)

Create `packages/shared` (or `lib/shared` consumed by both): `upi.ts` (single VPA regex — currently duplicated, a payments-correctness risk), `kpis.ts`, `freemium.ts`, `format-date.ts`, currency formatter (`₹1,23,456` Indian grouping — standardize once), i18n keys. UI stays platform-native; *logic* is shared.

### 4.2 Web primitive set (new — fixes D2/D3)

Today web has 5 shared components and per-page drift. The blueprint set, in build order:

| Component | API sketch | Replaces |
|---|---|---|
| `PageHeader` | `title, breadcrumb, actions[], badge?` | hand-rolled h1 rows on 24 pages |
| `Badge` | `tone: success·pending·danger·neutral·pro` | 3+ divergent inline badge stylings |
| `DataTable` | columns def, server pagination (`page,pageSize,total`), row click, empty/loading slots, sticky header, mobile card-collapse <640px | capped `.limit()` tables (G16) |
| `Dialog` / `ConfirmDialog` | focus-trapped, `danger` variant for destructive | `window.confirm` in DeleteButton (D3) |
| `Skeleton` + per-template presets | `SkeletonTable`, `SkeletonCards`, `SkeletonKpis` | nothing (G11) |
| `EmptyState` v2 | `icon, title, body, primaryAction, learnHref` + `PermissionEmptyState`, `UpgradeEmptyState` variants | blank screens, silent RLS empties |
| `StatCard` | `label, value, delta?, tone, freshness?, onClick` | ad-hoc KPI markup |
| `FormField` | label-above (spec), error slot, help slot, required mark | per-form drift |
| `Toast` system | `success/error/info`, action slot ("Undo") | scattered inline messages |
| `MoneyAmount` | sign-aware, tone-aware ₹ renderer | inconsistent amount rendering |
| `FreshnessLabel` | "as of 09:40 · today" + stale warning >24h | trust microcopy (§10.4) |
| `UpgradeGate` v2 | keep server check; add preview-blur variant (§10.6) | current binary gate |

### 4.3 Mobile additions (extends the existing 31 — keep all)

| Component | Purpose |
|---|---|
| `Skeleton` (+ shimmer-free variant) | replace ActivityIndicator screens (D1) |
| `PermissionEmptyState` | worker/vet denied surfaces (G13) |
| `BottomSheet` | filters, quick actions, batch picker — replaces full-screen detours for small choices |
| `SegmentedControl` | view toggles (Khata: All/Aging; Health: Incidents/Vaccinations) |
| `ListRow` (generic) | icon + title + meta + trailing value — unifies ledger/transaction/notification rows |
| `SyncStatusChip` | per-record queued/synced state on daily logs (offline trust, §8.2) |
| `StaleDataBanner` | market price / weather older than threshold |
| `ErrorState` | retry CTA wired to the failed loader — replaces silent `catch {}` (M5) |

### 4.4 Deletions

react-native-paper (only Snackbar remains — replace with own Toast and drop the dependency), victory-native, skia, Inter fonts, jspdf-autotable (until Reports PDF ships and chooses its lib deliberately).

---

## 5. Page layout templates

Five canonical templates; every screen maps to exactly one. (Consistency is the premium signal — Stripe has ~4 templates total.)

### T1 — Dashboard (web `/home`, mobile Dashboard)
See §6.

### T2 — List page
```
[PageHeader: title · count · primary action]
[Toolbar: search | filters (BottomSheet on mobile) | view toggle | export]
[DataTable (web) / FlatList of ListRow|Cards (mobile)]
[Pagination (web) / infinite scroll (mobile)]
States: SkeletonTable → EmptyState(first-use) | PermissionEmptyState | ErrorState
```
Applies to: Flocks, Khata, Transactions, Inventory, Health, Notifications, Settlements.

### T3 — Detail page (record-centric)
```
[PageHeader: record name · status Badge · actions (≤3 + overflow ▾)]
[Hero strip: 3–4 StatCards specific to the record]
[Tab bar or stacked sections: e.g. Batch → Logs | Health | Vaccines | P&L]
[Activity/history list at bottom]
```
Applies to: Batch detail, Buyer detail, Contract cycle, Inventory item, Farm.

### T4 — Form page / flow
```
[Header: task name + close]
[FormFields, label-above, one column, 36px inputs]
[Sticky footer: secondary · primary (loading state inside button)]
Multi-step → StepIndicator (exists) + per-step validation + draft persistence
```
Rule: forms never lose data — onboarding store pattern (zustand persistence) extends to all multi-step forms.

### T5 — Settings hub
```
Web: two-pane (settings nav left within content area / panel right)
Mobile: grouped list → leaf screens
Sections: Farm & Sheds · Team · Integrators · WhatsApp · Billing · Profile · Language
```

---

## 6. Dashboard experience redesign

### 6.1 Web `/home` (new page — the linchpin of the funnel fix, G7)

```
┌────────────────────────────────────────────────────────────┐
│ Good morning, Ramesh        Sundara Farm · TN   [＋ Log]    │
│ ⚠ HEAT ALERT 41°C tomorrow — see 4 actions      [dismiss]  │ ← only when active
├──────────────┬──────────────┬──────────────┬───────────────┤
│ Active birds │ Mortality 7d │ FCR          │ ₹ Outstanding │ ← StatCards w/ tone + delta
│ 4,820        │ 0.8% ▼good   │ 1.72         │ ₹46,500 (3)   │   Outstanding links → Khata
├──────────────┴──────┬───────┴──────────────┴───────────────┤
│ TODAY  (action queue)│  Market: Broiler ₹128/kg ▲2 · as of │
│ ☐ Log not entered    │  today 08:00 [→ trend]              │
│   for Shed 2    [Log]│  Weather: 34° → 41° tomorrow        │
│ ☐ IBD vaccine due    │  [→ weather]                        │
│   B-260101 [Mark]    ├─────────────────────────────────────┤
│ ☐ ₹12,000 due 9d     │  ACTIVE BATCHES                     │
│   Ramesh Tr. [Remind]│  B-260101 · Cobb · 2,400 · day 23   │
│ ☐ Starter feed low   │  B-260115 · Ross · 2,420 · day 9    │
└──────────────────────┴─────────────────────────────────────┘
```

**The "Today" action queue is the centerpiece** — a server-derived to-do list (missing logs, due vaccinations, overdue payments from `check_payment_overdue` data, low stock from `low_stock_items` RPC). Every row has its action inline. This converts the dashboard from a report into a cockpit — the single biggest "billion-dollar SaaS" upgrade available, and all of its data sources already exist as RPCs/tables.

### 6.2 Mobile Dashboard — keep the bones, add three things

Current layout (greeting → heat banner → price strip → weather → KPI grid → batches) is good. Changes:
1. **Insert the "Today" queue** between KPI grid and Active Batches (collapsed to top 3 items + "view all").
2. **Weather widget taps through to `/weather`** (G6) and shows a FreshnessLabel.
3. **KPI tiles deep-link**: Mortality → flock list sorted by mortality; Outstanding → Khata aging; FCR → batch with worst FCR.
4. Skeleton grid replaces blank-while-loading; ErrorState with retry replaces silent catch.
5. Worker variant: hide ₹ Outstanding card; Today queue shows only log/vaccination tasks for assigned sheds.

---

## 7. Workflow redesigns (the six that matter)

### 7.1 First-touch: OTP-first auth (G1)
```
[Phone number] → [Get OTP] → [6-digit entry (react-native-otp-entry)]
  ↳ auto-read SMS (Android SMS Retriever) · resend w/ 30s cooldown
  ↳ "Use email instead" link (existing flow demoted to fallback)
New user after verify → name + role → onboarding wizard
```
Forgot-password (email path) ships in the same release (G10). Error states designed: wrong code (inline), too many attempts (cooldown screen), SMS not delivered (switch to email CTA).

### 7.2 Daily log — protect and polish the crown jewel
Keep single-page form. Add: (a) batch pre-selected from entry context (FAB on batch detail logs *that* batch); (b) `SyncStatusChip` on saved entries; (c) after-save sheet: "✓ Saved · Shed 2 done — Log Shed 1 next?" chaining multi-shed farms — this is how the <60s gate holds at 3 sheds; (d) yesterday's values as ghost placeholders for fast comparison.

### 7.3 Khata collect-money loop (the revenue habit)
```
Aging view default sort: overdue first
Buyer row → [₹ Collect] opens BottomSheet:
   [UPI QR (instant)] [Send Collect link] [Send reminder] [Mark paid…]
Mark paid → amount field (full/partial w/ amount_paid — G4) → optimistic row update + Undo toast
After Razorpay webhook confirms → row pulses success + push "₹6,000 received from Ramesh"
```
The pulse+push close the trust loop that makes farmers stop keeping the paper book.

### 7.4 Batch close → settlement (contract wedge)
Wizard: Confirm counts → Sale/delivery details → (contract) settlement preview screen showing the math **with the tariff card visible** ("Base ₹7.50/kg + FCR bonus ₹0.50 — rates last verified: never ⚠ [Verify rates]") → close → certificate + WhatsApp share sheet. Surfacing `review_required` (G24) inside the flow turns a data liability into a trust feature.

### 7.5 Worker experience
Reduced tabs (§1.4), Today queue scoped to assigned sheds, PermissionEmptyState anywhere money would be. Invite flow added to **mobile** Settings → Team (G18): phone number → role → shed assignment → WhatsApp invite message.

### 7.6 Vet experience (G14)
Case-queue home (§1.4). Incident detail: symptoms, photos (future), treatment, dose, withdrawal-days input → auto-computed clearance date → vet_note via existing RPC. Read-only flock context (RLS already permits).

---

## 8. Mobile experience standards

1. **Performance budget per screen**: TTI <800ms warm / <2s cold on Redmi 9A; FlatList for any list >10 rows (G-P1-4); no full-screen re-fetch on tab focus — stale-while-revalidate from zustand cache (06 P1-3).
2. **Offline grammar** (extend the queue pattern's *language* without extending scope): banner = global state; SyncStatusChip = per-record state; queued actions always show in lists immediately (optimistic) with the chip, never disappear into the queue invisibly.
3. **Touch ergonomics**: bottom-third placement for primary actions; BottomSheet over modal; destructive actions never adjacent to primary.
4. **Notifications**: every push deep-links (G27); notification list rows use ListRow with subject → screen mapping.
5. **Vernacular layout rules**: min 1.4 line-height for Indic scripts; buttons size to content (Tamil strings run ~40% longer than English); date format DD-MMM-YYYY everywhere via shared formatter; numerals stay Latin (field convention).
6. **Web-on-phone**: the Next.js app at <640px gets the mobile bottom-tab shell (§1.2) — buyers/vets opening shared links must not meet a desktop sidebar (G19).

---

## 9. Premium SaaS UX pattern catalog (the "feel" layer)

| # | Pattern | Spec | Fixes |
|---|---|---|---|
| 9.1 | **Skeleton-first loading** | Every async surface renders its skeleton preset ≤1 frame after nav; no spinners except inside buttons | G11, D1 |
| 9.2 | **Optimistic UI + Undo** | Mark-paid, acknowledge-alert, mark-vaccine-done apply instantly; toast with 5s Undo; reconcile on server response | trust/speed |
| 9.3 | **Designed empty states** | First-use (illustration + 1-line value + CTA), filtered-empty ("no results — clear filters"), permission, upgrade — four distinct variants, never a blank | M6, D6 |
| 9.4 | **Data freshness everywhere money/weather appears** | FreshnessLabel: "as of 08:00 today"; >24h flips to stale tone + explain; market strip shows source (manual/agmarknet) | G9 trust, 04 §5 |
| 9.5 | **Error recovery, not error display** | ErrorState always carries retry; Sentry-logged; never silent catch | M5 |
| 9.6 | **Freemium gates that sell** | Gated nav items visible with PRO badge; gate screens show a blurred/preview render of the real feature + one-line value + price; usage meters ("3/5 WhatsApp alerts used this month") surface *before* the wall | G7, monetization |
| 9.7 | **Command palette + shortcuts (web)** | Ctrl+K palette; `L` = new log, `T` = new transaction, `G then K` = Khata | Linear-feel |
| 9.8 | **Confirmation grammar** | Destructive = typed-name or explicit danger Dialog; reversible = Undo toast (no dialog); money-state changes = summary line in the confirm ("Mark ₹12,000 from Ramesh as PAID?") | D3 |
| 9.9 | **Activity timeline** | Per-batch and per-buyer event history (logs, payments, alerts) — turns records into stories; data already exists across tables | retention |
| 9.10 | **Trust microcopy** | "Synced ✓ 2 min ago" on dashboards; "This certificate is locked and tamper-evident" on traceability; "Your data stays in India (Mumbai region)" in onboarding | brand |
| 9.11 | **Accessibility baseline** | Focus rings (§3.3), aria-labels on all icon buttons, focus-trapped dialogs, KPI tones paired with ▲▼/text, contrast per §3.2 — WCAG AA target | G20 |
| 9.12 | **In-product changelog** | "What's new" sheet on version bump (3 bullets, vernacular) — beta-farm communication channel | launch ops |

---

## 10. Rollout plan (maps to the execution-plan sprints)

| Phase | Scope | Acceptance criteria |
|---|---|---|
| **R0 — Foundations** (with Sprint 1) | Font decision implemented; state tokens; shared package (`upi`, formatters); delete dead deps; Skeleton + ErrorState + Toast primitives both platforms | cold-start baseline recorded; zero hex/font violations in CI lint |
| **R1 — IA flip** (Sprint 2) | Web: top bar, grouped sidebar, `/home` dashboard with Today queue, settings consolidation, route 301s; Mobile: More-hub redesign, role-aware tabs, weather deep-link | free user lands on `/home`; nav depth ≤2 clicks to any module; worker sees no money surfaces |
| **R2 — States & templates** (Sprint 2–3) | T2/T3/T4 templates applied to top-8 screens; DataTable w/ pagination; Dialog; empty-state variants; PermissionEmptyState | zero blank screens in a full app walkthrough; all lists paginate |
| **R3 — Premium layer** (Days 31–60) | Optimistic UI on the 4 money/ack actions; freshness labels; freemium gate v2 with previews + usage meters; command palette; mobile web shell | Khata collect loop ≤3 taps; gate→billing CTR measurable |
| **R4 — Role products** (Days 45–90) | Vet case queue; worker Today scoping; mobile team invite; activity timelines | a vet can complete a case end-to-end on mobile web |

**Design-debt guardrails going forward:** every new screen must declare its template (T1–T5) and its four states in the PR description; CI greps for raw hex, raw `window.confirm`, and `ActivityIndicator` outside buttons.

---

## 11. What deliberately did NOT change

- Brand palette, spacing/radius ladders, elevation — DESIGN.md remains law.
- Bottom-tab structure and the daily-log FAB — the audit scored this flow 9/10; redesign protects it.
- Server-component-first web architecture and RLS-driven security model — the redesign is presentation + IA only.
- Freemium *limits* — only the gate presentation changes.
- No dark mode, no web vernacular fonts beyond fallbacks, no new modules — scope discipline per CLAUDE.md.
