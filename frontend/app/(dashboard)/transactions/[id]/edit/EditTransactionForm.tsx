'use client';

import { useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';

const schema = z.object({
  farm_id: z.string().uuid('Pick a farm'),
  transaction_type: z.enum(['income', 'expense']),
  category: z.string().min(2, 'Enter a category'),
  amount: z.coerce.number().positive('Amount must be > 0'),
  quantity: z.coerce.number().optional(),
  price_per_unit: z.coerce.number().optional(),
  buyer_id: z.string().uuid().optional().or(z.literal('')),
  buyer_or_supplier: z.string().optional(),
  batch_id: z.string().uuid().optional().or(z.literal('')),
  transaction_date: z.string().min(1, 'Pick a date'),
  payment_status: z.enum(['paid', 'pending', 'partial']),
  amount_paid: z.coerce.number().optional(),
  due_date: z.string().optional(),
  notes: z.string().optional(),
}).refine(
  (d) => d.payment_status !== 'partial' || (d.amount_paid != null && d.amount_paid > 0 && d.amount_paid < d.amount),
  { message: 'For a partial payment, enter an amount paid between 0 and the total', path: ['amount_paid'] },
);
type Form = z.infer<typeof schema>;

interface TxnRow {
  id: string;
  farm_id: string;
  transaction_type: 'income' | 'expense';
  category: string;
  amount: number;
  quantity: number | null;
  price_per_unit: number | null;
  buyer_id: string | null;
  buyer_or_supplier: string | null;
  batch_id: string | null;
  transaction_date: string;
  payment_status: 'paid' | 'pending' | 'partial';
  amount_paid: number | null;
  due_date: string | null;
  notes: string | null;
}

interface Props {
  txn: TxnRow;
  farms: { id: string; farm_name: string }[];
  buyers: { id: string; buyer_name: string; farm_id: string }[];
  batches: { id: string; batch_code: string; farm_id: string }[];
}

export function EditTransactionForm({ txn, farms, buyers, batches }: Props) {
  const router = useRouter();
  const supabase = createSupabaseBrowserClient();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const { register, handleSubmit, watch, formState: { errors } } = useForm<Form>({
    resolver: zodResolver(schema),
    defaultValues: {
      farm_id: txn.farm_id,
      transaction_type: txn.transaction_type,
      category: txn.category,
      amount: txn.amount,
      quantity: txn.quantity ?? undefined,
      price_per_unit: txn.price_per_unit ?? undefined,
      buyer_id: txn.buyer_id ?? '',
      buyer_or_supplier: txn.buyer_or_supplier ?? '',
      batch_id: txn.batch_id ?? '',
      transaction_date: txn.transaction_date,
      payment_status: txn.payment_status,
      amount_paid: txn.amount_paid ?? undefined,
      due_date: txn.due_date ?? '',
      notes: txn.notes ?? '',
    },
  });

  const selectedFarmId = watch('farm_id');
  const txType = watch('transaction_type');
  const paymentStatus = watch('payment_status');

  const farmBuyers = useMemo(() => buyers.filter((b) => b.farm_id === selectedFarmId), [buyers, selectedFarmId]);
  const farmBatches = useMemo(() => batches.filter((b) => b.farm_id === selectedFarmId), [batches, selectedFarmId]);

  async function onSubmit(data: Form) {
    setError(null);
    setLoading(true);
    const payload: any = {
      farm_id: data.farm_id,
      transaction_type: data.transaction_type,
      category: data.category,
      amount: data.amount,
      quantity: data.quantity || null,
      price_per_unit: data.price_per_unit || null,
      buyer_id: data.buyer_id || null,
      buyer_or_supplier: data.buyer_or_supplier || null,
      batch_id: data.batch_id || null,
      transaction_date: data.transaction_date,
      payment_status: data.payment_status,
      amount_paid: data.payment_status === 'partial' ? (data.amount_paid ?? null) : null,
      due_date: data.due_date || null,
      notes: data.notes || null,
    };
    const { error } = await supabase.from('financial_transactions').update(payload).eq('id', txn.id);
    setLoading(false);
    if (error) return setError(error.message);
    router.push('/transactions');
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="card space-y-md">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-md">
        <Field label="Farm" error={errors.farm_id?.message}>
          <select className="input" {...register('farm_id')}>
            {farms.map((f) => <option key={f.id} value={f.id}>{f.farm_name}</option>)}
          </select>
        </Field>
        <Field label="Type" error={errors.transaction_type?.message}>
          <select className="input" {...register('transaction_type')}>
            <option value="income">Income</option>
            <option value="expense">Expense</option>
          </select>
        </Field>
        <Field label="Category" error={errors.category?.message}>
          <input className="input" {...register('category')} />
        </Field>
        <Field label="Amount (₹)" error={errors.amount?.message}>
          <input type="number" step="0.01" className="input" {...register('amount')} />
        </Field>
        <Field label="Quantity">
          <input type="number" step="0.001" className="input" {...register('quantity')} />
        </Field>
        <Field label="Price / unit">
          <input type="number" step="0.01" className="input" {...register('price_per_unit')} />
        </Field>
        {txType === 'income' && farmBuyers.length > 0 && (
          <Field label="Buyer (Khata)">
            <select className="input" {...register('buyer_id')}>
              <option value="">— None —</option>
              {farmBuyers.map((b) => <option key={b.id} value={b.id}>{b.buyer_name}</option>)}
            </select>
          </Field>
        )}
        <Field label="Buyer / Supplier (free text)">
          <input className="input" {...register('buyer_or_supplier')} />
        </Field>
        {farmBatches.length > 0 && (
          <Field label="Batch (optional)">
            <select className="input" {...register('batch_id')}>
              <option value="">— None —</option>
              {farmBatches.map((b) => <option key={b.id} value={b.id}>{b.batch_code}</option>)}
            </select>
          </Field>
        )}
        <Field label="Transaction date" error={errors.transaction_date?.message}>
          <input type="date" className="input" {...register('transaction_date')} />
        </Field>
        <Field label="Payment status">
          <select className="input" {...register('payment_status')}>
            <option value="paid">Paid</option>
            <option value="pending">Pending</option>
            <option value="partial">Partial</option>
          </select>
        </Field>
        {paymentStatus === 'partial' && (
          <Field label="Amount paid so far (₹)" error={errors.amount_paid?.message}>
            <input type="number" step="0.01" className="input" {...register('amount_paid')} />
          </Field>
        )}
        {paymentStatus !== 'paid' && (
          <Field label="Due date">
            <input type="date" className="input" {...register('due_date')} />
          </Field>
        )}
      </div>

      <Field label="Notes">
        <textarea rows={2} className="input h-auto py-sm" {...register('notes')} />
      </Field>

      <button type="submit" disabled={loading} className="btn-primary w-full">
        {loading ? 'Saving…' : 'Save changes'}
      </button>
      {error && <p className="text-sm text-danger">{error}</p>}
    </form>
  );
}

function Field({ label, error, children }: { label: string; error?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="label">{label}</label>
      {children}
      {error && <p className="text-sm text-danger mt-xs">{error}</p>}
    </div>
  );
}
