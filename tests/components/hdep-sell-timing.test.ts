import {
  computeHdepSeries,
  currentHdep,
  computeSellTiming,
  deriveSellTimingInput,
  type HdepLogRow,
  type SellTimingLogRow,
} from '@poultryos/shared';

describe('computeHdepSeries', () => {
  it('buckets eggs into weeks since placement and computes HDEP%', () => {
    // Placement 2026-01-01, 1000 birds. Week 1: 7 days × 900 eggs → 90% HDEP.
    const logs: HdepLogRow[] = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(Date.UTC(2026, 0, 1 + i)).toISOString().slice(0, 10);
      logs.push({ log_date: d, eggs_collected: 900 });
    }
    const series = computeHdepSeries(logs, 1000, '2026-01-01');
    expect(series).toHaveLength(1);
    expect(series[0].weekIndex).toBe(1);
    expect(series[0].days).toBe(7);
    expect(series[0].hdep).toBeCloseTo(90, 5);
    expect(currentHdep(series)).toBeCloseTo(90, 5);
  });

  it('ignores days with no egg count and keeps weeks separate', () => {
    const logs: HdepLogRow[] = [
      { log_date: '2026-01-02', eggs_collected: 800 }, // week 1
      { log_date: '2026-01-03', eggs_collected: null }, // skipped
      { log_date: '2026-01-09', eggs_collected: 950 }, // week 2
    ];
    const series = computeHdepSeries(logs, 1000, '2026-01-01');
    expect(series.map((p) => p.weekIndex)).toEqual([1, 2]);
    expect(series[0].hdep).toBeCloseTo(80, 5); // 800 / (1000*1)
    expect(series[1].hdep).toBeCloseTo(95, 5);
  });

  it('returns empty for no birds or no logs', () => {
    expect(computeHdepSeries([], 1000, '2026-01-01')).toEqual([]);
    expect(computeHdepSeries([{ log_date: '2026-01-02', eggs_collected: 900 }], 0, '2026-01-01')).toEqual([]);
    expect(currentHdep([])).toBeNull();
  });
});

describe('computeSellTiming', () => {
  const base = {
    birds: 1000,
    currentWeightKg: 1.8,
    adgKgPerDay: 0.06, // 60 g/day
    feedPerBirdPerDayKg: 0.12, // 120 g/day
    feedCostPerKg: 40,
    pricePerKg: 120,
    targetWeightKg: 2.1,
  };

  it('recommends growing while marginal revenue beats marginal feed cost', () => {
    const r = computeSellTiming(base);
    // rev/day = 0.06*1000*120 = 7200; feed/day = 0.12*1000*40 = 4800; net = 2400
    expect(r.marginalRevenuePerDay).toBeCloseTo(7200, 5);
    expect(r.marginalFeedCostPerDay).toBeCloseTo(4800, 5);
    expect(r.netMarginPerDay).toBeCloseTo(2400, 5);
    expect(r.recommendation).toBe('keep_growing');
    expect(r.daysToTarget).toBeCloseTo((2.1 - 1.8) / 0.06, 5); // 5 days
  });

  it('recommends selling when growth stalls (low ADG)', () => {
    const r = computeSellTiming({ ...base, adgKgPerDay: 0.01 });
    // rev/day = 0.01*1000*120 = 1200 < feed 4800 → net negative
    expect(r.netMarginPerDay).toBeLessThan(0);
    expect(r.recommendation).toBe('sell_now');
  });

  it('is unknown without price/feed-cost inputs', () => {
    expect(computeSellTiming({ ...base, pricePerKg: 0 }).recommendation).toBe('unknown');
    expect(computeSellTiming({ ...base, feedCostPerKg: 0 }).recommendation).toBe('unknown');
  });

  it('computes current flock value at today price', () => {
    const r = computeSellTiming(base);
    expect(r.currentValue).toBeCloseTo(1000 * 1.8 * 120, 5);
  });
});

describe('deriveSellTimingInput', () => {
  const logs: SellTimingLogRow[] = [
    { log_date: '2026-06-01', feed_consumed_kg: 100, feed_cost_per_kg: 38, avg_bird_weight_g: 1500 },
    { log_date: '2026-06-08', feed_consumed_kg: 120, feed_cost_per_kg: 40, avg_bird_weight_g: 1920 },
  ];

  it('derives ADG, current weight, feed/bird/day, and feed cost from logs', () => {
    const input = deriveSellTimingInput(logs, { birds: 1000, pricePerKg: 120, targetWeightKg: 2.1 });
    expect(input.currentWeightKg).toBeCloseTo(1.92, 5);
    // (1920-1500)/1000 over 7 days = 0.06 kg/day
    expect(input.adgKgPerDay).toBeCloseTo(0.06, 5);
    // most recent feed cost
    expect(input.feedCostPerKg).toBe(40);
    // feed/bird/day over the 2 logged days: (100+120)/2/1000 = 0.11
    expect(input.feedPerBirdPerDayKg).toBeCloseTo(0.11, 5);
    expect(input.targetWeightKg).toBe(2.1);
  });

  it('feeds a coherent recommendation end-to-end', () => {
    const r = computeSellTiming(
      deriveSellTimingInput(logs, { birds: 1000, pricePerKg: 120, targetWeightKg: 2.1 }),
    );
    expect(['sell_now', 'keep_growing']).toContain(r.recommendation);
  });
});
