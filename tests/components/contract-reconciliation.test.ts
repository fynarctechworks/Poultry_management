import {
  settlementFor,
  computeContractReconciliation,
  parseTariffCard,
  serializeTariffCard,
  buildContractReconciliationMessage,
  type ContractTariff,
  type ContractFigures,
} from '@poultryos/shared';

// A representative integrator tariff: ₹8/kg base, FCR bonus ₹0.50/kg at ≤1.70,
// mortality bonus ₹0.30/kg at ≤5%.
const tariff: ContractTariff = {
  baseGrowingChargePerKg: 8,
  fcrBonus: { threshold: 1.7, bonusPerKg: 0.5 },
  mortalityBonus: { thresholdPct: 5, bonusPerKg: 0.3 },
};

describe('settlementFor', () => {
  it('computes base + bonuses when both thresholds are met', () => {
    const fig: ContractFigures = { birdsLifted: 10000, avgWeightKg: 2.2, fcr: 1.65, mortalityPct: 4 };
    const s = settlementFor(tariff, fig);
    expect(s.liveWeightKg).toBe(22000);
    expect(s.base).toBe(176000); // 8 × 22000
    expect(s.fcrBonus).toBe(11000); // 0.5 × 22000
    expect(s.mortalityBonus).toBeCloseTo(6600, 5); // 0.3 × 22000
    expect(s.total).toBeCloseTo(193600, 5);
  });

  it('drops a bonus when its figure is above the threshold', () => {
    const fig: ContractFigures = { birdsLifted: 10000, avgWeightKg: 2.2, fcr: 1.78, mortalityPct: 7 };
    const s = settlementFor(tariff, fig);
    expect(s.fcrBonus).toBe(0);
    expect(s.mortalityBonus).toBe(0);
    expect(s.total).toBe(176000);
  });

  it('treats a null figure as "bonus not earned"', () => {
    const fig: ContractFigures = { birdsLifted: 1000, avgWeightKg: 2, fcr: null, mortalityPct: null };
    const s = settlementFor(tariff, fig);
    expect(s.fcrBonus).toBe(0);
    expect(s.mortalityBonus).toBe(0);
    expect(s.total).toBe(16000);
  });
});

