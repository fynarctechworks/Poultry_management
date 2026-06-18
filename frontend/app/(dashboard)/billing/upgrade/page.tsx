import { redirect } from 'next/navigation';
import Link from 'next/link';
import { ChevronLeft } from '@/components/icons';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { getBillingSummary } from '@/lib/subscription';
import { UpgradeFlow, type PlanCard, type BillingProfile } from './UpgradeFlow';

export const dynamic = 'force-dynamic';

export default async function UpgradePage() {
  const summary = await getBillingSummary();

  // Only the tenant owner can manage the subscription.
  if (!summary?.is_owner) redirect('/billing');

  const supabase = createSupabaseServerClient();
  const [{ data: planRows }, { data: profile }] = await Promise.all([
    supabase
      .from('subscription_plans')
      .select('id, code, name, tier, monthly_price_inr, yearly_price_inr, is_contactable, recommended, features_json, sort_order')
      .eq('is_active', true)
      .order('sort_order'),
    summary.tenant_id
      ? supabase
          .from('billing_profiles')
          .select('billing_name, company_name, gstin, email, phone, address_line1, city, state, postal_code, country')
          .eq('tenant_id', summary.tenant_id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  const plans: PlanCard[] = (planRows ?? []).map((p) => ({
    id: p.id,
    code: p.code,
    name: p.name,
    tier: p.tier ?? null,
    monthly_price_inr: Number(p.monthly_price_inr ?? 0),
    yearly_price_inr: Number(p.yearly_price_inr ?? 0),
    is_contactable: Boolean(p.is_contactable),
    recommended: Boolean(p.recommended),
    features_json: (p.features_json ?? {}) as Record<string, unknown>,
  }));

  return (
    <div className="max-w-[1080px] mx-auto">
      <Link href="/billing" className="inline-flex items-center gap-xxs text-sm font-semibold text-body hover:text-ink mb-md">
        <ChevronLeft size={16} /> Back to billing
      </Link>

      <UpgradeFlow
        plans={plans}
        currentPlanCode={summary.plan?.code ?? null}
        currentCycle={(summary.billing_cycle ?? 'monthly') as 'monthly' | 'yearly'}
        hasRazorpaySub={Boolean(summary.razorpay_subscription_id)}
        isTrial={summary.is_trial}
        profile={(profile as BillingProfile | null) ?? null}
      />
    </div>
  );
}
