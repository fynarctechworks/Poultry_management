import Link from 'next/link';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { formatCurrencyINR, formatDateDDMonYYYY } from '@/lib/utils';
import { ReminderButton } from './ReminderButton';
import { PageHeader } from '@/components/ui/PageHeader';

type Bucket = '0-7' | '8-15' | '16-30' | '30+';

function bucketFor(days: number): Bucket {
  if (days <= 7) return '0-7';
  if (days <= 15) return '8-15';
  if (days <= 30) return '16-30';
  return '30+';
}

export default async function ReceivablesAgingPage() {
  const supabase = createSupabaseServerClient();

  const { data: txns } = await supabase
    .from('financial_transactions')
    .select('id, amount, amount_paid, transaction_date, due_date, payment_status, buyer_or_supplier, buyer_id, buyers(buyer_name, phone, whatsapp_phone), farms(farm_name, upi_id)')
    .eq('transaction_type', 'income')
    .in('payment_status', ['pending', 'partial'])
    .order('due_date', { ascending: true });

  const today = new Date();
  const rows = (txns ?? []).map((t: any) => {
    const ref = t.due_date ?? t.transaction_date;
    const days = ref ? Math.max(0, Math.floor((today.getTime() - new Date(ref).getTime()) / 86400000)) : 0;
    // Age the OUTSTANDING amount, not the gross. Mirrors the DB legacy fallback:
    // amount_paid when recorded, else partial→50%, pending→0.
    const gross = Number(t.amount ?? 0);
    const paid = t.amount_paid != null
      ? Number(t.amount_paid)
      : (t.payment_status === 'partial' ? gross * 0.5 : 0);
    const outstanding = Math.max(0, gross - paid);
    return {
      id: t.id,
      party: t.buyers?.buyer_name ?? t.buyer_or_supplier ?? '—',
      buyerId: t.buyer_id as string | null,
      phone: (t.buyers?.whatsapp_phone ?? t.buyers?.phone ?? null) as string | null,
      farmName: (t.farms?.farm_name ?? 'PoultryOS') as string,
      farmUpi: (t.farms?.upi_id ?? null) as string | null,
      amount: outstanding,
      dueDate: t.due_date ?? t.transaction_date,
      days,
      bucket: bucketFor(days),
    };
  });

  const buckets: Record<Bucket, number> = { '0-7': 0, '8-15': 0, '16-30': 0, '30+': 0 };
  for (const r of rows) buckets[r.bucket] += r.amount;
  const total = rows.reduce((s, r) => s + r.amount, 0);

  return (
    <div className="max-w-[1100px] mx-auto">
      <PageHeader
        eyebrow="Money"
        title="Receivables aging"
        subtitle="Outstanding income (pending or partial) bucketed by days overdue from the due date."
        actions={<Link href="/khata" className="btn-outline">Back to Khata</Link>}
      />

      <div className="grid grid-cols-2 md:grid-cols-5 gap-md mb-2xl">
        <BucketCard label="0–7 days" value={buckets['0-7']} />
        <BucketCard label="8–15 days" value={buckets['8-15']} accent="warning" />
        <BucketCard label="16–30 days" value={buckets['16-30']} accent="warning" />
        <BucketCard label="30+ days" value={buckets['30+']} accent="danger" />
        <BucketCard label="Total" value={total} accent="ink" />
      </div>

      <div className="card overflow-x-auto p-0">
        <table className="w-full text-sm">
          <thead className="bg-canvas-soft border-b border-mute">
            <tr className="text-left text-xs uppercase tracking-wider text-body-soft">
              <th className="px-md py-sm">Buyer</th>
              <th className="px-md py-sm">Due date</th>
              <th className="px-md py-sm text-right">Days overdue</th>
              <th className="px-md py-sm">Bucket</th>
              <th className="px-md py-sm text-right">Amount</th>
              <th className="px-md py-sm text-right">Action</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-b border-mute last:border-0">
                <td className="px-md py-md">
                  {r.buyerId
                    ? <Link href={`/khata/${r.buyerId}`} className="font-semibold text-primary-dark">{r.party}</Link>
                    : <span className="text-ink">{r.party}</span>}
                </td>
                <td className="px-md py-md text-body">{formatDateDDMonYYYY(r.dueDate)}</td>
                <td className="px-md py-md text-right tabular-nums">{r.days}</td>
                <td className="px-md py-md">
                  <span className={`px-sm py-xxs rounded-md text-xs font-semibold ${r.bucket === '30+' ? 'bg-warning-soft text-danger' : r.bucket === '0-7' ? 'bg-mute-soft text-body' : 'bg-warning-soft text-warning-ink'}`}>
                    {r.bucket}
                  </span>
                </td>
                <td className="px-md py-md text-right tabular-nums font-semibold">{formatCurrencyINR(r.amount)}</td>
                <td className="px-md py-md text-right">
                  <ReminderButton
                    buyerName={r.party}
                    phone={r.phone}
                    amount={r.amount}
                    farmName={r.farmName}
                    farmUpi={r.farmUpi}
                  />
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr><td colSpan={6} className="py-2xl text-center text-body">No outstanding receivables. 🎉</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function BucketCard({ label, value, accent }: { label: string; value: number; accent?: 'warning' | 'danger' | 'ink' }) {
  const tone = accent === 'danger' ? 'text-danger' : accent === 'warning' ? 'text-warning-ink' : 'text-ink';
  return (
    <div className="card">
      <p className="text-xs uppercase tracking-wider text-body-soft mb-xs">{label}</p>
      <p className={`text-xl font-bold ${tone}`}>{formatCurrencyINR(value)}</p>
    </div>
  );
}
