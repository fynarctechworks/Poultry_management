import {
  reconcileFeed,
  feedToGrowthConsistency,
  reconcileBirdCount,
  detectEntryBehavior,
  buildFarmIntegrityReport,
  type EntryBehaviorLog,
} from '@poultryos/shared';

describe('reconcileFeed', () => {
  it('flags a feed shortfall with its rupee value', () => {
    const r = reconcileFeed({ systemStockKg: 500, physicalStockKg: 380, feedCostPerKg: 30 });
    expect(r.varianceKg).toBe(-120);
    expect(r.varianceRupees).toBe(-3600);
    expect(r.severity).toBe('attention'); // 120kg short >> tolerance
  });

  it('is OK within tolerance', () => {
    const r = reconcileFeed({ systemStockKg: 500, physicalStockKg: 495, feedCostPerKg: 30 });
    expect(r.severity).toBe('ok');
  });

  it('returns no variance when there is no physical count', () => {
    const r = reconcileFeed({ systemStockKg: 500, physicalStockKg: null, feedCostPerKg: 30 });
    expect(r.varianceKg).toBeNull();
    expect(r.severity).toBe('ok');
  });
});

describe('feedToGrowthConsistency', () => {
  it('flags feed that outruns weight gain at standard FCR', () => {
    // 4400kg feed for 2000kg gain → FCR 2.2 vs standard 1.6 (>30% over → attention).
    const r = feedToGrowthConsistency({ feedConsumedKg: 4400, weightGainKg: 2000, standardFcr: 1.6, feedCostPerKg: 30 });
    expect(r.actualFcr).toBeCloseTo(2.2, 3);
    expect(r.excessFeedKg).toBeCloseTo(1200, 1); // 4400 − 2000×1.6
    expect(r.excessRupees).toBe(36000);
    expect(r.severity).toBe('attention');
  });

  it('flags a moderate FCR drift as review', () => {
    // FCR 2.0 vs 1.6 (25% over) → review, not attention.
    const r = feedToGrowthConsistency({ feedConsumedKg: 4000, weightGainKg: 2000, standardFcr: 1.6, feedCostPerKg: 30 });
    expect(r.actualFcr).toBeCloseTo(2.0, 3);
    expect(r.severity).toBe('review');
  });

  it('is OK when FCR tracks standard', () => {
    const r = feedToGrowthConsistency({ feedConsumedKg: 3200, weightGainKg: 2000, standardFcr: 1.6, feedCostPerKg: 30 });
    expect(r.severity).toBe('ok');
    expect(r.excessFeedKg).toBe(0);
  });
});

describe('reconcileBirdCount', () => {
  it('detects fewer physical birds than the system claims', () => {
    const r = reconcileBirdCount({
      opening: 5000,
      cumulativeDeaths: 120,
      soldOrTransferred: 0,
      systemCount: 4880,
      physicalCount: 4810,
      birdValue: 80,
    });
    expect(r.expectedCount).toBe(4880);
    expect(r.varianceBirds).toBe(-70);
    expect(r.varianceRupees).toBe(-5600);
    expect(r.severity).toBe('attention');
  });

  it('flags ledger drift even without a physical count', () => {
    const r = reconcileBirdCount({
      opening: 5000,
      cumulativeDeaths: 100,
      soldOrTransferred: 0,
      systemCount: 4950, // should be 4900
      physicalCount: null,
    });
    expect(r.ledgerDrift).toBe(50);
    expect(r.severity).toBe('review');
  });
});

describe('detectEntryBehavior', () => {
  const mk = (date: string, created: string, feed: number | null, wt: number | null): EntryBehaviorLog => ({
    log_date: date,
    created_at: created,
    feed_consumed_kg: feed,
    avg_bird_weight_g: wt,
  });

  it('counts backfills, repeated values, odd hours and weight jumps', () => {
    const logs: EntryBehaviorLog[] = [
      mk('2026-06-01', '2026-06-01T08:00:00Z', 180, 500),
      mk('2026-06-02', '2026-06-02T08:00:00Z', 180, 540),
      mk('2026-06-03', '2026-06-03T08:00:00Z', 180, 580),
      mk('2026-06-04', '2026-06-04T08:00:00Z', 180, 1200), // implausible jump
      // backfilled 5 days late, logged at 2 AM (odd hour)
      mk('2026-06-05', '2026-06-12T02:00:00Z', 200, null),
    ];
    const e = detectEntryBehavior(logs);
    expect(e.repeatedRun).toBeGreaterThanOrEqual(4); // four 180s in a row
    expect(e.backfilledCount).toBe(1);
    expect(e.oddHourCount).toBe(1);
    expect(e.weightJumpCount).toBe(1);
  });
});

describe('buildFarmIntegrityReport', () => {
  it('assembles findings, overall severity and total exposure', () => {
    const report = buildFarmIntegrityReport({
      feed: { systemStockKg: 500, physicalStockKg: 380, feedCostPerKg: 30 },
      feedGrowth: { feedConsumedKg: 4000, weightGainKg: 2000, standardFcr: 1.6, feedCostPerKg: 30 },
      birdCount: { opening: 5000, cumulativeDeaths: 120, soldOrTransferred: 0, systemCount: 4880, physicalCount: 4810, birdValue: 80 },
    });
    expect(report.findings.map((f) => f.key).sort()).toEqual(
      ['bird_variance', 'feed_growth', 'feed_variance'].sort(),
    );
    expect(report.overall).toBe('attention');
    // feed −3600, growth −24000, birds −5600
    expect(report.totalExposureRupees).toBe(-33200);
  });

  it('is clean when everything reconciles', () => {
    const report = buildFarmIntegrityReport({
      feed: { systemStockKg: 500, physicalStockKg: 498, feedCostPerKg: 30 },
      feedGrowth: { feedConsumedKg: 3200, weightGainKg: 2000, standardFcr: 1.6, feedCostPerKg: 30 },
      birdCount: { opening: 5000, cumulativeDeaths: 100, soldOrTransferred: 0, systemCount: 4900, physicalCount: 4899, birdValue: 80 },
    });
    expect(report.findings).toHaveLength(0);
    expect(report.overall).toBe('ok');
    expect(report.totalExposureRupees).toBe(0);
  });
});
