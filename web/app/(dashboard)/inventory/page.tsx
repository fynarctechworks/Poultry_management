import Link from 'next/link';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export default async function InventoryPage() {
  const supabase = createSupabaseServerClient();

  const { data: items } = await supabase
    .from('inventory_items')
    .select('id, item_name, category, unit, current_stock, low_stock_threshold, farms(farm_name)')
    .order('item_name');

  return (
    <div className="max-w-[1100px] mx-auto">
      <div className="flex items-center justify-between mb-2xl flex-wrap gap-md">
        <h1 className="text-3xl font-bold text-ink">Inventory</h1>
        <div className="flex gap-sm">
          <Link href="/inventory/purchase" className="btn-outline">Record purchase</Link>
          <Link href="/inventory/new" className="btn-primary">New item</Link>
        </div>
      </div>

      <div className="card p-0 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-canvas-soft border-b border-mute">
            <tr className="text-left text-xs uppercase tracking-wider text-body-soft">
              <th className="px-md py-sm">Item</th>
              <th className="px-md py-sm">Farm</th>
              <th className="px-md py-sm">Category</th>
              <th className="px-md py-sm text-right">Stock</th>
              <th className="px-md py-sm text-right">Threshold</th>
              <th className="px-md py-sm">Status</th>
            </tr>
          </thead>
          <tbody>
            {(items ?? []).map((i: any) => {
              const low = Number(i.current_stock ?? 0) <= Number(i.low_stock_threshold ?? 0);
              return (
                <tr key={i.id} className="border-b border-mute last:border-0">
                  <td className="px-md py-md font-semibold">
                    <Link href={`/inventory/${i.id}`} className="text-primary-dark">{i.item_name}</Link>
                  </td>
                  <td className="px-md py-md text-body">{i.farms?.farm_name ?? '—'}</td>
                  <td className="px-md py-md text-body">{i.category}</td>
                  <td className="px-md py-md text-right tabular-nums">{i.current_stock} {i.unit}</td>
                  <td className="px-md py-md text-right tabular-nums">{i.low_stock_threshold ?? '—'} {i.unit}</td>
                  <td className="px-md py-md">
                    {low ? (
                      <span className="px-sm py-xxs rounded-md text-xs font-semibold bg-warning-soft text-warning-ink">Low</span>
                    ) : (
                      <span className="px-sm py-xxs rounded-md text-xs font-semibold bg-success-soft text-success-ink">OK</span>
                    )}
                  </td>
                </tr>
              );
            })}
            {(!items || items.length === 0) && (
              <tr><td colSpan={6} className="py-2xl text-center text-body">No inventory items.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
