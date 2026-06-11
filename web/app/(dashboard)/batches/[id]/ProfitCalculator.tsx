'use client';

import { useMemo, useState } from 'react';
import { projectProfit } from '@/lib/profit-calculator';
import { formatCurrencyINR } from '@/lib/utils';

interface Props {
  openingBirdCount: number;
  currentBirdCount: number;
  totalCostSoFar: number;
  defaultPricePerKg: number;
}

export function ProfitCalculator({ openingBirdCount, currentBirdCount, totalCostSoFar, defaultPricePerKg }: Props) {
  const [weight, setWeight] = useState<number>(2.0);
  const [price, setPrice] = useState<number>(defaultPricePerKg || 120);

  const projection = useMemo(() => projectProfit({
    openingBirdCount,
    currentBirdCount,
    avgWeightKg: weight,
    pricePerKg: price,
    totalCostSoFar,
  }), [openingBirdCount, currentBirdCount, weight, price, totalCostSoFar]);

  return (
    <div className="card mt-2xl">
      <h2 className="text-lg font-bold text-ink mb-md">Profit projection</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-md mb-md">
        <div>
          <label className="label">Expected avg weight at harvest (kg)</label>
          <input type="number" step="0.01" min={0} className="input" value={weight} onChange={(e) => setWeight(+e.target.value)} />
        </div>
        <div>
          <label className="label">Expected price per kg (₹)</label>
          <input type="number" step="0.01" min={0} className="input" value={price} onChange={(e) => setPrice(+e.target.value)} />
        </div>
      </div>
      <dl className="grid grid-cols-2 md:grid-cols-4 gap-md">
        <Tile label="Livability" value={`${projection.livabilityPct.toFixed(1)}%`} />
        <Tile label="Birds at harvest" value={projection.projectedSurvivingBirds.toLocaleString('en-IN')} />
        <Tile label="Projected revenue" value={formatCurrencyINR(projection.projectedRevenue)} />
        <Tile
          label="Net P&L"
          value={formatCurrencyINR(projection.projectedNetPnl)}
          accent={projection.projectedNetPnl >= 0 ? 'success' : 'danger'}
        />
      </dl>
      <p className="text-xs text-body-soft mt-md">
        Per-bird P&amp;L: <span className={`font-semibold ${projection.projectedPerBirdPnl >= 0 ? 'text-success-ink' : 'text-danger'}`}>
          {formatCurrencyINR(projection.projectedPerBirdPnl)}
        </span>
      </p>
    </div>
  );
}

function Tile({ label, value, accent }: { label: string; value: string; accent?: 'success' | 'danger' }) {
  const tone = accent === 'success' ? 'text-success-ink' : accent === 'danger' ? 'text-danger' : 'text-ink';
  return (
    <div>
      <dt className="text-xs uppercase tracking-wider text-body-soft">{label}</dt>
      <dd className={`text-xl font-bold ${tone}`}>{value}</dd>
    </div>
  );
}
