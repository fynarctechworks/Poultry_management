import { createSupabaseServerClient } from '@/lib/supabase/server';
import { UpgradeButton } from './UpgradeButton';

const LIMITS = {
  free: { farms: 1, sheds: 3, workers: 2, buyers: 10, whatsapp: '5/month', multiFarm: false, traceability: false },
  active: { farms: 'Unlimited', sheds: 'Unlimited', workers: 'Unlimited', buyers: 'Unlimited', whatsapp: 'Unlimited', multiFarm: true, traceability: true },
} as const;

export default async function BillingPage() {
  const supabase = createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();

  const [
    { data: profile },
    { data: isPaidRpc },
    { count: farmCount },
    { count: shedCount },
    { count: workerCount },
    { count: buyerCount },
  ] = await Promise.all([
    supabase.from('profiles').select('subscription_status, subscription_id').eq('id', user!.id).maybeSingle(),
    supabase.rpc('is_paid'),
    supabase.from('farms').select('id', { count: 'exact', head: true }),
    supabase.from('sheds').select('id', { count: 'exact', head: true }),
    supabase.from('farm_users').select('id', { count: 'exact', head: true }).neq('role', 'owner'),
    supabase.from('buyers').select('id', { count: 'exact', head: true }),
  ]);

  // is_paid() honours the 7-day past_due grace; raw subscription_status does not.
  const isPaid = isPaidRpc === true;
  const tier = isPaid ? 'active' : 'free';
  const limits = LIMITS[tier];

  return (
    <div className="max-w-[1000px] mx-auto">
      <h1 className="text-3xl font-bold text-ink mb-xs">Billing</h1>
      <p className="text-sm text-body mb-2xl">Manage your subscription and see freemium usage.</p>

      <div className={`card mb-2xl ${isPaid ? 'border-success' : ''}`}>
        <div className="flex items-center justify-between flex-wrap gap-md">
          <div>
            <p className="text-xs uppercase tracking-wider text-body-soft">Current plan</p>
            <h2 className="text-2xl font-bold text-ink">
              {isPaid ? 'PoultryOS Pro' : 'Free'}
            </h2>
            <p className="text-sm text-body mt-xs">
              {isPaid ? 'Unlimited farms, WhatsApp, contract module, multi-farm dashboard.' : 'Limited to 1 farm, 3 sheds, 2 workers, 10 buyers, 5 WhatsApp/month.'}
            </p>
          </div>
          {!isPaid && <UpgradeButton />}
          {isPaid && profile?.subscription_status === 'active' && (
            <span className="px-md py-xs rounded-md text-sm font-semibold bg-success-soft text-success-ink">
              active
            </span>
          )}
          {isPaid && profile?.subscription_status === 'past_due' && (
            <span className="px-md py-xs rounded-md text-sm font-semibold bg-warning-soft text-warning-ink">
              past_due · grace window
            </span>
          )}
        </div>
      </div>

      <h2 className="text-lg font-bold text-ink mb-md">Usage</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-md mb-2xl">
        <UsageRow label="Farms" used={farmCount ?? 0} limit={limits.farms} />
        <UsageRow label="Sheds" used={shedCount ?? 0} limit={limits.sheds} />
        <UsageRow label="Team members" used={workerCount ?? 0} limit={limits.workers} />
        <UsageRow label="Buyers" used={buyerCount ?? 0} limit={limits.buyers} />
      </div>

      <h2 className="text-lg font-bold text-ink mb-md">Feature comparison</h2>
      <div className="card p-0 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-canvas-soft border-b border-mute">
            <tr className="text-left text-xs uppercase tracking-wider text-body-soft">
              <th className="px-md py-sm">Feature</th>
              <th className="px-md py-sm text-center">Free</th>
              <th className="px-md py-sm text-center">Pro</th>
            </tr>
          </thead>
          <tbody>
            <Row label="Farms" free="1" pro="Unlimited" />
            <Row label="Sheds" free="3" pro="Unlimited" />
            <Row label="Workers" free="2" pro="Unlimited" />
            <Row label="Vet access" free="✗" pro="✓" />
            <Row label="Buyers (Khata)" free="10" pro="Unlimited" />
            <Row label="WhatsApp alerts" free="5/month" pro="Unlimited" />
            <Row label="Contract farming module" free="✗" pro="✓" />
            <Row label="Traceability QR & PDF" free="✗" pro="✓" />
            <Row label="Multi-farm dashboard" free="✗" pro="✓" />
            <Row label="Full data export" free="✗" pro="✓" />
            <Row label="Heat-stress alerts" free="✓" pro="✓" />
            <Row label="Daily logs + KPIs" free="✓" pro="✓" />
          </tbody>
        </table>
      </div>
    </div>
  );
}

function UsageRow({ label, used, limit }: { label: string; used: number; limit: number | string }) {
  const numericLimit = typeof limit === 'number' ? limit : null;
  const pct = numericLimit ? Math.min(100, (used / numericLimit) * 100) : 0;
  const warn = numericLimit && used >= numericLimit;
  return (
    <div className="card">
      <div className="flex items-baseline justify-between mb-sm">
        <p className="text-sm font-semibold text-ink">{label}</p>
        <p className={`text-sm tabular-nums ${warn ? 'text-warning-ink font-semibold' : 'text-body'}`}>
          {used} / {limit}
        </p>
      </div>
      {numericLimit && (
        <div className="h-2 bg-mute rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full ${warn ? 'bg-warning' : 'bg-primary'}`}
            style={{ width: `${pct}%` }}
          />
        </div>
      )}
    </div>
  );
}

function Row({ label, free, pro }: { label: string; free: string; pro: string }) {
  return (
    <tr className="border-b border-mute last:border-0">
      <td className="px-md py-md text-body">{label}</td>
      <td className="px-md py-md text-center text-body">{free}</td>
      <td className="px-md py-md text-center font-semibold text-success-ink">{pro}</td>
    </tr>
  );
}
