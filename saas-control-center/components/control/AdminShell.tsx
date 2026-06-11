'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useState } from 'react';
import {
  LayoutDashboard, Building2, CreditCard, Tag, TrendingUp, Headphones,
  HeartPulse, Bug, ScrollText, ShieldCheck, ToggleRight, Activity,
  Search, Bell, LogOut, ChevronDown,
} from 'lucide-react';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import { cn } from '@/lib/utils';

// Full Control Center module map. `ready` items are built (Increment 1);
// the rest render as visible-but-disabled with a "soon" tag so the operator
// sees the full surface without dead links.
const NAV: { href: string; label: string; icon: typeof Building2; perm?: string; ready: boolean }[] = [
  { href: '/admin', label: 'Overview', icon: LayoutDashboard, ready: true },
  { href: '/admin/tenants', label: 'Tenants', icon: Building2, perm: 'tenant:read', ready: true },
  { href: '/admin/subscriptions', label: 'Plans', icon: CreditCard, perm: 'subscription:read', ready: true },
  { href: '/admin/discounts', label: 'Discounts', icon: Tag, perm: 'discount:read', ready: true },
  { href: '/admin/revenue', label: 'Revenue', icon: TrendingUp, perm: 'revenue:read', ready: true },
  { href: '/admin/support', label: 'Support', icon: Headphones, perm: 'support:read', ready: true },
  { href: '/admin/success', label: 'Customer Success', icon: HeartPulse, perm: 'success:read', ready: true },
  { href: '/admin/errors', label: 'Errors', icon: Bug, perm: 'error:read', ready: true },
  { href: '/admin/audit', label: 'Audit Log', icon: ScrollText, perm: 'audit:read', ready: true },
  { href: '/admin/access', label: 'Access Control', icon: ShieldCheck, perm: 'access:read', ready: true },
  { href: '/admin/flags', label: 'Feature Flags', icon: ToggleRight, perm: 'flag:read', ready: true },
  { href: '/admin/system', label: 'System', icon: Activity, perm: 'system:read', ready: true },
];

export function AdminShell({
  operatorName,
  roleName,
  children,
}: {
  operatorName: string;
  roleName: string;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const supabase = createSupabaseBrowserClient();
  const [profileOpen, setProfileOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [query, setQuery] = useState('');

  async function signOut() {
    await supabase.auth.signOut();
    router.push('/login');
    router.refresh();
  }

  function onSearch(e: React.FormEvent) {
    e.preventDefault();
    const q = query.trim();
    if (q) router.push(`/admin/tenants?q=${encodeURIComponent(q)}`);
  }

  return (
    <div className="flex min-h-screen bg-canvas-soft">
      {/* Sidebar */}
      <aside className="w-[248px] shrink-0 bg-canvas border-r border-mute flex flex-col">
        <div className="px-lg py-xl">
          <h1 className="text-xl font-bold text-primary">PoultryOS</h1>
          <p className="text-xs font-semibold text-body-soft mt-xxs uppercase tracking-wide">
            Control Center
          </p>
        </div>
        <nav className="flex-1 px-sm overflow-y-auto">
          {NAV.map(({ href, label, icon: Icon, ready }) => {
            const active = pathname === href || (href !== '/admin' && pathname.startsWith(href + '/'));
            if (!ready) {
              return (
                <span
                  key={href}
                  className="flex items-center justify-between gap-md px-md py-sm rounded-md text-sm font-semibold mb-xxs text-body-soft cursor-not-allowed opacity-60"
                  title="Coming in a later increment"
                >
                  <span className="flex items-center gap-md">
                    <Icon size={18} />
                    {label}
                  </span>
                  <span className="text-[10px] font-bold uppercase bg-mute-soft text-body rounded-sm px-xs py-px">
                    soon
                  </span>
                </span>
              );
            }
            return (
              <Link
                key={href}
                href={href}
                className={cn(
                  'flex items-center gap-md px-md py-sm rounded-md text-sm font-semibold mb-xxs',
                  active ? 'bg-primary-subtle text-primary' : 'text-body hover:bg-mute-soft'
                )}
              >
                <Icon size={18} />
                {label}
              </Link>
            );
          })}
        </nav>
      </aside>

      {/* Main column */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Topbar */}
        <header className="h-[60px] shrink-0 bg-canvas border-b border-mute flex items-center gap-lg px-xl">
          <form onSubmit={onSearch} className="relative flex-1 max-w-[460px]">
            <Search size={16} className="absolute left-md top-1/2 -translate-y-1/2 text-body-soft" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search tenants, users, invoices…"
              className="w-full h-9 pl-[34px] pr-md rounded-lg border border-mute bg-canvas-soft text-sm text-ink placeholder:text-body-soft focus:outline-none focus:border-primary-dark"
            />
          </form>

          <div className="ml-auto flex items-center gap-sm">
            {/* Notification center */}
            <div className="relative">
              <button
                onClick={() => { setNotifOpen((v) => !v); setProfileOpen(false); }}
                className="grid place-items-center w-9 h-9 rounded-lg text-body hover:bg-mute-soft"
                aria-label="Notifications"
              >
                <Bell size={18} />
              </button>
              {notifOpen && (
                <div className="absolute right-0 mt-xs w-[300px] bg-canvas border border-mute rounded-card shadow-sm p-md z-20">
                  <p className="text-sm font-semibold text-ink mb-xs">Notifications</p>
                  <p className="text-sm text-body-soft">You're all caught up.</p>
                </div>
              )}
            </div>

            {/* Admin profile */}
            <div className="relative">
              <button
                onClick={() => { setProfileOpen((v) => !v); setNotifOpen(false); }}
                className="flex items-center gap-sm pl-sm pr-md h-9 rounded-lg hover:bg-mute-soft"
              >
                <span className="grid place-items-center w-7 h-7 rounded-full bg-primary-subtle text-primary text-xs font-bold">
                  {operatorName.slice(0, 1).toUpperCase()}
                </span>
                <span className="text-left leading-tight">
                  <span className="block text-xs font-semibold text-ink">{operatorName}</span>
                  <span className="block text-[10px] text-body-soft">{roleName}</span>
                </span>
                <ChevronDown size={14} className="text-body-soft" />
              </button>
              {profileOpen && (
                <div className="absolute right-0 mt-xs w-[220px] bg-canvas border border-mute rounded-card shadow-sm p-xs z-20">
                  <div className="px-md py-sm">
                    <p className="text-sm font-semibold text-ink">{operatorName}</p>
                    <p className="text-xs text-body-soft">{roleName}</p>
                  </div>
                  <div className="border-t border-mute my-xs" />
                  <button
                    onClick={signOut}
                    className="w-full flex items-center gap-sm px-md py-sm rounded-md text-sm font-semibold text-body hover:bg-mute-soft"
                  >
                    <LogOut size={16} />
                    Sign out
                  </button>
                </div>
              )}
            </div>
          </div>
        </header>

        <main className="flex-1 px-2xl py-xl overflow-x-auto">{children}</main>
      </div>
    </div>
  );
}
