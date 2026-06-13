import {
  aggregateFcr,
  aggregateLivability,
  fcrTone,
  livabilityTone,
  type BatchSnapshot,
  type DailyLogRow,
} from '../../mobile-app/lib/kpis';

describe('aggregateFcr', () => {
  const oneBatch: BatchSnapshot[] = [
    { batchId: 'b1', currentBirdCount: 500, openingBirdCount: 520 },
  ];

  it('returns null when no batches', () => {
    expect(aggregateFcr([], [])).toBeNull();
  });

  it('returns null when no logs', () => {
    expect(aggregateFcr(oneBatch, [])).toBeNull();
  });

  it('returns null when no weights recorded', () => {
    const logs: DailyLogRow[] = [
      { batch_id: 'b1', log_date: '2026-05-10', feed_consumed_kg: 50, avg_bird_weight_g: null },
      { batch_id: 'b1', log_date: '2026-05-11', feed_consumed_kg: 60, avg_bird_weight_g: null },
    ];
    expect(aggregateFcr(oneBatch, logs)).toBeNull();
  });

  it('computes FCR using latest non-null weight per batch', () => {
    // 500 birds, latest weight 1500g => 750kg live weight
    // total feed = 1200kg => FCR = 1.60
    const logs: DailyLogRow[] = [
      { batch_id: 'b1', log_date: '2026-05-01', feed_consumed_kg: 200, avg_bird_weight_g: 800 },
      { batch_id: 'b1', log_date: '2026-05-05', feed_consumed_kg: 400, avg_bird_weight_g: 1100 },
      { batch_id: 'b1', log_date: '2026-05-10', feed_consumed_kg: 600, avg_bird_weight_g: 1500 },
    ];
    const fcr = aggregateFcr(oneBatch, logs);
    expect(fcr).not.toBeNull();
    expect(fcr!).toBeCloseTo(1.6, 2);
  });

  it('weights across multiple batches by live weight', () => {
    const batches: BatchSnapshot[] = [
      { batchId: 'b1', currentBirdCount: 100, openingBirdCount: 100 },
      { batchId: 'b2', currentBirdCount: 400, openingBirdCount: 400 },
    ];
    // b1: 100 birds × 1000g = 100kg live, 200kg feed => 2.0 FCR
    // b2: 400 birds × 2000g = 800kg live, 1200kg feed => 1.5 FCR
    // aggregate = 1400 / 900 = 1.5556
    const logs: DailyLogRow[] = [
      { batch_id: 'b1', log_date: '2026-05-10', feed_consumed_kg: 200, avg_bird_weight_g: 1000 },
      { batch_id: 'b2', log_date: '2026-05-10', feed_consumed_kg: 1200, avg_bird_weight_g: 2000 },
    ];
    expect(aggregateFcr(batches, logs)!).toBeCloseTo(1400 / 900, 3);
  });

  it('skips batches with no weight data', () => {
    const batches: BatchSnapshot[] = [
      { batchId: 'b1', currentBirdCount: 100, openingBirdCount: 100 },
      { batchId: 'b2', currentBirdCount: 400, openingBirdCount: 400 },
    ];
    const logs: DailyLogRow[] = [
      { batch_id: 'b1', log_date: '2026-05-10', feed_consumed_kg: 200, avg_bird_weight_g: 1000 },
      // b2 has feed but no weight — should be skipped from the aggregate
      { batch_id: 'b2', log_date: '2026-05-10', feed_consumed_kg: 1200, avg_bird_weight_g: null },
    ];
    // Only b1 counts: 200 / 100 = 2.0
    expect(aggregateFcr(batches, logs)!).toBeCloseTo(2.0, 2);
  });
});

describe('aggregateLivability', () => {
  it('returns null when no opening birds', () => {
    expect(aggregateLivability([])).toBeNull();
    expect(
      aggregateLivability([
        { batchId: 'b1', currentBirdCount: 0, openingBirdCount: 0 },
      ]),
    ).toBeNull();
  });

  it('computes overall livability across batches', () => {
    const batches: BatchSnapshot[] = [
      { batchId: 'b1', currentBirdCount: 480, openingBirdCount: 500 },
      { batchId: 'b2', currentBirdCount: 970, openingBirdCount: 1000 },
    ];
    // alive 1450 / opening 1500 = 96.6667%
    expect(aggregateLivability(batches)!).toBeCloseTo((1450 / 1500) * 100, 3);
  });
});

describe('fcrTone', () => {
  it('returns neutral for null', () => {
    expect(fcrTone(null)).toBe('neutral');
  });
  it('classifies banded values', () => {
    expect(fcrTone(1.55)).toBe('positive');
    expect(fcrTone(1.8)).toBe('neutral');
    expect(fcrTone(2.1)).toBe('warning');
    expect(fcrTone(2.5)).toBe('negative');
  });
});

describe('livabilityTone', () => {
  it('returns neutral for null', () => {
    expect(livabilityTone(null)).toBe('neutral');
  });
  it('classifies banded values', () => {
    expect(livabilityTone(98)).toBe('positive');
    expect(livabilityTone(95)).toBe('neutral');
    expect(livabilityTone(90)).toBe('warning');
    expect(livabilityTone(80)).toBe('negative');
  });
});
