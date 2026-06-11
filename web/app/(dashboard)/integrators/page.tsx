import Link from 'next/link';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { formatCurrencyINR } from '@/lib/utils';

export default async function IntegratorsPage() {
  const supabase = createSupabaseServerClient();
  const { data: integrators } = await supabase
    .from('integrators')
    .select('id, name, state_presence, tariff_card_json, is_pre_loaded')
    .order('name');

  return (
    <div className="max-w-[1100px] mx-auto">
      <div className="flex items-center justify-between mb-2xl">
        <h1 className="text-3xl font-bold text-ink">Integrators</h1>
        <Link href="/integrators/new" className="btn-primary">Add custom integrator</Link>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-md">
        {(integrators ?? []).map((i: any) => {
          const t = i.tariff_card_json ?? {};
          return (
            <div key={i.id} className="card">
              <div className="flex items-baseline justify-between">
                <h2 className="text-lg font-bold text-ink">{i.name}</h2>
                {i.is_pre_loaded
                  ? <span className="px-sm py-xxs rounded-md text-xs font-semibold bg-primary-subtle text-primary">Pre-loaded</span>
                  : <span className="px-sm py-xxs rounded-md text-xs font-semibold bg-mute-soft text-body">Custom</span>}
              </div>
              {i.state_presence?.length > 0 && (
                <p className="text-xs text-body-soft mt-xxs">{i.state_presence.join(', ')}</p>
              )}
              <dl className="grid grid-cols-2 gap-sm mt-md text-sm">
                <Item label="Base / kg" value={t.base_growing_charge_per_kg ? formatCurrencyINR(Number(t.base_growing_charge_per_kg)) : '—'} />
                <Item label="Target weight" value={t.weight_target_kg ? `${t.weight_target_kg} kg` : '—'} />
                <Item label="Cycle days" value={t.cycle_days ?? '—'} />
                <Item label="FCR bonus ≤" value={t.fcr_bonus?.threshold ?? '—'} />
                <Item label="Mortality bonus ≤" value={t.mortality_bonus?.threshold_pct ? `${t.mortality_bonus.threshold_pct}%` : '—'} />
              </dl>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Item({ label, value }: { label: string; value: any }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wider text-body-soft">{label}</dt>
      <dd className="font-semibold text-ink">{value}</dd>
    </div>
  );
}
