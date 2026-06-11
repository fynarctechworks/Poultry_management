'use client';

import { useState } from 'react';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';

interface Farm { id: string; farm_name: string; }
type ReportType = 'daily_logs' | 'transactions' | 'batches';

const REPORT_OPTIONS: { value: ReportType; label: string }[] = [
  { value: 'daily_logs', label: 'Daily logs' },
  { value: 'transactions', label: 'Financial transactions' },
  { value: 'batches', label: 'Batch performance' },
];

export function ReportExports({ farms }: { farms: Farm[] }) {
  const supabase = createSupabaseBrowserClient();
  const [farmId, setFarmId] = useState(farms[0]?.id ?? '');
  const [type, setType] = useState<ReportType>('daily_logs');
  const [from, setFrom] = useState<string>(() => {
    const d = new Date();
    d.setMonth(d.getMonth() - 1);
    return d.toISOString().slice(0, 10);
  });
  const [to, setTo] = useState<string>(() => new Date().toISOString().slice(0, 10));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function exportCsv() {
    setError(null);
    setLoading(true);

    let rows: any[] | null = null;
    let headers: string[] = [];

    try {
      if (type === 'daily_logs') {
        const { data, error } = await supabase
          .from('daily_logs')
          .select('log_date, batch_id, birds_dead, death_cause, feed_consumed_kg, feed_type, eggs_collected, avg_bird_weight_g, notes')
          .eq('farm_id', farmId)
          .gte('log_date', from)
          .lte('log_date', to)
          .order('log_date');
        if (error) throw error;
        rows = data;
        headers = ['log_date', 'batch_id', 'birds_dead', 'death_cause', 'feed_consumed_kg', 'feed_type', 'eggs_collected', 'avg_bird_weight_g', 'notes'];
      } else if (type === 'transactions') {
        const { data, error } = await supabase
          .from('financial_transactions')
          .select('transaction_date, transaction_type, category, amount, quantity, price_per_unit, buyer_or_supplier, payment_status, due_date, notes')
          .eq('farm_id', farmId)
          .gte('transaction_date', from)
          .lte('transaction_date', to)
          .order('transaction_date');
        if (error) throw error;
        rows = data;
        headers = ['transaction_date', 'transaction_type', 'category', 'amount', 'quantity', 'price_per_unit', 'buyer_or_supplier', 'payment_status', 'due_date', 'notes'];
      } else {
        const { data, error } = await supabase
          .from('batches')
          .select('batch_code, breed_name, poultry_type, placement_date, opening_bird_count, current_bird_count, status, harvest_date, birds_sold, sale_weight_kg, sale_price_per_kg, total_sale_revenue')
          .eq('farm_id', farmId)
          .order('placement_date', { ascending: false });
        if (error) throw error;
        rows = data;
        headers = ['batch_code', 'breed_name', 'poultry_type', 'placement_date', 'opening_bird_count', 'current_bird_count', 'status', 'harvest_date', 'birds_sold', 'sale_weight_kg', 'sale_price_per_kg', 'total_sale_revenue'];
      }

      const csv = toCsv(headers, rows ?? []);
      downloadFile(csv, `${type}_${farmId.slice(0, 8)}_${from}_to_${to}.csv`, 'text/csv');
    } catch (e: any) {
      setError(e.message ?? 'Export failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="card">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-md">
        <div>
          <label className="label">Farm</label>
          <select className="input" value={farmId} onChange={(e) => setFarmId(e.target.value)}>
            {farms.map((f) => <option key={f.id} value={f.id}>{f.farm_name}</option>)}
            {farms.length === 0 && <option value="">No farms</option>}
          </select>
        </div>
        <div>
          <label className="label">Report</label>
          <select className="input" value={type} onChange={(e) => setType(e.target.value as ReportType)}>
            {REPORT_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>
        <div>
          <label className="label">From</label>
          <input type="date" className="input" value={from} onChange={(e) => setFrom(e.target.value)} />
        </div>
        <div>
          <label className="label">To</label>
          <input type="date" className="input" value={to} onChange={(e) => setTo(e.target.value)} />
        </div>
      </div>

      <button onClick={exportCsv} disabled={loading || !farmId} className="btn-primary w-full mt-lg">
        {loading ? 'Exporting…' : 'Download CSV'}
      </button>

      {error && <p className="text-sm text-danger mt-md">{error}</p>}
    </div>
  );
}

function toCsv(headers: string[], rows: any[]): string {
  const esc = (v: any) => {
    if (v == null) return '';
    const s = String(v);
    if (s.includes(',') || s.includes('"') || s.includes('\n')) return `"${s.replace(/"/g, '""')}"`;
    return s;
  };
  return [headers.join(','), ...rows.map((r) => headers.map((h) => esc(r[h])).join(','))].join('\n');
}

function downloadFile(content: string, filename: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
