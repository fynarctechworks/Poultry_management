import { requirePlatformPermission, PlatformForbiddenError } from '@/lib/control/guard';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { Forbidden } from '@/components/control/Forbidden';
import { FlagManager, type FlagRow } from '@/components/control/FlagManager';

export const dynamic = 'force-dynamic';

export default async function FlagsPage() {
  let service;
  try {
    ({ service } = await requirePlatformPermission('flag:read'));
  } catch (e) {
    if (e instanceof PlatformForbiddenError) return <Forbidden message={e.message} />;
    throw e;
  }

  const [{ data }, canManageRes] = await Promise.all([
    service.from('feature_flags').select('id, key, name, description, is_enabled, rollout_percentage').order('key'),
    createSupabaseServerClient().rpc('platform_has_permission', { p_perm: 'flag:manage' }),
  ]);

  return (
    <div className="max-w-[1000px]">
      <h2 className="text-2xl font-bold text-ink mb-xs">Feature Flags</h2>
      <p className="text-sm text-body-soft mb-xl">
        Global flags with percentage rollouts. Resolution: tenant override → plan override → global + rollout.
        Anything can resolve a flag via <code>tenant_feature(tenant, key)</code>.
      </p>
      <FlagManager flags={(data ?? []) as FlagRow[]} canManage={!!canManageRes.data} />
    </div>
  );
}
