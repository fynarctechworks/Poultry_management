export interface ProfitProjection {
  projectedSurvivingBirds: number;
  projectedRevenue: number;
  projectedNetPnl: number;
  projectedPerBirdPnl: number;
  livabilityPct: number;
}

export function projectProfit(args: {
  openingBirdCount: number;
  currentBirdCount: number;
  avgWeightKg: number;
  pricePerKg: number;
  totalCostSoFar: number;
}): ProfitProjection {
  const { openingBirdCount, currentBirdCount, avgWeightKg, pricePerKg, totalCostSoFar } = args;
  const livabilityPct = openingBirdCount > 0 ? (currentBirdCount / openingBirdCount) * 100 : 0;
  const projectedSurvivingBirds = Math.round(openingBirdCount * (livabilityPct / 100));
  const projectedRevenue = projectedSurvivingBirds * avgWeightKg * pricePerKg;
  const projectedNetPnl = projectedRevenue - totalCostSoFar;
  const projectedPerBirdPnl = openingBirdCount > 0 ? projectedNetPnl / openingBirdCount : 0;
  return { projectedSurvivingBirds, projectedRevenue, projectedNetPnl, projectedPerBirdPnl, livabilityPct };
}
