import {
  computeBatchPnl,
  daysSince,
  type BatchPnlBatchInputs,
  type BatchPnlLogRow,
  type BatchPnlTxn,
} from '../../PoultryOS/lib/batch-pnl';

const baseBatch: BatchPnlBatchInputs = {
  openingBirdCount: 1000,
  currentBirdCount: 950,
  costPerBird: 35,
  saleWeightKg: null,
  salePricePerKg: null,
  totalSaleRevenue: null,
};

describe('computeBatchPnl', () => {
  it('returns all zeros for a fresh batch with no data', () => {
    const result = computeBatchPnl(
      { ...baseBatch, costPerBird: null, openingBirdCount: 0, currentBirdCount: 0 },
      [],
      [],
    );
    expect(result.chickCost).toBe(0);
    expect(result.feedCost).toBe(0);
    expect(result.totalCost).toBe(0);
    expect(result.netPnl).toBe(0);
    expect(result.costPerBird).toBeNull();
    expect(result.pnlPerBird).toBeNull();
  });

  it('multiplies chick cost by opening_bird_count', () => {
    const result = computeBatchPnl(baseBatch, [], []);
    expect(result.chickCost).toBe(35000);
    expect(result.totalCost).toBe(35000);
    expect(result.costPerBird).toBe(35);
    expect(result.netPnl).toBe(-35000);
  });

  it('sums feed cost only when both kg and rate are positive', () => {
    const logs: BatchPnlLogRow[] = [
      { feed_consumed_kg: 100, feed_cost_per_kg: 30, avg_bird_weight_g: 800, log_date: '2026-05-01' },
      { feed_consumed_kg: 150, feed_cost_per_kg: 32, avg_bird_weight_g: 1100, log_date: '2026-05-05' },
      { feed_consumed_kg: 50, feed_cost_per_kg: null, avg_bird_weight_g: 1300, log_date: '2026-05-10' },
      { feed_consumed_kg: null, feed_cost_per_kg: 30, avg_bird_weight_g: 1400, log_date: '2026-05-11' },
    ];
    const result = computeBatchPnl(baseBatch, logs, []);
    // 100*30 + 150*32 = 3000 + 4800 = 7800
    expect(result.feedCost).toBe(7800);
  });

  it('includes financial_transactions for batch', () => {
    const txns: BatchPnlTxn[] = [
      { transaction_type: 'expense', amount: 500, payment_status: 'paid' },
      { transaction_type: 'expense', amount: 200, payment_status: 'pending' },
      { transaction_type: 'income', amount: 1000, payment_status: 'paid' },
      { transaction_type: 'income', amount: 500, payment_status: 'pending' },
    ];
    const result = computeBatchPnl(baseBatch, [], txns);
    expect(result.otherExpenseCost).toBe(700);
    expect(result.otherIncome).toBe(1500);
    expect(result.realisedIncome).toBe(1000);
  });

  it('uses total_sale_revenue from harvested batch', () => {
    const batch: BatchPnlBatchInputs = {
      ...baseBatch,
      saleWeightKg: 1800,
      salePricePerKg: 110,
      totalSaleRevenue: 198000,
    };
    const result = computeBatchPnl(batch, [], []);
    expect(result.saleRevenue).toBe(198000);
    expect(result.totalIncome).toBe(198000);
    expect(result.netPnl).toBe(198000 - 35000);
  });

  it('computes a complete P&L end-to-end', () => {
    const batch: BatchPnlBatchInputs = {
      ...baseBatch,
      totalSaleRevenue: 198000,
    };
    const logs: BatchPnlLogRow[] = [
      { feed_consumed_kg: 100, feed_cost_per_kg: 30, avg_bird_weight_g: 800, log_date: '2026-05-01' },
      { feed_consumed_kg: 150, feed_cost_per_kg: 32, avg_bird_weight_g: 1100, log_date: '2026-05-05' },
    ];
    const txns: BatchPnlTxn[] = [
      { transaction_type: 'expense', amount: 2000, payment_status: 'paid' },
      { transaction_type: 'income', amount: 5000, payment_status: 'pending' },
    ];
    const r = computeBatchPnl(batch, logs, txns);
    // chick 35000, feed 7800, exp 2000 => total cost 44800
    // sale 198000, other income 5000 => total income 203000
    // net = 158200, per-bird = 158.2
    expect(r.chickCost).toBe(35000);
    expect(r.feedCost).toBe(7800);
    expect(r.otherExpenseCost).toBe(2000);
    expect(r.totalCost).toBe(44800);
    expect(r.totalIncome).toBe(203000);
    expect(r.netPnl).toBe(158200);
    expect(r.pnlPerBird).toBeCloseTo(158.2, 5);
    // Realised excludes the pending 5000 → net realised = 198000 - 44800 = 153200
    expect(r.realisedNetPnl).toBe(153200);
  });
});

describe('daysSince', () => {
  it('handles invalid dates', () => {
    expect(daysSince('garbage')).toBe(0);
  });

  it('handles future date as zero', () => {
    const tomorrow = new Date(Date.now() + 86400 * 1000)
      .toISOString()
      .slice(0, 10);
    expect(daysSince(tomorrow)).toBe(0);
  });

  it('counts days back', () => {
    const past = new Date(Date.now() - 3 * 86400 * 1000)
      .toISOString()
      .slice(0, 10);
    expect(daysSince(past)).toBeGreaterThanOrEqual(2);
    expect(daysSince(past)).toBeLessThanOrEqual(3);
  });
});
