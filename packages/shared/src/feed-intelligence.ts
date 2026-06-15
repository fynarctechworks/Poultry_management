// Feed intelligence — days-of-stock-left + reorder urgency.
//
// Feed is 65–70% of farm cost; running out mid-cycle or over-ordering both
// hurt. This estimates how many days each feed inventory item will last at the
// recent consumption rate, and flags reorder urgency. Pure functions over
// daily_logs feed rows + inventory items — runs on mobile, web, and (later)
// the low-stock cron. No I/O.

export type FeedType = 'starter' | 'grower' | 'finisher' | 'layer' | 'custom';

export const FEED_TYPES: FeedType[] = ['starter', 'grower', 'finisher', 'layer', 'custom'];

const DAY_MS = 24 * 60 * 60 * 1000;

export interface FeedConsumptionLog {
  log_date: string; // YYYY-MM-DD
  feed_type: string | null;
  feed_consumed_kg: number | null;
}

/**
 * Average kg/day consumed per feed_type over the trailing `days` window
 * anchored on the latest log date. Keyed by feed_type. Days with no log count
 * as zero burn (we divide by the whole window) so a quiet week reads as low
 * burn, not a spuriously high daily rate.
 */
export function dailyBurnByFeedType(
  logs: FeedConsumptionLog[],
  days = 7,
): Record<string, number> {
  if (logs.length === 0 || days <= 0) return {};
  const anchor = logs.reduce((m, r) => (r.log_date > m ? r.log_date : m), logs[0].log_date);
  const anchorMs = new Date(`${anchor}T00:00:00Z`).getTime();
  const start = anchorMs - (days - 1) * DAY_MS;
  const totals: Record<string, number> = {};
  for (const r of logs) {
    const t = new Date(`${r.log_date}T00:00:00Z`).getTime();
    if (Number.isNaN(t) || t < start || t > anchorMs) continue;
    const kg = Number(r.feed_consumed_kg ?? 0);
    if (kg <= 0 || !r.feed_type) continue;
    totals[r.feed_type] = (totals[r.feed_type] ?? 0) + kg;
  }
  const out: Record<string, number> = {};
  for (const k of Object.keys(totals)) out[k] = totals[k] / days;
  return out;
}

/**
 * Reverse of the deduct_feed_inventory trigger's matching, which deducts from
 * the item whose name ILIKE `${feed_type}%`. So "Starter feed" → 'starter'.
 * Returns null for items that don't map to a phase feed type.
 */
export function inferFeedType(itemName: string): FeedType | null {
  const n = itemName.trim().toLowerCase();
  for (const ft of FEED_TYPES) {
    if (ft === 'custom') continue;
    if (n.startsWith(ft)) return ft;
  }
  return null;
}

export type FeedStockSeverity = 'critical' | 'warning' | 'ok' | 'unknown';

export interface FeedStockInput {
  id: string;
  itemName: string;
  currentStock: number;
  lowStockThreshold: number | null;
}

export interface FeedStockStatus extends FeedStockInput {
  feedType: FeedType | null;
  /** Average kg/day burn matched to this item, or null when unknown. */
  avgDailyKg: number | null;
  /** Estimated days of stock left, or null when burn is unknown/zero. */
  daysLeft: number | null;
  severity: FeedStockSeverity;
}

export interface FeedStockThresholds {
  /** ≤ this many days left → critical (default 3). */
  criticalDays?: number;
  /** ≤ this many days left → warning (default 7). */
  warningDays?: number;
}

/**
 * Classify one feed item's stock health from the recent burn-by-type map.
 *   daysLeft unknown → 'unknown' (or 'warning' if already below its threshold)
 *   daysLeft ≤ criticalDays → 'critical'
 *   daysLeft ≤ warningDays OR at/below low-stock threshold → 'warning'
 *   else → 'ok'
 */
export function feedStockStatus(
  item: FeedStockInput,
  burnByType: Record<string, number>,
  { criticalDays = 3, warningDays = 7 }: FeedStockThresholds = {},
): FeedStockStatus {
  const feedType = inferFeedType(item.itemName);
  const avgDailyKg = feedType ? burnByType[feedType] ?? null : null;
  const daysLeft = avgDailyKg && avgDailyKg > 0 ? item.currentStock / avgDailyKg : null;
  const belowThreshold =
    item.lowStockThreshold != null &&
    item.lowStockThreshold > 0 &&
    item.currentStock <= item.lowStockThreshold;

  let severity: FeedStockSeverity;
  if (daysLeft === null) severity = belowThreshold ? 'warning' : 'unknown';
  else if (daysLeft <= criticalDays) severity = 'critical';
  else if (daysLeft <= warningDays || belowThreshold) severity = 'warning';
  else severity = 'ok';

  return { ...item, feedType, avgDailyKg, daysLeft, severity };
}
