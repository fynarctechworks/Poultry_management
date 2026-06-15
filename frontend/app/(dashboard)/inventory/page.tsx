import Link from 'next/link';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import {
  dailyBurnByFeedType,
  feedStockStatus,
  type FeedConsumptionLog,
} from '@poultryos/shared';

export default async function InventoryPage() {
  const supabase = createSupabaseServerClient();

  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  const [{ data: items }, { data: feedLogs }] = await Promise.all([
    supabase
      .from('inventory_items')
      .select('id, farm_id, item_name, category, unit, current_stock, low_stock_threshold, farms(farm_name)')
      .order('item_name'),
    // Recent feed consumption → days-of-stock burn rate (scoped per farm).
    supabase
      .from('daily_logs')
      .select('farm_id, log_date, feed_type, feed_consumed_kg')
      .gte('log_date', sevenDaysAgo),
  ]);

  // Burn rate is matched within a farm (the deduct trigger is farm-scoped), so
  // build one burn-by-feed-type map per farm.
  const logsByFarm = new Map<string, FeedConsumptionLog[]>();
  for (const l of (feedLogs ?? []) as any[]) {
    const arr = logsByFarm.get(l.farm_id) ?? [];
    arr.push({ log_date: l.log_date, feed_type: l.feed_type, feed_consumed_kg: l.feed_consumed_kg });
    logsByFarm.set(l.farm_id, arr);
  }
  const burnByFarm = new Map<string, Record<string, number>>();
  for (const [farmId, logs] of logsByFarm) {
    burnByFarm.set(farmId, dailyBurnByFeedType(logs, 7));
  }

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
              <th className="px-md py-sm text-right">Days left</th>
              <th className="px-md py-sm">Status</th>
            </tr>
          </thead>
          <tbody>
            {(items ?? []).map((i: any) => {
              const status =
                i.category === 'feed'
                  ? feedStockStatus(
                      {
                        id: i.id,
                        itemName: i.item_name,
                        currentStock: Number(i.current_stock ?? 0),
                        lowStockThreshold: i.low_stock_threshold,
                      },
                      burnByFarm.get(i.farm_id) ?? {},
                    )
                  : null;
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
                  <td className="px-md py-md text-right tabular-nums">
                    {status?.daysLeft != null ? `~${Math.floor(status.daysLeft)}d` : '—'}
                  </td>
                  <td className="px-md py-md">
                    {status && status.severity === 'critical' ? (
                      <span className="px-sm py-xxs rounded-md text-xs font-semibold bg-warning-soft text-danger">Reorder now</span>
                    ) : status && status.severity === 'warning' ? (
                      <span className="px-sm py-xxs rounded-md text-xs font-semibold bg-warning-soft text-warning-ink">Reorder</span>
                    ) : status && status.severity === 'ok' ? (
                      <span className="px-sm py-xxs rounded-md text-xs font-semibold bg-success-soft text-success-ink">OK</span>
                    ) : low ? (
                      <span className="px-sm py-xxs rounded-md text-xs font-semibold bg-warning-soft text-warning-ink">Low</span>
                    ) : (
                      <span className="px-sm py-xxs rounded-md text-xs font-semibold bg-success-soft text-success-ink">OK</span>
                    )}
                  </td>
                </tr>
              );
            })}
            {(!items || items.length === 0) && (
              <tr><td colSpan={7} className="py-2xl text-center text-body">No inventory items.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
