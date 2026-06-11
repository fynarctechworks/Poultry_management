// KPI math used by the dashboard. Pure, no I/O — easy to unit-test.

export interface BatchSnapshot {
  batchId: string;
  currentBirdCount: number;
  openingBirdCount: number;
}

export interface DailyLogRow {
  batch_id: string;
  log_date: string;
  feed_consumed_kg: number | null;
  avg_bird_weight_g: number | null;
}

// Cumulative FCR across all active batches, weighted by total live weight.
// FCR = total feed (kg) / total live weight (kg).
// live_weight per batch = current_bird_count * latest_avg_weight_g / 1000.
// Returns null when there isn't enough data to compute (no feed logged or no
// weight ever recorded).
export function aggregateFcr(
  batches: BatchSnapshot[],
  logs: DailyLogRow[],
): number | null {
  if (batches.length === 0 || logs.length === 0) return null;

  const feedByBatch = new Map<string, number>();
  const latestWeightByBatch = new Map<string, { date: string; weightG: number }>();

  for (const row of logs) {
    const feed = Number(row.feed_consumed_kg ?? 0);
    if (feed > 0) {
      feedByBatch.set(row.batch_id, (feedByBatch.get(row.batch_id) ?? 0) + feed);
    }
    const w = row.avg_bird_weight_g;
    if (w != null && w > 0) {
      const existing = latestWeightByBatch.get(row.batch_id);
      if (!existing || row.log_date > existing.date) {
        latestWeightByBatch.set(row.batch_id, { date: row.log_date, weightG: Number(w) });
      }
    }
  }

  let totalFeedKg = 0;
  let totalLiveWeightKg = 0;
  for (const b of batches) {
    const feed = feedByBatch.get(b.batchId) ?? 0;
    const latest = latestWeightByBatch.get(b.batchId);
    if (!latest) continue;
    const liveWeight = (b.currentBirdCount * latest.weightG) / 1000;
    if (liveWeight <= 0) continue;
    totalFeedKg += feed;
    totalLiveWeightKg += liveWeight;
  }

  if (totalLiveWeightKg <= 0 || totalFeedKg <= 0) return null;
  return totalFeedKg / totalLiveWeightKg;
}

// Livability % = (alive / opening) * 100, weighted across batches by opening count.
// Returns null when no batches exist.
export function aggregateLivability(batches: BatchSnapshot[]): number | null {
  const opening = batches.reduce((s, b) => s + (b.openingBirdCount ?? 0), 0);
  const alive = batches.reduce((s, b) => s + (b.currentBirdCount ?? 0), 0);
  if (opening <= 0) return null;
  return (alive / opening) * 100;
}

// Broiler FCR tone bands — typical commercial targets:
// < 1.6 excellent, 1.6–1.9 ok, 1.9–2.2 watch, > 2.2 bad.
export function fcrTone(
  fcr: number | null,
): 'positive' | 'neutral' | 'warning' | 'negative' {
  if (fcr === null) return 'neutral';
  if (fcr < 1.6) return 'positive';
  if (fcr <= 1.9) return 'neutral';
  if (fcr <= 2.2) return 'warning';
  return 'negative';
}

export function livabilityTone(
  pct: number | null,
): 'positive' | 'neutral' | 'warning' | 'negative' {
  if (pct === null) return 'neutral';
  if (pct >= 97) return 'positive';
  if (pct >= 93) return 'neutral';
  if (pct >= 88) return 'warning';
  return 'negative';
}
