import {
  LayoutGrid, Tractor, Wallet, BarChart3, Settings, FileText, CloudSun,
  TrendingUp, Handshake, Syringe, Stethoscope, Package, MessageCircle, Bell,
  Layers, Users, CreditCard, Building2, QrCode, ShieldCheck, ClipboardList,
  type LucideIcon,
} from 'lucide-react';

export type NavItem = { href: string; label: string; icon: LucideIcon };
export type NavGroup = { label: string; items: NavItem[] };

// Grouped navigation for the customer web shell. Sections keep the 20-item nav
// scannable (and short enough to avoid the chunky scrollbar). Order within a
// group follows the farm workflow: lifecycle → operations → money → insights.
export const NAV_GROUPS: NavGroup[] = [
  {
    label: 'Overview',
    items: [
      { href: '/multi-farm', label: 'Multi-Farm', icon: LayoutGrid },
      { href: '/farms', label: 'Farms', icon: Tractor },
      { href: '/batches', label: 'Batches', icon: Layers },
    ],
  },
  {
    label: 'Operations',
    items: [
      { href: '/daily-log', label: 'Daily Logs', icon: ClipboardList },
      { href: '/health', label: 'Health', icon: Stethoscope },
      { href: '/vaccinations', label: 'Vaccinations', icon: Syringe },
      { href: '/inventory', label: 'Inventory', icon: Package },
    ],
  },
  {
    label: 'Money',
    items: [
      { href: '/transactions', label: 'Transactions', icon: FileText },
      { href: '/khata', label: 'Khata', icon: Wallet },
      { href: '/contract', label: 'Contract', icon: Handshake },
      { href: '/integrators', label: 'Integrators', icon: Building2 },
    ],
  },
  {
    label: 'Insights',
    items: [
      { href: '/market-prices', label: 'Market Prices', icon: TrendingUp },
      { href: '/weather', label: 'Weather', icon: CloudSun },
      { href: '/reports', label: 'Reports', icon: BarChart3 },
      { href: '/traceability', label: 'Traceability', icon: QrCode },
      { href: '/farm-integrity', label: 'Farm Integrity', icon: ShieldCheck },
    ],
  },
  {
    label: 'Account',
    items: [
      { href: '/whatsapp-settings', label: 'WhatsApp', icon: MessageCircle },
      { href: '/notifications', label: 'Notifications', icon: Bell },
      { href: '/team', label: 'Team', icon: Users },
      { href: '/billing', label: 'Billing', icon: CreditCard },
      { href: '/settings', label: 'Settings', icon: Settings },
    ],
  },
];

export const ALL_NAV: NavItem[] = NAV_GROUPS.flatMap((g) => g.items);

/** Best-match page title for the current pathname (longest matching nav href). */
export function titleForPath(pathname: string): string {
  let best: NavItem | null = null;
  for (const item of ALL_NAV) {
    if (pathname === item.href || pathname.startsWith(item.href + '/')) {
      if (!best || item.href.length > best.href.length) best = item;
    }
  }
  if (best) return best.label;
  if (pathname.startsWith('/daily-log/new') || pathname === '/daily-log/new') return 'Log entry';
  return 'Dashboard';
}
