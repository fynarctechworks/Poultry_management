/**
 * Central icon barrel — the whole web app draws its icons from Iconsax
 * (`iconsax-react`) through this file. Names are aliased to the lucide names the
 * codebase already used, so call sites keep `<LayoutGrid size={18} />` etc. and
 * only their *import source* changes to `@/components/icons`.
 *
 * Iconsax icons default to `color="currentColor"` and spread `className`/`size`
 * onto the underlying <svg>, so they drop in wherever a lucide icon stood.
 * Default variant is "Linear" (the thin editorial line style that suits the
 * ElevenLabs system); pass `variant="Bold"` at a call site to fill one.
 */
import { Add, type IconProps } from 'iconsax-react';
import type { FC } from 'react';

export type { IconProps };
// Back-compat alias for the few files that typed icons as `LucideIcon`.
export type LucideIcon = FC<IconProps>;

export {
  // Overview / navigation
  Element3 as LayoutGrid,
  Home2 as Tractor,
  Layer as Layers,
  // Operations
  ClipboardText as ClipboardList,
  Health as Stethoscope,
  Drop as Syringe,
  Box as Package,
  // Money
  DocumentText as FileText,
  Wallet,
  Briefcase as Handshake,
  Buildings2 as Building2,
  Card as CreditCard,
  ReceiptText,
  // Insights
  TrendUp as TrendingUp,
  CloudSunny as CloudSun,
  Chart as BarChart3,
  ScanBarcode as QrCode,
  ShieldTick as ShieldCheck,
  // Account / chrome
  Messages as MessageCircle,
  Notification as Bell,
  Profile2User as Users,
  Setting2 as Settings,
  HambergerMenu as Menu,
  AddCircle as PlusCircle,
  ArrowDown2 as ChevronDown,
  ArrowLeft2 as ChevronLeft,
  ArrowRight2 as ChevronRight,
  ArrowRight as ArrowUpRight,
  Logout as LogOut,
  // Auth / onboarding / billing
  Eye,
  EyeSlash as EyeOff,
  Check,
  TickCircle as CheckCircle2,
  Lock,
  Building as Warehouse,
  DocumentDownload as Download,
  Sms as MailCheck,
} from 'iconsax-react';

/**
 * lucide's bare "X" (close) has no Iconsax equivalent — render the Iconsax
 * plus (`Add`) rotated 45° so the close glyph shares the line weight of every
 * other icon instead of importing a second icon set.
 */
export const X: FC<IconProps> = ({ className, ...props }) => (
  <Add {...props} className={['rotate-45', className].filter(Boolean).join(' ')} />
);

/**
 * Iconsax ships no spinner, so loading states use this neutral circular one.
 * Mirrors the lucide `Loader2` API (`size`, `className`) — call sites keep
 * passing `className="animate-spin"`.
 */
export const Loader2: FC<IconProps> = ({ size = 24, className, color = 'currentColor', ...rest }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke={color}
    strokeWidth={2}
    strokeLinecap="round"
    className={className}
    {...rest}
  >
    <path d="M21 12a9 9 0 1 1-6.219-8.56" opacity={0.9} />
  </svg>
);
