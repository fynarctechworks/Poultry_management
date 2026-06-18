import Link from 'next/link';
import { notFound } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { EditDailyLogForm } from './EditDailyLogForm';
import { DeleteButton } from '@/components/DeleteButton';

export default async function EditDailyLogPage({ params }: { params: { id: string } }) {
  const supabase = createSupabaseServerClient();

  const { data: log } = await supabase
    .from('daily_logs')
    .select('id, batch_id, log_date, birds_dead, death_cause, feed_consumed_kg, feed_type, eggs_collected, avg_bird_weight_g, notes')
    .eq('id', params.id)
    .maybeSingle();

  if (!log) notFound();

  return (
    <div className="max-w-[720px] mx-auto">
      <Link href="/daily-log" className="text-sm text-primary-dark font-semibold">&larr; Daily logs</Link>
      <h1 className="font-display text-3xl text-ink mt-md mb-2xl">Edit daily log</h1>
      <EditDailyLogForm log={log as any} />
      <div className="card mt-lg">
        <p className="text-sm font-semibold text-ink mb-xs">Delete this log</p>
        <p className="text-xs text-body-soft mb-md">
          Removes the entry and reverses its effect — birds restored to the batch count and feed returned to inventory stock.
        </p>
        <DeleteButton table="daily_logs" id={log.id} redirectTo="/daily-log" label="Delete log" />
      </div>
    </div>
  );
}
