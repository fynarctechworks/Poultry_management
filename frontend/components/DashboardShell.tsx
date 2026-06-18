'use client';

import { useState, useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { Sidebar } from '@/components/Sidebar';
import { Topbar } from '@/components/Topbar';

export function DashboardShell({
  userName,
  banners,
  children,
}: {
  userName: string;
  banners?: React.ReactNode;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  // Close the drawer whenever the route changes.
  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  return (
    <div className="flex h-screen overflow-hidden bg-canvas-soft">
      {/* Mobile drawer backdrop */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-30 bg-ink/40 lg:hidden"
          onClick={() => setMobileOpen(false)}
          aria-hidden="true"
        />
      )}

      <Sidebar userName={userName} mobileOpen={mobileOpen} onClose={() => setMobileOpen(false)} />

      <div className="flex-1 flex flex-col min-w-0 min-h-0">
        <Topbar userName={userName} onMenu={() => setMobileOpen(true)} />
        <main className="flex-1 min-h-0 px-lg lg:px-2xl py-xl overflow-y-auto scrollbar-thin">
          {banners}
          {children}
        </main>
      </div>
    </div>
  );
}
