'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useState } from 'react';
import { Menu, PlusCircle, ChevronDown, LogOut, Settings, ShieldCheck } from '@/components/icons';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import { titleForPath } from '@/components/nav-config';
import { useCanWrite } from '@/components/CanWriteProvider';

export function Topbar({ userName, onMenu }: { userName: string; onMenu: () => void }) {
  const pathname = usePathname();
  const router = useRouter();
  const supabase = createSupabaseBrowserClient();
  const canWrite = useCanWrite();
  const [profileOpen, setProfileOpen] = useState(false);

  const title = titleForPath(pathname);

  async function signOut() {
    await supabase.auth.signOut();
    router.push('/login');
    router.refresh();
  }

  return (
    <header className="h-[60px] shrink-0 bg-canvas border-b border-mute flex items-center gap-sm lg:gap-lg px-lg lg:px-2xl">
      <button
        onClick={onMenu}
        className="grid place-items-center w-9 h-9 rounded-lg text-body hover:bg-mute-soft lg:hidden shrink-0"
        aria-label="Open menu"
      >
        <Menu size={20} />
      </button>

      {/* Current page label — small caption above, never competes with the page's own serif H1 */}
      <div className="min-w-0">
        <p className="nav-section-label leading-none">PoultryOS</p>
        <p className="text-[15px] font-medium text-ink leading-tight truncate">{title}</p>
      </div>

      <div className="ml-auto flex items-center gap-sm">
        {canWrite && (
          <Link
            href="/daily-log/new"
            className="inline-flex items-center gap-sm bg-primary text-on-primary rounded-pill px-xl py-sm text-sm font-medium min-h-[40px] hover:bg-primary-dark transition-colors"
          >
            <PlusCircle size={16} />
            <span className="hidden sm:inline">Log entry</span>
          </Link>
        )}

        <div className="relative">
          <button
            onClick={() => setProfileOpen((v) => !v)}
            className="flex items-center gap-sm pl-sm pr-md h-9 rounded-pill hover:bg-mute-soft"
          >
            <span className="grid place-items-center w-7 h-7 rounded-full bg-primary-subtle text-primary text-xs font-semibold">
              {userName.slice(0, 1).toUpperCase()}
            </span>
            <span className="text-left leading-tight hidden sm:block max-w-[140px]">
              <span className="block text-xs font-semibold text-ink truncate">{userName}</span>
            </span>
            <ChevronDown size={14} className="text-body-soft" />
          </button>
          {profileOpen && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setProfileOpen(false)} aria-hidden="true" />
              <div className="absolute right-0 mt-xs w-[220px] bg-canvas border border-mute rounded-card shadow-subtle p-xs z-20">
                <div className="px-md py-sm">
                  <p className="text-sm font-semibold text-ink truncate">{userName}</p>
                </div>
                <div className="border-t border-mute my-xs" />
                <Link
                  href="/settings"
                  onClick={() => setProfileOpen(false)}
                  className="w-full flex items-center gap-sm px-md py-sm rounded-md text-sm font-medium text-body hover:bg-mute-soft"
                >
                  <Settings size={16} />
                  Settings
                </Link>
                <Link
                  href="/team"
                  onClick={() => setProfileOpen(false)}
                  className="w-full flex items-center gap-sm px-md py-sm rounded-md text-sm font-medium text-body hover:bg-mute-soft"
                >
                  <ShieldCheck size={16} />
                  Team &amp; access
                </Link>
                <button
                  onClick={signOut}
                  className="w-full flex items-center gap-sm px-md py-sm rounded-md text-sm font-medium text-body hover:bg-mute-soft"
                >
                  <LogOut size={16} />
                  Sign out
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
