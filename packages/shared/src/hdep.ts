// Layer HDEP (Hen-Day Egg Production) curve.
//
// HDEP% for a day = eggs collected ÷ live birds. A layer flock's value lives in
// its production curve: climb → peak (~28–32 wk, 90–96%) → slow decline. This
// builds a weekly HDEP series from daily_logs so the app can plot "are we on /
// holding peak?" against the breed standard. Pure — no I/O.
//
// Note: live bird count is approximated with the batch's current count (we don't
// store historical per-day counts). Fine for a trend; not a per-day audit.

export interface HdepLogRow {
  log_date: string; // YYYY-MM-DD
  eggs_collected: number | null;
}

export interface HdepWeekPoint {
  /** 1-based week since placement. */
  weekIndex: number;
  /** Eggs counted across the week's logged days. */
  eggs: number;
  /** Days in the week that had an egg count logged. */
  days: number;
  /** Hen-day egg production %, 0–100+. */
  hdep: number;
}

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Weekly HDEP series since placement. Only days with an actual egg count
 * (eggs_collected not null) contribute, so blank days don't deflate the rate.
 */
export function computeHdepSeries(
  logs: HdepLogRow[],
  birds: number,
  placementDate: string,
): HdepWeekPoint[] {
  if (birds <= 0 || logs.length === 0) return [];
  const placeMs = new Date(`${placementDate}T00:00:00Z`).getTime();
  if (Number.isNaN(placeMs)) return [];

  const byWeek = new Map<number, { eggs: number; days: number }>();
  for (const r of logs) {
    if (r.eggs_collected == null) continue;
    const t = new Date(`${r.log_date}T00:00:00Z`).getTime();
    if (Number.isNaN(t)) continue;
    const week = Math.floor((t - placeMs) / WEEK_MS) + 1;
    if (week < 1) continue;
    const cur = byWeek.get(week) ?? { eggs: 0, days: 0 };
    cur.eggs += Number(r.eggs_collected);
    cur.days += 1;
    byWeek.set(week, cur);
  }

  return [...byWeek.entries()]
    .sort((a, b) => a[0] - b[0])
    .filter(([, v]) => v.days > 0)
    .map(([weekIndex, v]) => ({
      weekIndex,
      eggs: v.eggs,
      days: v.days,
      hdep: (v.eggs / (birds * v.days)) * 100,
    }));
}

/** Most recent week's HDEP, or null when there's no data. */
export function currentHdep(series: HdepWeekPoint[]): number | null {
  return series.length ? series[series.length - 1].hdep : null;
}
