import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requirePlatformPermission, PlatformForbiddenError } from '@/lib/control/guard';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { Forbidden } from '@/components/control/Forbidden';
import { PlanFeatureEditor, type FeatureDef } from '@/components/control/PlanFeatureEditor';

export const dynamic = 'force-dynamic';

export default async function PlanDetailPage({ params }: { params: { id: string } }) {
  let service;
  try {
    ({ service } = await requirePlatformPermission('subscription:read'));
  } catch (e) {
    if (e instanceof PlatformForbiddenError) return <Forbidden message={e.message} />;
    throw e;
  }

  const [{ data: plan }, { data: features }, canManageRes, { data: history }] = await Promise.all([
    service.from('subscription_plans')
      .select('id, code, name, tier, monthly_price_inr, yearly_price_inr, max_farms, max_users, is_active, features_json')
      .eq('id', params.id).maybeSingle(),
    service.from('subscription_features').select('code, name, value_type').order('sort_order'),
    createSupabaseServerClient().rpc('platform_has_permission', { p_perm: 'subscription:manage' }),
    service.from('plan_history').select('action, created_at').eq('plan_id', params.id).order('created_at', { ascending: false }).limit(10),
  ]);

  if (!plan) notFound();
  const canManage = !!canManageRes.data;

  return (
    <div className="max-w-[900px]">
      <Link href="/admin/subscriptions" className="text-sm text-body-soft hover:text-ink">← All plans</Link>
      <div className="flex items-center gap-md mt-sm mb-lg">
        <h2 className="font-display text-[2rem] text-ink">{plan.name}</h2>
        <span className="text-xs font-mono text-body-soft">{plan.code}</span>
        <span className={`text-[11px] font-bold uppercase rounded-sm px-xs py-px ${plan.is_active ? 'bg-success-soft text-success-ink' : 'bg-mute-soft text-body'}`}>
          {plan.is_active ? 'active' : 'archived'}
        </span>
      </div>

      <div className="grid md:grid-cols-2 gap-lg mb-lg">
        <div className="bg-canvas border border-mute rounded-card p-lg text-sm grid grid-cols-2 gap-sm">
          <span className="text-body-soft">Tier</span><span className="text-ink">{plan.tier ?? '—'}</span>
          <span className="text-body-soft">Monthly</span><span className="text-ink">₹{(plan.monthly_price_inr ?? 0).toLocaleString('en-IN')}</span>
          <span className="text-body-soft">Yearly</span><span className="text-ink">₹{(plan.yearly_price_inr ?? 0).toLocaleString('en-IN')}</span>
          <span className="text-body-soft">Max farms</span><span className="text-ink">{plan.max_farms ?? '∞'}</span>
          <span className="text-body-soft">Max users</span><span className="text-ink">{plan.max_users ?? '∞'}</span>
        </div>

        <PlanFeatureEditor
          planId={plan.id}
          features={(features ?? []) as FeatureDef[]}
          values={(plan.features_json ?? {}) as Record<string, unknown>}
          canManage={canManage}
        />
      </div>

      <div className="bg-canvas border border-mute rounded-card p-lg">
        <h3 className="text-sm font-bold text-ink mb-md">Change history</h3>
        {(history?.length ?? 0) === 0 ? (
          <p className="text-sm text-body-soft">No changes recorded.</p>
        ) : (
          <ul className="text-sm divide-y divide-mute">
            {history!.map((h, i) => (
              <li key={i} className="flex justify-between py-xs">
                <span className="font-semibold text-ink capitalize">{h.action.replace('_', ' ')}</span>
                <span className="text-body-soft">{new Date(h.created_at).toLocaleString('en-IN')}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
