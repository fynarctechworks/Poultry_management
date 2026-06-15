import {
  dailyBurnByFeedType,
  inferFeedType,
  feedStockStatus,
  type FeedConsumptionLog,
} from '@poultryos/shared';

function logs(end: string, days: number, feedType: string, kgPerDay: number): FeedConsumptionLog[] {
  const rows: FeedConsumptionLog[] = [];
  const endMs = new Date(`${end}T00:00:00Z`).getTime();
  for (let i = 0; i < days; i++) {
    rows.push({
      log_date: new Date(endMs - i * 86400000).toISOString().slice(0, 10),
      feed_type: feedType,
      feed_consumed_kg: kgPerDay,
    });
  }
  return rows;
}

describe('dailyBurnByFeedType', () => {
  it('averages over the trailing 7-day window', () => {
    // 7 days of 70kg grower → 70 kg/day average.
    const burn = dailyBurnByFeedType(logs('2026-06-14', 7, 'grower', 70), 7);
    expect(burn.grower).toBeCloseTo(70, 5);
  });

  it('counts missing days as zero burn (3 logged days of 70kg over 7-day window → 30/day)', () => {
    const burn = dailyBurnByFeedType(logs('2026-06-14', 3, 'grower', 70), 7);
    expect(burn.grower).toBeCloseTo(30, 5);
  });

  it('ignores rows outside the window and zero/blank feed', () => {
    const rows: FeedConsumptionLog[] = [
      { log_date: '2026-06-14', feed_type: 'starter', feed_consumed_kg: 50 },
      { log_date: '2026-05-01', feed_type: 'starter', feed_consumed_kg: 999 }, // out of window
      { log_date: '2026-06-13', feed_type: null, feed_consumed_kg: 40 }, // no type
    ];
    const burn = dailyBurnByFeedType(rows, 7);
    expect(burn.starter).toBeCloseTo(50 / 7, 5);
  });
});

describe('inferFeedType', () => {
  it('maps item names by their leading phase word (mirrors the deduct trigger)', () => {
    expect(inferFeedType('Starter feed')).toBe('starter');
    expect(inferFeedType('grower mash')).toBe('grower');
    expect(inferFeedType('Finisher pellets')).toBe('finisher');
    expect(inferFeedType('Layer ration')).toBe('layer');
    expect(inferFeedType('Maize')).toBeNull();
  });
});

describe('feedStockStatus', () => {
  const burn = { grower: 100 }; // 100 kg/day

  it('flags critical when ≤ 3 days of stock remain', () => {
    const s = feedStockStatus(
      { id: 'i1', itemName: 'Grower feed', currentStock: 250, lowStockThreshold: 0 },
      burn,
    );
    expect(s.daysLeft).toBeCloseTo(2.5, 5);
    expect(s.severity).toBe('critical');
  });

  it('flags warning between 3 and 7 days', () => {
    const s = feedStockStatus(
      { id: 'i1', itemName: 'Grower feed', currentStock: 500, lowStockThreshold: 0 },
      burn,
    );
    expect(s.daysLeft).toBeCloseTo(5, 5);
    expect(s.severity).toBe('warning');
  });

  it('is ok with ample stock', () => {
    const s = feedStockStatus(
      { id: 'i1', itemName: 'Grower feed', currentStock: 2000, lowStockThreshold: 0 },
      burn,
    );
    expect(s.severity).toBe('ok');
  });

  it('is unknown when no burn data, but warning if already below threshold', () => {
    const noBurn = feedStockStatus(
      { id: 'i1', itemName: 'Finisher feed', currentStock: 100, lowStockThreshold: 0 },
      burn,
    );
    expect(noBurn.daysLeft).toBeNull();
    expect(noBurn.severity).toBe('unknown');

    const belowThreshold = feedStockStatus(
      { id: 'i2', itemName: 'Finisher feed', currentStock: 40, lowStockThreshold: 50 },
      burn,
    );
    expect(belowThreshold.severity).toBe('warning');
  });
});