describe('computeContractReconciliation', () => {
  it('line rupee impacts sum exactly to the your-vs-integrator-computed gap', () => {
    const your: ContractFigures = { birdsLifted: 9700, avgWeightKg: 2.25, fcr: 1.68, mortalityPct: 3 };
    const integrator = { birdsLifted: 9600, avgWeightKg: 2.18, fcr: 1.74, mortalityPct: 4 };
    const r = computeContractReconciliation({ tariff, your, integrator });

    const lineSum = r.lines.reduce((s, l) => s + l.rupeeImpact, 0);
    const gap = r.yourSettlement.total - r.integratorComputedSettlement.total;
    expect(lineSum).toBeCloseTo(gap, 4);
  });

  it('flags the FCR bonus the grower may be owed when the integrator overstates FCR', () => {
    // Your FCR 1.65 clears the 1.70 bonus; integrator-stated 1.78 does not.
    const your: ContractFigures = { birdsLifted: 10000, avgWeightKg: 2.2, fcr: 1.65, mortalityPct: 4 };
    const integrator = { birdsLifted: 10000, avgWeightKg: 2.2, fcr: 1.78, mortalityPct: 4 };
    const r = computeContractReconciliation({ tariff, your, integrator });

    const fcrLine = r.lines.find((l) => l.key === 'fcr')!;
    // FCR bonus on 22000 kg at ₹0.50 = ₹11,000 the integrator's FCR denies you.
    expect(fcrLine.rupeeImpact).toBeCloseTo(11000, 4);
    expect(fcrLine.yourValue).toBe(1.65);
    expect(fcrLine.integratorValue).toBe(1.78);
    expect(fcrLine.delta).toBeCloseTo(-0.13, 5);
  });

  it('computes expected-vs-stated and statement-arithmetic gaps', () => {
    const your: ContractFigures = { birdsLifted: 10000, avgWeightKg: 2.2, fcr: 1.65, mortalityPct: 4 };
    const integrator = { birdsLifted: 10000, avgWeightKg: 2.2, fcr: 1.78, mortalityPct: 4 };
    // Integrator computed (no FCR bonus) = 176000 + 6600 = 182600; they paid 180000.
    const r = computeContractReconciliation({
      tariff,
      your,
      integrator,
      integratorStatedAmount: 180000,
    });
    expect(r.yourSettlement.total).toBeCloseTo(193600, 4);
    expect(r.integratorComputedSettlement.total).toBeCloseTo(182600, 4);
    expect(r.expectedVsStatedGap).toBeCloseTo(13600, 4); // you may be owed
    expect(r.statementArithmeticGap).toBeCloseTo(2600, 4); // even their own figures imply more than paid
  });

  it('reports no discrepancy when integrator states no figures (falls back to yours)', () => {
    const your: ContractFigures = { birdsLifted: 8000, avgWeightKg: 2.1, fcr: 1.6, mortalityPct: 3 };
    const r = computeContractReconciliation({ tariff, your, integrator: {} });
    expect(r.lines.every((l) => l.rupeeImpact === 0)).toBe(true);
    expect(r.lines.every((l) => l.delta === null)).toBe(true);
    expect(r.yourSettlement.total).toBeCloseTo(r.integratorComputedSettlement.total, 6);
  });

  it('round-trips a stored tariff card through parse/serialize', () => {
    const raw = {
      base_growing_charge_per_kg: 8,
      fcr_bonus: { threshold: 1.7, bonus_per_kg: 0.5 },
      mortality_bonus: { threshold_pct: 5, bonus_per_kg: 0.3 },
    };
    const parsed = parseTariffCard(raw);
    expect(parsed).toEqual(tariff);
    expect(serializeTariffCard(parsed)).toEqual(raw);
  });

  it('parseTariffCard tolerates a partial / empty card', () => {
    expect(parseTariffCard(null)).toEqual({
      baseGrowingChargePerKg: 0,
      fcrBonus: null,
      mortalityBonus: null,
    });
    expect(parseTariffCard({ base_growing_charge_per_kg: 7 }).baseGrowingChargePerKg).toBe(7);
  });
});

describe('buildContractReconciliationMessage', () => {
  const your: ContractFigures = { birdsLifted: 10000, avgWeightKg: 2.2, fcr: 1.65, mortalityPct: 4 };
  const integrator = { birdsLifted: 10000, avgWeightKg: 2.2, fcr: 1.78, mortalityPct: 4 };

  it('leads with the headline and lists the figure gap with rupee impact', () => {
    const recon = computeContractReconciliation({
      tariff,
      your,
      integrator,
      integratorStatedAmount: 180000,
    });
    const msg = buildContractReconciliationMessage(recon, {
      batchCode: 'BR-2026-A',
      farmName: 'Krishna Poultry',
      integratorName: 'Suguna',
      your,
      integrator,
    });
    expect(msg).toContain('BR-2026-A');
    expect(msg).toContain('Krishna Poultry');
    expect(msg).toContain('Integrator: Suguna');
    // Headline: expected 193600 vs stated 180000 → owed ~13600.
    expect(msg).toMatch(/owed|difference|review/i);
    // The FCR gap line with its rupee impact appears under "Where the gap is".
    expect(msg).toContain('Where the gap is');
    expect(msg).toContain('FCR');
    expect(msg).toContain('— Sent from PoultryOS');
  });

  it('omits the gap section when figures match', () => {
    const recon = computeContractReconciliation({ tariff, your, integrator: {} });
    const msg = buildContractReconciliationMessage(recon, { batchCode: 'X', your, integrator: {} });
    expect(msg).not.toContain('Where the gap is');
  });
});
