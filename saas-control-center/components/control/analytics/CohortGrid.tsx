/**
 * CohortGrid — pure server-rendered cohort retention table.
 * Colors retention cells by band using token classes.
 * Zero client JS.
 */

interface CohortRow {
  cohort: string;       // "2026-01"
  size: number;
  active: number;
  retention_pct: number; // 0–100 integer
}

interface CohortGridProps {
  cohorts: CohortRow[];
}

/** Format "2026-01" → "Jan '26" */
function fmtCohort(ym: string): string {
  try {
    const [y, m] = ym.split('-').map(Number);
    const names = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    return `${names[(m ?? 1) - 1]} '${String(y ?? 0).slice(2)}`;
  } catch {
    return ym;
  }
}

function retentionCellClass(pct: number): string {
  if (pct >= 80) return 'bg-success-soft text-success-ink';
  if (pct >= 50) return 'bg-pending-soft text-pending-ink';
  return 'bg-warning-soft text-warning-ink';
}

function retentionLabel(pct: number): string {
  if (pct >= 80) return 'Strong';
  if (pct >= 50) return 'Fair';
  return 'At Risk';
}

export function CohortGrid({ cohorts }: CohortGridProps) {
  if (cohorts.length === 0) {
    return (
      <div className="py-2xl text-center text-body-soft">
        <p className="text-sm">No cohort data yet.</p>
        <p className="text-xs mt-xs">Cohort rows appear once tenants have at least one month of history.</p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-body-soft border-b border-mute">
            <th className="px-md py-sm font-semibold">Cohort</th>
            <th className="px-md py-sm font-semibold text-right tabular-nums">Signed Up</th>
            <th className="px-md py-sm font-semibold text-right tabular-nums">Still Active</th>
            <th className="px-md py-sm font-semibold">Retention</th>
            <th className="px-md py-sm font-semibold">Status</th>
          </tr>
        </thead>
        <tbody>
          {cohorts.map((row) => {
            const cellClass = retentionCellClass(row.retention_pct);
            const label = retentionLabel(row.retention_pct);
            return (
              <tr key={row.cohort} className="border-b border-mute last:border-0 hover:bg-mute-soft">
                <td className="px-md py-sm font-semibold text-ink">{fmtCohort(row.cohort)}</td>
                <td className="px-md py-sm text-right tabular-nums text-body">{row.size}</td>
                <td className="px-md py-sm text-right tabular-nums text-body">{row.active}</td>
                <td className="px-md py-sm">
                  <div className="flex items-center gap-sm">
                    {/* Mini bar */}
                    <div className="flex-1 h-2 bg-canvas-soft rounded-full overflow-hidden max-w-[80px]">
                      <div
                        className={`h-full rounded-full ${row.retention_pct >= 80 ? 'bg-success' : row.retention_pct >= 50 ? 'bg-warning' : 'bg-danger'}`}
                        style={{ width: `${Math.min(row.retention_pct, 100)}%` }}
                      />
                    </div>
                    <span className={`text-xs font-bold tabular-nums px-xs py-xxs rounded-xs ${cellClass}`}>
                      {row.retention_pct}%
                    </span>
                  </div>
                </td>
                <td className="px-md py-sm">
                  <span className={`text-[11px] font-bold uppercase rounded-xs px-xs py-px ${cellClass}`}>
                    {label}
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
