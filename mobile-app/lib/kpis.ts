// Re-export shim — the single implementation lives in packages/shared.
export type { BatchSnapshot, DailyLogRow } from '@poultryos/shared';
export { aggregateFcr, aggregateLivability, fcrTone, livabilityTone } from '@poultryos/shared';
