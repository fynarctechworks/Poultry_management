import {
  buildOperationalReport,
  buildFinancialReport,
  buildCsv,
} from '../../mobile-app/lib/reports';

describe('buildOperationalReport', () => {
  const base = {
    farmName: 'Krishna Poultry',
    fromDate: '2026-04-01',
    toDate: '2026-04-30',
    activeBatches: 3,
    totalBirds: 4200,
    deaths: 120,
    mortalityPct: 2.86,
    feedConsumedKg: 18500,
    eggsCollected: 0,
    vaccinationsDone: 6,
    healthIncidents: 2,
  };

  it('puts farm name in the header and date range below it', () => {
    const out = buildOperationalReport(base);
    expect(out.startsWith('*Operational report — Krishna Poultry*')).toBe(true);
    expect(out).toContain('01 Apr 2026 → 30 Apr 2026');
  });

  it('omits eggs row when zero', () => {
    const out = buildOperationalReport(base);
    expect(out).not.toContain('Eggs collected');
  });

  it('includes eggs row when > 0', () => {
    const out = buildOperationalReport({ ...base, eggsCollected: 1250 });
    expect(out).toContain('Eggs collected: 1,250');
  });

  it('renders mortality % with em-dash when null', () => {
    const out = buildOperationalReport({ ...base, mortalityPct: null });
    expect(out).toContain('Mortality %: —');
  });

  it('ends with PoultryOS attribution', () => {
    expect(buildOperationalReport(base).endsWith('— Sent from PoultryOS')).toBe(true);
  });
});

describe('buildFinancialReport', () => {
  const base = {
    farmName: 'Krishna Poultry',
    fromDate: '2026-04-01',
    toDate: '2026-04-30',
    totalIncome: 250_000,
    totalExpense: 180_000,
    netPnl: 70_000,
    paidIncome: 200_000,
    pendingReceivables: 50_000,
    topExpenseCategory: 'feed',
    topExpenseAmount: 120_000,
  };

  it('formats INR with Indian grouping', () => {
    const out = buildFinancialReport(base);
    expect(out).toContain('Income: ₹2,50,000');
    expect(out).toContain('Net P&L: ₹70,000');
  });

  it('shows negative P&L with minus sign', () => {
    const out = buildFinancialReport({ ...base, netPnl: -15_000 });
    expect(out).toContain('Net P&L: −₹15,000');
  });

  it('omits top expense section when category is null', () => {
    const out = buildFinancialReport({ ...base, topExpenseCategory: null });
    expect(out).not.toContain('Top expense');
  });
});

describe('buildCsv', () => {
  it('emits headers as the first line', () => {
    const out = buildCsv([], ['a', 'b']);
    expect(out).toBe('a,b');
  });

  it('emits rows with values aligned to columns', () => {
    const out = buildCsv(
      [{ a: 1, b: 'two' }, { a: 3, b: 'four' }],
      ['a', 'b'],
    );
    expect(out).toBe('a,b\n1,two\n3,four');
  });

  it('quotes fields containing commas', () => {
    const out = buildCsv([{ name: 'Sharma, R.', amount: 5000 }], ['name', 'amount']);
    expect(out).toContain('"Sharma, R.",5000');
  });

  it('escapes embedded double-quotes by doubling them', () => {
    const out = buildCsv([{ note: 'He said "hi"' }], ['note']);
    expect(out).toContain('"He said ""hi"""');
  });

  it('renders null / undefined as empty fields', () => {
    const out = buildCsv([{ a: null, b: undefined, c: 5 }], ['a', 'b', 'c']);
    expect(out).toBe('a,b,c\n,,5');
  });
});
