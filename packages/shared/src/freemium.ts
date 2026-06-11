// PoultryOS — client-side freemium gate helpers.
//
// Mirrors the limits in CLAUDE.md "Freemium Enforcement" table. These are
// presentation-layer guards; server-side enforcement lives in is_paid() and
// the send-whatsapp-message Edge Function (5/month gate).
//
// All helpers in this file are pure functions for easy unit testing.
// The `useIsPaid` React hook lives in the app layers to keep this file
// import-light (no Supabase client init at test time).

export const FREE_LIMITS = {
  farms: 1,
  sheds: 3,
  workers: 2,
  buyers: 10,
  whatsappPerMonth: 5,
} as const;

export interface GateResult {
  allowed: boolean;
  reason?: string;
}

function paidGate(isPaid: boolean): GateResult | null {
  if (isPaid) return { allowed: true };
  return null;
}

export function canAddBuyer(currentCount: number, isPaid: boolean): GateResult {
  const ok = paidGate(isPaid);
  if (ok) return ok;
  if (currentCount < FREE_LIMITS.buyers) return { allowed: true };
  return {
    allowed: false,
    reason: `Free plan is capped at ${FREE_LIMITS.buyers} buyers. Upgrade for unlimited buyers.`,
  };
}

export function canAddShed(currentCount: number, isPaid: boolean): GateResult {
  const ok = paidGate(isPaid);
  if (ok) return ok;
  if (currentCount < FREE_LIMITS.sheds) return { allowed: true };
  return {
    allowed: false,
    reason: `Free plan is capped at ${FREE_LIMITS.sheds} sheds. Upgrade for unlimited sheds.`,
  };
}

export function canAddWorker(currentCount: number, isPaid: boolean): GateResult {
  const ok = paidGate(isPaid);
  if (ok) return ok;
  if (currentCount < FREE_LIMITS.workers) return { allowed: true };
  return {
    allowed: false,
    reason: `Free plan is capped at ${FREE_LIMITS.workers} workers. Upgrade for unlimited workers.`,
  };
}

export function canAddFarm(currentCount: number, isPaid: boolean): GateResult {
  const ok = paidGate(isPaid);
  if (ok) return ok;
  if (currentCount < FREE_LIMITS.farms) return { allowed: true };
  return {
    allowed: false,
    reason: `Free plan is limited to ${FREE_LIMITS.farms} farm. Upgrade to manage multiple farms.`,
  };
}

export function hasContractAccess(isPaid: boolean): GateResult {
  if (isPaid) return { allowed: true };
  return {
    allowed: false,
    reason: 'Contract farming is a paid feature. Upgrade to access integrator dashboards and settlement.',
  };
}

export function hasTraceability(isPaid: boolean): GateResult {
  if (isPaid) return { allowed: true };
  return {
    allowed: false,
    reason: 'Traceability QR & certificate downloads require a paid plan.',
  };
}

export function hasMultiFarmDashboard(isPaid: boolean): GateResult {
  if (isPaid) return { allowed: true };
  return {
    allowed: false,
    reason: 'Multi-farm consolidated dashboard requires a paid plan.',
  };
}

export function hasVetAccess(isPaid: boolean): GateResult {
  if (isPaid) return { allowed: true };
  return {
    allowed: false,
    reason: 'Vet collaboration role requires a paid plan.',
  };
}

/** Usage-meter descriptor for "3/5 used this month" surfaces (blueprint §9.6). */
export interface UsageMeter {
  used: number;
  limit: number | null; // null = unlimited (paid)
  remaining: number | null;
  /** True when the meter should surface a warning (≥80% used on free). */
  nearLimit: boolean;
}

export function whatsappUsageMeter(usedThisMonth: number, isPaid: boolean): UsageMeter {
  if (isPaid) return { used: usedThisMonth, limit: null, remaining: null, nearLimit: false };
  const limit = FREE_LIMITS.whatsappPerMonth;
  const remaining = Math.max(0, limit - usedThisMonth);
  return { used: usedThisMonth, limit, remaining, nearLimit: usedThisMonth >= limit * 0.8 };
}

export function buyerUsageMeter(buyerCount: number, isPaid: boolean): UsageMeter {
  if (isPaid) return { used: buyerCount, limit: null, remaining: null, nearLimit: false };
  const limit = FREE_LIMITS.buyers;
  const remaining = Math.max(0, limit - buyerCount);
  return { used: buyerCount, limit, remaining, nearLimit: buyerCount >= limit * 0.8 };
}
