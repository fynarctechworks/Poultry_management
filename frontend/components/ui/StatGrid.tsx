import { cn } from '@/lib/utils';

/**
 * Count-aware KPI grid. Uses auto-fit columns so any number of stat cards
 * flows evenly instead of orphaning a cell (e.g. 7 cards in a fixed 4-col
 * grid left an empty slot). Cards wrap to fit at min 220px each.
 */
export function StatGrid({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        'grid gap-md mb-2xl grid-cols-[repeat(auto-fit,minmax(220px,1fr))]',
        className
      )}
    >
      {children}
    </div>
  );
}

type Accent = 'default' | 'success' | 'danger' | 'warning';

const ACCENT_TONE: Record<Accent, string> = {
  default: 'text-ink',
  success: 'text-success-ink',
  danger: 'text-danger',
  warning: 'text-warning-ink',
};

export function StatCard({
  label,
  value,
  hint,
  accent = 'default',
}: {
  label: string;
  value: React.ReactNode;
  hint?: string;
  accent?: Accent;
}) {
  return (
    <div className="card">
      <p className="nav-section-label mb-xs">{label}</p>
      {/* Editorial: medium-weight tabular figures, never bold */}
      <p className={cn('text-2xl font-medium tabular-nums', ACCENT_TONE[accent])}>{value}</p>
      {hint && <p className="mt-xs text-xs text-body-soft">{hint}</p>}
    </div>
  );
}
