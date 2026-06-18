import Link from 'next/link';
import { notFound } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { formatCurrencyINR, formatDateDDMonYYYY } from '@/lib/utils';
import { AdjustStockForm } from './AdjustStockForm';
import { DeleteButton } from '@/components/DeleteButton';

export default async function InventoryItemPage({ params }: { params: { id: string } }) {
  const supabase = createSupabaseServerClient();

  const { data: item } = await supabase
    .from('inventory_items')
    .select('id, farm_id, item_name, category, unit, current_stock, low_stock_threshold, farms(farm_name)')
    .eq('id', params.id)
    .maybeSingle();

  if (!item) notFound();
  const it = item as any;
  const low = Number(it.current_stock ?? 0) <= Number(it.low_stock_threshold ?? 0);

  const { data: movements } = await supabase
    .from('inventory_movements')
    .select('id, movement_type, quantity, cost_per_unit, supplier, movement_date, notes')
    .eq('item_id', params.id)
    .order('movement_date', { ascending: false })
    .limit(50);

  const rows = (movements ?? []) as any[];

  return (
    <div className="max-w-[920px] mx-auto">
      <Link href="/inventory" className="text-sm text-primary-dark font-semibold">&larr; Inventory</Link>
      <div className="flex items-baseline justify-between mt-md mb-2xl flex-wrap gap-sm">
        <div>
          <h1 className="font-display text-3xl text-ink">{it.item_name}</h1>
          <p className="text-sm text-body mt-xs">{it.category} · {it.farms?.farm_name ?? '—'}</p>
        </div>
        <div className="flex items-center gap-md">
          {low
            ? <span className="px-md py-xs rounded-md text-sm font-semibold bg-warning-soft text-warning-ink">Low stock</span>
            : <span className="px-md py-xs rounded-md text-sm font-semibold bg-success-soft text-success-ink">In stock</span>}
          <Link href={`/inventory/${it.id}/edit`} className="btn-outline shrink-0">Edit</Link>
          <DeleteButton table="inventory_items" id={it.id} redirectTo="/inventory" />
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-md mb-2xl">
        <Kpi label="Current stock" value={`${it.current_stock} ${it.unit}`} />
        <Kpi label="Low threshold" value={`${it.low_stock_threshold ?? '—'} ${it.unit}`} />
        <Kpi label="Unit" value={it.unit} />
      </div>

      <section className="mb-2xl">
        <h2 className="text-lg font-bold text-ink mb-md">Adjust stock</h2>
        <AdjustStockForm itemId={it.id} farmId={it.farm_id} unit={it.unit} currentStock={Number(it.current_stock ?? 0)} />
      </section>

      <section>
        <h2 className="text-lg font-bold text-ink mb-md">Movement history</h2>
        <div className="card overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead className="bg-canvas-soft border-b border-mute">
              <tr className="text-left text-xs uppercase tracking-wider text-body-soft">
                <th className="px-md py-sm">Date</th>
                <th className="px-md py-sm">Type</th>
                <th className="px-md py-sm text-right">Quantity</th>
                <th className="px-md py-sm text-right">Cost/unit</th>
                <th className="px-md py-sm">Supplier</th>
                <th className="px-md py-sm">Notes</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((m) => (
                <tr key={m.id} className="border-b border-mute last:border-0">
                  <td className="px-md py-md">{formatDateDDMonYYYY(m.movement_date)}</td>
                  <td className="px-md py-md">
                    <span className={`px-sm py-xxs rounded-md text-xs font-semibold ${m.movement_type === 'purchase' ? 'bg-success-soft text-success-ink' : m.movement_type === 'usage' ? 'bg-mute-soft text-body' : 'bg-primary-subtle text-primary'}`}>
                      {m.movement_type}
                    </span>
                  </td>
                  <td className={`px-md py-md text-right tabular-nums ${m.movement_type === 'usage' ? 'text-danger' : 'text-ink'}`}>
                    {m.movement_type === 'usage' ? '-' : '+'}{Number(m.quantity)} {it.unit}
                  </td>
                  <td className="px-md py-md text-right tabular-nums">{m.cost_per_unit != null ? formatCurrencyINR(Number(m.cost_per_unit)) : '—'}</td>
                  <td className="px-md py-md text-body">{m.supplier ?? '—'}</td>
                  <td className="px-md py-md text-body-soft">{m.notes ?? '—'}</td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr><td colSpan={6} className="py-2xl text-center text-body">No movements recorded yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <div className="card">
      <p className="text-xs uppercase tracking-wider text-body-soft mb-xs">{label}</p>
      <p className="text-xl font-bold text-ink">{value}</p>
    </div>
  );
}
