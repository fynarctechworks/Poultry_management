import { requirePlatformPermission, PlatformForbiddenError } from '@/lib/control/guard';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { Forbidden } from '@/components/control/Forbidden';
import { PlanManager, type PlanListItem, type FeatureCatalogItem } from '@/components/control/PlanManager';

export const dynamic = 'force-dynamic';

export default async function SubscriptionsPage() {
  let service;
  try {
    ({ service } = await requirePlatformPermission('subscription:read'));
  } catch (e) {
    if (e instanceof PlatformForbiddenError) return <Forbidden message={e.message} />;
    throw e;
  }

  const [{ data }, { data: featureRows }, canManageRes] = await Promise.all([
    service
      .from('subscription_plans')
      .select('id, code, name, tier, monthly_price_inr, yearly_price_inr, max_farms, max_users, is_active, recommended, is_contactable, features_json')
      .order('sort_order'),
    service
      .from('subscription_features')
      .select('code, name, value_type, category, sort_order')
      .order('sort_order'),
    createSupabaseServerClient().rpc('platform_has_permission', { p_perm: 'subscription:manage' }),
  ]);

  const plans = (data ?? []) as PlanListItem[];
  const features = (featureRows ?? []) as FeatureCatalogItem[];

  return (
    <div className="max-w-[1100px]">
      <h2 className="font-display text-[2rem] text-ink mb-xs">Plans</h2>
      <p className="text-sm text-body-soft mb-xl">
        Plans are database-driven. Edits here update the canonical <code>subscription_plans</code> the app reads — no code changes.
        Click any plan to view and edit its full feature set.
      </p>
      <PlanManager plans={plans} features={features} canManage={!!canManageRes.data} />
    </div>
  );
}
