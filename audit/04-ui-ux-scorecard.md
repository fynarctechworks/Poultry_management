# 04 — Billion-Dollar SaaS UX Scorecard

_Audit date: 2026-06-11. Benchmark bar: Stripe (clarity/trust), Shopify (merchant ergonomics), Notion (approachability), Linear (speed/IA), HubSpot (breadth without clutter), Vercel (polish). Scores 1–10 derived from code review of layout, states, copy, and interaction patterns — no live-device run (note: screenshots on a Redmi-class device should be the follow-up)._

## Scoring dimensions
**VD** Visual Design · **IA** Information Architecture · **US** Usability · **A11y** Accessibility · **MX** Mobile Experience · **TR** User Trust (states, feedback, error handling) · **SQ** Modern-SaaS Quality bar

## Mobile app (Expo)

| Screen | VD | IA | US | A11y | MX | TR | SQ | Notes (evidence) |
|---|--|--|--|--|--|--|--|---|
| Login / Register | 6 | 6 | **3** | 5 | 6 | 4 | 4 | Clean tokens, but email/password only for an OTP-first audience ([auth-service.ts](PoultryOS/auth/auth-service.ts)); no forgot-password |
| Onboarding wizard (5 steps) | 7 | 8 | 7 | 6 | 8 | 6 | 7 | StepIndicator, store-backed resume ([stores/onboarding.ts](PoultryOS/stores/onboarding.ts)); good value sequencing |
| Dashboard | 8 | 8 | 7 | 6 | 8 | 5 | 7 | Best screen: KPI tones, heat banner, market strip, FAB ([dashboard.tsx](PoultryOS/app/(tabs)/dashboard.tsx)); −trust for silent `catch {}` and weather dead-end |
| Flocks / Batch detail | 7 | 7 | 7 | 6 | 7 | 6 | 7 | Card hierarchy good; missing profit calculator (open item) |
| Daily Log entry | 7 | 8 | **9** | 6 | 9 | 8 | 8 | Single-page, offline queue + sync feedback — flagship flow |
| Khata / Buyer detail | 7 | 7 | 8 | 6 | 8 | 7 | 7 | 3-tap QR + reminder loop; balance semantics clear ([KhataLedgerRow.tsx](PoultryOS/components/ui/KhataLedgerRow.tsx)) |
| UPI QR modal | 8 | 8 | 8 | 5 | 8 | 7 | 8 | 250px QR, amount + buyer below, per spec ([UpiQrModal.tsx](PoultryOS/components/ui/UpiQrModal.tsx)) |
| Health / Vaccinations | 7 | 7 | 7 | 6 | 7 | 6 | 7 | Withdrawal badge is a strong domain touch ([WithdrawalBadge.tsx](PoultryOS/components/ui/WithdrawalBadge.tsx)) |
| Inventory | 7 | 7 | 7 | 6 | 7 | 6 | 7 | Solid cards; low-stock affordance present |
| Market Prices | 7 | 6 | 6 | 5 | 7 | **4** | 6 | Hand-rolled SVG chart is competent; trust collapses when data is stale (no automated feed) |
| Weather | 7 | 7 | 7 | 6 | 7 | 6 | 7 | Complete screen — just unreachable from its main entry point |
| Contract dashboards | 7 | 7 | 7 | 5 | 7 | 6 | 7 | Settlement math surfaced clearly; tariff "review_required" not surfaced to user (trust risk) |
| Reports | 6 | 6 | 6 | 5 | 6 | 6 | 6 | CSV only; monospace preview ([reports/index.tsx:398](PoultryOS/app/reports/index.tsx#L398)) feels developer-grade, not farmer-grade |
| More tab | 5 | **4** | 5 | 6 | 6 | 6 | 5 | 14 flat items, no grouping/search |
| Settings / WhatsApp settings / Language | 7 | 7 | 7 | 6 | 7 | 7 | 7 | Per-category WhatsApp prefs = genuinely Stripe-grade control granularity |
| Billing | 7 | 7 | 6 | 5 | 7 | 6 | 7 | Plan cards exist ([PlanCard.tsx](PoultryOS/components/ui/PlanCard.tsx)); blocked on live plan IDs |
| **Mobile mean** | **6.9** | **6.8** | **6.7** | **5.6** | **7.2** | **5.9** | **6.7** | |

## Web app (Next.js)

| Screen | VD | IA | US | A11y | MX | TR | SQ | Notes |
|---|--|--|--|--|--|--|--|---|
| Login / Register | 7 | 7 | 7 | 4 | 5 | 6 | 7 | Has phone OTP ✅; minimal aria |
| Post-login landing (/multi-farm) | 6 | **3** | **3** | 4 | 3 | **3** | 4 | Free user's home = upgrade gate (W1 in [03-user-flows.md](03-user-flows.md)) |
| Sidebar shell | 6 | **4** | 5 | 4 | **2** | 6 | 5 | 19 flat links, no grouping, no collapse, unusable <1024px ([Sidebar.tsx](web/components/Sidebar.tsx)) |
| Batches list/detail/P&L | 7 | 7 | 7 | 4 | 4 | 6 | 7 | Server-rendered, fast; no loading/error states |
| Daily log list/new/edit | 7 | 7 | 8 | 4 | 4 | 6 | 7 | Mirrors mobile form well |
| Khata (list/detail/aging) | 7 | 8 | 8 | 4 | 4 | 7 | 8 | Aging buckets + ReminderButton = HubSpot-grade AR view ([khata/aging](web/app/(dashboard)/khata/aging/page.tsx)) |
| Transactions | 7 | 7 | 7 | 4 | 4 | 6 | 7 | MarkPaidButton inline action good; 100-row cap, no pagination |
| Contract suite | 7 | 7 | 7 | 4 | 4 | 6 | 7 | Gated correctly post-audit (launch checklist §6) |
| Multi-farm (paid) | 7 | 7 | 7 | 4 | 4 | 6 | 7 | RPC-aggregated; legitimate paid differentiator |
| Reports | 6 | 6 | 6 | 4 | 4 | 6 | 6 | CSV only — "Download CSV" labelled honestly at least |
| Traceability (public) | 8 | 8 | 8 | 6 | 7 | 8 | 8 | Best web page: clean cert layout, consumer-appropriate copy ([traceability/[token]/page.tsx](web/app/traceability/[token]/page.tsx)) |
| Weather / Market prices | 7 | 7 | 7 | 4 | 4 | 6 | 7 | Recharts trend ([PriceTrend.tsx](web/app/(dashboard)/market-prices/PriceTrend.tsx)) |
| Billing | 7 | 7 | 7 | 4 | 4 | 7 | 7 | Grace-window badge ("past_due · grace") is a Stripe-grade trust detail |
| Onboarding wizard | 7 | 8 | 7 | 4 | 5 | 6 | 7 | Parity with mobile |
| **Web mean** | **6.9** | **6.4** | **6.6** | **4.2** | **4.1** | **6.0** | **6.6** | |

## Benchmark deltas — what separates this from the Stripe/Linear tier

1. **States discipline** (biggest gap): Stripe never shows a white screen or a silently-empty table. Here: 0 `loading.tsx`, 0 `error.tsx`, bare `catch {}` blocks, workers seeing unexplained empty Khata. Skeletons are a CLAUDE.md requirement ("Loading: skeleton screens (not spinners)") and are not implemented as components anywhere in [components/ui/](PoultryOS/components/ui/).
2. **IA compression**: Linear ships ~6 top-level nav groups. Web has 19; mobile "More" has 14. Both need grouping (Operate / Money / Insights / Setup) and a command-palette-style search on web.
3. **Accessibility**: 6 aria attributes across the entire web app; no focus management in modals; color-only KPI tones (positive/negative) with no icon/text redundancy in [KpiTile.tsx](PoultryOS/components/ui/KpiTile.tsx). WCAG AA is not met.
4. **Responsive web**: Vercel-tier products are flawless at 360px. This web app is desktop-only by construction — yet the buyer persona will open shared links on phones.
5. **Trust microcopy**: no last-synced timestamps on KPIs, no "price data from {date}" prominence when stale, no optimistic UI on mark-paid actions.
6. **Where it already competes**: token discipline (one source of truth), per-category notification prefs, the offline daily-log loop, the public traceability page, and honest freemium gating with server enforcement — these are genuinely top-tier patterns.

## Priority UX fixes (ranked by impact ÷ effort)

| P | Fix | Effort |
|---|---|---|
| P0 | Route weather widget → `/weather` (delete snackbar) | minutes |
| P0 | Web: create a real `/dashboard` home (free-tier KPIs) and point the login redirect at it | 1–2 days |
| P0 | Mobile phone OTP login (also a UX item — it's the first screen) | 2–3 days |
| P1 | Add `loading.tsx` + `error.tsx` to all web route groups; Skeleton component for mobile | 2 days |
| P1 | Group sidebar (web) + More tab (mobile) into 4 sections | 1 day |
| P1 | Role-aware nav: hide Khata/financial tabs for workers; permission empty-states | 1 day |
| P2 | Responsive sidebar (drawer <1024px) | 1–2 days |
| P2 | A11y pass: aria-labels on icon buttons, focus traps in modals, non-color KPI cues | 2–3 days |
