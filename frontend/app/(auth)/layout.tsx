import { AuthBrandPanel } from '@/components/auth';

/**
 * Split-screen auth shell: the brand "aurora" panel on the left (≥lg) and the
 * form column on the right. Collapses to a single centered column on mobile,
 * where a compact logo replaces the panel.
 */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-screen bg-canvas">
      <AuthBrandPanel />

      {/* Form column */}
      <section className="flex flex-1 items-center justify-center px-6 py-10 sm:px-10">
        <div className="w-full max-w-[400px]">
          {/* Compact logo for mobile (panel is hidden) */}
          <div className="mb-2xl lg:hidden">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/brand/poultry-logo-color.png" alt="PoultryOS" className="h-9 w-auto" />
          </div>
          {children}
        </div>
      </section>
    </main>
  );
}
