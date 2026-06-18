import Link from 'next/link';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { formatDateDDMonYYYY } from '@/lib/utils';
import { PageHeader } from '@/components/ui/PageHeader';

export default async function DailyLogListPage() {
  const supabase = createSupabaseServerClient();

  const { data: logs } = await supabase
    .from('daily_logs')
    .select('id, log_date, birds_dead, death_cause, feed_consumed_kg, feed_type, eggs_collected, avg_bird_weight_g, batches(batch_code), farms(farm_name)')
    .order('log_date', { ascending: false })
    .limit(100);

  return (
    <div className="max-w-[1200px] mx-auto">
      <PageHeader
        eyebrow="Operations"
        title="Daily logs"
        subtitle="Mortality, feed, eggs and weights — the daily source of truth."
        actions={<Link href="/daily-log/new" className="btn-primary">Log entry</Link>}
      />

      <div className="card overflow-x-auto p-0">
        <table className="w-full text-sm">
          <thead className="bg-canvas-soft border-b border-mute">
            <tr className="text-left text-xs uppercase tracking-wider text-body-soft">
              <th className="px-md py-sm">Date</th>
              <th className="px-md py-sm">Farm</th>
              <th className="px-md py-sm">Batch</th>
              <th className="px-md py-sm text-right">Deaths</th>
              <th className="px-md py-sm">Cause</th>
              <th className="px-md py-sm text-right">Feed (kg)</th>
              <th className="px-md py-sm">Feed type</th>
              <th className="px-md py-sm text-right">Eggs</th>
              <th className="px-md py-sm text-right">Avg wt (g)</th>
              <th className="px-md py-sm text-right">Action</th>
            </tr>
          </thead>
          <tbody>
            {(logs ?? []).map((l: any) => (
              <tr key={l.id} className="border-b border-mute last:border-0">
                <td className="px-md py-md">{formatDateDDMonYYYY(l.log_date)}</td>
                <td className="px-md py-md text-body">{l.farms?.farm_name ?? '—'}</td>
                <td className="px-md py-md text-body">{l.batches?.batch_code ?? '—'}</td>
                <td className={`px-md py-md text-right tabular-nums ${l.birds_dead > 0 ? 'text-danger font-semibold' : ''}`}>{l.birds_dead ?? 0}</td>
                <td className="px-md py-md text-body">{l.birds_dead > 0 ? (l.death_cause ?? '—') : '—'}</td>
                <td className="px-md py-md text-right tabular-nums">{Number(l.feed_consumed_kg ?? 0)}</td>
                <td className="px-md py-md text-body">{l.feed_type ?? '—'}</td>
                <td className="px-md py-md text-right tabular-nums">{l.eggs_collected ?? '—'}</td>
                <td className="px-md py-md text-right tabular-nums">{l.avg_bird_weight_g ?? '—'}</td>
                <td className="px-md py-md text-right">
                  <Link href={`/daily-log/${l.id}/edit`} className="text-xs text-primary-dark font-semibold">Edit</Link>
                </td>
              </tr>
            ))}
            {(!logs || logs.length === 0) && (
              <tr><td colSpan={10} className="py-2xl text-center text-body">No daily logs yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
