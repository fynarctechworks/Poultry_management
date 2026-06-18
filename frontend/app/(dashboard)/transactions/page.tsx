import Link from 'next/link';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { formatCurrencyINR, formatDateDDMonYYYY } from '@/lib/utils';
import { MarkPaidButton } from './MarkPaidButton';
import { DeleteButton } from '@/components/DeleteButton';
import { PageHeader } from '@/components/ui/PageHeader';

export default async function TransactionsPage() {
  const supabase = createSupabaseServerClient();

  const { data: txns } = await supabase
    .from('financial_transactions')
    .select('id, transaction_date, transaction_type, category, amount, buyer_or_supplier, payment_status, due_date, farms(farm_name)')
    .order('transaction_date', { ascending: false })
    .limit(100);

  return (
    <div className="max-w-[1200px] mx-auto">
      <PageHeader
        eyebrow="Money"
        title="Transactions"
        subtitle="Income and expenses across all your farms."
        actions={<Link href="/transactions/new" className="btn-primary">Add transaction</Link>}
      />

      <div className="card overflow-x-auto p-0">
        <table className="w-full text-sm">
          <thead className="bg-canvas-soft border-b border-mute">
            <tr className="text-left text-xs uppercase tracking-wider text-body-soft">
              <th className="px-md py-sm">Date</th>
              <th className="px-md py-sm">Farm</th>
              <th className="px-md py-sm">Type</th>
              <th className="px-md py-sm">Category</th>
              <th className="px-md py-sm">Party</th>
              <th className="px-md py-sm text-right">Amount</th>
              <th className="px-md py-sm">Status</th>
              <th className="px-md py-sm">Due</th>
              <th className="px-md py-sm text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {(txns ?? []).map((t: any) => (
              <tr key={t.id} className="border-b border-mute last:border-0">
                <td className="px-md py-md">{formatDateDDMonYYYY(t.transaction_date)}</td>
                <td className="px-md py-md text-body">{t.farms?.farm_name ?? '—'}</td>
                <td className="px-md py-md">
                  <span className={`px-sm py-xxs rounded-md text-xs font-semibold ${t.transaction_type === 'income' ? 'bg-success-soft text-success-ink' : 'bg-mute-soft text-body'}`}>
                    {t.transaction_type}
                  </span>
                </td>
                <td className="px-md py-md text-body">{t.category}</td>
                <td className="px-md py-md text-body">{t.buyer_or_supplier ?? '—'}</td>
                <td className="px-md py-md text-right tabular-nums font-semibold">{formatCurrencyINR(Number(t.amount))}</td>
                <td className="px-md py-md">
                  <span className={`px-sm py-xxs rounded-md text-xs font-semibold ${t.payment_status === 'paid' ? 'bg-success-soft text-success-ink' : t.payment_status === 'partial' ? 'bg-warning-soft text-warning-ink' : 'bg-mute-soft text-body'}`}>
                    {t.payment_status}
                  </span>
                </td>
                <td className="px-md py-md text-body">{formatDateDDMonYYYY(t.due_date)}</td>
                <td className="px-md py-md text-right">
                  <div className="flex justify-end gap-md items-center">
                    {t.payment_status !== 'paid' && <MarkPaidButton id={t.id} />}
                    <Link href={`/transactions/${t.id}/edit`} className="text-xs text-primary-dark font-semibold">Edit</Link>
                    <DeleteButton table="financial_transactions" id={t.id} variant="link" />
                  </div>
                </td>
              </tr>
            ))}
            {(!txns || txns.length === 0) && (
              <tr><td colSpan={9} className="py-2xl text-center text-body">No transactions yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
