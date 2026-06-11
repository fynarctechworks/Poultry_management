**PoultryOS**

Poultry Farm Management Platform

Product Requirements Document \| v1.0 \| April 2026

  ----------------------------------------------------------------------------------------------------------------------------------------
  **Platform**                            **Timeline**   **Market**            **Team**       **Backend**                    **Pricing**
  --------------------------------------- -------------- --------------------- -------------- ------------------------------ -------------
  Mobile (React Native) + Web (Next.js)   3--6 months    Pan-India (English)   2 developers   Supabase (PostgreSQL + Auth)   Freemium

  ----------------------------------------------------------------------------------------------------------------------------------------

  -----------------------------------------------------------------------
  **📊 1. Project Overview**

  -----------------------------------------------------------------------

PoultryOS is a cross-platform farm management application for medium-scale poultry farmers managing 500--5,000 birds across broiler and layer operations. It digitises every daily farm workflow --- from flock placement to sale --- replacing error-prone paper logs and disconnected Excel sheets with a single source of truth accessible on mobile and web.

Core problem: Indian poultry farmers at medium scale have no affordable, purpose-built digital tool. They track feed, mortality, health, and finances manually, leading to undetected losses, delayed disease response, and zero financial visibility. PoultryOS closes that gap.

  -----------------------------------------------------------------------
  **🎯 2. Product Vision**

  -----------------------------------------------------------------------

**Vision:** *\"Every poultry farmer in India should have a farm manager in their pocket --- one that never loses data, never forgets a vaccination, and always knows the profit per batch.\"*

**Strategic pillars**

-   Simplicity first: a farm worker with basic smartphone literacy can log a daily entry in under 60 seconds

-   Data as asset: every entry builds historical data the farmer owns and can export

-   Traceability ready: full batch lineage from placement to sale, compliance-ready for integrators and export buyers

-   Market-aware: real-time egg and broiler price feeds so every decision is profit-informed

  -----------------------------------------------------------------------
  **👤 3. Target User**

  -----------------------------------------------------------------------

**Primary persona: Farm Owner --- Rajesh**

  -------------------------------------------------------------------------------------------------------------------------------------------
  **Attribute**       **Detail**
  ------------------- -----------------------------------------------------------------------------------------------------------------------
  Age / location      35--55 years, Andhra Pradesh / Telangana / Maharashtra

  Farm size           3,000--4,000 birds across 2--4 sheds (broilers + layers)

  Tech literacy       Uses WhatsApp daily, comfortable with basic Android apps

  Current tools       Paper registers, WhatsApp voice notes, Excel on desktop

  Pain points         Doesn't know true cost-per-kg; misses vaccination dates; can't prove batch history to buyers; no cash flow visibility

  Goal                Run a profitable, traceable farm with minimum paperwork
  -------------------------------------------------------------------------------------------------------------------------------------------

**Secondary persona: Farm Worker --- Suresh**

-   Role: day-to-day data entry (mortality, feed, eggs)

-   Access: Worker role --- can log entries, cannot edit financials or settings

-   Device: low-end Android smartphone (₹6,000--12,000)

-   Key need: one-page daily form, minimal navigation, offline tolerance

**Tertiary persona: Vet / Consultant --- Dr. Meera**

-   Read-only access to flock health incidents and mortality logs

-   Can add diagnosis notes and treatment recommendations

-   Does not access financials or batch financials

  -----------------------------------------------------------------------
  **✨ 4. Core Features**

  -----------------------------------------------------------------------

**Feature 1: Authentication & Role Management**

  ----------------------------------------------------------------------------------------
  **Spec**               **Detail**
  ---------------------- -----------------------------------------------------------------
  Auth method            Email + password via Supabase Auth

  Roles                  Owner \| Worker \| Vet (read-only health)

  Owner                  Full CRUD across all modules, billing, user management

  Worker                 Log daily entries; view assigned sheds; no financials

  Vet                    View health incidents + mortality; add diagnosis; no financials

  Free tier              1 owner + 2 workers

  Paid tier              1 owner + unlimited workers + 1 vet

  Session                JWT; mobile: 30-day login; web: 8-hour idle timeout
  ----------------------------------------------------------------------------------------

