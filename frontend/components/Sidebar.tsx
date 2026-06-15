'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LayoutGrid, Tractor, Wallet, BarChart3, Settings, LogOut, FileText, CloudSun, TrendingUp, Handshake, PlusCircle, Syringe, Stethoscope, Package, MessageCircle, Bell, Layers, Users, CreditCard, Building2, QrCode, ShieldCheck } from 'lucide-react';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import { useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';

const NAV = [
  { href: '/multi-farm', label: 'Multi-Farm', icon: LayoutGrid },
  { href: '/farms', label: 'Farms', icon: Tractor },
  { href: '/batches', label: 'Batches', icon: Layers },
  { href: '/health', label: 'Health', icon: Stethoscope },
  { href: '/vaccinations', label: 'Vaccinations', icon: Syringe },
  { href: '/inventory', label: 'Inventory', icon: Package },
  { href: '/transactions', label: 'Transactions', icon: FileText },
  { href: '/khata', label: 'Khata', icon: Wallet },
  { href: '/farm-integrity', label: 'Farm Integrity', icon: ShieldCheck },
  { href: '/contract', label: 'Contract', icon: Handshake },
  { href: '/integrators', label: 'Integrators', icon: Building2 },
  { href: '/traceability', label: 'Traceability', icon: QrCode },
  { href: '/market-prices', label: 'Market Prices', icon: TrendingUp },
  { href: '/weather', label: 'Weather', icon: CloudSun },
  { href: '/reports', label: 'Reports', icon: BarChart3 },
  { href: '/whatsapp-settings', label: 'WhatsApp', icon: MessageCircle },
  { href: '/notifications', label: 'Notifications', icon: Bell },
  { href: '/team', label: 'Team', icon: Users },
  { href: '/billing', label: 'Billing', icon: CreditCard },
  { href: '/settings', label: 'Settings', icon: Settings },
];

export function Sidebar({ userName }: { userName: string }) {
  const pathname = usePathname();
  const router = useRouter();
  const supabase = createSupabaseBrowserClient();

  async function signOut() {
    await supabase.auth.signOut();
    router.push('/login');
    router.refresh();
  }

  return (
    <aside className="w-[240px] shrink-0 bg-canvas border-r border-mute flex flex-col h-screen">
      <div className="px-lg py-xl">
        <div className="flex items-center gap-sm">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/poultry-mark.png" alt="" className="h-8 w-8 rounded-lg" />
          <h1 className="text-xl font-bold text-primary">PoultryOS</h1>
        </div>
        <p className="text-xs text-body-soft mt-xxs">{userName}</p>
      </div>
      <Link
        href="/daily-log/new"
        className="mx-sm mb-md flex items-center justify-center gap-sm bg-primary text-on-primary rounded-lg px-md py-sm text-sm font-semibold hover:bg-primary-dark"
      >
        <PlusCircle size={16} />
        Log entry
      </Link>
      <nav className="flex-1 min-h-0 px-sm overflow-y-auto">
        {NAV.map(({ href, label, icon: Icon }) => {
          const active = pathname === href || pathname.startsWith(href + '/');
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
      <button
        onClick={signOut}
        className="m-sm flex items-center gap-md px-md py-sm rounded-md text-sm font-semibold text-body hover:bg-mute-soft"
      >
        <LogOut size={18} />
        Sign out
      </button>
    </aside>
  );
}
