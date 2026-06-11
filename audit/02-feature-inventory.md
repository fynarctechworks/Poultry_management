# 02 — Feature Inventory

_Audit date: 2026-06-11. Status legend: ✅ Exists · 🟡 Partially complete · 🔴 Broken/contradicts spec · ⬜ Missing · ♻️ Duplicate · 🧾 Technical debt._

## A. Authentication & Identity

| Feature | Mobile | Web | Status | Evidence |
|---|---|---|---|---|
| Email/password login + register | ✅ | ✅ | Exists | [PoultryOS/auth/auth-service.ts:5-9](PoultryOS/auth/auth-service.ts#L5-L9), [web/app/(auth)/login/page.tsx:41](web/app/(auth)/login/page.tsx#L41) |
| **Phone OTP login (documented PRIMARY auth)** | ⬜ | ✅ | **Missing on mobile** | OTP functions are commented-out stubs: [auth-service.ts:46-48](PoultryOS/auth/auth-service.ts#L46-L48) ("Week 2 swap"); web has `signInWithOtp`/`verifyOtp` ([login/page.tsx:51,61](web/app/(auth)/login/page.tsx#L51)). `react-native-otp-entry` is installed but the primary persona (farmer on Android) cannot log in with phone. **Highest-priority feature gap in the product.** |
| Session persistence | ✅ | ✅ | Exists | SecureStore-backed ([lib/supabase.ts:5-15](PoultryOS/lib/supabase.ts#L5-L15)); SSR cookies ([web/lib/supabase/middleware.ts](web/lib/supabase/middleware.ts)) |
| Role model (owner/worker/vet) | ✅ | ✅ | Exists | `profiles.role`, `farm_users.role` + RLS (initial_schema.sql:920–1125) |
| Vet collaboration flow | 🟡 | 🟡 | Partial | `update_vet_note` RPC exists ([20260519000004](supabase/migrations/20260519000004_vet_note_rpc.sql)) and web has [VetNoteForm.tsx](web/app/(dashboard)/health/[id]/VetNoteForm.tsx), but there is no invite-vet flow or vet-facing screen — confirmed open in [tasks/open-items.md:19](tasks/open-items.md#L19) |
| Password reset / account recovery | ⬜ | ⬜ | Missing | no `resetPasswordForEmail` anywhere — a locked-out farmer has no recovery path |

## B. Onboarding & Farm Setup

| Feature | Status | Evidence |
|---|---|---|
| 5-step onboarding wizard (profile → farm → integrator → location → WhatsApp/UPI) | ✅ both clients | [PoultryOS/app/(onboarding)/](PoultryOS/app/(onboarding)/) 5 steps; [web/app/onboarding/OnboardingWizard.tsx](web/app/onboarding/OnboardingWizard.tsx) |
| Shed + batch setup | ✅ | [PoultryOS/app/setup/sheds.tsx](PoultryOS/app/setup/sheds.tsx), [batches.tsx](PoultryOS/app/setup/batches.tsx); web `sheds/new`, `batches/new` |
| Farm settings / edit | ✅ | [PoultryOS/app/settings/index.tsx](PoultryOS/app/settings/index.tsx); [web farms/[id]/edit](web/app/(dashboard)/farms/[id]/edit/page.tsx) |
| Team / worker invite | 🟡 web only | [web/app/(dashboard)/team/InviteForm.tsx](web/app/(dashboard)/team/InviteForm.tsx); no mobile team screen |

## C. Daily Operations (core loop)

| Feature | Status | Evidence |
|---|---|---|
| Daily log entry (mortality/feed/eggs/weight) | ✅ both | [DailyLogForm.tsx](PoultryOS/components/ui/DailyLogForm.tsx) (mobile), [web daily-log/new](web/app/(dashboard)/daily-log/new/DailyLogForm.tsx) |
| **Offline queue for daily logs** | ✅ mobile | [lib/offline-queue.ts](PoultryOS/lib/offline-queue.ts) — AsyncStorage queue, upsert on `batch_id,log_date`, max 5 attempts; tested ([tests/components/offline-queue.test.ts](tests/components/offline-queue.test.ts)) |
| Bird-count auto-update trigger | ✅ | `update_batch_bird_count()` (initial_schema.sql:526) + edit-sync ([20260522000000](supabase/migrations/20260522000000_daily_log_edit_bird_count_sync.sql)) |
| Mortality spike alert (push + WhatsApp) | ✅ | `check_mortality_spike()` (initial_schema.sql:546) → pg_net → Edge Functions; pgTAP test [mortality_spike_trigger.test.sql](tests/db/mortality_spike_trigger.test.sql) |
| Feed auto-deduct from inventory | 🟡 | `deduct_feed_inventory()` (initial_schema.sql:608) — matches item by `item_name LIKE feed_type%`; **name-prefix matching is fragile** (a farmer naming the item "Broiler starter" instead of "Starter…" silently skips deduction) 🧾 |
| Health incidents + withdrawal tracker | ✅ | generated `withdrawal_clearance_date` (initial_schema.sql:217-224); [WithdrawalBadge.tsx](PoultryOS/components/ui/WithdrawalBadge.tsx) |
| Vaccination scheduler + reminders | ✅ | screens both clients; cron [20260519000003](supabase/migrations/20260519000003_schedule_vaccination_reminders.sql); Edge Fn `send-vaccination-reminders` |
| Inventory + purchases + low-stock alerts | ✅ | screens both clients; stock trigger [20260521000001](supabase/migrations/20260521000001_inventory_movement_stock_trigger.sql); cron [20260519000006](supabase/migrations/20260519000006_schedule_low_stock_alerts.sql) |

## D. Financials & UPI Khata

| Feature | Status | Evidence |
|---|---|---|
| Income/expense transactions + mark-paid | ✅ both | [transactions/](web/app/(dashboard)/transactions/) + mobile equivalents |
| Buyer profiles + Khata ledger | ✅ both | [buyers/](PoultryOS/app/buyers/), [web khata/](web/app/(dashboard)/khata/) incl. aging view |
| Buyer balance auto-recompute | 🟡 | `update_buyer_balance()` — **`partial` payments counted as exactly 50% of amount** (initial_schema.sql:726), an arbitrary heuristic; there is no `amount_paid` column to compute real outstanding 🧾 |
| Client-side UPI QR (BHIM URI) | ✅ both | [PoultryOS/lib/upi.ts](PoultryOS/lib/upi.ts) ♻️ duplicated verbatim in [web/lib/upi.ts](web/lib/upi.ts); [UpiQrModal.tsx](PoultryOS/components/ui/UpiQrModal.tsx) |
| Razorpay UPI Collect auto-confirm | ✅ | [create-upi-collect-link](supabase/functions/create-upi-collect-link/index.ts) (RLS-scoped) + `payment_link.paid` handling in [razorpay-webhook](supabase/functions/razorpay-webhook/index.ts#L133) |
| Payment reminder cron (day 7/15/30) | ✅ | `check_payment_overdue()` + fix [20260504000000](supabase/migrations/20260504000000_fix_payment_overdue_filter.sql); cron [20260519000008](supabase/migrations/20260519000008_schedule_payment_reminders.sql) |
| Batch P&L + closure flow | ✅ | [lib/batch-pnl.ts](PoultryOS/lib/batch-pnl.ts) (tested), [CloseBatchModal.tsx](PoultryOS/components/ui/CloseBatchModal.tsx), [20260520000000_batch_closure_flow.sql](supabase/migrations/20260520000000_batch_closure_flow.sql) |
| Profit calculator (what-if) | 🟡 | web has [ProfitCalculator.tsx](web/app/(dashboard)/batches/[id]/ProfitCalculator.tsx); mobile batch detail lacks it (open item [open-items.md:18](tasks/open-items.md#L18)) |

## E. WhatsApp Integration

| Feature | Status | Evidence |
|---|---|---|
| send-whatsapp-message core (template allowlist, opt-out, freemium 5/mo, audit log) | ✅ | [send-whatsapp-message/index.ts](supabase/functions/send-whatsapp-message/index.ts) — high quality: always-log design, per-category prefs |
| Daily digest cron (8 PM IST) | ✅ | [send-daily-digest](supabase/functions/send-daily-digest/index.ts) + [20260519000007](supabase/migrations/20260519000007_schedule_daily_digest.sql) |
| AiSensy status webhook + STOP/RESUME | ✅ | [aisensy-webhook/index.ts](supabase/functions/aisensy-webhook/index.ts) — HMAC verified when secret set |
| WhatsApp settings (per-category prefs) | ✅ both | [whatsapp-settings/](PoultryOS/app/whatsapp-settings/), [20260520000006_whatsapp_preferences.sql](supabase/migrations/20260520000006_whatsapp_preferences.sql) |
| Share buttons (reports/certs/settlements) | ✅ | [WhatsAppShareButton.tsx](PoultryOS/components/ui/WhatsAppShareButton.tsx), [ShareTraceability.tsx](web/app/(dashboard)/traceability/ShareTraceability.tsx) |
| Live delivery | 🔴 blocked externally | `AISENSY_API_KEY` unset → every send logs a `failed` row (by design); WABA approval pending ([phase-5-launch-readiness.md §1.1](tasks/phase-5-launch-readiness.md)) |

## F. Weather & Heat Stress

| Feature | Status | Evidence |
|---|---|---|
| fetch-weather-data cron + upsert + alert trigger | ✅ | [fetch-weather-data/index.ts](supabase/functions/fetch-weather-data/index.ts); UNIQUE(farm_id) added in [20260519000002](supabase/migrations/20260519000002_schedule_weather_cron.sql) |
| Heat-stress alert (push + WhatsApp + banner) | ✅ | [send-heat-stress-alert](supabase/functions/send-heat-stress-alert/index.ts); [HeatStressBanner.tsx](PoultryOS/components/ui/HeatStressBanner.tsx) with acknowledge ([dashboard.tsx:192-204](PoultryOS/app/(tabs)/dashboard.tsx#L192-L204)) |
| Dashboard weather widget | 🔴 dead-end | widget exists but `onPress` shows a "coming soon" snackbar ([dashboard.tsx:280](PoultryOS/app/(tabs)/dashboard.tsx#L280)) **even though the full Weather screen exists** at [app/weather/index.tsx](PoultryOS/app/weather/index.tsx) — one-line fix |
| Weather detail screen (forecast, mitigation, mortality–temp) | ✅ both | [PoultryOS/app/weather/](PoultryOS/app/weather/), [web weather/page.tsx](web/app/(dashboard)/weather/page.tsx) |
| API plan mismatch | 🧾 | function calls One Call **3.0** ([index.ts:114](supabase/functions/fetch-weather-data/index.ts#L114)) which requires a card-on-file subscription, while docs assume plain free tier; also secret name drift (`OPENWEATHER_API_KEY` in checklist vs `OPENWEATHERMAP_API_KEY` in code) |

## G. Market Prices

| Feature | Status | Evidence |
|---|---|---|
| Price dashboard + 14-day trend chart | ✅ both | [market-prices/index.tsx](PoultryOS/app/market-prices/index.tsx) (hand-rolled SVG chart), [web PriceTrend.tsx](web/app/(dashboard)/market-prices/PriceTrend.tsx) |
| Manual price entry | ✅ | `upsert_market_price` RPC + [web market-prices/new](web/app/(dashboard)/market-prices/new/PriceEntryForm.tsx) |
| **Automated price fetch (Agmarknet/NECC)** | ⬜ | CLAUDE.md lists `fetch-market-prices` Edge Fn + daily cron — **does not exist**. The `source` enum includes `agmarknet`/`nafed` but nothing ever writes them. Without daily prices, the dashboard price strip will be perpetually stale — this was a headline "standout feature" |

## H. Traceability

| Feature | Status | Evidence |
|---|---|---|
| Record creation + lock on close | ✅ | `create_traceability_record` RPC ([20260520000001](supabase/migrations/20260520000001_traceability_rpc.sql)), lock trigger |
| QR + public consumer page | ✅ | [web/app/traceability/[token]/page.tsx](web/app/traceability/[token]/page.tsx) (anon route) |
| Certificate PDF | 🟡 web only, client-side | [DownloadCertificate.tsx](web/app/traceability/[token]/DownloadCertificate.tsx) jsPDF; no server `generate-traceability-pdf`, no stored `certificate_pdf_url` writer |
| Anon RLS scope | 🔴 security | `traceability_anon_select USING (qr_token IS NOT NULL)` (initial_schema.sql:1073-1074) lets anon **enumerate the entire table** — see 07-security-audit |

## I. Contract Farming

| Feature | Status | Evidence |
|---|---|---|
| Seeded integrators (Suguna/Venkateshwara/Skylark/IB Group) | ✅ | initial_schema.sql:1133-1189 — values flagged `review_required: true` (still unverified 🧾) |
| Custom integrator creation | ✅ | [20260519000000_custom_integrator_rpc.sql](supabase/migrations/20260519000000_custom_integrator_rpc.sql) + [web integrators/new](web/app/(dashboard)/integrators/new/IntegratorForm.tsx) |
| Contract cycle tracking + settlement calc | ✅ | [20260520000003_contract_farming_seed_and_rpc.sql](supabase/migrations/20260520000003_contract_farming_seed_and_rpc.sql) (`calculate_contract_settlement` as DB RPC — CLAUDE.md said Edge Function; acceptable drift); screens both clients |
| Settlement history + reconciliation + WhatsApp share | ✅ | [web contract/settlements](web/app/(dashboard)/contract/settlements/page.tsx), [lib/contract-report.ts](PoultryOS/lib/contract-report.ts) (tested) |
| Immutability after settle | ✅ | `lock_contract_cycle_on_close()` trigger (initial_schema.sql:807-828) |

## J. Reports, Billing, Multi-farm, Notifications

| Feature | Status | Evidence |
|---|---|---|
| Reports + CSV export | ✅ | [web ReportExports.tsx](web/app/(dashboard)/reports/ReportExports.tsx); mobile [lib/reports.ts](PoultryOS/lib/reports.ts) |
| Reports **PDF** export | ⬜ | CSV only; `jspdf-autotable` installed but unused; CLAUDE.md screen-inventory promises "PDF/CSV download" |
| Razorpay subscriptions (plan toggle, grace window) | ✅ | [create-razorpay-subscription](supabase/functions/create-razorpay-subscription/index.ts), `is_paid()` 7-day grace, [billing screens](web/app/(dashboard)/billing/page.tsx) — blocked only on live plan IDs |
| Freemium enforcement (client + server) | ✅ | [lib/freemium.ts](PoultryOS/lib/freemium.ts) (tested) + `is_paid()` RPC + WhatsApp 5/mo server gate + revoked anon EXECUTE ([20260522000004](supabase/migrations/20260522000004_revoke_anon_execute_on_paid_rpcs.sql)) |
| Multi-farm consolidated dashboard | ✅ web | [multi-farm/page.tsx](web/app/(dashboard)/multi-farm/page.tsx) + `multi_farm_summary` RPC ([20260520000005](supabase/migrations/20260520000005_multi_farm_summary_rpc.sql)); mobile has a stub route to it |
| Push notifications | ✅ | [hooks/usePushToken.ts](PoultryOS/hooks/usePushToken.ts), [send-push-notification](supabase/functions/send-push-notification/index.ts) |
| Notification history screen | ✅ both | [notifications/](PoultryOS/app/notifications/) (reads whatsapp_messages_log + weather_alerts) |
| Supabase Realtime alerts | ⬜ | listed in CLAUDE.md tech stack; zero `.channel(` usage — superseded by push, update docs |

## K. Summary counts

- **Exists & solid**: ~70% of the v2.0 surface (all 23 inventory screens have routes; 21 tables; 12 Edge Functions; cron wiring complete).
- **Partial**: vet flow, feed auto-deduct matching, partial-payment math, profit calculator (mobile), traceability PDF, team management (mobile).
- **Broken / contradicts spec**: dashboard weather dead-end; anon traceability enumeration; OWM secret-name drift.
- **Missing**: **mobile phone OTP (primary auth)**, automated market prices, report PDFs, password reset, E2E tests, CI, monitoring.
- **Duplicates**: `lib/upi.ts` ×2 (verbatim); WHATSAPP_GREEN constant ×2 vs `colors.whatsapp`; UpiQrModal logic ×2 (platform-justified but unshared validation).
