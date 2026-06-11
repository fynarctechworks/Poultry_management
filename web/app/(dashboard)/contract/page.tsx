import Link from 'next/link';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { formatCurrencyINR, formatDateDDMonYYYY } from '@/lib/utils';
import { UpgradeGate } from '@/components/UpgradeGate';

export default async function ContractListPage() {
  return (
    <UpgradeGate
      feature="Contract farming"
      description="Track integrator inputs, settlement math, and reconciliation reports for Suguna / Venkateshwara / Skylark / IB Group cycles — a paid plan feature."
    >
      <ContractListContent />
    </UpgradeGate>
  );
}

async function ContractListContent() {
  const supabase = createSupabaseServerClient();

  const { data: cycles } = await supabase
    .from('contract_cycles')
    .select(`
      id, status, chicks_supplied, chicks_supplied_date,
      expected_harvest_date, actual_harvest_date,
      birds_delivered, avg_weight_kg, actual_fcr, actual_mortality_pct,
      expected_settlement_amount, actual_settlement_amount, settlement_received_date,
      batches(batch_code, breed_name), integrators(name), farms(farm_name)
    `)
    .order('chicks_supplied_date', { ascending: false });

  return (
    <div className="max-w-[1400px] mx-auto">
      <div className="flex items-center justify-between mb-xs">
        <h1 className="text-3xl font-bold text-ink">Contract Farming</h1>
        <div className="flex items-center gap-md">
          <Link href="/contract/settlements" className="btn-outline">Settlement history</Link>
          <Link href="/contract/new" className="btn-primary">Start cycle</Link>
        </div>
      </div>
      <p className="text-sm text-body mb-2xl">Contract cycles across all your farms. Settlement math is tariff-card driven.</p>

      <div className="card overflow-x-auto p-0">
        <table className="w-full text-sm">
          <thead className="bg-canvas-soft border-b border-mute">
            <tr className="text-left text-xs uppercase tracking-wider text-body-soft">
              <th className="px-md py-sm">Batch</th>
              <th className="px-md py-sm">Integrator</th>
              <th className="px-md py-sm">Farm</th>
              <th className="px-md py-sm text-right">Chicks</th>
              <th className="px-md py-sm">Placed</th>
              <th className="px-md py-sm">Status</th>
              <th className="px-md py-sm text-right">Expected ₹</th>
              <th className="px-md py-sm text-right">Actual ₹</th>
              <th className="px-md py-sm text-right">Variance</th>
            </tr>
          </thead>
          <tbody>
            {(cycles ?? []).map((c: any) => {
              const variance = c.actual_settlement_amount != null && c.expected_settlement_amount != null
                ? Number(c.actual_settlement_amount) - Number(c.expected_settlement_amount)
                : null;
              return (
                <tr key={c.id} className="border-b border-mute last:border-0 hover:bg-canvas-soft">
                  <td className="px-md py-md">
                    <Link href={`/contract/${c.id}`} className="font-semibold text-primary-dark">{c.batches?.batch_code ?? '—'}</Link>
                    <div className="text-xs text-body-soft">{c.batches?.breed_name}</div>
                  </td>
                  <td className="px-md py-md text-body">{c.integrators?.name ?? '—'}</td>
                  <td className="px-md py-md text-body">{c.farms?.farm_name ?? '—'}</td>
                  <td className="px-md py-md text-right tabular-nums">{c.chicks_supplied.toLocaleString('en-IN')}</td>
                  <td className="px-md py-md text-body">{formatDateDDMonYYYY(c.chicks_supplied_date)}</td>
                  <td className="px-md py-md">
                    <StatusBadge status={c.status} />
                  </td>
                  <td className="px-md py-md text-right tabular-nums">{c.expected_settlement_amount ? formatCurrencyINR(Number(c.expected_settlement_amount)) : '—'}</td>
                  <td className="px-md py-md text-right tabular-nums">{c.actual_settlement_amount ? formatCurrencyINR(Number(c.actual_settlement_amount)) : '—'}</td>
                  <td className={`px-md py-md text-right tabular-nums font-semibold ${variance == null ? '' : variance >= 0 ? 'text-success-ink' : 'text-danger'}`}>
                    {variance == null ? '—' : `${variance >= 0 ? '+' : ''}${formatCurrencyINR(variance)}`}
                  </td>
                </tr>
              );
            })}
            {(!cycles || cycles.length === 0) && (
              <tr><td colSpan={9} className="py-2xl text-center text-body">No contract cycles yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>
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
