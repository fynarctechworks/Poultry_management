import { createSupabaseServerClient } from '@/lib/supabase/server';
import { ReportExports } from './ReportExports';
import { PageHeader } from '@/components/ui/PageHeader';
import { UpgradeGate } from '@/components/UpgradeGate';

export default async function ReportsPage() {
  // "Full export" is a paid-plan feature (CLAUDE.md freemium table). Gate it
  // server-side via the same is_paid() RPC used by /multi-farm and /contract.
  return (
    <UpgradeGate
      feature="Data export"
      description="Export your daily logs, transactions and batch performance to CSV for accounting and record-keeping — a paid plan feature."
    >
      <ReportsContent />
    </UpgradeGate>
  );
}

async function ReportsContent() {
  const supabase = createSupabaseServerClient();
  const { data: farms } = await supabase
    .from('farms')
    .select('id, farm_name')
    .order('farm_name');

  return (
    <div className="max-w-[900px] mx-auto">
      <PageHeader
        eyebrow="Insights"
        title="Reports"
        subtitle="CSV exports for daily logs, transactions, and batch performance."
        orbs={['lavender', 'sky']}
      />
      <ReportExports farms={farms ?? []} />
    </div>
  );
}