**Feature 2: Farm & Shed Setup**

  ----------------------------------------------------------------------------------------------------------------
  **Spec**               **Detail**
  ---------------------- -----------------------------------------------------------------------------------------
  Farm profile fields    Farm name, owner name, location (state + district), phone, GSTIN (optional)

  Shed fields            Shed name, capacity (birds), poultry type (Broiler / Layer), status (Active / Inactive)

  Free tier limit        1 farm, up to 3 sheds

  Paid tier limit        Unlimited farms and sheds

  Multi-farm             Owner switches farms from top nav; each farm is fully isolated
  ----------------------------------------------------------------------------------------------------------------

**Feature 3: Flock & Batch Management**

  ----------------------------------------------------------------------------------------------------------------------------------------
  **Spec**                **Detail**
  ----------------------- ----------------------------------------------------------------------------------------------------------------
  Batch creation fields   Batch ID (auto), breed name, placement date, shed assigned, opening bird count, source supplier, cost per bird

  Batch states            Active \| Harvested \| Closed

  Poultry types           Broiler (35--42 day cycle) \| Layer (up to 72-week cycle)

  Batch history           All closed batches stored permanently; exportable

  Closure                 Owner marks batch harvested; enters birds sold, sale weight, sale price; system auto-calculates P&L
  ----------------------------------------------------------------------------------------------------------------------------------------

**Feature 4: Feed Management**

  ----------------------------------------------------------------------------------------------------
  **Spec**               **Detail**
  ---------------------- -----------------------------------------------------------------------------
  Daily entry fields     Date, batch, feed type, quantity consumed (kg), cost per kg

  Auto-calculations      FCR (Feed Conversion Ratio), cumulative feed per bird, cumulative feed cost

  Feed inventory         Track stock per shed; auto-deduct on entry; alert at owner-set threshold

  Feed types             Starter \| Grower \| Finisher \| Layer feed (owner can add custom)

  Low-stock alert        Push notification when stock falls below owner-defined minimum
  ----------------------------------------------------------------------------------------------------

**Feature 5: Mortality & Health Tracking**

  ------------------------------------------------------------------------------------------------------------------------------------
  **Spec**                **Detail**
  ----------------------- ------------------------------------------------------------------------------------------------------------
  Daily mortality entry   Date, shed, birds dead, cause (Disease / Culled / Injury / Heat stress / Unknown)

  Auto-calculations       Cumulative mortality %, closing bird count, livability %

  Health incident log     Symptom, affected count, vet consulted (Y/N), diagnosis, treatment, withdrawal date

  Withdrawal tracker      Medicine name, dose, date given, days; auto-calculates clearance date; blocks sale record before clearance

  Mortality spike alert   Push alert if daily mortality \> 3% of opening count (configurable)

  Vet note                Vet role can append diagnosis + recommendation to any health incident
  ------------------------------------------------------------------------------------------------------------------------------------

**Feature 6: Vaccination & Medication Schedule**

  --------------------------------------------------------------------------------------------------------------
  **Spec**               **Detail**
  ---------------------- ---------------------------------------------------------------------------------------
  Vaccination entry      Vaccine name, batch, date given, dose, route (oral/injection/spray), birds vaccinated

  Schedule builder       Owner sets schedule per batch; system generates reminder timeline

  Reminders              Push notification 2 days before and on due date; overdue alert if missed

  Medication log         Medicine name, disease, dosage, start date, end date, withdrawal period

  Templates              Newcastle Disease, IBD, Marek's, Fowl Pox (owner can customise)
  --------------------------------------------------------------------------------------------------------------

**Feature 7: Production KPI Dashboard**

  -------------------------------------------------------------------------------------------------------------------------
  **Spec**               **Detail**
  ---------------------- --------------------------------------------------------------------------------------------------
  Broiler KPIs           FCR, daily weight gain (g/bird), livability %, cost per kg live weight, projected harvest weight

  Layer KPIs             Hen-day production %, hen-house production %, feed per egg, feed per bird, cumulative egg count

  Refresh                Recalculates on each new daily entry; shows current-day and cumulative

  Benchmarks             KPI shown vs breed standard reference values

  Charts                 7-day trend line for mortality %, production %, and feed consumption per shed
  -------------------------------------------------------------------------------------------------------------------------

