// =============================================================================
// Subscription / billing state — shared types + server fetch helper.
// =============================================================================
// `my_billing_summary()` (SECURITY DEFINER RPC) is the single source of truth
// for the current owner's plan, status, renewal date and write-access. Both the
// global gating banners (Phase D) and the billing portal (Phase E) read it.
// =============================================================================

import { createSupabaseServerClient } from '@/lib/supabase/server';

export interface BillingPlan {
  id: string | null;
  code: string | null;
  name: string | null;
  tier: string | null;
  monthly_price_inr: number | null;
  yearly_price_inr: number | null;
  features: Record<string, unknown> | null;
}

export interface BillingSummary {
  tenant_id: string | null;
  status: string;                 // trial | active | past_due | suspended | cancelled
  is_owner: boolean;
  is_paid: boolean;               // honours the 7-day past_due grace
  is_trial: boolean;
  can_write: boolean;             // false => app is view-only
  cancellable: boolean;           // true only while in trial
  cancelled_at: string | null;
  billing_cycle: 'monthly' | 'yearly' | null;
  trial_ends_at: string | null;
  current_period_end: string | null;
  renewal_at: string | null;
  days_remaining: number | null;  // days to renewal/expiry
  has_subscription: boolean;
  razorpay_subscription_id: string | null;
  plan: BillingPlan | null;
}

/** Fetch the current user's billing summary. Returns null if unauthenticated or RPC fails. */
export async function getBillingSummary(): Promise<BillingSummary | null> {
  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase.rpc('my_billing_summary');
  if (error || !data) return null;
  return data as unknown as BillingSummary;
}
