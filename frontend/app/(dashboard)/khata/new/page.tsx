import Link from 'next/link';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { BuyerForm } from './BuyerForm';

export default async function NewBuyerPage() {
  const supabase = createSupabaseServerClient();
  const { data: farms } = await supabase.from('farms').select('id, farm_name').order('farm_name');
  return (
    <div className="max-w-[640px] mx-auto">
      <Link href="/khata" className="text-sm text-primary-dark font-semibold">&larr; Khata</Link>
      <h1 className="font-display text-3xl text-ink mt-md mb-2xl">Add buyer</h1>
      <BuyerForm farms={farms ?? []} />
    </div>
  );
}
