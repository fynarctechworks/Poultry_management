// Owner trust / transparency reconciliation ("Farm Integrity").
//
// The owner is rarely on-farm daily and the dashboard just echoes what the
// worker typed. This engine cross-checks those entries against physical reality
// and biology so the owner can trust the numbers. Four rule-based checks (no
// LLM, consistent with the architecture):
//   1. Feed reconciliation        — physical feed stock vs system stock
//   2. Feed-to-growth consistency — feed consumed vs weight gain at standard FCR
//   3. Bird-count reconciliation  — physical bird count vs system count
//   4. Entry-behaviour signals    — backfills, repeated values, odd hours, jumps
//
// Framing is deliberately NON-ACCUSATORY: findings are "variances to review"
// with a ₹ value, never verdicts. The UI/copy localises the keys; this stays
// pure (no React, no Supabase, no i18n) and is unit-tested. The Deno weekly
// digest (send-farm-integrity-report) mirrors this logic — keep them in sync.

export type IntegritySeverity = 'ok' | 'review' | 'attention';

export type IntegrityFindingKey =
  | 'feed_variance'
  | 'feed_growth'
  | 'bird_variance'
  | 'entry_backfill'
  | 'entry_repeated'
  | 'entry_odd_hours'
  | 'entry_weight_jump';

export interface IntegrityFinding {
  key: IntegrityFindingKey;
  severity: IntegritySeverity;
  /** Signed ₹ exposure where money is involved (negative = value unaccounted). */
  rupees?: number;
  /** Structured params for the localised message (counts, kg, etc.). */
  params: Record<string, number | string>;
}

const n = (v: number | null | undefined): number => {
  const x = Number(v ?? 0);
  return Number.isFinite(x) ? x : 0;
};
const round = (v: number, dp = 0): number => {
  const f = 10 ** dp;
  return Math.round(v * f) / f;
};

// ── 1. Feed reconciliation ────────────────────────────────────────────────────
export interface FeedReconInput {
  /** System stock on hand (purchases − consumption, maintained by triggers). */
  systemStockKg: number;
  /** Latest physical spot-count, or null if none recorded. */
  physicalStockKg: number | null;
  feedCostPerKg: number;
  /** kg below which a shortfall is worth surfacing (anti-noise). Default 10. */
  toleranceKg?: number;
}

export interface FeedReconResult {
  systemStockKg: number;
  physicalStockKg: number | null;
  varianceKg: number | null; // physical − system (negative = missing)
  varianceRupees: number | null;
  severity: IntegritySeverity;
}

export function reconcileFeed(input: FeedReconInput): FeedReconResult {
  const tol = input.toleranceKg ?? 10;
  if (input.physicalStockKg == null) {
    return {
      systemStockKg: round(n(input.systemStockKg), 2),
      physicalStockKg: null,
      varianceKg: null,
      varianceRupees: null,
      severity: 'ok',
    };
  }
  const varianceKg = n(input.physicalStockKg) - n(input.systemStockKg);
  const varianceRupees = varianceKg * n(input.feedCostPerKg);
  const shortfall = -varianceKg; // positive = less feed than system claims
  const severity: IntegritySeverity =
    shortfall <= tol ? 'ok' : shortfall <= tol * 3 ? 'review' : 'attention';
  return {
    systemStockKg: round(n(input.systemStockKg), 2),
    physicalStockKg: round(n(input.physicalStockKg), 2),
    varianceKg: round(varianceKg, 2),
    varianceRupees: round(varianceRupees, 0),
    severity,
  };
}

// ── 2. Feed-to-growth consistency ──────────────────────────────────────────────
export interface FeedGrowthInput {
  feedConsumedKg: number;
  /** Total live-weight gain over the window (birds × per-bird gain), kg. */
  weightGainKg: number;
  /** Breed-standard FCR for the age window. */
  standardFcr: number;
  feedCostPerKg: number;
  /** Fractional FCR tolerance before flagging. Default 0.15 (15% above standard). */
  tolerance?: number;
}

export interface FeedGrowthResult {
  actualFcr: number | null;
  standardFcr: number;
  excessFeedKg: number; // feed beyond what standard FCR explains
  excessRupees: number;
  severity: IntegritySeverity;
}

