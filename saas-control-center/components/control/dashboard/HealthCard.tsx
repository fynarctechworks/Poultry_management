import Link from 'next/link';
import type { LucideIcon } from 'lucide-react';

export interface HealthStat {
  label: string;
  value: string | number;
  /** When true the value renders in danger color with a left-accent on the card */
  alert?: boolean;
  /** When true the value renders in warning/pending color */
  warn?: boolean;
}

interface HealthCardProps {
  title: string;
  href: string;
  icon: LucideIcon;
  stats: HealthStat[];
  /** If true, the card gets a left danger-color accent border */
  hasDanger?: boolean;
  /** If true, the card gets a left warning-color accent border */
  hasWarning?: boolean;
}

export function HealthCard({ title, href, icon: Icon, stats, hasDanger, hasWarning }: HealthCardProps) {
  const accentClass = hasDanger
    ? 'border-l-4 border-l-danger'
    : hasWarning
    ? 'border-l-4 border-l-warning'
    : '';

  return (
    <Link
      href={href}
      className={
        'block no-underline bg-canvas border border-mute rounded-card p-lg hover:bg-mute-soft transition-colors duration-base group ' +
        accentClass
      }
    >
      {/* Card header */}
      <div className="flex items-center gap-sm mb-md">
        <div className="grid place-items-center w-8 h-8 rounded-md bg-primary-subtle text-primary shrink-0">
          <Icon size={16} />
        </div>
        <p className="text-[11px] font-semibold uppercase tracking-[0.96px] text-muted">{title}</p>
        <span className="ml-auto text-body-soft group-hover:text-primary transition-colors duration-base">
          <ArrowIcon />
        </span>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-2 gap-x-lg gap-y-sm">
        {stats.map((s) => (
          <div key={s.label}>
            <p className="text-[10px] font-semibold uppercase tracking-[0.96px] text-muted leading-none mb-xxs">
              {s.label}
            </p>
            <p
              className={`text-lg font-bold tabular-nums leading-none ${
                s.alert
                  ? 'text-danger'
                  : s.warn
                  ? 'text-warning-ink'
                  : 'text-ink'
              }`}
            >
              {s.value}
            </p>
          </div>
        ))}
      </div>
    </Link>
  );
}

/** Minimal inline arrow — avoids importing another lucide icon */
function ArrowIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
      <path
        d="M3 7h8M7.5 3.5L11 7l-3.5 3.5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
