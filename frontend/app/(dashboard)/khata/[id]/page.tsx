import Link from 'next/link';
import { notFound } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { formatCurrencyINR, formatDateDDMonYYYY } from '@/lib/utils';
import { BuyerActions } from './BuyerActions';
import { DeleteButton } from '@/components/DeleteButton';

export default async function BuyerDetailPage({ params }: { params: { id: string } }) {
  const supabase = createSupabaseServerClient();

  const { data: buyer } = await supabase
    .from('buyers')
    .select('id, buyer_name, phone, whatsapp_phone, address, gstin, credit_limit, total_business_volume, current_balance, last_transaction_date, farm_id')
    .eq('id', params.id)
    .maybeSingle();

  if (!buyer) notFound();

  const { data: farm } = await supabase
    .from('farms')
    .select('farm_name, upi_id')
    .eq('id', buyer.farm_id)
    .maybeSingle();

  const { data: txns } = await supabase
    .from('financial_transactions')
    .select('id, transaction_date, transaction_type, category, amount, quantity, price_per_unit, payment_status, due_date, notes')
    .eq('buyer_id', params.id)
    .order('transaction_date', { ascending: false })
    .limit(50);

  const outstanding = Number(buyer.current_balance ?? 0);

  return (
    <div className="max-w-[1200px] mx-auto">
      <Link href="/khata" className="text-sm text-primary-dark font-semibold">&larr; Khata</Link>
      <div className="flex items-baseline justify-between mt-md flex-wrap gap-md">
        <div>
          <h1 className="text-3xl font-bold text-ink">{buyer.buyer_name}</h1>
          <p className="text-sm text-body mt-xs">{buyer.phone ?? '—'} {buyer.whatsapp_phone ? `· WhatsApp ${buyer.whatsapp_phone}` : ''}</p>
          <div className="flex items-center gap-md mt-sm">
            <Link href={`/khata/${buyer.id}/edit`} className="text-sm text-primary-dark font-semibold">Edit buyer &rarr;</Link>
            <DeleteButton table="buyers" id={buyer.id} redirectTo="/khata" variant="link" label="Delete buyer" />
          </div>
        </div>
        <BuyerActions
          buyerName={buyer.buyer_name}
          buyerPhone={buyer.whatsapp_phone ?? buyer.phone}
          outstanding={outstanding}
          farmUpiId={farm?.upi_id ?? null}
          farmName={farm?.farm_name ?? 'PoultryOS Farm'}
        />
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-md mt-2xl">
        <Kpi label="Outstanding" value={formatCurrencyINR(outstanding)} accent={outstanding > 0 ? 'warning' : undefined} />
        <Kpi label="Lifetime volume" value={formatCurrencyINR(Number(buyer.total_business_volume ?? 0))} />
        <Kpi label="Credit limit" value={buyer.credit_limit ? formatCurrencyINR(Number(buyer.credit_limit)) : '—'} />
        <Kpi label="Last transaction" value={formatDateDDMonYYYY(buyer.last_transaction_date)} />
      </div>

      <section className="mt-2xl">
        <h2 className="text-lg font-bold text-ink mb-md">Transaction history</h2>
        <div className="card overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead className="bg-canvas-soft border-b border-mute">
              <tr className="text-left text-xs uppercase tracking-wider text-body-soft">
                <th className="px-md py-sm">Date</th>
                <th className="px-md py-sm">Type</th>
                <th className="px-md py-sm">Category</th>
                <th className="px-md py-sm text-right">Amount</th>
                <th className="px-md py-sm">Status</th>
                <th className="px-md py-sm">Due</th>
                <th className="px-md py-sm">Notes</th>
              </tr>
            </thead>
            <tbody>
              {(txns ?? []).map((t) => (
                <tr key={t.id} className="border-b border-mute last:border-0">
                  <td className="px-md py-md">{formatDateDDMonYYYY(t.transaction_date)}</td>
                  <td className="px-md py-md">
                    <span className={`px-sm py-xxs rounded-md text-xs font-semibold ${t.transaction_type === 'income' ? 'bg-success-soft text-success-ink' : 'bg-mute-soft text-body'}`}>
                      {t.transaction_type}
                    </span>
                  </td>
                  <td className="px-md py-md text-body">{t.category}</td>
                  <td className="px-md py-md text-right tabular-nums font-semibold">{formatCurrencyINR(Number(t.amount))}</td>
                  <td className="px-md py-md">
                    <span className={`px-sm py-xxs rounded-md text-xs font-semibold ${t.payment_status === 'paid' ? 'bg-success-soft text-success-ink' : t.payment_status === 'partial' ? 'bg-warning-soft text-warning-ink' : 'bg-mute-soft text-body'}`}>
                      {t.payment_status}
                    </span>
                  </td>
                  <td className="px-md py-md text-body">{formatDateDDMonYYYY(t.due_date)}</td>
                  <td className="px-md py-md text-body truncate max-w-[200px]">{t.notes ?? '—'}</td>
                </tr>
              ))}
              {(!txns || txns.length === 0) && (
                <tr><td colSpan={7} className="py-2xl text-center text-body">No transactions yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function Kpi({ label, value, accent }: { label: string; value: string; accent?: 'warning' }) {
  return (
    <div className="card">
      <p className="text-xs uppercase tracking-wider text-body-soft mb-xs">{label}</p>
      <p className={`text-xl font-bold ${accent === 'warning' ? 'text-warning-ink' : 'text-ink'}`}>{value}</p>
    </div>
  );
}
