import Link from 'next/link';
import { notFound } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { EditInventoryItemForm } from './EditInventoryItemForm';

export default async function EditInventoryItemPage({ params }: { params: { id: string } }) {
  const supabase = createSupabaseServerClient();

  const { data: item } = await supabase
    .from('inventory_items')
    .select('id, item_name, category, unit, low_stock_threshold')
    .eq('id', params.id)
    .maybeSingle();

  if (!item) notFound();

  return (
    <div className="max-w-[560px] mx-auto">
      <Link href={`/inventory/${item.id}`} className="text-sm text-primary-dark font-semibold">&larr; {item.item_name}</Link>
      <h1 className="font-display text-3xl text-ink mt-md mb-2xl">Edit item</h1>
      <EditInventoryItemForm item={item as any} />
    </div>
  );
}
