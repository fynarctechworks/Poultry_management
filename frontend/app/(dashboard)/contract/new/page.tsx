import Link from 'next/link';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { UpgradeGate } from '@/components/UpgradeGate';
import { ContractCycleForm } from './ContractCycleForm';

export default async function NewContractCyclePage() {
  return (
    <UpgradeGate
      feature="Contract farming"
      description="Starting a contract cycle requires a paid plan."
    >
      <NewContractCycleContent />
    </UpgradeGate>
  );
}

async function NewContractCycleContent() {
  const supabase = createSupabaseServerClient();

  const [{ data: integrators }, { data: batches }] = await Promise.all([
    supabase.from('integrators').select('id, name, tariff_card_json').order('name'),
    supabase
      .from('batches')
      .select('id, batch_code, breed_name, opening_bird_count, placement_date, farm_id, farms(farm_name, farm_type)')
      .eq('status', 'active'),
  ]);

  // Filter to batches on contract farms with no existing cycle
  const { data: existingCycles } = await supabase.from('contract_cycles').select('batch_id');
  const usedBatchIds = new Set((existingCycles ?? []).map((c) => c.batch_id));
  const eligible = (batches ?? []).filter((b: any) => b.farms?.farm_type === 'contract' && !usedBatchIds.has(b.id));

  return (
    <div className="max-w-[720px] mx-auto">
      <Link href="/contract" className="text-sm text-primary-dark font-semibold">&larr; Contract cycles</Link>
      <h1 className="font-display text-3xl text-ink mt-md mb-2xl">Start contract cycle</h1>
      <ContractCycleForm integrators={integrators ?? []} batches={eligible as any} />
    </div>
  );
}
