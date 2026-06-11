// Re-export shim — the single implementation lives in packages/shared.
// Keep importing from '../lib/upi' or import '@poultryos/shared' directly.
export type { UpiPayload } from '@poultryos/shared';
export { isValidVpa, buildUpiUri } from '@poultryos/shared';
