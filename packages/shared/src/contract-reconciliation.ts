// Contract settlement reconciliation.
//
// A contract grower's income is a growing charge per kg of live bird lifted,
// plus FCR / mortality performance bonuses. Weeks after lifting, the integrator
// sends a settlement statement with THEIR figures and an amount. The grower has
// no independent way to check it. This engine does exactly that: it computes the
// settlement two ways — from the grower's own logged data and from the
// integrator's stated figures, through the same (grower-confirmed) tariff card —
// and decomposes the gap line by line so each performance discrepancy carries a
// rupee impact.
//
// The settlement math here MUST stay in lockstep with the DB function
// public.calculate_contract_settlement (see
// supabase/migrations/20260616000001_contract_settlement_reconciliation.sql).
//
// Pure functions — no React, no Supabase, no i18n. The UI localises line keys.

import { formatINR, formatNumber } from './format';
import { formatDDMMMYYYY } from './format-date';

export interface ContractTariff {
  /** ₹ per kg of live weight lifted. */
  baseGrowingChargePerKg: number;
  /** FCR at or below `threshold` earns `bonusPerKg` extra ₹/kg. */
  fcrBonus?: { threshold: number; bonusPerKg: number } | null;
  /** Mortality % at or below `thresholdPct` earns `bonusPerKg` extra ₹/kg. */
  mortalityBonus?: { thresholdPct: number; bonusPerKg: number } | null;
}

export interface ContractFigures {
  birdsLifted: number;
  avgWeightKg: number;
  /** Null when not recorded — the corresponding bonus is then treated as not earned. */
  fcr: number | null;
  mortalityPct: number | null;
}

export interface SettlementBreakdown {
  liveWeightKg: number;
  base: number;
  fcrBonus: number;
  mortalityBonus: number;
  total: number;
}

/** The four performance figures whose gaps drive the settlement difference. */
export type ReconLineKey = 'birds_lifted' | 'avg_weight' | 'fcr' | 'mortality';

export interface ReconLine {
  key: ReconLineKey;
  yourValue: number | null;
  integratorValue: number | null;
  /** yourValue − integratorValue (null when either side is missing). */
  delta: number | null;
  /**
   * ₹ the gap on this single figure is worth, holding the others at the
   * integrator's stated values then progressively adopting yours (sequential
   * attribution). Positive = this line favours the grower (you may be owed it).
   */
  rupeeImpact: number;
}

export interface ContractReconciliation {
  /** Settlement implied by the grower's own figures + tariff. */
  yourSettlement: SettlementBreakdown;
  /** Settlement implied by the integrator's stated figures + the same tariff. */
  integratorComputedSettlement: SettlementBreakdown;
  /** The amount the integrator actually stated/paid, if entered. */
  integratorStatedAmount: number | null;
  /** Per-figure breakdown; rupeeImpact values sum to (yourTotal − integratorComputedTotal). */
  lines: ReconLine[];
  /**
   * Bottom line the grower cares about: your expected settlement − what the
   * integrator stated. Positive = you may be underpaid. Null if no stated amount.
   */
  expectedVsStatedGap: number | null;
  /**
   * Internal-consistency check on the integrator's own statement: settlement
   * their figures imply (via tariff) − the amount they stated. A non-zero value
   * means their arithmetic / unstated deductions don't match their own figures.
   */
  statementArithmeticGap: number | null;
  /** True once the grower has confirmed the tariff terms used for this cycle. */
  tariffConfirmed: boolean;
}

function n(v: number | null | undefined): number {
  const x = Number(v ?? 0);
  return Number.isFinite(x) ? x : 0;
}

/**
 * Settlement for a set of figures under a tariff. Mirrors the DB function:
 * a bonus applies only when its figure is present, its threshold is positive,
 * and the figure is at or below the threshold.
 */
export function settlementFor(tariff: ContractTariff, fig: ContractFigures): SettlementBreakdown {
  const liveWeightKg = Math.max(0, n(fig.birdsLifted)) * Math.max(0, n(fig.avgWeightKg));
  const base = n(tariff.baseGrowingChargePerKg) * liveWeightKg;

  const fcrThresh = n(tariff.fcrBonus?.threshold);
  const fcrBonus =
    fig.fcr != null && fcrThresh > 0 && n(fig.fcr) <= fcrThresh
      ? n(tariff.fcrBonus?.bonusPerKg) * liveWeightKg
      : 0;

  const mortThresh = n(tariff.mortalityBonus?.thresholdPct);
  const mortalityBonus =
    fig.mortalityPct != null && mortThresh > 0 && n(fig.mortalityPct) <= mortThresh
      ? n(tariff.mortalityBonus?.bonusPerKg) * liveWeightKg
      : 0;

  return { liveWeightKg, base, fcrBonus, mortalityBonus, total: base + fcrBonus + mortalityBonus };
}

