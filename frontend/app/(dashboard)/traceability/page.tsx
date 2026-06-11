import Link from 'next/link';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { formatDateDDMonYYYY } from '@/lib/utils';
import { ShareTraceability } from './ShareTraceability';

export default async function TraceabilityListPage() {
  const supabase = createSupabaseServerClient();

  const { data: records } = await supabase
    .from('traceability_records')
    .select('id, qr_token, supplier_name, breed_name, placement_date, harvest_date, buyer_name, withdrawal_cleared, is_locked, batches(batch_code), farms(farm_name)')
    .order('placement_date', { ascending: false });

  const rows = (records ?? []) as any[];

  return (
    <div className="max-w-[1200px] mx-auto">
      <div className="mb-xs">
        <h1 className="text-3xl font-bold text-ink">Traceability</h1>
      </div>
      <p className="text-sm text-body mb-2xl">Farm-to-plate certificates. Share the public link or QR with buyers for full provenance.</p>

      <div className="card overflow-x-auto p-0">
        <table className="w-full text-sm">
          <thead className="bg-canvas-soft border-b border-mute">
            <tr className="text-left text-xs uppercase tracking-wider text-body-soft">
              <th className="px-md py-sm">Batch</th>
              <th className="px-md py-sm">Breed</th>
              <th className="px-md py-sm">Farm</th>
              <th className="px-md py-sm">Placed</th>
              <th className="px-md py-sm">Harvested</th>
              <th className="px-md py-sm">Buyer</th>
              <th className="px-md py-sm">Status</th>
              <th className="px-md py-sm text-right">Share</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-b border-mute last:border-0 hover:bg-canvas-soft">
                <td className="px-md py-md">
                  <Link href={`/traceability/${r.qr_token}`} className="font-semibold text-primary-dark">{r.batches?.batch_code ?? '—'}</Link>
                </td>
                <td className="px-md py-md text-body">{r.breed_name ?? '—'}</td>
                <td className="px-md py-md text-body">{r.farms?.farm_name ?? '—'}</td>
                <td className="px-md py-md text-body">{formatDateDDMonYYYY(r.placement_date)}</td>
                <td className="px-md py-md text-body">{formatDateDDMonYYYY(r.harvest_date)}</td>
                <td className="px-md py-md text-body">{r.buyer_name ?? '—'}</td>
                <td className="px-md py-md">
                  <div className="flex flex-wrap gap-xxs">
                    {r.is_locked
                      ? <span className="px-sm py-xxs rounded-md text-xs font-semibold bg-success-soft text-success-ink">Locked</span>
                      : <span className="px-sm py-xxs rounded-md text-xs font-semibold bg-mute-soft text-body">In progress</span>}
                    {r.withdrawal_cleared && (
                      <span className="px-sm py-xxs rounded-md text-xs font-semibold bg-success-soft text-success-ink">Withdrawal cleared</span>
                    )}
                  </div>
                </td>
                <td className="px-md py-md text-right">
                  <ShareTraceability token={r.qr_token} batchCode={r.batches?.batch_code ?? 'batch'} />
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr><td colSpan={8} className="py-2xl text-center text-body">No traceability records yet. They are generated when a batch is closed.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
