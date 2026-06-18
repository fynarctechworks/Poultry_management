import Silk from '@/components/Silk';

/**
 * Left "brand" panel of the split-screen auth shell.
 *
 * Background is an animated Silk WebGL shader (react-bits, ogl-based) tinted
 * `#7B7481`, with the display copy layered on top. A soft dark scrim keeps the
 * white headline/logo legible over the moving texture.
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
      {/* Animated Silk background */}
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <Silk speed={1.6} scale={1} color="#7B7481" noiseIntensity={0.8} rotation={0} />
      </div>
      {/* Legibility scrim over the moving texture */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-gradient-to-tr from-black/55 via-black/30 to-black/45"
      />

      {/* Logo row */}
      <div className="relative z-10">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/brand/poultry-logo-white.png" alt="PoultryOS" className="h-14 w-auto" />
      </div>

      {/* Bottom content */}
      <div className="relative z-10 space-y-2xl">
        {/* Headline block */}
        <div className="max-w-sm">
          <p className="mb-sm text-sm font-medium uppercase tracking-widest text-on-dark-soft">
            {eyebrow}
          </p>
          <h2 className="font-display text-4xl leading-tight text-on-dark xl:text-[2.75rem]">
            {headline}
          </h2>
        </div>

        {/* Powered-by footer */}
        <div className="flex items-center gap-sm border-t border-white/10 pt-lg">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/fyn-arc-logo.png" alt="FYN ARC Techworks" className="h-7 w-auto opacity-90" />
          <p className="text-xs leading-tight text-on-dark-soft">
            Powered by <span className="font-medium text-on-dark">FYN ARC Techworks Private Limited</span>
          </p>
        </div>
      </div>
    </aside>
  );
}