**Feature 8: Inventory Management**

  --------------------------------------------------------------------------------------------------------
  **Spec**               **Detail**
  ---------------------- ---------------------------------------------------------------------------------
  Items tracked          Feed (by type), medicines, vaccines, equipment (informational)

  Stock movements        Purchase (add stock), Usage (auto-deducted from daily entry), Manual adjustment

  Purchase fields        Item name, quantity, unit (kg/litres/units), cost per unit, supplier, date

  Low-stock alert        Push notification at owner-defined threshold per item

  Stock report           Current level per item, 7-day consumption rate, estimated days remaining
  --------------------------------------------------------------------------------------------------------

**Feature 9: Financial Management**

  ------------------------------------------------------------------------------------------------------------------
  **Spec**               **Detail**
  ---------------------- -------------------------------------------------------------------------------------------
  Income entry           Sale type (birds/eggs/manure), quantity, price per unit, buyer name, date, payment status

  Expense entry          Category (Feed/Medicine/Labour/Utilities/Chick cost/Other), amount, date, notes

  Auto-calculations      Gross income, total expenses, net P&L, cost per bird, cost per egg, cost per kg

  Payment tracker        Mark income as Paid / Pending / Partial; outstanding receivables with due dates

  Batch P&L              Auto P&L summary at batch closure: all costs vs sale revenue

  Invoice export         PDF invoice (buyer name, items, amount, farm name) from mobile and web
  ------------------------------------------------------------------------------------------------------------------

**Feature 10: Multi-Farm Management**

  ---------------------------------------------------------------------------------------------------------
  **Spec**                 **Detail**
  ------------------------ --------------------------------------------------------------------------------
  Farm switcher            Dropdown in top nav; switches entire app context to selected farm

  Consolidated dashboard   Owner-only: total birds across all farms, aggregate P&L, aggregate mortality %

  Data isolation           Each farm has its own user pool, sheds, batches, and financials

  Tier                     Paid feature only; free = 1 farm
  ---------------------------------------------------------------------------------------------------------

**Feature 11: Reporting & Export**

  --------------------------------------------------------------------------------------------------------------------------------
  **Spec**               **Detail**
  ---------------------- ---------------------------------------------------------------------------------------------------------
  Report types           Daily mortality sheet, Weekly health summary, Batch P&L, Vaccination log, Feed report, Inventory status

  Export formats         PDF (all reports), Excel/CSV (tabular data)

  Filters                Custom date range, batch filter on all reports

  Compliance report      Full batch traceability: placement → health → vaccinations → withdrawal → sale

  Delivery               Download on device; share via WhatsApp/email from mobile
  --------------------------------------------------------------------------------------------------------------------------------

**Feature 12: End-to-End Traceability**

  ----------------------------------------------------------------------------------------------------------------------------------------------------------
  **Spec**               **Detail**
  ---------------------- -----------------------------------------------------------------------------------------------------------------------------------
  Traceability record    Immutable log per batch: supplier → placement → vaccinations → health incidents → medications → withdrawal clearance → sale buyer

  Batch QR code          Each batch generates a QR linking to a read-only web traceability summary page

  Buyer-facing page      QR shows: breed, placement date, vaccines given, health clearance date, harvest date (no financials)

  Certificate PDF        Branded traceability certificate with farm name, batch ID, full lineage; shareable via WhatsApp

  Regulatory readiness   Fields map to FSSAI traceability requirements

  Tier                   Paid feature only
  ----------------------------------------------------------------------------------------------------------------------------------------------------------

