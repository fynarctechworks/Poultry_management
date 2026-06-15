'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';

interface Opt {
  id: string;
  name: string;
  farm_id: string;
}

export function SpotCountForm({ items, batches }: { items: Opt[]; batches: Opt[] }) {
  const router = useRouter();
  const supabase = createSupabaseBrowserClient();
  const [type, setType] = useState<'feed_stock' | 'bird_count'>('bird_count');
  const [targetId, setTargetId] = useState('');
  const [value, setValue] = useState('');
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const options = type === 'feed_stock' ? items : batches;

  async function save() {
    setError(null);
    const target = options.find((o) => o.id === targetId);
    const num = Number(value);
    if (!target) return setError('Select what you counted.');
    if (!Number.isFinite(num) || num < 0) return setError('Enter a valid count.');
    setLoading(true);
    const { error } = await supabase.from('physical_counts').insert({
      farm_id: target.farm_id,
      count_type: type,
      counted_value: num,
      count_date: date,
      item_id: type === 'feed_stock' ? target.id : null,
      batch_id: type === 'bird_count' ? target.id : null,
      notes: notes.trim() || null,
    });
    setLoading(false);
    if (error) return setError(error.message);
    setValue('');
    setNotes('');
    setDone(true);
    router.refresh();
  }

  return (
    <div className="card">
      <h2 className="text-lg font-bold text-ink mb-md">Enter a physical spot-count</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-md">
        <div>
          <label className="label">What did you count?</label>
          <select
            className="input"
            value={type}
            onChange={(e) => {
              setType(e.target.value as 'feed_stock' | 'bird_count');
              setTargetId('');
            }}
          >
            <option value="bird_count">Bird count (a batch)</option>
            <option value="feed_stock">Feed stock (an item)</option>
          </select>
        </div>
        <div>
          <label className="label">{type === 'feed_stock' ? 'Feed item' : 'Batch'}</label>
          <select className="input" value={targetId} onChange={(e) => setTargetId(e.target.value)}>
            <option value="">— Select —</option>
            {options.map((o) => (
              <option key={o.id} value={o.id}>{o.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">{type === 'feed_stock' ? 'Counted stock (kg)' : 'Counted birds'}</label>
          <input type="number" min={0} step={type === 'feed_stock' ? '0.1' : '1'} className="input" value={value} onChange={(e) => setValue(e.target.value)} />
        </div>
        <div>
          <label className="label">Count date</label>
          <input type="date" className="input" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
      </div>
      <div className="mt-md">
        <label className="label">Notes (optional)</label>
        <input className="input" value={notes} onChange={(e) => setNotes(e.target.value)} />
      </div>
      <div className="flex items-center gap-md mt-md">
        <button onClick={save} disabled={loading} className="btn-primary">{loading ? 'Saving…' : 'Save count'}</button>
        {done && <span className="text-sm text-success-ink">Saved ✓</span>}
        {error && <span className="text-sm text-danger">{error}</span>}
      </div>
    </div>
  );
}
