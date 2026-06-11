import { requirePlatformPermission, PlatformForbiddenError } from '@/lib/control/guard';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { Forbidden } from '@/components/control/Forbidden';
import { DiscountTools } from '@/components/control/DiscountTools';

export const dynamic = 'force-dynamic';

export default async function DiscountsPage() {
  let service;
  try {
    ({ service } = await requirePlatformPermission('discount:read'));
  } catch (e) {
    if (e instanceof PlatformForbiddenError) return <Forbidden message={e.message} />;
    throw e;
  }

  const [{ data: discounts }, { data: coupons }, canManageRes] = await Promise.all([
    service.from('discounts')
      .select('id, name, discount_type, value, scope, max_redemptions, redeemed_count, is_active, created_at')
      .order('created_at', { ascending: false }).limit(100),
    service.from('coupon_codes')
      .select('code, max_per_tenant, is_active, discounts(name)')
      .order('created_at', { ascending: false }).limit(100),
    createSupabaseServerClient().rpc('platform_has_permission', { p_perm: 'discount:manage' }),
  ]);

  const discountList = (discounts ?? []) as any[];

  return (
    <div className="max-w-[1100px]">
      <h2 className="text-2xl font-bold text-ink mb-xs">Discounts &amp; Coupons</h2>
      <p className="text-sm text-body-soft mb-xl">Flat / percentage discounts delivered as coupon codes, custom grants or promotions.</p>

      <DiscountTools discounts={discountList.map((d) => ({ id: d.id, name: d.name }))} canManage={!!canManageRes.data} />

      <h3 className="text-sm font-bold text-ink mt-2xl mb-md">Discounts</h3>
      <div className="bg-canvas border border-mute rounded-card overflow-hidden mb-2xl">
        <table className="w-full text-sm">
          <thead><tr className="text-left text-body-soft border-b border-mute">
            <th className="px-md py-sm font-semibold">Name</th>
            <th className="px-md py-sm font-semibold">Value</th>
            <th className="px-md py-sm font-semibold">Scope</th>
            <th className="px-md py-sm font-semibold">Used</th>
            <th className="px-md py-sm font-semibold">State</th>
          </tr></thead>
          <tbody>
            {discountList.length === 0 ? (
              <tr><td colSpan={5} className="px-md py-xl text-center text-body-soft">No discounts yet.</td></tr>
            ) : discountList.map((d) => (
              <tr key={d.id} className="border-b border-mute last:border-0">
                <td className="px-md py-sm text-ink font-semibold">{d.name}</td>
                <td className="px-md py-sm text-body">{d.discount_type === 'percentage' ? `${d.value}%` : `₹${d.value}`}</td>
                <td className="px-md py-sm text-body capitalize">{d.scope}</td>
                <td className="px-md py-sm text-body-soft">{d.redeemed_count}{d.max_redemptions ? ` / ${d.max_redemptions}` : ''}</td>
                <td className="px-md py-sm">
                  <span className={`text-[11px] font-bold uppercase rounded-sm px-xs py-px ${d.is_active ? 'bg-success-soft text-success-ink' : 'bg-mute-soft text-body'}`}>
                    {d.is_active ? 'active' : 'inactive'}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h3 className="text-sm font-bold text-ink mb-md">Coupon codes</h3>
      <div className="bg-canvas border border-mute rounded-card overflow-hidden">
        <table className="w-full text-sm">
          <thead><tr className="text-left text-body-soft border-b border-mute">
            <th className="px-md py-sm font-semibold">Code</th>
            <th className="px-md py-sm font-semibold">Discount</th>
            <th className="px-md py-sm font-semibold">Max / tenant</th>
            <th className="px-md py-sm font-semibold">State</th>
          </tr></thead>
          <tbody>
            {(coupons?.length ?? 0) === 0 ? (
              <tr><td colSpan={4} className="px-md py-xl text-center text-body-soft">No coupon codes yet.</td></tr>
            ) : (coupons as any[]).map((c) => (
              <tr key={c.code} className="border-b border-mute last:border-0">
                <td className="px-md py-sm font-mono font-semibold text-ink">{c.code}</td>
                <td className="px-md py-sm text-body">{c.discounts?.name ?? '—'}</td>
                <td className="px-md py-sm text-body-soft">{c.max_per_tenant}</td>
                <td className="px-md py-sm">
                  <span className={`text-[11px] font-bold uppercase rounded-sm px-xs py-px ${c.is_active ? 'bg-success-soft text-success-ink' : 'bg-mute-soft text-body'}`}>
                    {c.is_active ? 'active' : 'inactive'}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
