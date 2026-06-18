'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useState, useEffect } from 'react';
import {
  LayoutDashboard, Building2, CreditCard, Tag, TrendingUp, Headphones,
  HeartPulse, Bug, ScrollText, ShieldCheck, ToggleRight, Activity, Receipt,
  Search, Bell, LogOut, ChevronDown, Menu, X, ShieldCheck as ShieldCheckIcon,
  IndianRupee, BarChart3,
} from 'lucide-react';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import { cn } from '@/lib/utils';

// Full Control Center module map, grouped into sections. `ready` items are
// built; the rest render as visible-but-disabled with a "soon" tag so the
// operator sees the full surface without dead links. Sections keep the nav
// scannable and short enough to avoid a chunky scrollbar.
type NavItem = { href: string; label: string; icon: typeof Building2; perm?: string; ready: boolean };
const NAV_GROUPS: { label: string; items: NavItem[] }[] = [
  {
    label: 'Platform',
    items: [
      { href: '/admin', label: 'Overview', icon: LayoutDashboard, ready: true },
      { href: '/admin/system', label: 'System', icon: Activity, perm: 'system:read', ready: true },
    ],
  },
  {
    label: 'Customers',
    items: [
      { href: '/admin/tenants', label: 'Tenants', icon: Building2, perm: 'tenant:read', ready: true },
      { href: '/admin/support', label: 'Support', icon: Headphones, perm: 'support:read', ready: true },
      { href: '/admin/success', label: 'Customer Success', icon: HeartPulse, perm: 'success:read', ready: true },
    ],
  },
  {
    label: 'Billing',
    items: [
      { href: '/admin/subscriptions', label: 'Plans', icon: CreditCard, perm: 'subscription:read', ready: true },
      { href: '/admin/billing', label: 'Billing', icon: Receipt, perm: 'billing:read', ready: true },
      { href: '/admin/razorpay', label: 'Razorpay', icon: IndianRupee, perm: 'revenue:read', ready: true },
      { href: '/admin/discounts', label: 'Discounts', icon: Tag, perm: 'discount:read', ready: true },
      { href: '/admin/revenue', label: 'Revenue', icon: TrendingUp, perm: 'revenue:read', ready: true },
      { href: '/admin/analytics', label: 'Analytics', icon: BarChart3, perm: 'revenue:read', ready: true },
    ],
  },
  {
    label: 'Operations',
    items: [
      { href: '/admin/errors', label: 'Errors', icon: Bug, perm: 'error:read', ready: true },
      { href: '/admin/audit', label: 'Audit Log', icon: ScrollText, perm: 'audit:read', ready: true },
      { href: '/admin/flags', label: 'Feature Flags', icon: ToggleRight, perm: 'flag:read', ready: true },
    ],
  },
  {
    label: 'Security',
    items: [
      { href: '/admin/access', label: 'Access Control', icon: ShieldCheck, perm: 'access:read', ready: true },
      { href: '/admin/security', label: 'Security & 2FA', icon: ShieldCheckIcon, ready: true },
    ],
  },
];

