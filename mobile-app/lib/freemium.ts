// Re-export shim — the single implementation lives in packages/shared.
// The `useIsPaid` React hook stays in `freemium-hooks.ts`.
export type { GateResult, UsageMeter } from '@poultryos/shared';
export {
  FREE_LIMITS,
  canAddBuyer,
  canAddShed,
  canAddWorker,
  canAddFarm,
  hasContractAccess,
  hasTraceability,
  hasMultiFarmDashboard,
  hasVetAccess,
  whatsappUsageMeter,
  buyerUsageMeter,
} from '@poultryos/shared';
