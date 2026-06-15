// Broiler sell-timing calculator.
//
// The highest-leverage single broiler decision: sell today, or grow another
// day? Every extra day adds feed cost but also adds saleable weight (worth
// today's price). When the marginal feed cost of a day exceeds the marginal
// revenue it buys, you're feeding at a loss — sell. Pure arithmetic, no I/O.

export interface SellTimingInput {
  birds: number;
  currentWeightKg: number;
  /** Recent average daily weight gain per bird (kg/day). */
  adgKgPerDay: number;
  /** Recent average feed per bird per day (kg/day). */
  feedPerBirdPerDayKg: number;
  feedCostPerKg: number;
  pricePerKg: number;
  /** Breed-standard target weight (kg) — optional, drives days-to-target. */
  targetWeightKg?: number | null;
}

export type SellRecommendation = 'sell_now' | 'keep_growing' | 'unknown';

export interface SellTimingResult {
  /** Extra flock revenue from one more day (₹). */
  marginalRevenuePerDay: number;
  /** Extra flock feed cost from one more day (₹). */
  marginalFeedCostPerDay: number;
  /** marginalRevenue − marginalFeedCost (₹/day, signed). */
  netMarginPerDay: number;
  recommendation: SellRecommendation;
  /** Days to reach target weight at the recent ADG, or null. */
  daysToTarget: number | null;
  /** Flock value at today's price (birds × weight × price). */
  currentValue: number;
}

export interface SellTimingLogRow {
  log_date: string; // YYYY-MM-DD
  feed_consumed_kg: number | null;
  feed_cost_per_kg: number | null;
  avg_bird_weight_g: number | null;
}

export interface DeriveSellTimingOpts {
  birds: number;
  pricePerKg: number;
  targetWeightKg?: number | null;
  /** Trailing window (logged days) for the feed-per-bird estimate. Default 7. */
  feedWindowDays?: number;
}

/**
 * Derive a SellTimingInput from a batch's daily logs:
 *   - current weight + ADG from the two latest weight observations,
 *   - feed-per-bird-per-day from the last N logged days,
 *   - feed cost from the most recent log that recorded one.
 * Keeps the mobile + web batch screens thin and consistent.
 */
export function deriveSellTimingInput(
  logs: SellTimingLogRow[],
  { birds, pricePerKg, targetWeightKg = null, feedWindowDays = 7 }: DeriveSellTimingOpts,
): SellTimingInput {
  const weighed = logs
    .filter((l) => l.avg_bird_weight_g != null && Number(l.avg_bird_weight_g) > 0)
    .sort((a, b) => (a.log_date < b.log_date ? -1 : 1));

  let currentWeightKg = 0;
  let adgKgPerDay = 0;
  if (weighed.length >= 1) {
    currentWeightKg = Number(weighed[weighed.length - 1].avg_bird_weight_g) / 1000;
  }
  if (weighed.length >= 2) {
    const last = weighed[weighed.length - 1];
    const prev = weighed[weighed.length - 2];
    const dayGap = Math.max(
      1,
      (new Date(`${last.log_date}T00:00:00Z`).getTime() -
        new Date(`${prev.log_date}T00:00:00Z`).getTime()) /
        (24 * 60 * 60 * 1000),
    );
    adgKgPerDay =
      (Number(last.avg_bird_weight_g) - Number(prev.avg_bird_weight_g)) / 1000 / dayGap;
  }

  const byDateDesc = [...logs].sort((a, b) => (a.log_date < b.log_date ? 1 : -1));
  const window = byDateDesc.slice(0, feedWindowDays);
  const feedSum = window.reduce((s, l) => s + Number(l.feed_consumed_kg ?? 0), 0);
  const feedPerBirdPerDayKg =
    birds > 0 && window.length > 0 ? feedSum / window.length / birds : 0;

  const withCost = byDateDesc.find(
    (l) => l.feed_cost_per_kg != null && Number(l.feed_cost_per_kg) > 0,
  );
  const feedCostPerKg = withCost ? Number(withCost.feed_cost_per_kg) : 0;

  return {
    birds,
    currentWeightKg,
    adgKgPerDay,
    feedPerBirdPerDayKg,
    feedCostPerKg,
    pricePerKg,
    targetWeightKg,
  };
}

/**
 * Compute the sell-vs-grow trade-off for a broiler batch.
 *   net > 0  → keep growing (each day still earns more than it costs)
 *   net ≤ 0  → sell now (feeding past economic weight)
 * Returns 'unknown' when an essential price/cost/feed input is missing.
 */
export function computeSellTiming(input: SellTimingInput): SellTimingResult {
  const {
    birds,
    currentWeightKg,
    adgKgPerDay,
    feedPerBirdPerDayKg,
    feedCostPerKg,
    pricePerKg,
    targetWeightKg,
  } = input;

  const currentValue = Math.max(0, birds) * Math.max(0, currentWeightKg) * Math.max(0, pricePerKg);

  const essentialMissing =
    birds <= 0 || pricePerKg <= 0 || feedCostPerKg <= 0 || feedPerBirdPerDayKg <= 0;

  const marginalRevenuePerDay = Math.max(0, adgKgPerDay) * birds * pricePerKg;
  const marginalFeedCostPerDay = feedPerBirdPerDayKg * birds * feedCostPerKg;
  const netMarginPerDay = marginalRevenuePerDay - marginalFeedCostPerDay;

  let recommendation: SellRecommendation;
  if (essentialMissing || adgKgPerDay == null || Number.isNaN(adgKgPerDay)) {
    recommendation = 'unknown';
  } else {
    recommendation = netMarginPerDay > 0 ? 'keep_growing' : 'sell_now';
  }

  const daysToTarget =
    targetWeightKg != null && adgKgPerDay > 0 && targetWeightKg > currentWeightKg
      ? (targetWeightKg - currentWeightKg) / adgKgPerDay
      : targetWeightKg != null && currentWeightKg >= targetWeightKg
        ? 0
        : null;

  return {
    marginalRevenuePerDay,
    marginalFeedCostPerDay,
    netMarginPerDay,
    recommendation,
    daysToTarget,
    currentValue,
  };
}
