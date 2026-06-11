// Formats a contract cycle settlement reconciliation report for WhatsApp.
//
// Plain text only (no markdown). WhatsApp renders newlines and a couple of
// inline emphasis chars (*bold*, _italic_) but it does not render markdown
// tables, so we lay everything out as label/value lines.
//
// Pure function — no React, no Supabase. Easy to unit-test.

import { formatDDMMMYYYY } from './format-date';

export interface ContractReportInputs {
  batchCode: string | null;
  integratorName: string | null;
  breedName?: string | null;
  status: 'active' | 'harvest_complete' | 'settled' | 'disputed';

  // Integrator inputs
  chicksSupplied: number;
  chicksSuppliedDate: string;
  totalFeedSuppliedKg: number;

  // Performance
  birdsDelivered: number | null;
  avgWeightKg: number | null;
  actualFcr: number | null;
  actualMortalityPct: number | null;
  actualHarvestDate: string | null;

  // Settlement breakdown (from calculate_contract_settlement RPC)
  liveWeightKg?: number | null;
  baseAmount?: number | null;
  fcrBonus?: number | null;
  mortalityBonus?: number | null;
  expectedSettlement: number | null;
  actualSettlement: number | null;
  settlementReceivedDate: string | null;

  disputeNotes?: string | null;

  // Optional: human-readable farm name shown at the top
  farmName?: string | null;
}

const INR = (n: number | null | undefined): string => {
  if (n === null || n === undefined) return '—';
  const num = Number(n);
  if (Number.isNaN(num)) return '—';
  return `₹${num.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
};

const NUM = (n: number | null | undefined, suffix = ''): string => {
  if (n === null || n === undefined) return '—';
  return `${Number(n).toLocaleString('en-IN', { maximumFractionDigits: 2 })}${suffix}`;
};

const STATUS_LABEL: Record<ContractReportInputs['status'], string> = {
  active: 'Active',
  harvest_complete: 'Harvest complete',
  settled: 'Settled',
  disputed: 'Disputed',
};

/**
 * Builds the structured WhatsApp text body. Designed to fit comfortably on a
 * single message in WhatsApp (no media), readable on a 4" phone screen.
 *
 * Delta semantics:
 *   delta = actual − expected
 *   positive = integrator paid more than tariff calculation
 *   negative = integrator underpaid → dispute trigger
 */
export function buildSettlementReport(input: ContractReportInputs): string {
  const lines: string[] = [];

  // Header
  lines.push(
    `*Contract settlement — ${input.batchCode ?? 'Cycle'}*`,
  );
  if (input.farmName) {
    lines.push(input.farmName);
  }
  if (input.integratorName) {
    lines.push(`Integrator: ${input.integratorName}`);
  }
  if (input.breedName) {
    lines.push(`Breed: ${input.breedName}`);
  }
  lines.push(`Status: ${STATUS_LABEL[input.status]}`);
  lines.push('');

  // Integrator inputs
  lines.push('*Integrator inputs*');
  lines.push(`Chicks supplied: ${NUM(input.chicksSupplied)}`);
  lines.push(`Placed on: ${formatDDMMMYYYY(input.chicksSuppliedDate)}`);
  lines.push(`Feed supplied: ${NUM(input.totalFeedSuppliedKg, ' kg')}`);
  lines.push('');

  // Performance
  lines.push('*Cycle performance*');
  lines.push(
    `Birds delivered: ${input.birdsDelivered !== null ? NUM(input.birdsDelivered) : '—'}`,
  );
  lines.push(`Avg weight: ${NUM(input.avgWeightKg, ' kg')}`);
  lines.push(`Actual FCR: ${NUM(input.actualFcr)}`);
  lines.push(`Mortality: ${NUM(input.actualMortalityPct, '%')}`);
  if (input.actualHarvestDate) {
    lines.push(`Harvested: ${formatDDMMMYYYY(input.actualHarvestDate)}`);
  }
  lines.push('');

  // Settlement breakdown
  lines.push('*Settlement (expected per tariff)*');
  if (input.liveWeightKg !== null && input.liveWeightKg !== undefined) {
    lines.push(`Live weight: ${NUM(input.liveWeightKg, ' kg')}`);
  }
  if (input.baseAmount !== null && input.baseAmount !== undefined) {
    lines.push(`Base amount: ${INR(input.baseAmount)}`);
  }
  if (input.fcrBonus !== null && input.fcrBonus !== undefined) {
    lines.push(`FCR bonus: ${INR(input.fcrBonus)}`);
  }
  if (input.mortalityBonus !== null && input.mortalityBonus !== undefined) {
    lines.push(`Mortality bonus: ${INR(input.mortalityBonus)}`);
  }
  lines.push(`Expected total: ${INR(input.expectedSettlement)}`);
  lines.push('');

  // Reconciliation
  const hasActual =
    input.actualSettlement !== null && input.actualSettlement !== undefined;
  if (hasActual) {
    lines.push('*Reconciliation*');
    lines.push(`Actual received: ${INR(input.actualSettlement)}`);
    if (
      input.expectedSettlement !== null &&
      input.expectedSettlement !== undefined
    ) {
      const delta =
        Number(input.actualSettlement) - Number(input.expectedSettlement);
      const sign = delta >= 0 ? '+' : '−';
      lines.push(`Delta (actual − expected): ${sign}${INR(Math.abs(delta))}`);
    }
    if (input.settlementReceivedDate) {
      lines.push(`Received on: ${formatDDMMMYYYY(input.settlementReceivedDate)}`);
    }
    lines.push('');
  }

  // Dispute
  if (input.disputeNotes && input.disputeNotes.trim().length > 0) {
    lines.push('*Dispute notes*');
    lines.push(input.disputeNotes.trim());
    lines.push('');
  }

  lines.push('— Sent from PoultryOS');

  // Trim trailing empty lines & collapse 3+ newlines to 2
  return lines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}