export function feedToGrowthConsistency(input: FeedGrowthInput): FeedGrowthResult {
  const tol = input.tolerance ?? 0.15;
  const gain = n(input.weightGainKg);
  const feed = n(input.feedConsumedKg);
  const std = n(input.standardFcr);
  if (gain <= 0 || std <= 0) {
    return { actualFcr: null, standardFcr: round(std, 3), excessFeedKg: 0, excessRupees: 0, severity: 'ok' };
  }
  const actualFcr = feed / gain;
  const expectedFeed = gain * std;
  const excessFeedKg = Math.max(0, feed - expectedFeed);
  const excessRupees = excessFeedKg * n(input.feedCostPerKg);
  let severity: IntegritySeverity = 'ok';
  if (actualFcr > std * (1 + tol * 2)) severity = 'attention';
  else if (actualFcr > std * (1 + tol)) severity = 'review';
  return {
    actualFcr: round(actualFcr, 3),
    standardFcr: round(std, 3),
    excessFeedKg: round(excessFeedKg, 1),
    excessRupees: round(excessRupees, 0),
    severity,
  };
}

// ── 3. Bird-count reconciliation ───────────────────────────────────────────────
export interface BirdCountReconInput {
  opening: number;
  cumulativeDeaths: number;
  soldOrTransferred: number;
  /** System current count (trigger-maintained). */
  systemCount: number;
  physicalCount: number | null;
  /** Per-bird value (cost or market) for the ₹ exposure. */
  birdValue?: number;
  /** Birds below which a gap is noise. Default 5. */
  toleranceBirds?: number;
}

export interface BirdCountReconResult {
  expectedCount: number; // opening − deaths − sold/transferred
  systemCount: number;
  physicalCount: number | null;
  /** physical − system (negative = fewer birds than recorded). */
  varianceBirds: number | null;
  varianceRupees: number | null;
  /** system − expected: a non-zero value means the ledger itself is inconsistent. */
  ledgerDrift: number;
  severity: IntegritySeverity;
}

export function reconcileBirdCount(input: BirdCountReconInput): BirdCountReconResult {
  const tol = input.toleranceBirds ?? 5;
  const expectedCount = n(input.opening) - n(input.cumulativeDeaths) - n(input.soldOrTransferred);
  const ledgerDrift = n(input.systemCount) - expectedCount;
  if (input.physicalCount == null) {
    return {
      expectedCount,
      systemCount: n(input.systemCount),
      physicalCount: null,
      varianceBirds: null,
      varianceRupees: null,
      ledgerDrift,
      severity: Math.abs(ledgerDrift) > tol ? 'review' : 'ok',
    };
  }
  const varianceBirds = n(input.physicalCount) - n(input.systemCount);
  const shortfall = -varianceBirds;
  const varianceRupees = varianceBirds * n(input.birdValue);
  const severity: IntegritySeverity =
    Math.abs(varianceBirds) <= tol ? 'ok' : shortfall > tol * 4 ? 'attention' : 'review';
  return {
    expectedCount,
    systemCount: n(input.systemCount),
    physicalCount: n(input.physicalCount),
    varianceBirds,
    varianceRupees: round(varianceRupees, 0),
    ledgerDrift,
    severity,
  };
}

// ── 4. Entry-behaviour signals ─────────────────────────────────────────────────
export interface EntryBehaviorLog {
  log_date: string; // YYYY-MM-DD
  created_at: string; // ISO timestamp
  feed_consumed_kg: number | null;
  avg_bird_weight_g: number | null;
}

export interface EntryBehaviorResult {
  backfilledCount: number; // logs created > backfillDays after their log_date
  repeatedRun: number; // longest run of identical non-zero feed values
  oddHourCount: number; // logs created outside working hours
  weightJumpCount: number; // biologically implausible weight changes
}

export interface EntryBehaviorOpts {
  backfillDays?: number; // default 2
  workStartHour?: number; // default 4 (IST-ish, local hour of created_at)
  workEndHour?: number; // default 22
  maxDailyGainG?: number; // default 120 g/day implausible for broiler/layer sample
}

