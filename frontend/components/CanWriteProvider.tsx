'use client';

// =============================================================================
// Phase D — read-only mode client context.
// The dashboard server layout knows `can_write` (from my_billing_summary). This
// provider exposes it to client components so write affordances (create/edit/
// delete buttons, FABs) can disable themselves. The DB still enforces the rule
// via the tenant_can_write() triggers — this is purely UX, never the gate.
// =============================================================================

import { createContext, useContext } from 'react';

const CanWriteContext = createContext<boolean>(true);

export function CanWriteProvider({ canWrite, children }: { canWrite: boolean; children: React.ReactNode }) {
  return <CanWriteContext.Provider value={canWrite}>{children}</CanWriteContext.Provider>;
}

/** True when the tenant may create/edit/delete. False => view-only (subscription lapsed). */
export function useCanWrite(): boolean {
  return useContext(CanWriteContext);
}
