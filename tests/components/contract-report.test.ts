import { buildSettlementReport } from '../../mobile-app/lib/contract-report';

const baseInput = {
  batchCode: 'BR-2026-04-A',
  integratorName: 'Suguna',
  breedName: 'Cobb 500',
  status: 'settled' as const,
  chicksSupplied: 5000,
  chicksSuppliedDate: '2026-03-01',
  totalFeedSuppliedKg: 12500,
  birdsDelivered: 4900,
  avgWeightKg: 2.1,
  actualFcr: 1.6,
  actualMortalityPct: 2.0,
  actualHarvestDate: '2026-04-15',
  liveWeightKg: 10290,
  baseAmount: 102_900,
  fcrBonus: 5_145,
  mortalityBonus: 2_058,
  expectedSettlement: 110_103,
  actualSettlement: 108_000,
  settlementReceivedDate: '2026-04-22',
  disputeNotes: null,
  farmName: 'Krishna Poultry',
};

describe('buildSettlementReport', () => {
  it('produces a header with batch code, farm name and integrator', () => {
    const out = buildSettlementReport(baseInput);
    expect(out).toContain('BR-2026-04-A');
    expect(out).toContain('Krishna Poultry');
    expect(out).toContain('Integrator: Suguna');
    expect(out).toContain('Breed: Cobb 500');
    expect(out).toContain('Status: Settled');
  });

  it('includes integrator inputs section with Indian-grouped numbers', () => {
    const out = buildSettlementReport(baseInput);
    expect(out).toContain('Chicks supplied: 5,000');
    expect(out).toContain('Feed supplied: 12,500 kg');
  });

  it('includes performance numbers with units', () => {
    const out = buildSettlementReport(baseInput);
    expect(out).toContain('Birds delivered: 4,900');
    expect(out).toContain('Avg weight: 2.1 kg');
    expect(out).toContain('Actual FCR: 1.6');
    expect(out).toContain('Mortality: 2%');
  });

  it('formats INR with the rupee symbol and Indian grouping', () => {
    const out = buildSettlementReport(baseInput);
    expect(out).toContain('Expected total: ₹1,10,103');
    expect(out).toContain('Actual received: ₹1,08,000');
  });

  it('computes a negative delta when actual is lower than expected', () => {
    const out = buildSettlementReport(baseInput);
    // 108 000 − 110 103 = −2 103
    expect(out).toContain('Delta (actual − expected): −₹2,103');
  });

  it('computes a positive delta when actual is higher than expected', () => {
    const out = buildSettlementReport({
      ...baseInput,
      expectedSettlement: 100_000,
      actualSettlement: 105_500,
    });
    expect(out).toContain('Delta (actual − expected): +₹5,500');
  });

  it('omits the Reconciliation section when no actual settlement', () => {
    const out = buildSettlementReport({
      ...baseInput,
      actualSettlement: null,
      settlementReceivedDate: null,
    });
    expect(out).not.toContain('Actual received');
    expect(out).not.toContain('Delta');
  });

  it('includes dispute notes only when present and non-empty', () => {
    const withNotes = buildSettlementReport({
      ...baseInput,
      disputeNotes: 'Integrator marked 50 birds as condemned without proof.',
    });
    expect(withNotes).toContain('Dispute notes');
    expect(withNotes).toContain('without proof');

    const withoutNotes = buildSettlementReport({ ...baseInput, disputeNotes: null });
    expect(withoutNotes).not.toContain('Dispute notes');

    const blank = buildSettlementReport({ ...baseInput, disputeNotes: '   ' });
    expect(blank).not.toContain('Dispute notes');
  });

  it('renders an em-dash for missing performance fields', () => {
    const out = buildSettlementReport({
      ...baseInput,
      birdsDelivered: null,
      avgWeightKg: null,
      actualFcr: null,
      actualMortalityPct: null,
    });
    expect(out).toMatch(/Birds delivered: —/);
    expect(out).toMatch(/Avg weight: —/);
    expect(out).toMatch(/Actual FCR: —/);
    expect(out).toMatch(/Mortality: —/);
  });

  it('always ends with the PoultryOS attribution', () => {
    const out = buildSettlementReport(baseInput);
    expect(out.endsWith('— Sent from PoultryOS')).toBe(true);
  });

  it('collapses any accidental triple-newlines to a single blank line', () => {
    const out = buildSettlementReport(baseInput);
    expect(out).not.toMatch(/\n\n\n/);
  });
});
