import Link from 'next/link';
import { formatInsight, type Insight, type InsightSeverity } from '@poultryos/shared';

const DOT: Record<InsightSeverity, string> = {
  critical: 'bg-danger',
  warning: 'bg-warning',
  positive: 'bg-success',
  info: 'bg-body-soft',
};

/**
 * Smart Insights panel for the web dashboard — rule-based week-over-week
 * deltas with ₹ impact. Pure presentational: pass it the output of
 * computeInsights(). Renders English copy via the shared formatInsight().
 */
export function InsightsPanel({ insights }: { insights: Insight[] }) {
  if (insights.length === 0) return null;

  return (
    <div className="card mb-lg">
      <p className="text-xs uppercase tracking-wider text-body-soft mb-md">Smart insights</p>
      <ul className="space-y-md">
        {insights.map((insight) => {
          const { title, detail, impact } = formatInsight(insight);
          const negative = (insight.rupeeImpact ?? 0) < 0;
          return (
            <li key={insight.id} className="flex items-start gap-md">
              <span className={`mt-[6px] h-[10px] w-[10px] shrink-0 rounded-full ${DOT[insight.severity]}`} />
              <div className="min-w-0 flex-1">
                <Link href={`/batches/${insight.batchId}`} className="text-sm font-semibold text-ink hover:text-primary-dark">
                  {title}
                </Link>
                <p className="text-sm text-body">{detail}</p>
                {impact && (
                  <p className={`text-xs font-semibold mt-xxs ${negative ? 'text-danger' : 'text-success-ink'}`}>
                    {impact}
                  </p>
                )}
                <p className="text-xs text-body-soft mt-xxs">{insight.batchCode}</p>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
