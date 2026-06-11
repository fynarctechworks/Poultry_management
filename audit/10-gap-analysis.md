# 10 — Product Gap Analysis

_Audit date: 2026-06-11. Consolidates 01–09 into a single prioritized matrix. Priority: P0 launch-blocking · P1 first 30 days · P2 first quarter · P3 scale. Impact: revenue/adoption/trust effect if left unfixed._

## Gap matrix

| # | Feature / Area | Current state (evidence) | Ideal state | Priority | Business impact |
|---|---|---|---|---|---|
| G1 | **Mobile phone OTP auth** | Stub comments only ([auth-service.ts:46-48](PoultryOS/auth/auth-service.ts#L46)); email/password live | OTP-first login + register on mobile (Supabase phone provider + MSG91), email as fallback | **P0** | First-screen drop-off for the core persona; every competitor onboards via OTP. Blocks all adoption math. |
| G2 | **Anon traceability enumeration** | `USING (qr_token IS NOT NULL)` exposes all rows ([initial_schema.sql:1073](supabase/migrations/20260502000000_initial_schema.sql#L1073)) | Token-scoped RPC; anon table access revoked | **P0** | Cross-tenant data leak; one screenshot kills trust with integrators/beta farms |
| G3 | **Webhooks fail open without secrets** | [razorpay-webhook:107](supabase/functions/razorpay-webhook/index.ts#L107), [aisensy-webhook:155](supabase/functions/aisensy-webhook/index.ts#L155) | Fail closed; smoke test asserting 401 unsigned | **P0** | Forged "paid" states = real money disputes |
| G4 | **Partial-payment math wrong** | `amount * 0.5` heuristic ([initial_schema.sql:726](supabase/migrations/20260502000000_initial_schema.sql#L726)) | `amount_paid` column; balance = amount − paid | **P0** | The Khata headline number is wrong → product's core trust claim broken |
| G5 | **No git repo / CI / monitoring** | `Is a git repository: false`; no `.github/`; no Sentry | GitHub + CI (tsc, jest, migration lint) + Sentry both clients | **P0** | Can't ship, can't roll back, can't see beta-farm crashes |
| G6 | Weather widget dead-end | Snackbar "coming" ([dashboard.tsx:280](PoultryOS/app/(tabs)/dashboard.tsx#L280)) though [/weather](PoultryOS/app/weather/index.tsx) exists | `router.push('/weather')` | **P0** (trivial) | Daily-visible broken promise on the home screen |
| G7 | Web free-tier landing = upgrade wall | Redirect to paid-gated `/multi-farm` ([middleware.ts:45](web/lib/supabase/middleware.ts#L45)) | Free `/dashboard` home; multi-farm stays paid | **P0** | Free→paid funnel inverted; web activation ~0 for free users |
| G8 | Secret-name drift OWM | Checklist `OPENWEATHER_API_KEY` vs code `OPENWEATHERMAP_API_KEY` ([fetch-weather-data:286](supabase/functions/fetch-weather-data/index.ts#L286)) | Single name in code+docs; boot-time config assert | **P0** (minutes) | Weather/heat-stress pillar silently dead at launch |
| G9 | **Automated market prices** | Manual RPC only; `fetch-market-prices` missing ([02 §G](02-feature-inventory.md)) | Daily NECC/eNAM ingestion + staleness UI | **P1** | The daily-open habit loop; biggest retention lever in the field |
| G10 | Password reset / account recovery | None on either client | Email reset + OTP re-verify | **P1** | Silent churn; support burden |
| G11 | Web loading/error states | 0 `loading.tsx`/`error.tsx` | Skeletons + error boundaries on all route groups | **P1** | Perceived quality on 4G; white screens read as "broken" |
| G12 | Dead mobile deps (victory, skia, Inter, RHF) | [PoultryOS/package.json](PoultryOS/package.json); zero imports | Removed; bundle measured on Redmi-class device | **P1** | Cold start + AAB size on ₹6k phones (stated perf gate) |
| G13 | Role-aware navigation | Workers see Khata tab → silent empty (RLS) | Hide gated tabs; permission empty-states | **P1** | Worker confusion; "app is buggy" perception |
| G14 | Vet collaboration | RPC + web form only ([open-items.md:19](tasks/open-items.md#L19)) | Invite-vet flow + vet case queue screen | **P1** | Paid-tier feature ("Vet access: Paid") currently unsellable |
| G15 | IA: 19-item sidebar / 14-item More | [Sidebar.tsx:10-30](web/components/Sidebar.tsx#L10), [more.tsx](PoultryOS/app/(tabs)/more.tsx) | 4 groups (Operate/Money/Insights/Setup) | **P1** | Navigation cost on every session |
| G16 | Pagination on web lists | `.limit(100–200)` hard caps ([transactions:14](web/app/(dashboard)/transactions/page.tsx#L14)) | Server pagination/cursor | **P1** | Data silently truncates by month 2–6 |
| G17 | Reports PDF | CSV only ([ReportExports.tsx:69](web/app/(dashboard)/reports/ReportExports.tsx#L69)); jspdf-autotable unused | Branded PDF (bank/integrator-ready) + WhatsApp share | **P1** | Farmers share PDFs, not CSVs; loan/integrator use cases |
| G18 | Mobile team invite | Web-only ([team/InviteForm.tsx](web/app/(dashboard)/team/InviteForm.tsx)) | Invite from mobile Settings | **P2** | Owner is mobile-first; worker activation blocked on desktop detour |
| G19 | Responsive web | Fixed 240px sidebar ([Sidebar.tsx:44](web/components/Sidebar.tsx#L44)) | Drawer <1024px; mobile-usable tables | **P2** | Shared links opened on phones bounce |
| G20 | Accessibility | 6 aria hits web; color-only KPI tones | WCAG AA pass | **P2** | Play Store quality + inclusivity |
| G21 | Feed-deduct name matching | LIKE-prefix ([initial_schema.sql:624](supabase/migrations/20260502000000_initial_schema.sql#L624)) | Explicit `feed_item_id` link | **P2** | Inventory drift erodes the auto-deduct wow-feature |
| G22 | Mobile profit calculator | Web-only ([ProfitCalculator.tsx](web/app/(dashboard)/batches/[id]/ProfitCalculator.tsx)) | Port to batch detail | **P2** | Engagement feature for price-watching farmers |
| G23 | E2E tests | None (no Maestro) | 5 critical flows (auth, log-offline, QR, spike alert, settlement) | **P2** | Regression safety for the money paths |
| G24 | Tariff card verification | Seeds flagged `review_required: true` ([initial_schema.sql:1144](supabase/migrations/20260502000000_initial_schema.sql#L1144)) | Verified cards + in-app "verify your rates" prompt | **P2** | Wrong settlement expectations = the flagship feature backfires |
| G25 | Cron observability | No job monitoring | `cron.job_run_details` alerting / dead-man switch | **P2** | Digest silently dies → perceived product death |
| G26 | Vernacular completeness | hi/ta/te JSONs exist; coverage unverified across 23 screens | Audited translations + Telugu/Tamil first-run prompt | **P2** | The Phase-6 lever already half-built — finish it early |
| G27 | Notifications deep-linking | List rows not linked to batch/buyer | Tap → relevant screen | **P3** | Alert→action loop completion |
| G28 | Retention/archival policy | Alerts/logs grow forever ([08 §6](08-database-audit.md)) | TTL/archive jobs | **P3** | Cost + query hygiene at scale |
| G29 | Integrator B2B dashboard | Out of scope (correctly) | Phase-6 enterprise tier on `contract_cycles` data | **P3** | The 10× revenue expansion |
| G30 | Embedded finance / credit data export | Not started | Lender-ready P&L + receivables export | **P3** | Monetization beyond SaaS fee |

## Reading the matrix

- **P0 list is small and cheap**: G1–G8 are collectively ~1–2 weeks of work; nothing structural. The product is launch-shaped — it's the edges that are sharp.
- **The single biggest product gap is G9 (market prices)**: it's the only daily-habit feature whose data source doesn't exist, and habit is what the freemium funnel feeds on.
- **Trust cluster** (G2, G3, G4, G24): each is individually small, but together they define whether the "single source of truth" positioning survives first contact with real money.
- **External blockers** (not engineering): WABA approval, Razorpay live KYC + plan IDs, MSG91 KYC, OWM key, Play Store listing — all tracked in [tasks/phase-5-launch-readiness.md](tasks/phase-5-launch-readiness.md) and unchanged by this audit.
