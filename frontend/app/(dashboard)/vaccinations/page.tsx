import Link from 'next/link';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { formatDateDDMonYYYY } from '@/lib/utils';
import { MarkDoneButton } from './MarkDoneButton';
import { DeleteButton } from '@/components/DeleteButton';
import { PageHeader } from '@/components/ui/PageHeader';

export default async function VaccinationsPage() {
  const supabase = createSupabaseServerClient();

  const { data: vaccinations } = await supabase
    .from('vaccinations')
    .select('id, vaccine_name, scheduled_date, administered_date, dose, route, birds_vaccinated, status, batches(batch_code, breed_name, farms(farm_name))')
    .order('scheduled_date', { ascending: true });

  const grouped = {
    scheduled: (vaccinations ?? []).filter((v: any) => v.status === 'scheduled'),
    overdue: (vaccinations ?? []).filter((v: any) => v.status === 'overdue'),
    done: (vaccinations ?? []).filter((v: any) => v.status === 'done'),
  };

  return (
    <div className="max-w-[1200px] mx-auto">
      <PageHeader
        eyebrow="Operations"
        title="Vaccinations"
        subtitle="Scheduled, overdue and completed doses per batch."
        actions={<Link href="/vaccinations/new" className="btn-primary">Schedule</Link>}
      />

      <Section title="Overdue" rows={grouped.overdue} accent="warning" />
      <Section title="Upcoming" rows={grouped.scheduled} />
      <Section title="Completed" rows={grouped.done} />
    </div>
  );
}

function Section({ title, rows, accent }: { title: string; rows: any[]; accent?: 'warning' }) {
  if (rows.length === 0) return null;
  return (
    <section className="mb-2xl">
      <h2 className={`text-lg font-bold mb-md ${accent === 'warning' ? 'text-warning-ink' : 'text-ink'}`}>{title}</h2>
      <div className="card p-0 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-canvas-soft border-b border-mute">
            <tr className="text-left text-xs uppercase tracking-wider text-body-soft">
              <th className="px-md py-sm">Vaccine</th>
              <th className="px-md py-sm">Batch</th>
              <th className="px-md py-sm">Scheduled</th>
              <th className="px-md py-sm">Given</th>
              <th className="px-md py-sm">Dose / Route</th>
              <th className="px-md py-sm text-right">Birds</th>
              <th className="px-md py-sm text-right">Action</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((v) => (
              <tr key={v.id} className="border-b border-mute last:border-0">
                <td className="px-md py-md font-semibold text-ink">{v.vaccine_name}</td>
                <td className="px-md py-md text-body">
                  {v.batches?.batch_code} <span className="text-body-soft">· {v.batches?.farms?.farm_name}</span>
                </td>
                <td className="px-md py-md text-body">{formatDateDDMonYYYY(v.scheduled_date)}</td>
                <td className="px-md py-md text-body">{formatDateDDMonYYYY(v.administered_date)}</td>
                <td className="px-md py-md text-body">{[v.dose, v.route].filter(Boolean).join(' · ') || '—'}</td>
                <td className="px-md py-md text-right tabular-nums">{v.birds_vaccinated ?? '—'}</td>
                <td className="px-md py-md text-right">
                  <div className="flex justify-end gap-md items-center">
                    {v.status !== 'done' && <MarkDoneButton id={v.id} />}
                    <Link href={`/vaccinations/${v.id}/edit`} className="text-xs text-primary-dark font-semibold">Edit</Link>
                    <DeleteButton table="vaccinations" id={v.id} variant="link" />
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
