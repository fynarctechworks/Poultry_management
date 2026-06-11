// Currency and number formatting — Indian grouping (₹1,23,456).
// One implementation; the audit found 15+ hand-rolled copies across both apps.

export interface FormatINROptions {
  /** Fraction digits to show (default 0 — whole rupees). */
  decimals?: number;
  /** Prefix positive values with "+" (default false). Negatives always get "-". */
  signed?: boolean;
}

export function formatINR(
  value: number | string | null | undefined,
  { decimals = 0, signed = false }: FormatINROptions = {},
): string {
  const num = Number(value ?? 0);
  if (!Number.isFinite(num)) return '₹0';
  const abs = Math.abs(num).toLocaleString('en-IN', {
    maximumFractionDigits: decimals,
    minimumFractionDigits: 0,
  });
  const sign = num < 0 ? '-' : signed && num > 0 ? '+' : '';
  return `${sign}₹${abs}`;
}

/** Plain en-IN grouped number, e.g. 4820 → "4,820". */
export function formatNumber(
  value: number | string | null | undefined,
  decimals = 0,
): string {
  const num = Number(value ?? 0);
  if (!Number.isFinite(num)) return '0';
  return num.toLocaleString('en-IN', { maximumFractionDigits: decimals });
}

/** "1,234.5 kg" style quantity formatter. */
export function formatKg(value: number | string | null | undefined, decimals = 2): string {
  return `${formatNumber(value, decimals)} kg`;
}
