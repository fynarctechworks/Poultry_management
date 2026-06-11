import { createSupabaseServerClient } from '@/lib/supabase/server';
import { ReportExports } from './ReportExports';

export default async function ReportsPage() {
  const supabase = createSupabaseServerClient();
  const { data: farms } = await supabase
    .from('farms')
    .select('id, farm_name')
    .order('farm_name');

  return (
    <div className="max-w-[900px] mx-auto">
      <h1 className="text-3xl font-bold text-ink mb-xs">Reports</h1>
      <p className="text-sm text-body mb-2xl">CSV exports for daily logs, transactions, and batch performance.</p>
      <ReportExports farms={farms ?? []} />
    </div>
  );
}
