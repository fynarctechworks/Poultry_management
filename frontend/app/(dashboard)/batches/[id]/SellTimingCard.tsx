import { formatINR, type SellTimingResult } from '@poultryos/shared';

/** Broiler sell-vs-grow recommendation card (server-rendered, English). */
export function SellTimingCard({ result }: { result: SellTimingResult }) {
  if (result.recommendation === 'unknown') {
    return (
      <div className="card">
        <p className="text-xs uppercase tracking-wider text-body-soft mb-md">Sell timing</p>
        <p className="text-sm text-body">
          Add recent weights, feed cost, and today&apos;s broiler price to see a sell-vs-grow recommendation.
        </p>
      </div>
    );
  }

  const sell = result.recommendation === 'sell_now';
  const net = result.netMarginPerDay;

  return (
    <div className="card">
      <p className="text-xs uppercase tracking-wider text-body-soft mb-md">Sell timing</p>
      <div className="flex items-center gap-sm mb-xs">
        <span className={`h-2.5 w-2.5 rounded-full ${sell ? 'bg-warning' : 'bg-success'}`} />
        <p className={`text-xl font-bold ${sell ? 'text-warning-ink' : 'text-success-ink'}`}>
          {sell ? 'Sell now' : 'Keep growing'}
        </p>
      </div>
      <p className="text-sm text-body mb-md">
        {sell
          ? 'Each extra day now costs more in feed than the weight it adds is worth.'
          : 'Each extra day still adds more value than the feed it costs.'}
      </p>

      <dl className="space-y-xs text-sm">
        <Row label="Extra revenue" value={`${formatINR(result.marginalRevenuePerDay)}/day`} />
        <Row label="Extra feed cost" value={`${formatINR(result.marginalFeedCostPerDay)}/day`} />
        <Row
          label="Net per day"
          value={`${formatINR(net, { signed: true })}/day`}
          strong
          valueClass={net >= 0 ? 'text-success-ink' : 'text-danger'}
        />
        {result.daysToTarget != null && (
          <Row label="Days to target weight" value={`${Math.ceil(result.daysToTarget)}`} />
        )}
      </dl>
    </div>
  );
}

function Row({
  label,
  value,
  strong,
  valueClass,
}: {
  label: string;
  value: string;
  strong?: boolean;
  valueClass?: string;
}) {
  return (
    <div className="flex justify-between">
      <dt className={strong ? 'font-semibold text-ink' : 'text-body'}>{label}</dt>
      <dd className={`tabular-nums ${strong ? 'font-semibold' : ''} ${valueClass ?? 'text-ink'}`}>{value}</dd>
    </div>
  );
}
