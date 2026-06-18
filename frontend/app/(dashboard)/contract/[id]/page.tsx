import Link from 'next/link';
import { notFound } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { formatCurrencyINR, formatDateDDMonYYYY } from '@/lib/utils';
import { UpgradeGate } from '@/components/UpgradeGate';
import {
  computeContractReconciliation,
  parseTariffCard,
  buildContractReconciliationMessage,
  type ReconLineKey,
} from '@poultryos/shared';
import { CycleActions } from './CycleActions';

const RECON_LABEL: Record<ReconLineKey, string> = {
  birds_lifted: 'Birds lifted',
  avg_weight: 'Avg weight (kg)',
  fcr: 'FCR',
  mortality: 'Mortality %',
};

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

  // Reconciliation: your data vs the integrator-stated figures through the
  // grower-confirmed tariff (snapshot preferred, integrator master fallback).
  const tariffConfirmed = cycle.tariff_confirmed_at != null;
  const effectiveTariffRaw = cycle.tariff_card_snapshot ?? tariff;
  const parsedTariff = parseTariffCard(effectiveTariffRaw);
  const num = (v: unknown) => (v == null ? null : Number(v));
  const recon = computeContractReconciliation({
    tariff: parsedTariff,
    your: {
      birdsLifted: num(cycle.birds_delivered) ?? 0,
      avgWeightKg: num(cycle.avg_weight_kg) ?? 0,
      fcr: num(cycle.actual_fcr),
      mortalityPct: num(cycle.actual_mortality_pct),
    },
    integrator: {
      birdsLifted: num(cycle.integrator_birds_lifted) ?? undefined,
      avgWeightKg: num(cycle.integrator_avg_weight_kg) ?? undefined,
      fcr: num(cycle.integrator_fcr),
      mortalityPct: num(cycle.integrator_mortality_pct),
    },
    integratorStatedAmount: num(cycle.actual_settlement_amount),
    tariffConfirmed,
  });
  const hasIntegratorFigures =
    cycle.integrator_birds_lifted != null ||
    cycle.integrator_avg_weight_kg != null ||
    cycle.integrator_fcr != null ||
    cycle.integrator_mortality_pct != null ||
    cycle.actual_settlement_amount != null;

  const shareText = buildContractReconciliationMessage(recon, {
    batchCode: cycle.batches?.batch_code,
    farmName: cycle.farms?.farm_name,
    integratorName: cycle.integrators?.name,
    breedName: cycle.batches?.breed_name,
    chicksSupplied: num(cycle.chicks_supplied),
    totalFeedSuppliedKg: num(cycle.total_feed_supplied_kg),
    harvestDate: cycle.actual_harvest_date,
    settlementReceivedDate: cycle.settlement_received_date,
    disputeNotes: cycle.dispute_notes,
    your: {
      birdsLifted: num(cycle.birds_delivered) ?? 0,
      avgWeightKg: num(cycle.avg_weight_kg) ?? 0,
      fcr: num(cycle.actual_fcr),
      mortalityPct: num(cycle.actual_mortality_pct),
    },
    integrator: {
      birdsLifted: num(cycle.integrator_birds_lifted) ?? undefined,
      avgWeightKg: num(cycle.integrator_avg_weight_kg) ?? undefined,
      fcr: num(cycle.integrator_fcr),
      mortalityPct: num(cycle.integrator_mortality_pct),
    },
  });
  const shareHref = `https://wa.me/?text=${encodeURIComponent(shareText)}`;

  return (
    <div className="max-w-[1100px] mx-auto">
      <Link href="/contract" className="text-sm text-primary-dark font-semibold">&larr; Contract cycles</Link>
      <div className="flex items-baseline justify-between mt-md flex-wrap gap-md">
        <div>
          <h1 className="font-display text-3xl text-ink">{cycle.batches?.batch_code ?? 'Cycle'}</h1>
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
        <div className="flex items-center justify-between flex-wrap gap-sm mb-md">
          <h2 className="text-lg font-bold text-ink">
            Tariff terms {cycle.tariff_card_snapshot ? '(confirmed for this cycle)' : `— ${cycle.integrators?.name}`}
          </h2>
          {tariffConfirmed ? (
            <span className="px-sm py-xxs rounded-md text-xs font-semibold bg-success-soft text-success-ink">
              Confirmed {formatDateDDMonYYYY(cycle.tariff_confirmed_at)}
            </span>
          ) : (
            <span className="px-sm py-xxs rounded-md text-xs font-semibold bg-warning-soft text-warning-ink">
              Not yet confirmed — verify before reconciling
            </span>
          )}
        </div>
        <dl className="grid grid-cols-2 md:grid-cols-4 gap-md text-sm">
          <Row label="Base ₹/kg" value={parsedTariff.baseGrowingChargePerKg ? formatCurrencyINR(parsedTariff.baseGrowingChargePerKg) : '—'} />
          <Row label="FCR bonus threshold" value={parsedTariff.fcrBonus?.threshold ?? '—'} />
          <Row label="FCR bonus ₹/kg" value={parsedTariff.fcrBonus?.bonusPerKg ? formatCurrencyINR(parsedTariff.fcrBonus.bonusPerKg) : '—'} />
          <Row label="Mortality bonus %" value={parsedTariff.mortalityBonus?.thresholdPct ?? '—'} />
          <Row label="Mortality bonus ₹/kg" value={parsedTariff.mortalityBonus?.bonusPerKg ? formatCurrencyINR(parsedTariff.mortalityBonus.bonusPerKg) : '—'} />
          <Row label="Target weight (kg)" value={tariff.weight_target_kg ?? '—'} />
          <Row label="Cycle days" value={tariff.cycle_days ?? '—'} />
        </dl>
      </section>

      {hasIntegratorFigures && (
        <section className="card mt-lg">
          <div className="flex items-center justify-between flex-wrap gap-sm mb-md">
            <h2 className="text-lg font-bold text-ink">Reconciliation — your data vs integrator statement</h2>
            <a
              href={shareHref}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-xs px-md py-sm rounded-pill text-sm font-semibold text-white bg-whatsapp"
            >
              Share dispute summary
            </a>
          </div>

          {recon.expectedVsStatedGap != null && Math.abs(recon.expectedVsStatedGap) >= 1 ? (
            <div className={`p-md rounded-md mb-md text-sm font-semibold ${recon.expectedVsStatedGap > 0 ? 'bg-warning-soft text-warning-ink' : 'bg-success-soft text-success-ink'}`}>
              {recon.expectedVsStatedGap > 0
                ? `By your records you expect ${formatCurrencyINR(recon.yourSettlement.total)} — the statement shows ${formatCurrencyINR(recon.integratorStatedAmount ?? 0)}. You may be owed ${formatCurrencyINR(recon.expectedVsStatedGap)}.`
                : `The statement (${formatCurrencyINR(recon.integratorStatedAmount ?? 0)}) is at or above your expected ${formatCurrencyINR(recon.yourSettlement.total)}.`}
            </div>
          ) : (
            <p className="text-sm text-body mb-md">Enter the integrator-stated settlement amount below to see the bottom-line gap.</p>
          )}

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-mute">
                <tr className="text-left text-xs uppercase tracking-wider text-body-soft">
                  <th className="py-sm pr-md">Figure</th>
                  <th className="py-sm px-md text-right">Your data</th>
                  <th className="py-sm px-md text-right">Integrator</th>
                  <th className="py-sm px-md text-right">₹ impact</th>
                </tr>
              </thead>
              <tbody>
                {recon.lines.map((l) => (
                  <tr key={l.key} className="border-b border-mute last:border-0">
                    <td className="py-sm pr-md text-body">{RECON_LABEL[l.key]}</td>
                    <td className="py-sm px-md text-right tabular-nums text-ink">{l.yourValue ?? '—'}</td>
                    <td className="py-sm px-md text-right tabular-nums text-ink">{l.integratorValue ?? '—'}</td>
                    <td className={`py-sm px-md text-right tabular-nums font-semibold ${Math.abs(l.rupeeImpact) < 1 ? 'text-body-soft' : l.rupeeImpact > 0 ? 'text-success-ink' : 'text-danger'}`}>
                      {Math.abs(l.rupeeImpact) < 1 ? '—' : `${l.rupeeImpact >= 0 ? '+' : ''}${formatCurrencyINR(l.rupeeImpact)}`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-body-soft mt-md">
            ₹ impact shows what each figure gap is worth at the confirmed tariff. Positive = favours you (may be owed).
            {recon.statementArithmeticGap != null && Math.abs(recon.statementArithmeticGap) >= 1 && (
              <> The integrator&apos;s own figures imply {formatCurrencyINR(recon.integratorComputedSettlement.total)} vs the {formatCurrencyINR(recon.integratorStatedAmount ?? 0)} stated — a {formatCurrencyINR(recon.statementArithmeticGap)} arithmetic gap on their statement.</>
            )}
          </p>
        </section>
      )}

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
        tariffConfirmed={tariffConfirmed}
        tariffDefaults={{
          base_growing_charge_per_kg: parsedTariff.baseGrowingChargePerKg,
          fcr_threshold: parsedTariff.fcrBonus?.threshold ?? null,
          fcr_bonus_per_kg: parsedTariff.fcrBonus?.bonusPerKg ?? null,
          mortality_threshold_pct: parsedTariff.mortalityBonus?.thresholdPct ?? null,
          mortality_bonus_per_kg: parsedTariff.mortalityBonus?.bonusPerKg ?? null,
        }}
        initial={{
          actual_harvest_date: cycle.actual_harvest_date,
          birds_delivered: cycle.birds_delivered,
          avg_weight_kg: cycle.avg_weight_kg,
          actual_fcr: cycle.actual_fcr,
          actual_mortality_pct: cycle.actual_mortality_pct,
          expected_settlement_amount: cycle.expected_settlement_amount,
          integrator_birds_lifted: cycle.integrator_birds_lifted,
          integrator_avg_weight_kg: cycle.integrator_avg_weight_kg,
          integrator_fcr: cycle.integrator_fcr,
          integrator_mortality_pct: cycle.integrator_mortality_pct,
          actual_settlement_amount: cycle.actual_settlement_amount,
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
