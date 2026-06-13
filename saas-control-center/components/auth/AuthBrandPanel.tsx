import { ShieldCheck } from 'lucide-react';
import { colors } from '@/lib/theme/tokens';

/**
 * Left "brand" panel of the split-screen auth shell for the operator Control
 * Center. Carries the logo, an eyebrow line, and a marketing headline over the
 * purple aurora gradient. Hidden below `lg` (the form column shows a compact
 * logo instead). Brand colour stays Kraken Purple per DESIGN.md.
 */
export function AuthBrandPanel({
  eyebrow = 'Internal operator console',
  headline = 'Operate the PoultryOS platform with full control.',
}: {
  eyebrow?: string;
  headline?: string;
}) {
  return (
    <aside
      className="relative m-3 hidden w-[44%] flex-col justify-between overflow-hidden rounded-card p-10 text-on-dark lg:flex xl:w-1/2 xl:p-12"
      style={{
        background:
          `radial-gradient(120% 120% at 12% 100%, ${colors.primaryDeep} 0%, transparent 55%),` +
          `radial-gradient(90% 90% at 100% 0%, ${colors.primaryGlow} 0%, transparent 45%),` +
          `radial-gradient(120% 120% at 100% 100%, ${colors.primary} 0%, transparent 50%),` +
          `linear-gradient(150deg, ${colors.canvasSoft} 0%, ${colors.primaryHaze} 32%, ${colors.primary} 72%, ${colors.primaryDeep} 100%)`,
      }}
    >
      <div className="flex items-center gap-sm">
        <span className="grid h-9 w-9 place-items-center rounded-lg bg-white/20 backdrop-blur">
          <ShieldCheck size={20} className="text-on-dark" />
        </span>
        <span className="text-lg font-semibold tracking-tight">PoultryOS Control Center</span>
      </div>

      <div className="max-w-md">
        <p className="mb-sm text-sm font-medium opacity-80">{eyebrow}</p>
        <h2 className="text-3xl font-semibold leading-tight tracking-tight xl:text-[2.6rem]">
          {headline}
        </h2>
      </div>
    </aside>
  );
}