export interface ReconciliationInput {
  tariff: ContractTariff;
  your: ContractFigures;
  integrator: Partial<ContractFigures>;
  integratorStatedAmount?: number | null;
  tariffConfirmed?: boolean;
}

/**
 * Build the full reconciliation. The line breakdown uses sequential attribution:
 * start from the integrator's stated figures, then adopt the grower's value one
 * figure at a time (order: birds → weight → FCR → mortality), measuring the ₹
 * change at each step. This guarantees the line impacts sum exactly to
 * (yourSettlement.total − integratorComputedSettlement.total), so the breakdown
 * always reconciles to the headline — no leftover interaction term to explain.
 */
export function computeContractReconciliation(input: ReconciliationInput): ContractReconciliation {
  const { tariff, your } = input;

  // Integrator figures fall back to the grower's where the integrator didn't
  // state one (a missing figure can't be a discrepancy).
  const integrator: ContractFigures = {
    birdsLifted: input.integrator.birdsLifted ?? your.birdsLifted,
    avgWeightKg: input.integrator.avgWeightKg ?? your.avgWeightKg,
    fcr: input.integrator.fcr ?? your.fcr,
    mortalityPct: input.integrator.mortalityPct ?? your.mortalityPct,
  };

  const yourSettlement = settlementFor(tariff, your);
  const integratorComputedSettlement = settlementFor(tariff, integrator);

  // Sequential swap from integrator → your figures.
  const order: ReconLineKey[] = ['birds_lifted', 'avg_weight', 'fcr', 'mortality'];
  const field: Record<ReconLineKey, keyof ContractFigures> = {
    birds_lifted: 'birdsLifted',
    avg_weight: 'avgWeightKg',
    fcr: 'fcr',
    mortality: 'mortalityPct',
  };

  const running: ContractFigures = { ...integrator };
  let prevTotal = integratorComputedSettlement.total;

  const lines: ReconLine[] = order.map((key) => {
    const f = field[key];
    (running[f] as ContractFigures[typeof f]) = your[f];
    const total = settlementFor(tariff, running).total;
    const rupeeImpact = total - prevTotal;
    prevTotal = total;

    const yourValue = your[f] == null ? null : Number(your[f]);
    const integratorValue =
      input.integrator[f] == null ? null : Number(input.integrator[f] as number);
    const delta = yourValue != null && integratorValue != null ? yourValue - integratorValue : null;

    return { key, yourValue, integratorValue, delta, rupeeImpact };
  });

  const stated = input.integratorStatedAmount ?? null;

  return {
    yourSettlement,
    integratorComputedSettlement,
    integratorStatedAmount: stated,
    lines,
    expectedVsStatedGap: stated == null ? null : yourSettlement.total - stated,
    statementArithmeticGap: stated == null ? null : integratorComputedSettlement.total - stated,
    tariffConfirmed: input.tariffConfirmed ?? false,
  };
}

/**
 * Parse a stored tariff_card_json / tariff_card_snapshot (DB snake_case shape)
 * into the typed ContractTariff this engine consumes. Tolerates partial cards.
 */
export function parseTariffCard(raw: unknown): ContractTariff {
  const card = (raw ?? {}) as Record<string, any>;
  const fcr = card.fcr_bonus ?? null;
  const mort = card.mortality_bonus ?? null;
  return {
    baseGrowingChargePerKg: n(card.base_growing_charge_per_kg),
    fcrBonus:
      fcr && fcr.threshold != null
        ? { threshold: n(fcr.threshold), bonusPerKg: n(fcr.bonus_per_kg) }
        : null,
    mortalityBonus:
      mort && mort.threshold_pct != null
        ? { thresholdPct: n(mort.threshold_pct), bonusPerKg: n(mort.bonus_per_kg) }
        : null,
  };
}

/** Serialise a ContractTariff back to the stored snake_case shape (for snapshots). */
export function serializeTariffCard(t: ContractTariff): Record<string, unknown> {
  const out: Record<string, unknown> = {
    base_growing_charge_per_kg: t.baseGrowingChargePerKg,
  };
  if (t.fcrBonus) {
    out.fcr_bonus = { threshold: t.fcrBonus.threshold, bonus_per_kg: t.fcrBonus.bonusPerKg };
  }
  if (t.mortalityBonus) {
    out.mortality_bonus = {
      threshold_pct: t.mortalityBonus.thresholdPct,
      bonus_per_kg: t.mortalityBonus.bonusPerKg,
    };
  }
  return out;
}