export function AdminShell({
  operatorName,
  roleName,
  permissions,
  children,
}: {
  operatorName: string;
  roleName: string;
  permissions: string[];
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const supabase = createSupabaseBrowserClient();
  const [profileOpen, setProfileOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  // Close the mobile drawer whenever the route changes.
  useEffect(() => {
    setMobileNavOpen(false);
  }, [pathname]);

  // Only show modules the operator can actually open. Items without a `perm`
  // (e.g. Overview) are always visible; '*' grants the full surface. Empty
  // groups (operator lacks every perm in the section) are dropped entirely.
  const isSuper = permissions.includes('*');
  const visibleGroups = NAV_GROUPS
    .map((g) => ({ ...g, items: g.items.filter((n) => !n.perm || isSuper || permissions.includes(n.perm)) }))
    .filter((g) => g.items.length > 0);

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
    <div className="flex h-screen overflow-hidden bg-canvas-soft">
      {/* Mobile drawer backdrop */}
      {mobileNavOpen && (
        <div
          className="fixed inset-0 z-30 bg-ink/40 lg:hidden"
          onClick={() => setMobileNavOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* Sidebar — static column on desktop, slide-in drawer on mobile/tablet */}
      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-40 w-[248px] bg-canvas border-r border-mute flex flex-col transition-transform duration-200',
          'lg:static lg:translate-x-0',
          mobileNavOpen ? 'translate-x-0' : '-translate-x-full'
        )}
      >
        <div className="px-lg py-xl flex items-center justify-between">
          <div className="flex items-center gap-sm">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/brand/poultry-mark.png" alt="" className="h-9 w-9 rounded-lg shrink-0" />
            <div>
              {/* Sidebar wordmark — font-display gives editorial serif character at the nav root */}
              <h1 className="font-display text-xl leading-none text-ink tracking-[-0.16px]">PoultryOS</h1>
              <p className="text-[10px] font-semibold text-muted mt-xxs uppercase tracking-[0.96px]">
                Control Center
              </p>
            </div>
          </div>
          <button
            onClick={() => setMobileNavOpen(false)}
            className="grid place-items-center w-9 h-9 rounded-lg text-body hover:bg-mute-soft lg:hidden"
            aria-label="Close menu"
          >
            <X size={18} />
          </button>
        </div>
        <nav className="flex-1 min-h-0 px-sm pb-md overflow-y-auto scrollbar-thin">
          {visibleGroups.map((group) => (
            <div key={group.label} className="mb-lg last:mb-0">
              <p className="nav-section-label px-md mb-xs">{group.label}</p>
              {group.items.map(({ href, label, icon: Icon, ready }) => {
                const active = pathname === href || (href !== '/admin' && pathname.startsWith(href + '/'));
                if (!ready) {
                  return (
                    <span
                      key={href}
                      className="flex items-center justify-between gap-md px-md py-sm rounded-md text-[15px] font-medium mb-xxs text-body-soft cursor-not-allowed opacity-60"
                      title="Coming in a later increment"
                    >
                      <span className="flex items-center gap-md">
                        <Icon size={18} className="shrink-0" />
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
                    onClick={() => setMobileNavOpen(false)}
                    className={cn(
                      'flex items-center gap-md px-md py-sm rounded-md text-[15px] font-medium mb-xxs transition-colors',
                      active ? 'bg-primary-subtle text-primary' : 'text-body hover:bg-mute-soft'
                    )}
                  >
                    <Icon size={18} className="shrink-0" />
                    {label}
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>
      </aside>

      {/* Main column */}
      <div className="flex-1 flex flex-col min-w-0 min-h-0">
        {/* Topbar */}
        <header className="h-[60px] shrink-0 bg-canvas border-b border-mute flex items-center gap-sm lg:gap-lg px-lg lg:px-xl">
          <button
            onClick={() => setMobileNavOpen(true)}
            className="grid place-items-center w-9 h-9 rounded-lg text-body hover:bg-mute-soft lg:hidden shrink-0"
            aria-label="Open menu"
          >
            <Menu size={20} />
          </button>
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
                  <p className="text-sm text-body-soft">You&apos;re all caught up.</p>
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
                <span className="text-left leading-tight hidden sm:block max-w-[160px]">
                  <span className="block text-xs font-semibold text-ink truncate">{operatorName}</span>
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
                  <Link
                    href="/admin/security"
                    onClick={() => setProfileOpen(false)}
                    className="w-full flex items-center gap-sm px-md py-sm rounded-md text-sm font-semibold text-body hover:bg-mute-soft"
                  >
                    <ShieldCheckIcon size={16} />
                    Security &amp; 2FA
                  </Link>
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

        <main className="flex-1 min-h-0 px-lg lg:px-2xl py-xl overflow-y-auto scrollbar-thin">{children}</main>
      </div>
    </div>
  );
}