**Feature 13: Market Price Integration**

  ------------------------------------------------------------------------------------------------------------------------
  **Spec**               **Detail**
  ---------------------- -------------------------------------------------------------------------------------------------
  Data sourced           Live broiler farm-gate price (per kg) and egg wholesale price (per 100 eggs) by state

  Source                 Agmarknet / NAFED API or scrape; fallback to manual entry if unavailable

  Update frequency       Daily at 8:00 AM IST via scheduled backend job

  Dashboard display      \"Today's market --- Broiler: ₹98/kg \| Egg: ₹5.80/piece (Andhra Pradesh)\" at top of dashboard

  Profit calculator      Market price × estimated harvest weight − total cost to date = projected profit

  Price history          14-day chart per state for optimal harvest timing decisions

  Manual override        Owner enters local buyer price to override market price in calculator

  State selection        Owner selects state in farm profile; dashboard shows that state's price
  ------------------------------------------------------------------------------------------------------------------------

  -----------------------------------------------------------------------
  **📱 5. Screen Inventory**

  -----------------------------------------------------------------------

  ------------------------------------------------------------------------------------------------------------------
  **Screen**                          **Purpose**                                                    **Roles**
  ----------------------------------- -------------------------------------------------------------- ---------------
  Login / Register                    Email+password auth, farm onboarding wizard (4 steps)          All

  Dashboard (Home)                    KPI summary cards, market price strip, alerts, quick-log FAB   Owner, Worker

  Flock list                          All active batches per shed; tap to open batch detail          Owner, Worker

  Batch detail                        Full batch stats, daily log history, vaccination timeline      Owner, Worker

  Daily log entry                     Single-page form: mortality + feed + eggs + weight             Worker, Owner

  Health incident form                Log symptoms, treatment, set withdrawal date                   Owner, Vet

  Vaccination scheduler               Timeline of due and completed vaccinations per batch           Owner, Vet

  Inventory                           Stock levels, purchase entry, low-stock alerts                 Owner

  Financials --- Income               Log sales, view outstanding receivables                        Owner

  Financials --- Expenses             Log expenses by category                                       Owner

  P&L summary                         Batch and overall P&L, cost breakdowns                         Owner

  Reports                             Report selector, date filter, PDF/CSV download                 Owner

  Traceability                        Batch QR, buyer-facing certificate, export                     Owner

  Market prices                       State price dashboard, 14-day trend chart                      Owner

  Farm settings                       Farm profile, shed management, user invite and roles           Owner

  Notifications                       Push alert history and settings                                Owner, Worker

  Consolidated dashboard (web only)   Multi-farm aggregate view                                      Owner
  ------------------------------------------------------------------------------------------------------------------

  -----------------------------------------------------------------------
  **🔄 6. Key User Flows**

  -----------------------------------------------------------------------

**Flow 1: Worker logs a daily entry (most frequent critical path)**

1.  Worker opens app → taps large \"Log Today\" FAB button on dashboard

2.  Date auto-set to today; worker selects shed from dropdown (only assigned sheds visible)

3.  Enters: Birds dead (numeric) \| Cause (dropdown) \| Feed consumed (kg) \| Eggs collected (layers only) \| Notes (optional)

4.  Taps \"Save\" → system updates: cumulative mortality %, closing count, FCR, production %

5.  If mortality \> threshold: push alert fires to owner within 30 seconds

6.  Confirmation screen: \"Day 18 logged. Mortality today: 12 birds (0.4%). All good.\"

**Flow 2: Owner checks profitability with live market prices**

7.  Owner opens dashboard → sees market strip: \"Broiler ₹102/kg \| Egg ₹6.10 \| Updated 8:05 AM\"

8.  Taps active broiler batch → Batch Detail screen

9.  \"Profit calculator\" card shows: est. harvest weight × birds × market price = gross revenue

10. Total cost to date (feed + chick + medicine) subtracted → projected profit displayed in green

11. Owner taps \"Price history\" → 14-day chart confirms prices trending up; decides to wait 3 more days

**Flow 3: Generate traceability certificate for buyer**

12. Owner closes batch after sale → system auto-generates traceability record

13. Opens Traceability screen → selects closed batch → taps \"Generate Certificate\"

14. PDF created: supplier, placement date, all vaccinations, health incidents, withdrawal clearance, harvest date, buyer

15. QR code generated → links to buyer-scannable web page (no financials shown)

16. Owner shares certificate PDF via WhatsApp directly from app

**Flow 4: First-run farm onboarding**

17. Register with email + password