// ── WhatsApp dispute / reconciliation summary ─────────────────────────────────
// English-only plain text (WhatsApp renders newlines + *bold*/_italic_ but not
// tables). Shared so mobile and web produce an identical, defensible message.

export interface ReconciliationMessageContext {
  batchCode?: string | null;
  farmName?: string | null;
  integratorName?: string | null;
  breedName?: string | null;
  chicksSupplied?: number | null;
  totalFeedSuppliedKg?: number | null;
  harvestDate?: string | null;
  settlementReceivedDate?: string | null;
  disputeNotes?: string | null;
  your: ContractFigures;
  /** Integrator-stated figures (only the keys they provided). */
  integrator: Partial<ContractFigures>;
}

const LINE_LABEL: Record<ReconLineKey, string> = {
  birds_lifted: 'Birds lifted',
  avg_weight: 'Avg weight (kg)',
  fcr: 'FCR',
  mortality: 'Mortality %',
};

const signedINR = (v: number): string => `${v >= 0 ? '+' : '−'}${formatINR(Math.abs(v))}`;

/**
 * Build the full WhatsApp reconciliation message from a computed reconciliation
 * plus its surrounding context. Leads with the headline ("you may be owed ₹X"),
 * then a your-vs-integrator table and the per-line rupee impact of each gap.
 */
export function buildContractReconciliationMessage(
  recon: ContractReconciliation,
  ctx: ReconciliationMessageContext,
): string {
  const lines: string[] = [];
  const num = (v: number | null | undefined, suffix = '') =>
    v == null ? '—' : `${formatNumber(v)}${suffix}`;

  lines.push(`*Contract settlement — ${ctx.batchCode ?? 'Cycle'}*`);
  if (ctx.farmName) lines.push(ctx.farmName);
  if (ctx.integratorName) lines.push(`Integrator: ${ctx.integratorName}`);
  if (ctx.breedName) lines.push(`Breed: ${ctx.breedName}`);
  lines.push('');

  // Headline
  const gap = recon.expectedVsStatedGap;
  if (gap != null && Math.abs(gap) >= 1) {
    lines.push(
      gap > 0
        ? `By my records I expect *${formatINR(recon.yourSettlement.total)}*; the statement shows *${formatINR(recon.integratorStatedAmount ?? 0)}* — a *${formatINR(gap)}* difference I'd like to review.`
        : `My expected settlement is *${formatINR(recon.yourSettlement.total)}* vs the stated *${formatINR(recon.integratorStatedAmount ?? 0)}*.`,
    );
    lines.push('');
  } else {
    lines.push(`Expected per tariff: *${formatINR(recon.yourSettlement.total)}*`);
    lines.push('');
  }

  // Side-by-side figures
  lines.push('*My data vs your statement*');
  for (const l of recon.lines) {
    lines.push(`${LINE_LABEL[l.key]}: mine ${num(l.yourValue)} · yours ${num(l.integratorValue)}`);
  }
  lines.push('');

  // Rupee impact of each gap (only the ones that move money)
  const material = recon.lines.filter((l) => Math.abs(l.rupeeImpact) >= 1 && l.delta != null);
  if (material.length) {
    lines.push('*Where the gap is*');
    for (const l of material) {
      lines.push(`${LINE_LABEL[l.key]}: ${signedINR(l.rupeeImpact)}`);
    }
    lines.push('');
  }

  // Context
  if (ctx.chicksSupplied != null) lines.push(`Chicks supplied: ${num(ctx.chicksSupplied)}`);
  if (ctx.totalFeedSuppliedKg != null)
    lines.push(`Feed supplied: ${num(ctx.totalFeedSuppliedKg, ' kg')}`);
  if (ctx.harvestDate) lines.push(`Harvested: ${formatDDMMMYYYY(ctx.harvestDate)}`);
  if (ctx.settlementReceivedDate)
    lines.push(`Settlement received: ${formatDDMMMYYYY(ctx.settlementReceivedDate)}`);

  if (ctx.disputeNotes && ctx.disputeNotes.trim()) {
    lines.push('');
    lines.push('*Notes*');
    lines.push(ctx.disputeNotes.trim());
  }

  lines.push('');
  lines.push('— Sent from PoultryOS');

  return lines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}
