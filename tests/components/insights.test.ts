import {
  computeInsights,
  formatInsight,
  splitWeekWindows,
  type Insight,
  type InsightBatchInput,
  type InsightLogRow,
} from '@poultryos/shared';

// Build a contiguous run of daily logs ending at `endDate`, going back `days`.
function makeLogs(
  endDate: string,
  days: number,
  fn: (i: number) => Partial<InsightLogRow>,
): InsightLogRow[] {
  const rows: InsightLogRow[] = [];
  const end = new Date(`${endDate}T00:00:00Z`).getTime();
  for (let i = 0; i < days; i++) {
    const d = new Date(end - i * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    rows.push({
      log_date: d,
      birds_dead: 0,
      feed_consumed_kg: null,
      feed_cost_per_kg: null,
      eggs_collected: null,
      avg_bird_weight_g: null,
      ...fn(i),
    });
  }
  return rows;
}

describe('splitWeekWindows', () => {
  it('splits into 7-day recent and prior windows anchored on the latest log', () => {
    const logs = makeLogs('2026-06-14', 14, () => ({}));
    const { recent, prior, anchor } = splitWeekWindows(logs);
    expect(anchor).toBe('2026-06-14');
    expect(recent).toHaveLength(7);
    expect(prior).toHaveLength(7);
    // Recent window is the most recent 7 calendar days inclusive.
    expect(recent.map((r) => r.log_date)).toContain('2026-06-08');
    expect(recent.map((r) => r.log_date)).toContain('2026-06-14');
    expect(prior.map((r) => r.log_date)).toContain('2026-06-01');
  });

  it('returns empty windows for no logs', () => {
    expect(splitWeekWindows([])).toEqual({ recent: [], prior: [], anchor: null });
  });
});

describe('computeInsights — broiler FCR drift', () => {
  it('flags worsening FCR with a negative rupee impact', () => {
    // Prior week: 700g→1100g gain (400g/bird), 800kg feed.
    // Recent week: 1100g→1400g gain (300g/bird), 900kg feed → FCR clearly worse.
    const prior = makeLogs('2026-06-07', 7, (i) => ({
      feed_consumed_kg: 800 / 7,
      feed_cost_per_kg: 40,
      avg_bird_weight_g: i === 6 ? 700 : i === 0 ? 1100 : 900,
    }));
    const recent = makeLogs('2026-06-14', 7, (i) => ({
      feed_consumed_kg: 900 / 7,
      feed_cost_per_kg: 40,
      avg_bird_weight_g: i === 6 ? 1100 : i === 0 ? 1400 : 1250,
    }));
    const batch: InsightBatchInput = {
      batchId: 'b1',
      batchCode: 'B-001',
      breedName: 'Cobb 500',
      poultryType: 'broiler',
      openingBirdCount: 1000,
      currentBirdCount: 1000,
      placementDate: '2026-05-01',
      logs: [...prior, ...recent],
    };
    const insights = computeInsights([batch]);
    const fcr = insights.find((i) => i.metric === 'fcr');
    expect(fcr).toBeDefined();
    expect(fcr!.severity).toBe('warning');
    expect(fcr!.titleKey).toBe('insights.fcr.up_title');
    expect(fcr!.detailKey).toBe('insights.fcr.detail_bench');
    expect(fcr!.rupeeImpact).not.toBeNull();
    expect(fcr!.rupeeImpact!).toBeLessThan(0);
  });
});

describe('computeInsights — mortality rise', () => {
  it('flags a week-over-week mortality increase', () => {
    const prior = makeLogs('2026-06-07', 7, () => ({ birds_dead: 0 }));
    const recent = makeLogs('2026-06-14', 7, (i) => ({ birds_dead: i < 4 ? 5 : 0 }));
    const batch: InsightBatchInput = {
      batchId: 'b2',
      batchCode: 'B-002',
      breedName: 'Ross 308',
      poultryType: 'broiler',
      openingBirdCount: 1000,
      currentBirdCount: 1000,
      placementDate: '2026-05-01',
      logs: [...prior, ...recent],
    };
    const insights = computeInsights([batch]);
    const mort = insights.find((i) => i.metric === 'mortality');
    expect(mort).toBeDefined();
    expect(['warning', 'critical']).toContain(mort!.severity);
    expect(mort!.titleKey).toBe('insights.mortality.up_title');
    expect(mort!.detailParams.deaths_recent).toBe(20);
  });
});

describe('computeInsights — layer production drop', () => {
  it('flags an HDEP fall week-over-week', () => {
    // 1000 birds. Prior ~90% HDEP, recent ~80%.
    const prior = makeLogs('2026-06-07', 7, () => ({ eggs_collected: 900 }));
    const recent = makeLogs('2026-06-14', 7, () => ({ eggs_collected: 800 }));
    const batch: InsightBatchInput = {
      batchId: 'b3',
      batchCode: 'L-001',
      breedName: 'Hyline Brown',
      poultryType: 'layer',
      openingBirdCount: 1000,
      currentBirdCount: 1000,
      placementDate: '2025-09-01',
      logs: [...prior, ...recent],
    };
    const insights = computeInsights([batch]);
    const prod = insights.find((i) => i.metric === 'production');
    expect(prod).toBeDefined();
    expect(prod!.severity).toBe('warning');
    expect(prod!.titleKey).toBe('insights.production.down_title');
    expect(prod!.detailKey).toBe('insights.production.detail_bench');
  });
});

describe('formatInsight (English renderer)', () => {
  it('interpolates params, appends suffix, and labels a cost impact', () => {
    const insight: Insight = {
      id: 'b1:mortality',
      batchId: 'b1',
      batchCode: 'B-001',
      metric: 'mortality',
      severity: 'critical',
      titleKey: 'insights.mortality.up_title',
      detailKey: 'insights.mortality.detail',
      detailParams: { deaths_recent: 20, deaths_prior: 0, pct_recent: '2.0', pct_prior: '0.0' },
      suffixKey: 'insights.mortality.above_suffix',
      rupeeImpact: null,
      score: 90,
    };
    const r = formatInsight(insight);
    expect(r.title).toBe('Mortality rising');
    expect(r.detail).toContain('20 deaths this week vs 0 last week');
    expect(r.detail).toContain('above breed standard');
    expect(r.impact).toBeNull();
  });

  it('formats a negative rupee impact as a weekly cost', () => {
    const insight: Insight = {
      id: 'b1:fcr',
      batchId: 'b1',
      batchCode: 'B-001',
      metric: 'fcr',
      severity: 'warning',
      titleKey: 'insights.fcr.up_title',
      detailKey: 'insights.fcr.detail_bench',
      detailParams: { from: '1.60', to: '1.80', target: '1.55' },
      rupeeImpact: -3600,
      score: 70,
    };
    const r = formatInsight(insight);
    expect(r.detail).toBe('FCR moved 1.60 → 1.80 week-over-week (target 1.55).');
    expect(r.impact).toBe('Costing ~₹3,600/week');
  });
});

describe('computeInsights — quiet farm', () => {
  it('emits nothing when nothing changed', () => {
    const prior = makeLogs('2026-06-07', 7, () => ({ feed_consumed_kg: 100, avg_bird_weight_g: 1000 }));
    const recent = makeLogs('2026-06-14', 7, () => ({ feed_consumed_kg: 100, avg_bird_weight_g: 1000 }));
    const batch: InsightBatchInput = {
      batchId: 'b4',
      batchCode: 'B-004',
      breedName: 'Cobb 500',
      poultryType: 'broiler',
      openingBirdCount: 1000,
      currentBirdCount: 1000,
      placementDate: '2026-05-01',
      logs: [...prior, ...recent],
    };
    expect(computeInsights([batch])).toHaveLength(0);
  });
});
