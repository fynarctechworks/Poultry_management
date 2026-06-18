import Link from 'next/link';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { InventoryItemForm } from './InventoryItemForm';

export default async function NewInventoryItemPage() {
  const supabase = createSupabaseServerClient();
  const { data: farms } = await supabase.from('farms').select('id, farm_name').order('farm_name');

  return (
    <div className="max-w-[640px] mx-auto">
      <Link href="/inventory" className="text-sm text-primary-dark font-semibold">&larr; Inventory</Link>
      <h1 className="font-display text-3xl text-ink mt-md mb-2xl">New inventory item</h1>
      <InventoryItemForm farms={farms ?? []} />
    </div>
  );
}
