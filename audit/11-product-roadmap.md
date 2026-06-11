# 11 — Billion-Dollar SaaS Roadmap

_Audit date: 2026-06-11. Builds on gaps G1–G30 ([10-gap-analysis.md](10-gap-analysis.md)) and competitive posture ([09-competitor-analysis.md](09-competitor-analysis.md)). North-star positioning: **"the contract grower's independent source of truth"** + **"the broiler farmer's WhatsApp brain"**._

---

## 🏃 Quick Wins — Week 1

Goal: remove every self-inflicted launch blocker. All engineering, no external dependencies.

1. `git init` + GitHub + CI (tsc ×2, jest, SQL lint) + Sentry (both clients). _(G5)_
2. Fix weather widget dead-end → `router.push('/weather')`. _(G6, minutes)_
3. Traceability anon policy → `get_traceability_by_token()` RPC + pgTAP test. _(G2)_
4. Webhooks fail closed when secrets unset + unsigned-401 smoke test. _(G3)_
5. `amount_paid` column + buyer-balance rewrite + backfill. _(G4)_
6. Unify OWM secret name; add boot-time env assertions in all Edge Functions. _(G8)_
7. Strip dead deps (victory-native, skia, Inter fonts, jspdf-autotable, RHF-mobile if confirmed); measure AAB + cold start on a Redmi-class device. _(G12)_
8. Replace 2× `WHATSAPP_GREEN` with `colors.whatsapp`; consolidate `lib/upi.ts`.

**Exit criteria**: CI green on every push; advisor clean; bundle baseline recorded.

## 📅 Short Term — 30 Days (Launch month)

Goal: launchable free-tier funnel + the daily-habit loop.

| Theme | Items |
|---|---|
| **Auth that converts** | Mobile OTP login/register (MSG91 provider) with email fallback _(G1)_; password reset + OTP re-verify _(G10)_; auth rate limits + per-phone cooldown _(07-M1)_ |
| **Daily habit** | `fetch-market-prices` Edge Fn + cron (NECC broiler/egg rates; manual-curation ops fallback) + staleness UI _(G9)_ — this is the retention engine |
| **Web funnel** | Free `/dashboard` home; login redirect there _(G7)_; `loading.tsx`/`error.tsx` everywhere _(G11)_; sidebar grouped into 4 sections _(G15)_ |
| **Mobile polish** | Role-aware tabs + permission empty-states _(G13)_; Skeleton component on dashboard/lists; More-tab grouping |
| **Launch ops** | EAS production profile + Play internal track; Vercel prod; secrets pushed; 5 beta farms onboarded per [phase-5 checklist](tasks/phase-5-launch-readiness.md); cron dead-man monitoring _(G25)_ |

**Revenue hooks shipped**: working Razorpay subscribe (plan IDs), upgrade prompts at every freemium gate (already coded — verify copy).

## 📈 Medium Term — 90 Days (Post-launch traction)

Goal: paid-tier value depth + vernacular adoption.

1. **Vernacular GA**: audited hi/ta/te coverage across all 23 screens, Telugu/Tamil first-run language prompt, vernacular WhatsApp templates (submit to Meta early — lead time). _(G26)_
2. **Vet workflows (paid)**: invite-vet flow, vet case queue, withdrawal calendar — makes the "Vet access" paid line item real. _(G14)_
3. **Reports v2**: branded PDF (P&L, batch summary, settlement reconciliation) + WhatsApp share — the artifact farmers show banks and integrators. _(G17)_
4. **Khata depth**: pagination, partial-payment UX on top of `amount_paid`, buyer statements (PDF), aging buckets on mobile. _(G16)_
5. **Trust & quality**: tariff-card verification prompt in contract onboarding _(G24)_; feed `feed_item_id` linkage _(G21)_; mobile profit calculator _(G22)_; notifications deep-links _(G27)_; responsive web _(G19)_; WCAG AA pass _(G20)_.
6. **E2E safety net**: 5 Maestro flows on the money/data paths. _(G23)_
7. **Analytics**: PostHog (or similar) funnel instrumentation — activation = first daily log; habit = 3 logs/week; monetization = gate-hit → upgrade.

**Target metrics**: D7 retention > 40% for onboarded farms; ≥25% of active farms hitting a freemium gate monthly; WhatsApp digest open feedback loop running.

## 🚀 Long Term — 6 Months

Goal: expand from record-keeper to advisor; first AI surface.

1. **Rule-based insights v1** (no LLM needed): FCR vs breed benchmark deltas ([lib/breed-benchmarks.ts](PoultryOS/lib/breed-benchmarks.ts) already exists), mortality–temperature correlation (weather_data × daily_logs already joined on the Weather screen), feed-cost-per-kg-gain trends, "your batch is tracking ₹X below plan" digest lines.
2. **AI layer (Claude API, Phase 6 per CLAUDE.md #13)**: WhatsApp Q&A over the farmer's own data ("is meri batch ka FCR theek hai?"), photo-based symptom triage assist (flag, never diagnose), digest narrative generation in the farmer's language.
3. **Automation expansion**: auto-vaccination schedules from breed templates; smart reorder suggestions from consumption velocity; price-triggered sell alerts ("broiler crossed your target ₹/kg").
4. **Transaction monetization pilot**: convenience fee on UPI Collect auto-reconciled payments; measure take-rate tolerance.
5. **iOS** if >100 paying farms (per CLAUDE.md gate).

## 🌐 Scale Phase — 12 Months

1. **Integrator B2B tier** (the 10× ARPU move): field-officer dashboards over anonymized/permissioned `contract_cycles`, grower benchmarking, settlement dispute resolution workflows. The schema is already the moat. _(G29)_
2. **Embedded finance**: lender-ready data exports (verified production + receivables history) → working-capital referral revenue; insurance (mortality/weather parametric) partnerships — heat-stress alert history is underwriting gold. _(G30)_
3. **Marketplace adjacency via partnership** (not build): feed/chick input deals through DeHaat-class partners, affiliate economics.
4. **Enterprise hardening**: SSO for integrator staff, audit exports, data-residency attestations (already ap-south-1), SOC2-lite security narrative built on the existing RLS/audit-log discipline.
5. **Platform scale work**: `whatsapp_messages_log`/`daily_logs` partitioning, digest fan-out via queue, regional shards if needed _(G28, 06-P2)_.

## Revenue model evolution

| Horizon | Engine | Est. ARPU |
|---|---|---|
| Now | Pro ₹299/mo | ₹3.6k/yr |
| 90d | Pro + annual push (₹2,999) | ₹3–3.6k/yr |
| 6mo | + UPI convenience fee | +₹500–2k/yr/active-khata farm |
| 12mo | + Integrator seats | ₹1–5L/yr per integrator region |
| 12mo+ | + Finance referrals | ₹500–1,500 per funded loan |

## Roadmap guardrails

- Every feature must answer one of: *does it make the daily log habit stickier? does it make money flows more trustworthy? does it deepen the contract-grower wedge?* If none — it's scope creep (the Out-of-Scope list in CLAUDE.md is healthy; keep honoring it).
- Keep the no-LLM-in-MVP discipline until retention is proven; rule-based insights are cheaper and more explainable to this audience.
- WhatsApp template lead times (24–48h+, Meta review) gate every messaging feature — submit template changes a sprint ahead, always.
