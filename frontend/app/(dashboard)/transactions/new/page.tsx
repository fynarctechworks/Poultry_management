import Link from 'next/link';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { TransactionForm } from './TransactionForm';

export default async function NewTransactionPage() {
  const supabase = createSupabaseServerClient();
  const [{ data: farms }, { data: buyers }, { data: batches }] = await Promise.all([
    supabase.from('farms').select('id, farm_name').order('farm_name'),
    supabase.from('buyers').select('id, buyer_name, farm_id').order('buyer_name'),
    supabase.from('batches').select('id, batch_code, farm_id').eq('status', 'active').order('batch_code'),
  ]);

  return (
    <div className="max-w-[720px] mx-auto">
      <Link href="/transactions" className="text-sm text-primary-dark font-semibold">&larr; Transactions</Link>
      <h1 className="text-3xl font-bold text-ink mt-md mb-2xl">Add transaction</h1>
      <TransactionForm farms={farms ?? []} buyers={buyers ?? []} batches={batches ?? []} />
    </div>
  );
}
