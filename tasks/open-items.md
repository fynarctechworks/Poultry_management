# PoultryOS — Open Items

_Last refreshed 2026-05-20. Codebase status: MVP v2.0 build-complete (23/23 screen inventory shipped). Phase 5 deliverables done. 17 commits this session, zero pushes._

## Blocked on human / external operations

These cannot be completed from the codebase alone — they need real-world setup or customer activity.

- [ ] **5 beta-farm onboarding** (incl. 2 contract farms). Phase 5 launch gate.
- [ ] **Play Store submission** — needs EAS Build + Google Play Developer console.
- [ ] **Razorpay live-mode KYC** + create `razorpay_plan_id_monthly` / `razorpay_plan_id_yearly` in the dashboard, then UPDATE the seeded `subscription_plans` row.
- [ ] **AiSensy / Meta WhatsApp template approval** (6 templates, 3–7 days), then set `AISENSY_API_KEY` Edge Function secret.
- [ ] **MSG91 KYC** for live SMS OTP.
- [ ] **OpenWeatherMap API key** set as Edge Function secret (free tier signs up instantly; just needs the secret pushed).

## v2.0 polish (small scope, not blocking launch)

- [ ] **Profit calculator** on Batch Detail — what-if scenario (price/kg × current weight × livability) for forward planning.
- [ ] **Vet collaboration flow** — full invite-vet (farm_users role='vet') flow + a dedicated screen the vet sees with `update_vet_note` RPC wired.
- [ ] **PDF certificate generation** for traceability (deferred to web app per CLAUDE.md).

## Phase 6 — explicitly out of MVP scope per CLAUDE.md

Long-term roadmap items. Sequenced by user-value-to-cost ratio.

- [ ] **Vernacular language UI** — Hindi, Telugu, Tamil. Bhashini API for runtime translation.
- [ ] **LLM-powered insights** (Claude API) — currently all rules-based per architecture decision #13.
- [ ] **Integrator B2B aggregate dashboard** (enterprise tier).
- [ ] **iOS app** (after 100 paying farms).
- [ ] **Full offline-first sync** — MVP only offline-queues daily log.
- [ ] **Marketplace** for buying/selling birds or eggs.
- [ ] **Loan & insurance marketplace.**
- [ ] **Accounting software integration** (Tally, Zoho Books).
- [ ] **Regional disease-outbreak network alerts.**
- [ ] **Vet marketplace** / paid consultation booking.

## Now building

- [ ] **Phase 6 — vernacular UI scaffolding** (i18n framework + Hindi/Telugu/Tamil + language picker).