18. Onboarding wizard (4 steps): Farm name + location → Add sheds → Create first batch → Select state for market prices

19. Optionally invite workers by email; worker receives invite, sets password

20. Arrives on dashboard with first active batch and market prices loading

  -----------------------------------------------------------------------
  **📊 7. Success Metrics**

  -----------------------------------------------------------------------

  ---------------------------------------------------------------------------------------------------------------
  **Metric**                  **3-month target**               **6-month target**   **How measured**
  --------------------------- -------------------------------- -------------------- -----------------------------
  Active farms onboarded      50 farms                         200 farms            Farms with ≥1 active batch

  DAU / MAU ratio             \> 40%                           \> 55%               Supabase analytics

  Daily log completion        \> 70% of batches logged daily   \> 80%               Batches with entry each day

  Paid conversion             \> 8% of free farms              \> 15%               Stripe records

  Monthly Recurring Revenue   ₹75,000                          ₹4,00,000            Stripe dashboard

  Traceability certs issued   100                              500                  Database count

  Monthly churn               \< 10%                           \< 7%                Cancelled subscriptions
  ---------------------------------------------------------------------------------------------------------------

  -----------------------------------------------------------------------
  **🚫 8. Out of Scope (MVP)**

  -----------------------------------------------------------------------

-   AI-powered disease detection, anomaly detection, or predictive mortality models

-   IoT sensor integration (temperature, humidity, cameras)

-   Hatchery, feed mill, or processing plant management modules

-   Contract farming or integrator settlement module

-   Vernacular language support (Telugu, Hindi) --- Phase 2

-   Farmer benchmarking / community features

-   Accounting software integration (Tally, Zoho Books)

-   Marketplace for selling birds or eggs

-   iOS app --- Android first; iOS after 100 paying farms

-   Full offline-first sync --- MVP requires internet; offline queue for daily log entry only

  -----------------------------------------------------------------------
  **🚦 9. Development Phases**

  -----------------------------------------------------------------------

  ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------
  **Phase**                    **Duration**   **Deliverables**                                                                  **Gate to proceed**
  ---------------------------- -------------- --------------------------------------------------------------------------------- ----------------------------------------------
  Phase 1: Foundation          Weeks 1--3     Auth + roles, Farm + Shed setup, Batch creation, Daily log entry                  Worker completes daily log in \< 60 sec

  Phase 2: Core ops            Weeks 4--6     Health tracking, Vaccination scheduler, Inventory, Push notifications             All must-have features functional on Android

  Phase 3: Financials + KPIs   Weeks 7--9     Income + expense entry, Batch P&L, KPI dashboard, 7-day charts                    Owner sees real-time batch profit

  Phase 4: Standout features   Weeks 10--12   Market price integration, End-to-end traceability, QR + PDF certificate           Cert shareable via WhatsApp

  Phase 5: Web + billing       Weeks 13--16   Next.js web dashboard, multi-farm view, reports/export, Stripe freemium billing   Public launch on Product Hunt

  Phase 6: Growth              Weeks 17+      iOS, Telugu language, AI anomaly detection, IoT hooks                             100 paying farms milestone
  ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------

**Freemium gates:** Free tier = Phase 1--3 features with limits (1 farm, 3 sheds, 2 workers). Phase 4--5 features (traceability QR, multi-farm, unlimited users, full exports) require paid subscription.

  -----------------------------------------------------------------------
  **🔐 10. Privacy & Safety**

  -----------------------------------------------------------------------

  ------------------------------------------------------------------------------------------------------------------
  **Area**                  **Requirement**
  ------------------------- ----------------------------------------------------------------------------------------
  Data storage              Supabase PostgreSQL on AWS ap-south-1 (Mumbai) for Indian data residency

  Authentication            Supabase Auth with bcrypt hashing; JWT with 30-day mobile / 8-hour web expiry

  Row-level security        Supabase RLS: workers see only assigned farm sheds; vets have read-only health records

  Financial data            Financials visible to Owner role only; hidden from Worker and Vet at DB level

  Buyer traceability page   Public QR page shows no financial data --- health and certification info only

  Market price data         Only public APMC/Agmarknet data scraped; no user data sent to third parties

  Export security           PDF/CSV served as signed URLs expiring after 1 hour

  Data deletion             Account deletion removes all farm data within 30 days; DPDP Act compliant

  Backups                   Supabase daily automated backups; point-in-time recovery on paid plan
  ------------------------------------------------------------------------------------------------------------------

  -----------------------------------------------------------------------
  **✅ 11. Definition of Done**

  -----------------------------------------------------------------------

