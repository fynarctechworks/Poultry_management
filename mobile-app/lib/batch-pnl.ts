// Per-batch P&L math. Pure functions, unit-tested.

export interface BatchPnlBatchInputs {
  openingBirdCount: number;
  currentBirdCount: number;
  costPerBird: number | null;
  saleWeightKg: number | null;
  salePricePerKg: number | null;
  totalSaleRevenue: number | null;  // generated column on batches
}

export interface BatchPnlLogRow {
  feed_consumed_kg: number | null;
  feed_cost_per_kg: number | null;
  avg_bird_weight_g: number | null;
  log_date: string;
}

export interface BatchPnlTxn {
  transaction_type: 'income' | 'expense';
  amount: number;
  payment_status: 'paid' | 'pending' | 'partial';
}

export interface BatchPnl {
  chickCost: number;
  feedCost: number;
  otherExpenseCost: number;
  totalCost: number;
  saleRevenue: number;       // from batches.total_sale_revenue (harvest)
  otherIncome: number;       // from financial_transactions
  totalIncome: number;
  netPnl: number;
  costPerBird: number | null;
  pnlPerBird: number | null;
  // Pending receivables count toward income only when realised, so we expose
  // a "realised" view too. Buyers/banking app reconciliation can use it.
  realisedIncome: number;
  realisedNetPnl: number;
}

export function computeBatchPnl(
  batch: BatchPnlBatchInputs,
  logs: BatchPnlLogRow[],
  txns: BatchPnlTxn[],
): BatchPnl {
  const opening = batch.openingBirdCount ?? 0;
  const chickCost = (Number(batch.costPerBird ?? 0)) * opening;

  let feedCost = 0;
  for (const row of logs) {
    const kg = Number(row.feed_consumed_kg ?? 0);
    const ratePerKg = Number(row.feed_cost_per_kg ?? 0);
    if (kg > 0 && ratePerKg > 0) feedCost += kg * ratePerKg;
  }

  let otherExpenseCost = 0;
  let otherIncome = 0;
  let realisedIncome = 0;
  for (const t of txns) {
    const amt = Number(t.amount ?? 0);
    if (t.transaction_type === 'expense') {
      otherExpenseCost += amt;
    } else {
      otherIncome += amt;
      if (t.payment_status === 'paid') realisedIncome += amt;
    }
  }

  const saleRevenue = Number(batch.totalSaleRevenue ?? 0);
  const totalCost = chickCost + feedCost + otherExpenseCost;
  const totalIncome = saleRevenue + otherIncome;
  const netPnl = totalIncome - totalCost;
  const realisedTotal = saleRevenue + realisedIncome;
  const realisedNetPnl = realisedTotal - totalCost;

  return {
    chickCost,
    feedCost,
    otherExpenseCost,
    totalCost,
    saleRevenue,
    otherIncome,
    totalIncome,
    netPnl,
    costPerBird: opening > 0 ? totalCost / opening : null,
    pnlPerBird: opening > 0 ? netPnl / opening : null,
    realisedIncome,
    realisedNetPnl,
  };
}

export function daysSince(iso: string): number {
  const start = new Date(iso);
  if (Number.isNaN(start.getTime())) return 0;
  const now = new Date();
  const diff = now.getTime() - start.getTime();
  return Math.max(0, Math.floor(diff / (1000 * 60 * 60 * 24)));
}
