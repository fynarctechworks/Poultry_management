import Link from 'next/link';
import { notFound } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { EditTransactionForm } from './EditTransactionForm';

export default async function EditTransactionPage({ params }: { params: { id: string } }) {
  const supabase = createSupabaseServerClient();

  const [{ data: txn }, { data: farms }, { data: buyers }, { data: batches }] = await Promise.all([
    supabase
      .from('financial_transactions')
      .select('id, farm_id, transaction_type, category, amount, quantity, price_per_unit, buyer_id, buyer_or_supplier, batch_id, transaction_date, payment_status, due_date, notes')
      .eq('id', params.id)
      .maybeSingle(),
    supabase.from('farms').select('id, farm_name').order('farm_name'),
    supabase.from('buyers').select('id, buyer_name, farm_id').order('buyer_name'),
    supabase.from('batches').select('id, batch_code, farm_id').order('batch_code'),
  ]);

  if (!txn) notFound();

  return (
    <div className="max-w-[720px] mx-auto">
      <Link href="/transactions" className="text-sm text-primary-dark font-semibold">&larr; Transactions</Link>
      <h1 className="text-3xl font-bold text-ink mt-md mb-2xl">Edit transaction</h1>
      <EditTransactionForm txn={txn as any} farms={farms ?? []} buyers={buyers ?? []} batches={batches ?? []} />
    </div>
  );
}
