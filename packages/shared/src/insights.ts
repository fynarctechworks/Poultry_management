// Smart Insights — rule-based, week-over-week operational intelligence.
//
// The decision layer on top of trustworthy data: it compares the most recent
// 7 days of a batch against the prior 7 days, and against the breed standard,
// and surfaces the few things worth acting on — each with a ₹ impact where we
// can estimate one. No LLM, no I/O: pure functions over daily_logs rows so the
// same engine runs on the mobile dashboard, the web dashboard, and (later) the
// server-side WhatsApp digest.
//
// i18n: the engine is platform-agnostic and stays out of the translation layer.
// It emits translation KEYS + params (titleKey / detailKey / detailParams /
// suffixKey); each app renders them with its own i18next instance. That keeps
// the engine pure and lets every locale own its wording.
//
// Design rules:
//   - Compare a batch to ITS OWN previous week first; the breed benchmark is
//     secondary context, not the primary trigger.
//   - Only emit an insight when the change is materially actionable (minimum
//     thresholds) — false alarms erode trust in every alert.
//   - Quantify in rupees whenever feed cost is known.

import { findBenchmark, type BreedBenchmark } from './breed-benchmarks';
import { formatINR } from './format';

// ---------------------------------------------------------------------------
// Inputs
// ---------------------------------------------------------------------------

/** A daily_logs row — the subset the insights engine reads. */
export interface InsightLogRow {
  log_date: string; // YYYY-MM-DD
  birds_dead: number | null;
  feed_consumed_kg: number | null;
  feed_cost_per_kg: number | null;
  eggs_collected: number | null;
  avg_bird_weight_g: number | null;
}

export interface InsightBatchInput {
  batchId: string;
  batchCode: string;
  breedName: string | null;
  poultryType: 'broiler' | 'layer' | 'breeder';
  openingBirdCount: number;
  currentBirdCount: number;
  placementDate: string; // YYYY-MM-DD
  logs: InsightLogRow[];
}

// ---------------------------------------------------------------------------
// Output
// ---------------------------------------------------------------------------

export type InsightSeverity = 'critical' | 'warning' | 'positive' | 'info';
export type InsightMetric = 'fcr' | 'mortality' | 'feed' | 'production' | 'weight';

