/**
 * FunnelBars — pure div/CSS funnel chart. No client JS.
 * Renders a conversion funnel as horizontal stepped bars.
 */

interface FunnelStep {
  label: string;
  count: number;
  totalSignups: number;
  colorClass: string;
  bgClass: string;
  inkClass: string;
}

interface FunnelBarsProps {
  signups: number;
  trialStarted: number;
  trialConverted: number;
  active: number;
}

export function FunnelBars({ signups, trialStarted, trialConverted, active }: FunnelBarsProps) {
  const base = signups || 1;

  const steps: FunnelStep[] = [
    {
      label: 'Signups',
      count: signups,
      totalSignups: base,
      colorClass: 'bg-primary',
      bgClass: 'bg-primary-subtle',
      inkClass: 'text-primary',
    },
    {
      label: 'Trial Started',
      count: trialStarted,
      totalSignups: base,
      colorClass: 'bg-primary',
      bgClass: 'bg-primary-subtle',
      inkClass: 'text-primary',
    },
    {
      label: 'Trial Converted',
      count: trialConverted,
      totalSignups: base,
      colorClass: 'bg-success',
      bgClass: 'bg-success-soft',
      inkClass: 'text-success-ink',
    },
    {
      label: 'Active Paid',
      count: active,
      totalSignups: base,
      colorClass: 'bg-success',
      bgClass: 'bg-success-soft',
      inkClass: 'text-success-ink',
    },
  ];

  return (
    <div className="space-y-md">
      {steps.map((step, idx) => {
        const pctOfSignups = base > 0 ? (step.count / base) * 100 : 0;
        const isLast = idx === steps.length - 1;
        return (
          <div key={step.label}>
            <div className="flex items-center justify-between mb-xs">
              <div className="flex items-center gap-sm">
                <span className="text-[10px] font-bold uppercase tracking-widest text-body-soft w-4 text-right tabular-nums">
                  {idx + 1}
                </span>
                <span className="text-sm font-semibold text-ink">{step.label}</span>
              </div>
              <div className="flex items-center gap-sm">
                <span className={`text-sm font-bold tabular-nums ${step.inkClass}`}>
                  {step.count}
                </span>
                <span className="text-xs text-body-soft tabular-nums">
                  {pctOfSignups.toFixed(1)}%
                </span>
              </div>
            </div>
            <div className={`w-full h-[10px] ${step.bgClass} rounded-full overflow-hidden`}>
              <div
                className={`h-full ${step.colorClass} rounded-full transition-all`}
                style={{ width: `${Math.min(pctOfSignups, 100)}%` }}
              />
            </div>
            {/* Drop arrow between steps */}
            {!isLast && (
              <div className="flex items-center justify-start pl-4 mt-xs">
                <span className="text-[10px] text-body-soft">
                  ▼ {steps[idx + 1].count < step.count
                    ? `${(((step.count - steps[idx + 1].count) / (step.count || 1)) * 100).toFixed(1)}% drop-off`
                    : 'all advanced'}
                </span>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
