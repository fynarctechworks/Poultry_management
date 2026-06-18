import Link from 'next/link';
import type { LucideIcon } from 'lucide-react';

interface StatTileProps {
  label: string;
  value: string | number;
  href?: string;
  /** If set and truthy, renders a ▲/▼ delta chip */
  delta?: number | null;
  /** Override the value color when highlighting a concern */
  valueClass?: string;
  icon?: LucideIcon;
  subtext?: string;
}

export function StatTile({ label, value, href, delta, valueClass, icon: Icon, subtext }: StatTileProps) {
  const inner = (
    <div
      className={
        'bg-canvas border border-mute rounded-card p-lg flex flex-col gap-sm' +
        (href ? ' hover:bg-mute-soft transition-colors duration-base cursor-pointer' : '')
      }
    >
      <div className="flex items-center justify-between gap-sm">
        <p className="text-[11px] font-semibold uppercase tracking-[0.96px] text-muted">{label}</p>
        {Icon && <Icon size={15} className="text-body-soft shrink-0" />}
      </div>

      <div className="flex items-end gap-sm">
        <p className={`text-3xl font-bold tabular-nums leading-none ${valueClass ?? 'text-ink'}`}>
          {value}
        </p>
        {delta !== null && delta !== undefined && (
          <DeltaChip delta={delta} />
        )}
      </div>

      {subtext && (
        <p className="text-xs text-body-soft leading-tight">{subtext}</p>
      )}
    </div>
  );

  if (href) {
    return (
      <Link href={href} className="block no-underline">
        {inner}
      </Link>
    );
  }
  return inner;
}

function DeltaChip({ delta }: { delta: number }) {
  const isUp = delta >= 0;
  const arrow = isUp ? '▲' : '▼';
  const colorClass = isUp
    ? 'text-success-ink bg-success-soft'
    : 'text-warning-ink bg-warning-soft';
  return (
    <span
      className={`inline-flex items-center gap-xxs px-xs py-xxs rounded-xs text-xs font-bold tabular-nums mb-xxs ${colorClass}`}
    >
      {arrow} {Math.abs(delta).toFixed(1)}%
    </span>
  );
}
