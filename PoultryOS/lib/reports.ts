// Report formatters for the /reports screen and WhatsApp share.
// Pure text builders that map aggregate row shapes into WhatsApp-friendly
// multi-line summaries. Plain text only (light *bold* markdown only).

export interface OperationalReportInputs {
  farmName: string | null;
  fromDate: string;
  toDate: string;
  activeBatches: number;
  totalBirds: number;
  deaths: number;
  mortalityPct: number | null;
  feedConsumedKg: number;
  eggsCollected: number;
  vaccinationsDone: number;
  healthIncidents: number;
}

export interface FinancialReportInputs {
  farmName: string | null;
  fromDate: string;
  toDate: string;
  totalIncome: number;
  totalExpense: number;
  netPnl: number;
  paidIncome: number;
  pendingReceivables: number;
  topExpenseCategory: string | null;
  topExpenseAmount: number;
}

const INR = (n: number | null | undefined): string => {
  if (n === null || n === undefined) return '—';
  const num = Number(n);
  if (Number.isNaN(num)) return '—';
  const sign = num < 0 ? '−' : '';
  return `${sign}₹${Math.abs(num).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
};

const NUM = (n: number | null | undefined, suffix = ''): string => {
  if (n === null || n === undefined) return '—';
  return `${Number(n).toLocaleString('en-IN', { maximumFractionDigits: 2 })}${suffix}`;
};

function formatRange(from: string, to: string): string {
  const f = new Date(from);
  const t = new Date(to);
  const fmt = (d: Date) =>
    d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  return `${fmt(f)} → ${fmt(t)}`;
}

export function buildOperationalReport(input: OperationalReportInputs): string {
  const lines: string[] = [];
  lines.push(`*Operational report — ${input.farmName ?? 'Farm'}*`);
  lines.push(formatRange(input.fromDate, input.toDate));
  lines.push('');

  lines.push('*Flock*');
  lines.push(`Active batches: ${input.activeBatches}`);
  lines.push(`Total birds: ${NUM(input.totalBirds)}`);
  lines.push('');

  lines.push('*Mortality + production*');
  lines.push(`Deaths in period: ${NUM(input.deaths)}`);
  lines.push(
    `Mortality %: ${input.mortalityPct !== null ? NUM(input.mortalityPct, '%') : '—'}`,
  );
  lines.push(`Feed consumed: ${NUM(input.feedConsumedKg, ' kg')}`);
  if (input.eggsCollected > 0) {
    lines.push(`Eggs collected: ${NUM(input.eggsCollected)}`);
  }
  lines.push('');

  lines.push('*Health*');
  lines.push(`Vaccinations done: ${input.vaccinationsDone}`);
  lines.push(`Health incidents: ${input.healthIncidents}`);
  lines.push('');

  lines.push('— Sent from PoultryOS');
  return lines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

export function buildFinancialReport(input: FinancialReportInputs): string {
  const lines: string[] = [];
  lines.push(`*Financial summary — ${input.farmName ?? 'Farm'}*`);
  lines.push(formatRange(input.fromDate, input.toDate));
  lines.push('');

  lines.push('*Totals*');
  lines.push(`Income: ${INR(input.totalIncome)}`);
  lines.push(`Expenses: ${INR(input.totalExpense)}`);
  lines.push(`Net P&L: ${INR(input.netPnl)}`);
  lines.push('');

  lines.push('*Cash flow*');
  lines.push(`Paid income: ${INR(input.paidIncome)}`);
  lines.push(`Pending receivables: ${INR(input.pendingReceivables)}`);
  lines.push('');

  if (input.topExpenseCategory) {
    lines.push('*Top expense*');
    lines.push(`${input.topExpenseCategory}: ${INR(input.topExpenseAmount)}`);
    lines.push('');
  }

  lines.push('— Sent from PoultryOS');
  return lines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

// CSV builders — used by the Reports screen "Download CSV" action.
// Headers row + 1 row per record. RFC 4180 quoting for fields containing
// commas, quotes, or newlines.

function csvEscape(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return '';
  const str = String(value);
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export interface CsvRow {
  [key: string]: string | number | null | undefined;
}

export function buildCsv(rows: CsvRow[], columns: string[]): string {
  const lines: string[] = [];
  lines.push(columns.map(csvEscape).join(','));
  for (const row of rows) {
    lines.push(columns.map((c) => csvEscape(row[c])).join(','));
  }
  return lines.join('\n');
}
