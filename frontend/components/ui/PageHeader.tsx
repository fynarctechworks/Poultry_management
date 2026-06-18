import { cn } from '@/lib/utils';

type Orb = 'mint' | 'peach' | 'lavender' | 'sky' | 'rose';

/**
 * Editorial page header band — the signature ElevenLabs treatment:
 * an uppercase eyebrow, a light serif (EB Garamond) display headline, an
 * optional subtitle, an optional right-aligned actions slot, and atmospheric
 * gradient-orb decoration. Use at the top of every dashboard page so headers
 * are consistent instead of re-rolled per page.
 */
export function PageHeader({
  eyebrow,
  title,
  subtitle,
  actions,
  orbs = ['mint', 'peach'],
  className,
}: {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
  orbs?: Orb[];
  className?: string;
}) {
  return (
    <div
      className={cn(
        'relative mb-2xl overflow-hidden rounded-card bg-canvas px-2xl py-xl shadow-micro',
        className
      )}
    >
      {orbs[0] && (
        <div
          aria-hidden
          className={`orb-${orbs[0]} pointer-events-none absolute -right-16 -top-12 h-[260px] w-[260px] opacity-30 blur-3xl`}
        />
      )}
      {orbs[1] && (
        <div
          aria-hidden
          className={`orb-${orbs[1]} pointer-events-none absolute -bottom-12 left-0 h-[200px] w-[200px] opacity-20 blur-2xl`}
        />
      )}
      <div className="relative z-10 flex flex-col gap-lg sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          {eyebrow && <p className="nav-section-label mb-xs">{eyebrow}</p>}
          <h1 className="font-display text-4xl leading-tight text-ink">{title}</h1>
          {subtitle && <p className="mt-sm text-sm text-body max-w-[68ch]">{subtitle}</p>}
        </div>
        {actions && <div className="flex shrink-0 items-center gap-sm">{actions}</div>}
      </div>
    </div>
  );
}
