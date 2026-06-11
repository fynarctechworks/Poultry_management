import Link from 'next/link';
import { notFound } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { formatCurrencyINR, formatDateDDMonYYYY } from '@/lib/utils';
import { UpgradeGate } from '@/components/UpgradeGate';
import { CycleActions } from './CycleActions';

export default async function ContractDetailPage({ params }: { params: { id: string } }) {
  return (
    <UpgradeGate
      feature="Contract farming"
      description="Contract cycle detail, settlement calculator, and reconciliation reporting are part of the paid plan."
    >
      <ContractDetailContent id={params.id} />
    </UpgradeGate>
  );
}

async function ContractDetailContent({ id }: { id: string }) {
  const supabase = createSupabaseServerClient();

  const { data: cycle } = await supabase
    .from('contract_cycles')
    .select(`*, batches(batch_code, breed_name, opening_bird_count, current_bird_count, placement_date),
             integrators(name, tariff_card_json), farms(farm_name)`)
    .eq('id', id)
    .maybeSingle() as any;

  if (!cycle) notFound();

  const tariff = cycle.integrators?.tariff_card_json ?? {};
  const variance = cycle.actual_settlement_amount != null && cycle.expected_settlement_amount != null
    ? Number(cycle.actual_settlement_amount) - Number(cycle.expected_settlement_amount)
    : null;

  return (
    <div className="max-w-[1100px] mx-auto">
      <Link href="/contract" className="text-sm text-primary-dark font-semibold">&larr; Contract cycles</Link>
      <div className="flex items-baseline justify-between mt-md flex-wrap gap-md">
        <div>
          <h1 className="text-3xl font-bold text-ink">{cycle.batches?.batch_code ?? 'Cycle'}</h1>
          <p className="text-sm text-body mt-xs">{cycle.integrators?.name} · {cycle.farms?.farm_name} · {cycle.batches?.breed_name}</p>
        </div>
        <span className={`px-md py-xs rounded-md text-sm font-semibold ${
          cycle.status === 'settled' ? 'bg-success-soft text-success-ink' :
          cycle.status === 'disputed' ? 'bg-warning-soft text-warning-ink' :
          'bg-primary-subtle text-primary'
        }`}>{cycle.status}</span>
      </div>

      <section className="grid grid-cols-1 lg:grid-cols-2 gap-lg mt-2xl">
        <div className="card">
          <h2 className="text-lg font-bold text-ink mb-md">Inputs from integrator</h2>
          <dl className="space-y-md text-sm">
            <Row label="Chicks supplied" value={cycle.chicks_supplied.toLocaleString('en-IN')} />
            <Row label="Supply date" value={formatDateDDMonYYYY(cycle.chicks_supplied_date)} />
            <Row label="Feed supplied (kg)" value={Number(cycle.total_feed_supplied_kg ?? 0).toLocaleString('en-IN')} />
            <Row label="Expected harvest" value={formatDateDDMonYYYY(cycle.expected_harvest_date)} />
          </dl>
        </div>

        <div className="card">
          <h2 className="text-lg font-bold text-ink mb-md">Performance</h2>
          <dl className="space-y-md text-sm">
            <Row label="Actual harvest" value={formatDateDDMonYYYY(cycle.actual_harvest_date)} />
            <Row label="Birds delivered" value={cycle.birds_delivered?.toLocaleString('en-IN') ?? '—'} />
            <Row label="Avg weight (kg)" value={cycle.avg_weight_kg ? Number(cycle.avg_weight_kg).toFixed(3) : '—'} />
            <Row label="FCR" value={cycle.actual_fcr ? Number(cycle.actual_fcr).toFixed(3) : '—'} />
            <Row label="Mortality %" value={cycle.actual_mortality_pct ? `${Number(cycle.actual_mortality_pct).toFixed(2)}%` : '—'} />
          </dl>
        </div>
      </section>

      <section className="card mt-lg">
        <h2 className="text-lg font-bold text-ink mb-md">Tariff card — {cycle.integrators?.name}</h2>
        <dl className="grid grid-cols-2 md:grid-cols-4 gap-md text-sm">
          <Row label="Base ₹/kg" value={tariff.base_growing_charge_per_kg ? formatCurrencyINR(Number(tariff.base_growing_charge_per_kg)) : '—'} />
          <Row label="FCR bonus threshold" value={tariff.fcr_bonus?.threshold ?? '—'} />
          <Row label="FCR bonus ₹/kg" value={tariff.fcr_bonus?.bonus_per_kg ? formatCurrencyINR(Number(tariff.fcr_bonus.bonus_per_kg)) : '—'} />
          <Row label="Mortality bonus %" value={tariff.mortality_bonus?.threshold_pct ?? '—'} />
          <Row label="Target weight (kg)" value={tariff.weight_target_kg ?? '—'} />
          <Row label="Cycle days" value={tariff.cycle_days ?? '—'} />
        </dl>
      </section>

      <section className="card mt-lg">
        <h2 className="text-lg font-bold text-ink mb-md">Settlement</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-md">
          <Kpi label="Expected" value={cycle.expected_settlement_amount ? formatCurrencyINR(Number(cycle.expected_settlement_amount)) : '—'} />
          <Kpi label="Actual" value={cycle.actual_settlement_amount ? formatCurrencyINR(Number(cycle.actual_settlement_amount)) : '—'} />
          <Kpi
            label="Variance"
            value={variance == null ? '—' : `${variance >= 0 ? '+' : ''}${formatCurrencyINR(variance)}`}
            accent={variance == null ? undefined : variance >= 0 ? 'success' : 'danger'}
          />
        </div>
        {cycle.settlement_received_date && (
          <p className="text-xs text-body-soft mt-md">Received {formatDateDDMonYYYY(cycle.settlement_received_date)}</p>
        )}
        {cycle.dispute_notes && (
          <div className="mt-md p-md bg-warning-soft rounded-md text-sm text-warning-ink">
            <p className="font-semibold mb-xs">Dispute notes</p>
            <p>{cycle.dispute_notes}</p>
          </div>
        )}
      </section>

      <CycleActions
        cycleId={cycle.id}
        status={cycle.status}
        initial={{
          actual_harvest_date: cycle.actual_harvest_date,
          birds_delivered: cycle.birds_delivered,
          avg_weight_kg: cycle.avg_weight_kg,
          actual_fcr: cycle.actual_fcr,
          actual_mortality_pct: cycle.actual_mortality_pct,
          expected_settlement_amount: cycle.expected_settlement_amount,
        }}
      />
    </div>
  );
}

function Row({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex items-center justify-between border-b border-mute last:border-0 pb-sm last:pb-0">
      <dt className="text-body">{label}</dt>
      <dd className="font-semibold text-ink">{value}</dd>
    </div>
  );
}

function Kpi({ label, value, accent }: { label: string; value: string; accent?: 'success' | 'danger' }) {
  const tone = accent === 'success' ? 'text-success-ink' : accent === 'danger' ? 'text-danger' : 'text-ink';
  return (
    <div>
      <p className="text-xs uppercase tracking-wider text-body-soft">{label}</p>
      <p className={`text-2xl font-bold ${tone}`}>{value}</p>
    </div>
  );
}
