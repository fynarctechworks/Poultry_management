import Silk from '@/components/Silk';
import { colors } from '@/lib/theme/tokens';

/**
 * Left "brand" panel of the split-screen auth shell. Carries the PoultryOS logo,
 * an eyebrow line, and a large marketing headline over an animated "Silk" shader
 * backdrop tinted Kraken Purple. Hidden below `lg` (the form column shows a
 * compact logo instead).
 *
 * The brand colour stays Kraken Purple (`colors.primary`) per DESIGN.md, passed to
 * the Silk shader from the token (no inline hex).
 */
export function AuthBrandPanel({
  eyebrow = 'You can easily',
  headline = 'Run your entire poultry farm from one simple dashboard.',
}: {
  eyebrow?: string;
  headline?: string;
}) {
  return (
    <aside className="relative m-3 hidden w-[44%] flex-col justify-between overflow-hidden rounded-card p-10 text-on-dark lg:flex xl:w-1/2 xl:p-12">
      {/* Animated brand backdrop */}
      <div className="pointer-events-none absolute inset-0" aria-hidden>
        <Silk color={colors.primary} speed={5} scale={1} noiseIntensity={1.5} rotation={0} />
      </div>

      <div className="relative z-10">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/brand/poultry-logo-white.png" alt="PoultryOS" className="h-10 w-auto" />
      </div>

      <div className="relative z-10 max-w-md">
        <p className="mb-sm text-sm font-medium opacity-80">{eyebrow}</p>
        <h2 className="text-3xl font-semibold leading-tight tracking-tight xl:text-[2.6rem]">
          {headline}
        </h2>
      </div>
    </aside>
  );
}
