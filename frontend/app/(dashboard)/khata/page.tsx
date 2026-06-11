import Link from 'next/link';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { formatCurrencyINR, formatDateDDMonYYYY } from '@/lib/utils';

export default async function KhataPage() {
  const supabase = createSupabaseServerClient();
  const { data: buyers } = await supabase
    .from('buyers')
    .select('id, buyer_name, phone, current_balance, total_business_volume, last_transaction_date')
    .order('current_balance', { ascending: false });

  return (
    <div className="max-w-[1200px] mx-auto">
      <div className="flex items-center justify-between mb-2xl">
        <h1 className="text-3xl font-bold text-ink">Buyer Khata</h1>
        <div className="flex items-center gap-md">
          <Link href="/khata/aging" className="btn-outline">Aging report</Link>
          <Link href="/khata/new" className="btn-primary">Add buyer</Link>
        </div>
      </div>
      <div className="card overflow-x-auto p-0">
        <table className="w-full text-sm">
          <thead className="bg-canvas-soft border-b border-mute">
            <tr className="text-left text-xs uppercase tracking-wider text-body-soft">
              <th className="px-md py-sm">Buyer</th>
              <th className="px-md py-sm">Phone</th>
              <th className="px-md py-sm text-right">Outstanding</th>
              <th className="px-md py-sm text-right">Lifetime volume</th>
              <th className="px-md py-sm">Last transaction</th>
            </tr>
          </thead>
          <tbody>
            {(buyers ?? []).map((b) => (
              <tr key={b.id} className="border-b border-mute last:border-0">
                <td className="px-md py-md font-semibold">
                  <Link href={`/khata/${b.id}`} className="text-primary-dark">{b.buyer_name}</Link>
                </td>
                <td className="px-md py-md text-body">{b.phone ?? '—'}</td>
                <td className={`px-md py-md text-right tabular-nums ${Number(b.current_balance) > 0 ? 'text-warning-ink font-semibold' : 'text-body'}`}>
                  {formatCurrencyINR(Number(b.current_balance))}
                </td>
                <td className="px-md py-md text-right tabular-nums">{formatCurrencyINR(Number(b.total_business_volume))}</td>
                <td className="px-md py-md text-body">{formatDateDDMonYYYY(b.last_transaction_date)}</td>
              </tr>
            ))}
            {(!buyers || buyers.length === 0) && (
              <tr><td colSpan={5} className="py-2xl text-center text-body">No buyers yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