export function detectEntryBehavior(
  logs: EntryBehaviorLog[],
  opts: EntryBehaviorOpts = {},
): EntryBehaviorResult {
  const backfillDays = opts.backfillDays ?? 2;
  const startH = opts.workStartHour ?? 4;
  const endH = opts.workEndHour ?? 22;
  const maxGain = opts.maxDailyGainG ?? 120;

  let backfilledCount = 0;
  let oddHourCount = 0;
  const dayMs = 24 * 60 * 60 * 1000;

  for (const l of logs) {
    const created = new Date(l.created_at).getTime();
    const logged = new Date(`${l.log_date}T00:00:00Z`).getTime();
    if (Number.isFinite(created) && Number.isFinite(logged) && created - logged > backfillDays * dayMs) {
      backfilledCount++;
    }
    const h = new Date(l.created_at).getUTCHours();
    if (Number.isFinite(h) && (h < startH || h >= endH)) oddHourCount++;
  }

  // Longest run of identical non-zero feed values across consecutive log_dates.
  const sorted = [...logs].sort((a, b) => (a.log_date < b.log_date ? -1 : 1));
  let repeatedRun = 0;
  let run = 0;
  let prev: number | null = null;
  for (const l of sorted) {
    const v = l.feed_consumed_kg;
    if (v != null && v > 0 && prev != null && v === prev) {
      run += 1;
    } else {
      run = 1;
    }
    if (v != null && v > 0) prev = v;
    else prev = null;
    repeatedRun = Math.max(repeatedRun, run);
  }

  // Implausible weight jumps between consecutive weighings.
  const weighed = sorted.filter((l) => l.avg_bird_weight_g != null && Number(l.avg_bird_weight_g) > 0);
  let weightJumpCount = 0;
  for (let i = 1; i < weighed.length; i++) {
    const a = weighed[i - 1];
    const b = weighed[i];
    const days = Math.max(
      1,
      (new Date(`${b.log_date}T00:00:00Z`).getTime() - new Date(`${a.log_date}T00:00:00Z`).getTime()) /
        dayMs,
    );
    const perDay = (Number(b.avg_bird_weight_g) - Number(a.avg_bird_weight_g)) / days;
    if (perDay > maxGain || perDay < 0) weightJumpCount++;
  }

  return { backfilledCount, repeatedRun, oddHourCount, weightJumpCount };
}

// ── Assembled report ───────────────────────────────────────────────────────────
export interface FarmIntegrityInput {
  feed?: FeedReconInput | null;
  feedGrowth?: FeedGrowthInput | null;
  birdCount?: BirdCountReconInput | null;
  entryLogs?: EntryBehaviorLog[] | null;
  entryOpts?: EntryBehaviorOpts;
}

export interface FarmIntegrityReport {
  findings: IntegrityFinding[];
  /** Worst severity across findings. */
  overall: IntegritySeverity;
  /** Sum of (negative) ₹ exposure across money findings. */
  totalExposureRupees: number;
}

const SEVERITY_RANK: Record<IntegritySeverity, number> = { ok: 0, review: 1, attention: 2 };

export function buildFarmIntegrityReport(input: FarmIntegrityInput): FarmIntegrityReport {
  const findings: IntegrityFinding[] = [];

  if (input.feed) {
    const r = reconcileFeed(input.feed);
    if (r.severity !== 'ok' && r.varianceKg != null) {
      findings.push({
        key: 'feed_variance',
        severity: r.severity,
        rupees: r.varianceRupees ?? 0,
        params: { varianceKg: r.varianceKg, systemKg: r.systemStockKg, physicalKg: r.physicalStockKg ?? 0 },
      });
    }
  }

  if (input.feedGrowth) {
    const r = feedToGrowthConsistency(input.feedGrowth);
    if (r.severity !== 'ok' && r.actualFcr != null) {
      findings.push({
        key: 'feed_growth',
        severity: r.severity,
        rupees: -r.excessRupees,
        params: { actualFcr: r.actualFcr, standardFcr: r.standardFcr, excessKg: r.excessFeedKg },
      });
    }
  }

  if (input.birdCount) {
    const r = reconcileBirdCount(input.birdCount);
    if (r.severity !== 'ok') {
      findings.push({
        key: 'bird_variance',
        severity: r.severity,
        rupees: r.varianceRupees ?? 0,
        params: {
          varianceBirds: r.varianceBirds ?? r.ledgerDrift,
          systemCount: r.systemCount,
          physicalCount: r.physicalCount ?? 0,
          expectedCount: r.expectedCount,
        },
      });
    }
  }

  if (input.entryLogs && input.entryLogs.length) {
    const e = detectEntryBehavior(input.entryLogs, input.entryOpts);
    if (e.backfilledCount >= 2)
      findings.push({ key: 'entry_backfill', severity: 'review', params: { count: e.backfilledCount } });
    if (e.repeatedRun >= 4)
      findings.push({ key: 'entry_repeated', severity: 'review', params: { run: e.repeatedRun } });
    if (e.oddHourCount >= 3)
      findings.push({ key: 'entry_odd_hours', severity: 'review', params: { count: e.oddHourCount } });
    if (e.weightJumpCount >= 1)
      findings.push({ key: 'entry_weight_jump', severity: 'attention', params: { count: e.weightJumpCount } });
  }

  const overall = findings.reduce<IntegritySeverity>(
    (worst, f) => (SEVERITY_RANK[f.severity] > SEVERITY_RANK[worst] ? f.severity : worst),
    'ok',
  );
  const totalExposureRupees = findings.reduce(
    (s, f) => s + (f.rupees != null && f.rupees < 0 ? f.rupees : 0),
    0,
  );

  return { findings, overall, totalExposureRupees: round(totalExposureRupees, 0) };
}
