/**
 * Left "brand" panel of the split-screen auth shell.
 *
 * The panel uses the ElevenLabs editorial pattern: an off-white/ink surface with
 * atmospheric gradient orbs (mint + peach) as soft radial blooms behind the
 * display copy. Replaces the old purple Silk WebGL shader — same visual energy,
 * dramatically lighter runtime weight (CSS-only, no WebGL context, no Three.js).
 *
 * Hidden below `lg`; the form column shows a compact logo instead.
 */
export function AuthBrandPanel({
  eyebrow = 'Farm management, simplified',
  headline = 'Run your entire poultry operation from one elegant dashboard.',
}: {
  eyebrow?: string;
  headline?: string;
}) {
  return (
    <aside className="relative m-3 hidden w-[44%] flex-col justify-between overflow-hidden rounded-card bg-surface-dark p-10 text-on-dark lg:flex xl:w-1/2 xl:p-12">
      {/* Atmospheric orb — mint bloom, top-right */}
      <div
        aria-hidden
        className="orb-mint pointer-events-none absolute -right-24 -top-24 h-[420px] w-[420px] opacity-20 blur-3xl"
      />
      {/* Atmospheric orb — peach bloom, bottom-left */}
      <div
        aria-hidden
        className="orb-peach pointer-events-none absolute -bottom-24 -left-16 h-[360px] w-[360px] opacity-15 blur-3xl"
      />
      {/* Faint lavender mid accent */}
      <div
        aria-hidden
        className="orb-lavender pointer-events-none absolute right-1/3 top-1/2 h-[280px] w-[280px] -translate-y-1/2 opacity-10 blur-2xl"
      />

      {/* Logo row */}
      <div className="relative z-10">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/brand/poultry-logo-white.png" alt="PoultryOS" className="h-10 w-auto" />
      </div>

      {/* Headline block */}
      <div className="relative z-10 max-w-sm">
        <p className="mb-sm text-sm font-medium uppercase tracking-widest text-on-dark-soft">
          {eyebrow}
        </p>
        <h2 className="font-display text-4xl leading-tight text-on-dark xl:text-[2.75rem]">
          {headline}
        </h2>
        {/* Thin divider rule */}
        <div className="mt-xl h-px w-16 bg-on-dark opacity-20" />
        <p className="mt-md text-sm text-on-dark-soft">
          Trusted by poultry farmers across India — from 500-bird sheds to multi-farm operations.
        </p>
      </div>
    </aside>
  );
}
