import Link from 'next/link';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { PurchaseForm } from './PurchaseForm';

export default async function NewPurchasePage() {
  const supabase = createSupabaseServerClient();
  const { data: items } = await supabase
    .from('inventory_items')
    .select('id, item_name, unit, farm_id, farms(farm_name)')
    .order('item_name');

  return (
    <div className="max-w-[640px] mx-auto">
      <Link href="/inventory" className="text-sm text-primary-dark font-semibold">&larr; Inventory</Link>
      <h1 className="font-display text-3xl text-ink mt-md mb-2xl">Record purchase</h1>
      <PurchaseForm items={(items as any) ?? []} />
    </div>
  );
}
