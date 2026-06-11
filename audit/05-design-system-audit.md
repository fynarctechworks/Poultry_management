# 05 — Design System Audit

_Audit date: 2026-06-11. Source of truth: DESIGN.md (Kraken-inspired tokens) → [PoultryOS/theme/tokens.ts](PoultryOS/theme/tokens.ts) (mobile) and [web/lib/theme/tokens.ts](web/lib/theme/tokens.ts) + [web/tailwind.config.ts](web/tailwind.config.ts) (web)._

## 1. Token architecture — verdict: strong

- Mobile tokens file declares the rule "This is the ONLY file in the project that may contain hex literals" ([tokens.ts:2](PoultryOS/theme/tokens.ts#L2)) and the codebase **almost** honors it: a full hex scan of `PoultryOS/app`, `components`, `lib` found only **2 violations**, both the same constant:
  - [TraceabilityModal.tsx:7](PoultryOS/components/ui/TraceabilityModal.tsx#L7) `const WHATSAPP_GREEN = '#25D366'`
  - [WhatsAppShareButton.tsx:7](PoultryOS/components/ui/WhatsAppShareButton.tsx#L7) `const WHATSAPP_GREEN = '#25D366'`
  - …despite `colors.whatsapp` existing in the token file ([tokens.ts:30](PoultryOS/theme/tokens.ts#L30)). ♻️ Duplicate + violation; trivial fix.
- Web: zero hardcoded hex outside its token file; Tailwind classes map to token names (`bg-canvas`, `text-ink`, `border-mute`, `bg-primary-subtle` — see [Sidebar.tsx](web/components/Sidebar.tsx), [traceability page](web/app/traceability/[token]/page.tsx)).
- Legacy cleanup confirmed complete: no `#1A56DB` (old Brand Blue) or `#e60000` (Vodafone red) anywhere — CLAUDE.md "Legacy Cleanup Notes" are done.

## 2. Typography — verdict: broken at the foundation

| Issue | Evidence | Impact |
|---|---|---|
| **Two font systems shipped, neither actually used.** Inter (5 weights) is loaded at startup ([app/_layout.tsx:4-11,38-44](PoultryOS/app/_layout.tsx#L4-L11)) but **no StyleSheet in the app ever sets `fontFamily`** (verified: the only `fontFamily` hits are the token exports themselves and one monospace report preview). | grep `fontFamily` across PoultryOS → 4 hits, none applied to UI text | The entire mobile app renders in the platform default (Roboto), the Inter download is wasted startup cost, and the documented IBM Plex Sans substitution never happens |
| The exported `fontFamily = 'IBM Plex Sans, Helvetica Neue, …'` ([tokens.ts:37](PoultryOS/theme/tokens.ts#L37)) is a **CSS fallback stack — invalid in React Native**, which requires a single registered family name. If anyone ever did apply it, native would fail/fallback. | tokens.ts:37-38 | Latent bug + false sense of compliance with DESIGN.md |
| Type scale itself is well-formed: display ladder 48→18, body 18/16/14, caption/eyebrow uppercase variants ([tokens.ts:40-62](PoultryOS/theme/tokens.ts#L40-L62)) and is consistently spread into styles (e.g., `...typography.displaySm` in [dashboard.tsx:382](PoultryOS/app/(tabs)/dashboard.tsx#L382)). | — | Scale usage discipline is good; only the family is broken |

**Recommendation**: pick one — (a) bundle IBM Plex Sans via `expo-font` and set `fontFamily: 'IBMPlexSans_400Regular'`-style names inside each typography token, or (b) decide system-font-on-native is acceptable, delete `@expo-google-fonts/inter`, and update DESIGN.md. Either way, stop loading fonts you don't render.

## 3. Color — verdict: compliant, two watch items

- Brand purple `#7132f5`, neutrals, semantic greens/reds match DESIGN.md exactly (tokens.ts:5-28). Domain overlay (whatsapp/heat/upi) present per CLAUDE.md.
- ⚠️ Contrast: `colors.bodySoft` `#9497a9` on `canvasSoft` `#f7f7fa` ≈ 2.9:1 — below WCAG AA 4.5:1 for the small caption text it's used on (e.g., timestamps, helper text). `colors.body` `#686b82` on white ≈ 5.0:1 — passes but barely for 14px.
- ⚠️ Semantic tones in [KpiTile.tsx](PoultryOS/components/ui/KpiTile.tsx) communicate by color alone (positive/warning/negative) — needs a non-color cue for color-blind users.

## 4. Spacing, radius, elevation — verdict: clean

- Spacing ladder (2/4/8/12/16/20/24/32) used via tokens everywhere sampled; no magic-number paddings observed in audited screens.
- Radius rules honored: buttons 12px (`radius.lg`), cards 16px (`radius.card`), FAB `radius.full` ([DailyLogFab.tsx](PoultryOS/components/ui/DailyLogFab.tsx)); legacy `pillMd/pillLg` correctly remapped to 12 ([tokens.ts:80-90](PoultryOS/theme/tokens.ts#L80-L90)).
- Elevation: `subtle`/`micro` defined per spec; web mirrors with `shadow-subtle` class.

## 5. Component library coverage

31 mobile primitives in [components/ui/](PoultryOS/components/ui/): Button (variants: primary/outlined/subtle per spec), Card, TextInput (label-above pattern ✅), Select, RadioGroup, Toggle, KpiTile, EmptyState, StepIndicator, Timeline, badges via WithdrawalBadge, domain components (WeatherWidget, HeatStressBanner, MarketPriceStrip, UpiQrModal, WhatsAppShareButton, BuyerCard, KhataLedgerRow, PlanCard, UpgradeBanner, OfflineBanner…).

### Gaps & inconsistencies

| # | Finding | Evidence |
|---|---|---|
| D1 | **No Skeleton component** despite CLAUDE.md mandating "skeleton screens (not spinners)"; root layout uses `ActivityIndicator` ([app/_layout.tsx:112](PoultryOS/app/_layout.tsx#L112)), widgets use ad-hoc `loading` props | components/ui has no Skeleton*.tsx |
| D2 | **No shared web component library** — web has only 5 shared components ([web/components/](web/components/)); every page re-implements tables, badges, page headers, and form rows with utility classes. Already visible drift: status badge markup differs between khata, transactions, and billing pages | e.g., inline badge spans in [traceability page:27](web/app/traceability/[token]/page.tsx#L27) vs transactions |
| D3 | **No Modal/Dialog primitive on web** — `UpiQrModal` is bespoke; delete confirmations live in [DeleteButton.tsx](web/components/DeleteButton.tsx) with `window.confirm` (verify) rather than a styled dialog | web/components has no Dialog |
| D4 | Mobile Toast/Snackbar usage is react-native-paper's `Snackbar` — the only react-native-paper import surface left; consider replacing to drop the dependency, or standardize on it deliberately | [dashboard.tsx:4](PoultryOS/app/(tabs)/dashboard.tsx#L4) |
| D5 | Charts: web uses recharts ([PriceTrend.tsx](web/app/(dashboard)/market-prices/PriceTrend.tsx), [Sparkline.tsx](web/components/Sparkline.tsx)); mobile hand-rolls SVG ([market-prices/index.tsx:151-176](PoultryOS/app/market-prices/index.tsx#L151)) while victory-native ships unused. Decide: adopt victory properly or delete it and extract the hand-rolled chart into a shared `LineChart` primitive | package.json vs zero imports |
| D6 | Empty states: `EmptyState` exists and is used on dashboard, but CLAUDE.md promises "illustration + description + CTA" — component is text+CTA only, no illustration slot | [EmptyState.tsx](PoultryOS/components/ui/EmptyState.tsx) |
| D7 | Forms: spec says 36px input height; [TextInput.tsx](PoultryOS/components/ui/TextInput.tsx) should be measured on-device — flag for verification, mobile touch target floor is 44px and the two constraints need reconciling in DESIGN.md |

## 6. Cross-platform parity

| Token group | Mobile ↔ Web parity |
|---|---|
| Colors | ✅ identical values (web tokens.ts mirrors) |
| Spacing/radius | ✅ mapped into tailwind config (`px-lg`, `rounded-card` classes in use) |
| Typography | ⚠️ web inherits Tailwind defaults for font-family (system stack) — consistent with mobile's *de facto* system font, but both diverge from DESIGN.md's stated IBM Plex |
| Components | ⚠️ no shared abstraction (expected for RN vs React, but duplicated logic like [upi.ts](PoultryOS/lib/upi.ts)/[web upi.ts](web/lib/upi.ts) should live in one shared package) |

## 7. Action list

1. Replace the two `WHATSAPP_GREEN` constants with `colors.whatsapp` (minutes).
2. Resolve the font decision (bundle IBM Plex properly or delete Inter + update DESIGN.md) — currently paying cost for zero benefit.
3. Build `Skeleton` (mobile + web) and apply to dashboard, lists, batch detail.
4. Extract a minimal web primitive set: `Badge`, `PageHeader`, `DataTable` (with pagination), `Dialog`, `FormField` — stops the per-page drift now, before screens multiply.
5. Fix `bodySoft` contrast or restrict it to ≥18px text; add non-color KPI cues.
6. Consolidate `lib/upi.ts` into one shared module (single source for VPA regex — it's a payments-correctness surface).
7. Document the chart decision; remove victory-native + skia if hand-rolled SVG stays.
