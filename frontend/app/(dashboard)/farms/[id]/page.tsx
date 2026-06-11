import Link from 'next/link';
import { notFound } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { formatDateDDMonYYYY } from '@/lib/utils';

export default async function FarmDetailPage({ params }: { params: { id: string } }) {
  const supabase = createSupabaseServerClient();

  const { data: farm } = await supabase
    .from('farms')
    .select('id, farm_name, state, district, farm_type, latitude, longitude, heat_stress_threshold_celsius, upi_id, gstin')
    .eq('id', params.id)
    .maybeSingle();

  if (!farm) notFound();

  const [{ data: sheds }, { data: batches }] = await Promise.all([
    supabase
      .from('sheds')
      .select('id, shed_name, capacity, poultry_type, status')
      .eq('farm_id', params.id)
      .order('shed_name'),
    supabase
      .from('batches')
      .select('id, batch_code, breed_name, poultry_type, placement_date, opening_bird_count, current_bird_count, status, sheds(shed_name)')
      .eq('farm_id', params.id)
      .order('placement_date', { ascending: false })
      .limit(50),
  ]);

  return (
    <div className="max-w-[1200px] mx-auto">
      <Link href="/farms" className="text-sm text-primary-dark font-semibold">&larr; Farms</Link>
      <div className="flex items-start justify-between mt-md gap-md">
        <div>
          <h1 className="text-3xl font-bold text-ink">{farm.farm_name}</h1>
          <p className="text-sm text-body mt-xs">{[farm.district, farm.state].filter(Boolean).join(', ') || '—'}</p>
        </div>
        <Link href={`/farms/${farm.id}/edit`} className="btn-outline shrink-0">Edit farm</Link>
      </div>

      <section className="card mt-2xl">
        <h2 className="text-lg font-bold text-ink mb-md">Farm details</h2>
        <dl className="grid grid-cols-2 md:grid-cols-3 gap-md text-sm">
          <Info label="Type" value={farm.farm_type} />
          <Info label="GSTIN" value={farm.gstin ?? '—'} />
          <Info label="UPI ID" value={farm.upi_id ?? '—'} />
          <Info label="Heat threshold" value={`${farm.heat_stress_threshold_celsius ?? 35} °C`} />
          <Info label="Coordinates" value={farm.latitude && farm.longitude ? `${farm.latitude}, ${farm.longitude}` : '—'} />
        </dl>
      </section>

      <section className="mt-2xl">
        <div className="flex items-center justify-between mb-md">
          <h2 className="text-lg font-bold text-ink">Sheds</h2>
          <Link href="/sheds/new" className="btn-subtle text-sm">+ Add shed</Link>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-md">
          {(sheds ?? []).map((s) => (
            <div key={s.id} className="card">
              <div className="flex items-start justify-between">
                <p className="font-semibold text-ink">{s.shed_name}</p>
                <Link href={`/sheds/${s.id}/edit`} className="text-xs text-primary-dark font-semibold">Edit</Link>
              </div>
              <p className="text-xs text-body-soft mt-xxs">{s.poultry_type} · {s.capacity} cap</p>
              <span className={`inline-block mt-sm px-sm py-xxs rounded-md text-xs font-semibold ${s.status === 'active' ? 'bg-success-soft text-success-ink' : 'bg-mute-soft text-body'}`}>
                {s.status}
              </span>
            </div>
          ))}
          {(!sheds || sheds.length === 0) && (
            <p className="text-sm text-body">No sheds yet.</p>
          )}
        </div>
      </section>

      <section className="mt-2xl">
        <div className="flex items-center justify-between mb-md">
          <h2 className="text-lg font-bold text-ink">Recent batches</h2>
          <Link href="/batches/new" className="btn-subtle text-sm">+ New batch</Link>
        </div>
        <div className="card overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead className="bg-canvas-soft border-b border-mute">
              <tr className="text-left text-xs uppercase tracking-wider text-body-soft">
                <th className="px-md py-sm">Batch</th>
                <th className="px-md py-sm">Shed</th>
                <th className="px-md py-sm">Breed</th>
                <th className="px-md py-sm">Placed</th>
                <th className="px-md py-sm text-right">Opening</th>
                <th className="px-md py-sm text-right">Current</th>
                <th className="px-md py-sm">Status</th>
              </tr>
            </thead>
            <tbody>
              {(batches ?? []).map((b: any) => (
                <tr key={b.id} className="border-b border-mute last:border-0 hover:bg-canvas-soft">
                  <td className="px-md py-md">
                    <Link href={`/batches/${b.id}`} className="font-semibold text-primary-dark">{b.batch_code}</Link>
                  </td>
                  <td className="px-md py-md text-body">{b.sheds?.shed_name ?? '—'}</td>
                  <td className="px-md py-md text-body">{b.breed_name}</td>
                  <td className="px-md py-md text-body">{formatDateDDMonYYYY(b.placement_date)}</td>
                  <td className="px-md py-md text-right tabular-nums">{b.opening_bird_count}</td>
                  <td className="px-md py-md text-right tabular-nums">{b.current_bird_count}</td>
                  <td className="px-md py-md">
                    <span className={`px-sm py-xxs rounded-md text-xs font-semibold ${b.status === 'active' ? 'bg-success-soft text-success-ink' : 'bg-mute-soft text-body'}`}>
                      {b.status}
                    </span>
                  </td>
                </tr>
              ))}
              {(!batches || batches.length === 0) && (
                <tr><td colSpan={7} className="py-2xl text-center text-body">No batches yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string | number }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wider text-body-soft">{label}</dt>
      <dd className="text-sm font-semibold text-ink mt-xxs">{value}</dd>
    </div>
  );
}
