/**
 * Date formatting helpers.
 * India Time Zone rule (CLAUDE.md): all dates display as DD-MMM-YYYY.
 */

const MONTHS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
] as const;

/**
 * Converts an ISO date string (YYYY-MM-DD) or ISO datetime string to
 * "DD-MMM-YYYY" — e.g. "2026-05-19" → "19-May-2026".
 *
 * Parses the date-part only (no timezone shift) so the displayed date
 * matches what the server stored, regardless of device locale.
 */
export function formatDDMMMYYYY(iso: string): string {
  // Take only the date portion to avoid UTC-vs-local offset issues.
  const datePart = iso.slice(0, 10); // "YYYY-MM-DD"
  const [year, month, day] = datePart.split('-').map(Number);

  if (!year || !month || !day || month < 1 || month > 12) {
    // Graceful fallback: return the raw string rather than crash.
    return iso;
  }

  const dd = String(day).padStart(2, '0');
  const mmm = MONTHS[month - 1];
  return `${dd}-${mmm}-${year}`;
}

/**
 * Returns today's date as YYYY-MM-DD in local time.
 * Useful for default field values.
 */
export function todayISO(): string {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

export interface Freshness {
  /** Human label, e.g. "as of 08:00 today" or "as of 19-May-2026". */
  label: string;
  /** True when older than the staleness threshold (default 24h). */
  isStale: boolean;
}

/**
 * Data-freshness descriptor for money/weather surfaces (blueprint §10.4).
 * "as of HH:MM today" same-day, "as of HH:MM yesterday", otherwise the
 * DD-MMM-YYYY date. Stale when older than `staleAfterHours` (default 24).
 */
export function freshness(
  timestamp: string | number | Date,
  now: Date = new Date(),
  staleAfterHours = 24,
): Freshness {
  const t = new Date(timestamp);
  if (Number.isNaN(t.getTime())) return { label: '', isStale: false };

  const hh = String(t.getHours()).padStart(2, '0');
  const mi = String(t.getMinutes()).padStart(2, '0');
  const sameDay =
    t.getFullYear() === now.getFullYear() &&
    t.getMonth() === now.getMonth() &&
    t.getDate() === now.getDate();
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  const isYesterday =
    t.getFullYear() === yesterday.getFullYear() &&
    t.getMonth() === yesterday.getMonth() &&
    t.getDate() === yesterday.getDate();

  const label = sameDay
    ? `as of ${hh}:${mi} today`
    : isYesterday
      ? `as of ${hh}:${mi} yesterday`
      : `as of ${formatDDMMMYYYY(t.toISOString().slice(0, 10))}`;

  const ageHours = (now.getTime() - t.getTime()) / 36e5;
  return { label, isStale: ageHours > staleAfterHours };
}