export interface Insight {
  /** Stable id: `${batchId}:${metric}` — lets the UI de-dupe / key lists. */
  id: string;
  batchId: string;
  batchCode: string;
  metric: InsightMetric;
  severity: InsightSeverity;
  /** i18n key for the short headline. */
  titleKey: string;
  /** i18n key for the one-line explanation. */
  detailKey: string;
  /** Interpolation params for detailKey (numbers pre-rounded to strings). */
  detailParams: Record<string, string | number>;
  /** Optional i18n key appended to the detail (e.g. "— above breed standard"). */
  suffixKey?: string;
  /** Estimated rupee impact over the week, signed (− = costing money). null when unknowable. */
  rupeeImpact: number | null;
  /** Sort weight — higher floats to the top of the feed. */
  score: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const DAY_MS = 24 * 60 * 60 * 1000;

function parseISO(d: string): number {
  return new Date(`${d}T00:00:00Z`).getTime();
}

function num(v: number | null | undefined): number {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
}

interface WindowAgg {
  days: number; // distinct days with a log in the window
  deaths: number;
  feedKg: number;
  feedCost: number; // Σ feed_kg × feed_cost_per_kg (only where cost known)
  feedKgWithCost: number;
  eggs: number;
  firstWeightG: number | null;
  lastWeightG: number | null;
}

function aggregate(rows: InsightLogRow[]): WindowAgg {
  const agg: WindowAgg = {
    days: 0,
    deaths: 0,
    feedKg: 0,
    feedCost: 0,
    feedKgWithCost: 0,
    eggs: 0,
    firstWeightG: null,
    lastWeightG: null,
  };
  const sorted = [...rows].sort((a, b) => (a.log_date < b.log_date ? -1 : 1));
  for (const r of sorted) {
    agg.days += 1;
    agg.deaths += num(r.birds_dead);
    const fk = num(r.feed_consumed_kg);
    agg.feedKg += fk;
    if (r.feed_cost_per_kg != null && fk > 0) {
      agg.feedCost += fk * num(r.feed_cost_per_kg);
      agg.feedKgWithCost += fk;
    }
    agg.eggs += num(r.eggs_collected);
    const w = r.avg_bird_weight_g;
    if (w != null && w > 0) {
      if (agg.firstWeightG === null) agg.firstWeightG = num(w);
      agg.lastWeightG = num(w);
    }
  }
  return agg;
}

/** Average feed cost ₹/kg observed across both windows, for valuing feed gaps. */
function blendedFeedCost(...aggs: WindowAgg[]): number | null {
  let cost = 0;
  let kg = 0;
  for (const a of aggs) {
    cost += a.feedCost;
    kg += a.feedKgWithCost;
  }
  return kg > 0 ? cost / kg : null;
}

// Window FCR = feed consumed in window ÷ live-weight gain in window.
// Returns null when we can't bound the gain (need a start and end weight).
function windowFcr(agg: WindowAgg, birds: number): number | null {
  if (agg.firstWeightG === null || agg.lastWeightG === null || birds <= 0) return null;
  const gainKg = ((agg.lastWeightG - agg.firstWeightG) / 1000) * birds;
  if (gainKg <= 0 || agg.feedKg <= 0) return null;
  return agg.feedKg / gainKg;
}

// ---------------------------------------------------------------------------
// Core: split logs into this-week / prior-week windows anchored on latest log
// ---------------------------------------------------------------------------

export function splitWeekWindows(logs: InsightLogRow[]): {
  recent: InsightLogRow[];
  prior: InsightLogRow[];
  anchor: string | null;
} {
  if (logs.length === 0) return { recent: [], prior: [], anchor: null };
  const anchor = logs.reduce((max, r) => (r.log_date > max ? r.log_date : max), logs[0].log_date);
  const anchorMs = parseISO(anchor);
  const recentStart = anchorMs - 6 * DAY_MS; // inclusive 7-day window
  const priorStart = anchorMs - 13 * DAY_MS;
  const recent: InsightLogRow[] = [];
  const prior: InsightLogRow[] = [];
  for (const r of logs) {
    const t = parseISO(r.log_date);
    if (t >= recentStart && t <= anchorMs) recent.push(r);
    else if (t >= priorStart && t < recentStart) prior.push(r);
  }
  return { recent, prior, anchor };
}

// ---------------------------------------------------------------------------
// Rules
// ---------------------------------------------------------------------------

// Minimum changes worth surfacing (anti-noise floors).
const FCR_DELTA_MIN = 0.08; // FCR points
const MORT_PCT_DELTA_MIN = 0.5; // percentage points of weekly mortality
const FEED_ANOMALY_MIN_PCT = 15; // % feed-up while weight flat
const PRODUCTION_DROP_MIN_PCT = 5; // HDEP percentage points

function buildInsights(b: InsightBatchInput): Insight[] {
  const out: Insight[] = [];
  const { recent, prior } = splitWeekWindows(b.logs);
  if (recent.length === 0) return out;

  const r = aggregate(recent);
  const p = aggregate(prior);
  const hasPrior = prior.length > 0;
  const bench = findBenchmark(b.breedName, b.poultryType);
  const birds = b.currentBirdCount > 0 ? b.currentBirdCount : b.openingBirdCount;
  const feedCostPerKg = blendedFeedCost(r, p);

  // --- FCR drift (broiler/breeder; needs weight gain) -----------------------
  if (b.poultryType !== 'layer') {
    const rFcr = windowFcr(r, birds);
    const pFcr = hasPrior ? windowFcr(p, birds) : null;
    if (rFcr !== null && pFcr !== null) {
      const delta = rFcr - pFcr;
      if (Math.abs(delta) >= FCR_DELTA_MIN) {
        const gainKg = r.feedKg / rFcr;
        const extraFeedKg = delta * gainKg; // signed
        const rupee = feedCostPerKg != null ? -(extraFeedKg * feedCostPerKg) : null;
        const worse = delta > 0;
        out.push({
          id: `${b.batchId}:fcr`,
          batchId: b.batchId,
          batchCode: b.batchCode,
          metric: 'fcr',
          severity: worse ? 'warning' : 'positive',
          titleKey: worse ? 'insights.fcr.up_title' : 'insights.fcr.down_title',
          detailKey: bench ? 'insights.fcr.detail_bench' : 'insights.fcr.detail',
          detailParams: {
            from: pFcr.toFixed(2),
            to: rFcr.toFixed(2),
            ...(bench ? { target: bench.targetFcr.toFixed(2) } : {}),
          },
          rupeeImpact: rupee,
          score: (worse ? 60 : 30) + Math.min(Math.abs(delta) * 100, 30),
        });
      }
    }
  }

  // --- Mortality change -----------------------------------------------------
  if (birds > 0) {
    const rMortPct = (r.deaths / birds) * 100;
    const pMortPct = hasPrior ? (p.deaths / birds) * 100 : null;
    if (pMortPct !== null) {
      const delta = rMortPct - pMortPct;
      if (Math.abs(delta) >= MORT_PCT_DELTA_MIN) {
        const worse = delta > 0;
        const benchWeekly = bench ? (bench.targetMortalityPct / bench.cycleDays) * 7 : null;
        const aboveStandard = benchWeekly != null && rMortPct > benchWeekly;
        out.push({
          id: `${b.batchId}:mortality`,
          batchId: b.batchId,
          batchCode: b.batchCode,
          metric: 'mortality',
          severity: worse ? (aboveStandard ? 'critical' : 'warning') : 'positive',
          titleKey: worse ? 'insights.mortality.up_title' : 'insights.mortality.down_title',
          detailKey: 'insights.mortality.detail',
          detailParams: {
            deaths_recent: r.deaths,
            deaths_prior: p.deaths,
            pct_recent: rMortPct.toFixed(1),
            pct_prior: pMortPct.toFixed(1),
          },
          suffixKey: worse && aboveStandard ? 'insights.mortality.above_suffix' : undefined,
          rupeeImpact: null,
          score: (worse ? (aboveStandard ? 90 : 65) : 25) + Math.min(Math.abs(delta) * 10, 20),
        });
      }
    }
  }

  // --- Feed anomaly: intake up sharply while weight flat (broiler/breeder) ---
  // Classic wastage / theft / disease signature.
  if (b.poultryType !== 'layer' && hasPrior && p.feedKg > 0) {
    const feedUpPct = ((r.feedKg - p.feedKg) / p.feedKg) * 100;
    const weightGainG =
      r.firstWeightG !== null && r.lastWeightG !== null ? r.lastWeightG - r.firstWeightG : null;
    const weightFlat = weightGainG !== null && weightGainG <= 0;
    if (feedUpPct >= FEED_ANOMALY_MIN_PCT && weightFlat) {
      const extraFeedKg = r.feedKg - p.feedKg;
      const rupee = feedCostPerKg != null ? -(extraFeedKg * feedCostPerKg) : null;
      out.push({
        id: `${b.batchId}:feed`,
        batchId: b.batchId,
        batchCode: b.batchCode,
        metric: 'feed',
        severity: 'critical',
        titleKey: 'insights.feed.title',
        detailKey: 'insights.feed.detail',
        detailParams: {
          pct: feedUpPct.toFixed(0),
          from: p.feedKg.toFixed(0),
          to: r.feedKg.toFixed(0),
        },
        rupeeImpact: rupee,
        score: 95,
      });
    }
  }

  // --- Layer production drop (HDEP week-over-week) ---------------------------
  if (b.poultryType === 'layer' && birds > 0) {
    const rHdep = r.days > 0 ? (r.eggs / (birds * r.days)) * 100 : null;
    const pHdep = hasPrior && p.days > 0 ? (p.eggs / (birds * p.days)) * 100 : null;
    if (rHdep !== null && pHdep !== null) {
      const delta = rHdep - pHdep; // negative = production fell
      if (Math.abs(delta) >= PRODUCTION_DROP_MIN_PCT) {
        const dropped = delta < 0;
        const eggsDelta = Math.round((delta / 100) * birds * r.days);
        out.push({
          id: `${b.batchId}:production`,
          batchId: b.batchId,
          batchCode: b.batchCode,
          metric: 'production',
          severity: dropped ? 'warning' : 'positive',
          titleKey: dropped ? 'insights.production.down_title' : 'insights.production.up_title',
          detailKey: bench?.peakHdepPct
            ? 'insights.production.detail_bench'
            : 'insights.production.detail',
          detailParams: {
            from: pHdep.toFixed(0),
            to: rHdep.toFixed(0),
            eggs: `${eggsDelta >= 0 ? '+' : ''}${eggsDelta}`,
            ...(bench?.peakHdepPct ? { peak: bench.peakHdepPct } : {}),
          },
          rupeeImpact: null,
          score: (dropped ? 70 : 25) + Math.min(Math.abs(delta), 25),
        });
      }
    }
  }

  return out;
}

/**
 * Compute the Smart Insights feed across one or more active batches, sorted
 * most-actionable first. Pure — feed it the batches + their recent logs.
 */
export function computeInsights(batches: InsightBatchInput[]): Insight[] {
  const all: Insight[] = [];
  for (const b of batches) all.push(...buildInsights(b));
  return all.sort((a, b) => b.score - a.score);
}

// ---------------------------------------------------------------------------
// Canonical English copy (the fallback / source of truth for insight wording).
//
// The mobile app localises via its i18next `insights.*` keys (which mirror
// this). The web dashboard has no i18n layer, so it renders English directly
// through `formatInsight` below — keeping one English source instead of a
// second hand-rolled copy in the web bundle. Keep this in sync with the mobile
// `insights.*` locale entries.
// ---------------------------------------------------------------------------

const INSIGHT_EN: Record<string, string> = {
  'insights.fcr.up_title': 'FCR drifting up',
  'insights.fcr.down_title': 'FCR improving',
  'insights.fcr.detail': 'FCR moved {{from}} → {{to}} week-over-week.',
  'insights.fcr.detail_bench': 'FCR moved {{from}} → {{to}} week-over-week (target {{target}}).',
  'insights.mortality.up_title': 'Mortality rising',
  'insights.mortality.down_title': 'Mortality easing',
  'insights.mortality.detail':
    '{{deaths_recent}} deaths this week vs {{deaths_prior}} last week ({{pct_recent}}% vs {{pct_prior}}% of flock).',
  'insights.mortality.above_suffix': ' — above breed standard.',
  'insights.feed.title': 'Feed up but weight flat',
  'insights.feed.detail':
    "Feed rose {{pct}}% ({{from}} → {{to}} kg) while bird weight didn't gain — check for wastage, theft, or illness.",
  'insights.production.down_title': 'Egg production dropped',
  'insights.production.up_title': 'Egg production up',
  'insights.production.detail': 'HDEP {{from}}% → {{to}}% — {{eggs}} eggs/week vs last week.',
  'insights.production.detail_bench':
    'HDEP {{from}}% → {{to}}% (peak ~{{peak}}%) — {{eggs}} eggs/week vs last week.',
};

function interpolate(tpl: string, params: Record<string, string | number>): string {
  return tpl.replace(/\{\{(\w+)\}\}/g, (_, k: string) =>
    params[k] != null ? String(params[k]) : '',
  );
}

export interface RenderedInsight {
  title: string;
  detail: string;
  /** e.g. "Costing ~₹3,600/week" / "Saving ~₹3,600/week", or null. */
  impact: string | null;
}

/** Render an insight to English strings (web / non-i18n surfaces). */
export function formatInsight(insight: Insight): RenderedInsight {
  const title = INSIGHT_EN[insight.titleKey] ?? insight.titleKey;
  const detailTpl = INSIGHT_EN[insight.detailKey] ?? insight.detailKey;
  const suffix = insight.suffixKey ? INSIGHT_EN[insight.suffixKey] ?? '' : '';
  const detail = interpolate(detailTpl, insight.detailParams) + suffix;

  let impact: string | null = null;
  if (insight.rupeeImpact != null && Math.abs(insight.rupeeImpact) >= 1) {
    const amount = formatINR(Math.abs(insight.rupeeImpact), { decimals: 0 });
    impact =
      insight.rupeeImpact < 0
        ? `Costing ~${amount}/week`
        : `Saving ~${amount}/week`;
  }
  return { title, detail, impact };
}

export type { BreedBenchmark };