**A feature is done when:**

-   All specified fields, calculations, and triggers are implemented and tested

-   Role-based access control enforced at database level (RLS) and UI level

-   Works on Android without crash on: Samsung Galaxy A-series, Redmi Note series

-   Push notifications fire within 60 seconds of the triggering event

-   PDF exports render correctly on mobile and desktop

-   Loads in \< 2 seconds on 4G (LCP \< 2s)

-   No data loss on connectivity drop during daily log entry (retry queue implemented)

-   Tested with: 10 sheds, 5 active batches, 90 days of daily entries per batch

**MVP is launch-ready when:**

-   All Phase 1--4 features pass definition of done

-   Freemium billing (Stripe) tested end-to-end: upgrade, downgrade, cancel

-   5 beta farms have used the app for ≥14 consecutive days with no P0 bugs

-   Privacy policy and terms of service live in-app

-   App listed on Google Play Store (production track)

  -----------------------------------------------------------------------
  **🎨 12. Design System**

  -----------------------------------------------------------------------

**Colour palette**

  -----------------------------------------------------------------------------------------
  **Token**          **Hex**      **Usage**
  ------------------ ------------ ---------------------------------------------------------
  Brand Blue         #1A56DB      Primary CTA buttons, active nav, links, section headers

  Brand Blue Light   #EBF5FF      Info banners, table fills, highlight backgrounds

  Success Green      #057A55      Positive metrics, profit positive, success states

  Warning Amber      #92400E      Low stock, overdue vaccinations

  Danger Red         #9B1C1C      Mortality spike alerts, withdrawal violations, errors

  Surface Gray       #F9FAFB      Page background, alternating table rows

  Border Gray        #E5E7EB      Card borders, dividers, input borders

  Text Primary       #111827      All body text and headings

  Text Secondary     #6B7280      Subtitles, captions, placeholders
  -----------------------------------------------------------------------------------------

**Typography**

  -------------------------------------------------------------------------
  **Element**        **Font**     **Size**     **Weight**
  ------------------ ------------ ------------ ----------------------------
  Screen title       Inter        20px         600

  Section heading    Inter        16px         600

  Body text          Inter        14px         400

  Caption / label    Inter        12px         400

  KPI number         Inter        32--48px     700

  Button text        Inter        14px         500
  -------------------------------------------------------------------------

**Component rules**

-   Theme: Light only (v1). Clean white surfaces, #F9FAFB page background, #1A56DB as the single accent.

-   Cards: white background, 1px #E5E7EB border, 12px border-radius, 16px padding.

-   Primary button: solid #1A56DB fill, white text, 8px radius, 44px minimum touch target.

-   Forms: 36px input height, #E5E7EB border, #1A56DB focus ring, label above field (never placeholder-only).

-   Daily log FAB: 56px circular button, #1A56DB fill, fixed bottom-right, always visible on dashboard.

-   Charts: Recharts (web) / Victory Native (mobile). Brand Blue as primary line colour.

-   Alert strip: horizontal scroll row at dashboard top. Red = health/mortality. Amber = reminders. Blue = info.

-   Empty states: illustration + 1-line description + primary CTA. No blank white screens.

-   Loading states: skeleton screens (not spinners) for dashboard and list views.

**Mobile UX rules**

-   Minimum touch target: 44 × 44px for all interactive elements

-   Daily log entry must complete in 3 taps or fewer after opening the form

-   Bottom navigation: Dashboard \| Flocks \| Log \| Reports \| Settings (5 tabs maximum)

-   Offline banner: yellow strip "Working offline --- data will sync when connected"

-   All list screens must support pull-to-refresh

*PoultryOS PRD v1.0 --- April 2026 --- Confidential*

Review and update before each phase kickoff.
