import { colors } from '@/lib/theme/tokens';

/**
 * Left brand panel of the split-screen auth shell for the operator Control Center.
 * Editorial layout: EB Garamond Light (300) display headline over an atmospheric
 * pastel-orb gradient (lavender + sky stops from DESIGN.md gradient tokens) on a
 * dark canvas. Hidden below `lg` — the form column shows a compact logo instead.
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
          `radial-gradient(80% 80% at 80% 15%, ${colors.primaryGlow}55 0%, transparent 60%),` +
          `radial-gradient(70% 70% at 20% 85%, ${colors.primaryHaze}44 0%, transparent 55%),` +
          `linear-gradient(160deg, ${colors.surfaceDark} 0%, ${colors.surfaceDarkElevated} 100%)`,
      }}
    >
      {/* Atmospheric mint orb — pure decoration, no content */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -right-16 -top-16 h-[320px] w-[320px] rounded-full opacity-20"
        style={{
          background: `radial-gradient(circle, ${colors.gradientMint} 0%, transparent 70%)`,
        }}
      />

      <div className="relative flex flex-col gap-xs">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/brand/poultry-logo-white.png" alt="PoultryOS" className="h-10 w-auto self-start" />
        <span className="text-xs font-semibold uppercase tracking-[0.96px] text-on-dark opacity-60">
          Control Center
        </span>
      </div>

      <div className="relative max-w-[380px]">
        <p className="mb-md text-xs font-medium uppercase tracking-[0.96px] text-on-dark opacity-60">
          {eyebrow}
        </p>
        {/* Display headline: EB Garamond Light (font-display, weight 300) — editorial, never bold */}
        <h2 className="font-display text-[2.4rem] leading-[1.15] tracking-[-0.36px] text-on-dark xl:text-[3rem] xl:leading-[1.1]">
          {headline}
        </h2>
      </div>
    </aside>
  );
}
