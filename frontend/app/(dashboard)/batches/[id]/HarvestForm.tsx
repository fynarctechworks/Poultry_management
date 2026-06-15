'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import { formatCurrencyINR } from '@/lib/utils';

interface Props {
  batchId: string;
  currentBirdCount: number;
  buyers: { id: string; buyer_name: string }[];
}

export function HarvestForm({ batchId, currentBirdCount, buyers }: Props) {
  const router = useRouter();
  const supabase = createSupabaseBrowserClient();
  const [open, setOpen] = useState(false);
  const [birds, setBirds] = useState('');
  const [weight, setWeight] = useState('');
  const [price, setPrice] = useState('');
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [buyerId, setBuyerId] = useState('');
  const [status, setStatus] = useState<'paid' | 'pending' | 'partial'>('paid');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const revenue =
    (parseFloat(birds || '0') * parseFloat(weight || '0') * parseFloat(price || '0')) || 0;

  async function submit() {
    setError(null);
    const b = parseInt(birds, 10);
    if (!b || b <= 0 || b > currentBirdCount) {
      setError(`Birds must be between 1 and ${currentBirdCount}`);
      return;
    }
    if (!(parseFloat(weight) > 0)) return setError('Enter a valid average weight');
    if (!(parseFloat(price) >= 0)) return setError('Enter a valid price per kg');
    setLoading(true);
    const { error: rpcError } = await supabase.rpc('record_harvest', {
      p_batch_id: batchId,
      p_birds: b,
      p_avg_weight_kg: parseFloat(weight),
      p_price_per_kg: parseFloat(price),
      p_date: date,
      p_buyer_id: buyerId || null,
      p_payment_status: status,
      p_notes: notes || null,
    });
    setLoading(false);
    if (rpcError) return setError(rpcError.message);
    setOpen(false);
    router.refresh();
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="rounded-md border border-primary-dark px-md py-sm text-sm font-semibold text-primary-dark"
      >
        Record harvest / sale
      </button>
    );
  }

  return (
    <div className="card space-y-md w-full">
      <h3 className="text-base font-bold text-ink">Record harvest / sale</h3>
      <p className="text-xs text-body">{currentBirdCount.toLocaleString('en-IN')} birds currently alive. Selling part of the flock thins it without closing the batch.</p>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-md">
        <L label="Birds harvested"><input type="number" min={1} max={currentBirdCount} className="input" value={birds} onChange={(e) => setBirds(e.target.value)} /></L>
        <L label="Avg weight (kg)"><input type="number" step="0.001" min={0} className="input" value={weight} onChange={(e) => setWeight(e.target.value)} /></L>
        <L label="Price / kg (₹)"><input type="number" step="0.01" min={0} className="input" value={price} onChange={(e) => setPrice(e.target.value)} /></L>
        <L label="Date"><input type="date" className="input" value={date} onChange={(e) => setDate(e.target.value)} /></L>
        <L label="Buyer (Khata, optional)">
          <select className="input" value={buyerId} onChange={(e) => setBuyerId(e.target.value)}>
            <option value="">— None —</option>
            {buyers.map((b) => <option key={b.id} value={b.id}>{b.buyer_name}</option>)}
          </select>
        </L>
        <L label="Payment status">
          <select className="input" value={status} onChange={(e) => setStatus(e.target.value as typeof status)}>
            <option value="paid">Paid</option>
            <option value="pending">Pending</option>
            <option value="partial">Partial</option>
          </select>
        </L>
      </div>
      <L label="Notes"><input className="input" value={notes} onChange={(e) => setNotes(e.target.value)} /></L>
      <p className="text-sm text-body">Revenue booked: <strong className="text-ink">{formatCurrencyINR(revenue)}</strong> ({birds || 0} birds × {weight || 0} kg × {formatCurrencyINR(parseFloat(price || '0'))}/kg)</p>
      {error && <p className="text-sm text-danger">{error}</p>}
      <div className="flex gap-md">
        <button onClick={submit} disabled={loading} className="btn-primary">{loading ? 'Saving…' : 'Record harvest'}</button>
        <button onClick={() => setOpen(false)} className="text-sm text-body font-semibold self-center">Cancel</button>
      </div>
    </div>
  );
}

function L({ label, children }: { label: string; children: React.ReactNode }) {
  return <div><label className="label">{label}</label>{children}</div>;
}
