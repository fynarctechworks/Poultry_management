// PoultryOS — tenant billing reads for the subscription screen + freemium UI.
//
// `is_paid()` (used by useIsPaid) already resolves the tenant + trial state for
// the paid/free binary gate. This hook surfaces the richer tenant-subscription
// detail the billing screen needs: current plan, status, trial countdown, and
// per-tier limits/usage from the `tenant_plan_status` RPC.

import { useCallback, useEffect, useState } from 'react';
import { supabase } from './supabase';

export type SubscriptionStatus = 'trial' | 'active' | 'past_due' | 'suspended' | 'cancelled';
export type BillingCycle = 'monthly' | 'yearly';

export interface TenantPlanStatus {
  tier: string | null;
  max_farms: number | null;
  max_users: number | null;
  used_farms: number;
  used_users: number;
  can_add_farm: boolean;
  can_add_user: boolean;
  features: Record<string, unknown> | null;
  is_paid: boolean;
}

export interface TenantBilling {
  tenantId: string | null;
  status: SubscriptionStatus;
  billingCycle: BillingCycle;
  trialEndsAt: string | null;
  currentPeriodEnd: string | null;
  currentPlanCode: string | null;
  planStatus: TenantPlanStatus | null;
}

const EMPTY: TenantBilling = {
  tenantId: null,
  status: 'trial',
  billingCycle: 'monthly',
  trialEndsAt: null,
  currentPeriodEnd: null,
  currentPlanCode: null,
  planStatus: null,
};

/** Whole-number days left in the trial (clamped at 0); null when not on trial. */
export function trialDaysLeft(billing: TenantBilling): number | null {
  if (billing.status !== 'trial' || !billing.trialEndsAt) return null;
  const ms = new Date(billing.trialEndsAt).getTime() - Date.now();
  return Math.max(0, Math.ceil(ms / (24 * 60 * 60 * 1000)));
}

export function useTenantBilling() {
  const [billing, setBilling] = useState<TenantBilling>(EMPTY);
  const [loading, setLoading] = useState(true);

  const refetch = useCallback(async () => {
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setBilling(EMPTY); return; }

      const { data: profile } = await supabase
        .from('profiles')
        .select('tenant_id')
        .eq('id', user.id)
        .maybeSingle();
      const tenantId = (profile as { tenant_id: string | null } | null)?.tenant_id ?? null;
      if (!tenantId) { setBilling(EMPTY); return; }

      const [{ data: sub }, { data: planStatus }] = await Promise.all([
        supabase
          .from('tenant_subscriptions')
          .select('status, billing_cycle, trial_ends_at, current_period_end, subscription_plans(code)')
          .eq('tenant_id', tenantId)
          .maybeSingle(),
        supabase.rpc('tenant_plan_status', { p_tenant_id: tenantId }),
      ]);

      const subRow = sub as any;
      const planCode = subRow?.subscription_plans && !Array.isArray(subRow.subscription_plans)
        ? subRow.subscription_plans.code
        : Array.isArray(subRow?.subscription_plans)
          ? subRow.subscription_plans[0]?.code ?? null
          : null;

      setBilling({
        tenantId,
        status: (subRow?.status as SubscriptionStatus) ?? 'trial',
        billingCycle: (subRow?.billing_cycle as BillingCycle) ?? 'monthly',
        trialEndsAt: subRow?.trial_ends_at ?? null,
        currentPeriodEnd: subRow?.current_period_end ?? null,
        currentPlanCode: planCode,
        planStatus: (planStatus as TenantPlanStatus) ?? null,
      });
    } catch {
      setBilling(EMPTY);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refetch(); }, [refetch]);

  return { billing, loading, refetch };
}
