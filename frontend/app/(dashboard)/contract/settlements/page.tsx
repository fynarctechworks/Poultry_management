import Link from 'next/link';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { formatCurrencyINR, formatDateDDMonYYYY } from '@/lib/utils';
import { UpgradeGate } from '@/components/UpgradeGate';

export default async function SettlementHistoryPage() {
  return (
    <UpgradeGate
      feature="Contract settlement history"
      description="Past contract cycles, expected vs received settlement, and dispute notes — paid plan only."
    >
      <SettlementHistoryContent />
    </UpgradeGate>
  );
}

async function SettlementHistoryContent() {
  const supabase = createSupabaseServerClient();

  const { data: cycles } = await supabase
    .from('contract_cycles')
    .select(`
      id, status, actual_harvest_date, settlement_received_date,
      birds_delivered, avg_weight_kg, actual_fcr, actual_mortality_pct,
      expected_settlement_amount, actual_settlement_amount, dispute_notes,
      batches(batch_code), integrators(name), farms(farm_name)
    `)
    .in('status', ['harvest_complete', 'settled', 'disputed'])
    .order('settlement_received_date', { ascending: false, nullsFirst: false });

  const rows = (cycles ?? []) as any[];

  const totals = rows.reduce(
    (acc, c) => ({
      expected: acc.expected + Number(c.expected_settlement_amount ?? 0),
      actual: acc.actual + Number(c.actual_settlement_amount ?? 0),
    }),
    { expected: 0, actual: 0 }
  );
  const variance = totals.actual - totals.expected;
  const settledCount = rows.filter((c) => c.status === 'settled').length;
  const disputedCount = rows.filter((c) => c.status === 'disputed').length;
  const pendingCount = rows.filter((c) => c.status === 'harvest_complete').length;

  return (
    <div className="max-w-[1400px] mx-auto">
      <div className="flex items-center justify-between mb-xs">
        <h1 className="text-3xl font-bold text-ink">Settlement history</h1>
        <Link href="/contract" className="text-sm text-primary-dark font-semibold">&larr; Contract</Link>
      </div>
      <p className="text-sm text-body mb-2xl">Expected vs received reconciliation across all harvested and settled cycles.</p>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-md mb-2xl">
        <Kpi label="Expected total" value={formatCurrencyINR(totals.expected)} />
        <Kpi label="Received total" value={formatCurrencyINR(totals.actual)} />
        <Kpi label="Variance" value={`${variance >= 0 ? '+' : ''}${formatCurrencyINR(variance)}`} accent={variance >= 0 ? 'success' : 'danger'} />
        <Kpi label="Settled" value={`${settledCount}`} accent="success" />
        <Kpi label="Disputed / pending" value={`${disputedCount} / ${pendingCount}`} accent={disputedCount > 0 ? 'warning' : undefined} />
      </div>

      <div className="card overflow-x-auto p-0">
        <table className="w-full text-sm">
          <thead className="bg-canvas-soft border-b border-mute">
            <tr className="text-left text-xs uppercase tracking-wider text-body-soft">
              <th className="px-md py-sm">Batch</th>
              <th className="px-md py-sm">Integrator</th>
              <th className="px-md py-sm">Harvested</th>
              <th className="px-md py-sm">Settled</th>
              <th className="px-md py-sm text-right">Birds</th>
              <th className="px-md py-sm text-right">FCR</th>
              <th className="px-md py-sm text-right">Expected ₹</th>
              <th className="px-md py-sm text-right">Received ₹</th>
              <th className="px-md py-sm text-right">Variance</th>
              <th className="px-md py-sm">Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((c) => {
              const v = c.actual_settlement_amount != null && c.expected_settlement_amount != null
                ? Number(c.actual_settlement_amount) - Number(c.expected_settlement_amount)
                : null;
              return (
                <tr key={c.id} className="border-b border-mute last:border-0 hover:bg-canvas-soft">
                  <td className="px-md py-md">
                    <Link href={`/contract/${c.id}`} className="font-semibold text-primary-dark">{c.batches?.batch_code ?? '—'}</Link>
                    {c.dispute_notes && <div className="text-xs text-warning-ink mt-xxs">⚠ {c.dispute_notes}</div>}
                  </td>
                  <td className="px-md py-md text-body">{c.integrators?.name ?? '—'}</td>
                  <td className="px-md py-md text-body">{formatDateDDMonYYYY(c.actual_harvest_date)}</td>
                  <td className="px-md py-md text-body">{formatDateDDMonYYYY(c.settlement_received_date)}</td>
                  <td className="px-md py-md text-right tabular-nums">{c.birds_delivered != null ? Number(c.birds_delivered).toLocaleString('en-IN') : '—'}</td>
                  <td className="px-md py-md text-right tabular-nums">{c.actual_fcr != null ? Number(c.actual_fcr).toFixed(3) : '—'}</td>
                  <td className="px-md py-md text-right tabular-nums">{c.expected_settlement_amount ? formatCurrencyINR(Number(c.expected_settlement_amount)) : '—'}</td>
                  <td className="px-md py-md text-right tabular-nums">{c.actual_settlement_amount ? formatCurrencyINR(Number(c.actual_settlement_amount)) : '—'}</td>
                  <td className={`px-md py-md text-right tabular-nums font-semibold ${v == null ? '' : v >= 0 ? 'text-success-ink' : 'text-danger'}`}>
                    {v == null ? '—' : `${v >= 0 ? '+' : ''}${formatCurrencyINR(v)}`}
                  </td>
                  <td className="px-md py-md">
                    <StatusBadge status={c.status} />
                  </td>
                </tr>
              );
            })}
            {rows.length === 0 && (
              <tr><td colSpan={10} className="py-2xl text-center text-body">No harvested or settled cycles yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Kpi({ label, value, accent }: { label: string; value: string; accent?: 'success' | 'danger' | 'warning' }) {
  const tone = accent === 'success' ? 'text-success-ink' : accent === 'danger' ? 'text-danger' : accent === 'warning' ? 'text-warning-ink' : 'text-ink';
  return (
    <div className="card">
      <p className="text-xs uppercase tracking-wider text-body-soft mb-xs">{label}</p>
      <p className={`text-xl font-bold ${tone}`}>{value}</p>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const tone =
    status === 'settled' ? 'bg-success-soft text-success-ink'
    : status === 'disputed' ? 'bg-warning-soft text-warning-ink'
    : status === 'harvest_complete' ? 'bg-primary-subtle text-primary'
    : 'bg-mute-soft text-body';
  return <span className={`px-sm py-xxs rounded-md text-xs font-semibold ${tone}`}>{status}</span>;
}
