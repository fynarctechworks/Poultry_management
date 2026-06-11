import { requirePlatformPermission, PlatformForbiddenError } from '@/lib/control/guard';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { Forbidden } from '@/components/control/Forbidden';
import { PlanManager, type PlanListItem } from '@/components/control/PlanManager';

export const dynamic = 'force-dynamic';

export default async function SubscriptionsPage() {
  let service;
  try {
    ({ service } = await requirePlatformPermission('subscription:read'));
  } catch (e) {
    if (e instanceof PlatformForbiddenError) return <Forbidden message={e.message} />;
    throw e;
  }

  const [{ data }, canManageRes] = await Promise.all([
    service
      .from('subscription_plans')
      .select('id, code, name, tier, monthly_price_inr, yearly_price_inr, max_farms, max_users, is_active')
      .order('sort_order'),
    createSupabaseServerClient().rpc('platform_has_permission', { p_perm: 'subscription:manage' }),
  ]);

  const plans = (data ?? []) as PlanListItem[];

  return (
    <div className="max-w-[1100px]">
      <h2 className="text-2xl font-bold text-ink mb-xs">Plans</h2>
      <p className="text-sm text-body-soft mb-xl">
        Plans are database-driven. Edits here update the canonical <code>subscription_plans</code> the app reads — no code changes.
      </p>
      <PlanManager plans={plans} canManage={!!canManageRes.data} />
    </div>
  );
}
