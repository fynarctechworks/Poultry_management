'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { X, ChevronLeft, ChevronRight } from '@/components/icons';
import { cn } from '@/lib/utils';
import { NAV_GROUPS } from '@/components/nav-config';

export function Sidebar({
  userName,
  mobileOpen,
  collapsed,
  onClose,
  onToggleCollapse,
}: {
  userName: string;
  mobileOpen: boolean;
  collapsed: boolean;
  onClose: () => void;
  onToggleCollapse: () => void;
}) {
  const pathname = usePathname();

  return (
    <aside
      className={cn(
        'fixed inset-y-0 left-0 z-40 w-[248px] bg-canvas border-r border-mute flex flex-col transition-all duration-200',
        'lg:static lg:translate-x-0',
        // Desktop rail: the collapse only narrows the static lg+ sidebar; the
        // mobile drawer always shows full-width labels.
        collapsed ? 'lg:w-[72px]' : 'lg:w-[248px]',
        mobileOpen ? 'translate-x-0' : '-translate-x-full'
      )}
    >
      {/* Brand block — editorial serif wordmark (EB Garamond), not bold sans */}
      <div
        className={cn(
          'px-lg py-xl flex items-start justify-between',
          collapsed && 'lg:px-0 lg:justify-center'
        )}
      >
        <div className="flex items-center gap-sm min-w-0">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/poultry-mark.png" alt="" className="h-9 w-9 rounded-lg shrink-0" />
          <div className={cn('min-w-0', collapsed && 'lg:hidden')}>
            <h1 className="font-display text-xl leading-none text-ink tracking-[-0.16px]">PoultryOS</h1>
            <p className="text-[11px] text-body-soft mt-xxs truncate max-w-[150px]">{userName}</p>
          </div>
        </div>
        <button
          onClick={onClose}
          className="grid place-items-center w-9 h-9 rounded-lg text-body hover:bg-mute-soft lg:hidden shrink-0"
          aria-label="Close menu"
        >
          <X size={18} />
        </button>
      </div>

      <nav className="flex-1 min-h-0 px-sm pb-md overflow-y-auto scrollbar-thin">
        {NAV_GROUPS.map((group) => (
          <div key={group.label} className="mb-lg last:mb-0">
            <p className={cn('nav-section-label px-md mb-xs', collapsed && 'lg:hidden')}>{group.label}</p>
            {group.items.map(({ href, label, icon: Icon }) => {
              const active = pathname === href || pathname.startsWith(href + '/');
              return (
                <Link
                  key={href}
                  href={href}
                  onClick={onClose}
                  title={collapsed ? label : undefined}
                  className={cn(
                    'flex items-center gap-md px-md py-sm rounded-md text-[15px] font-medium mb-xxs transition-colors',
                    collapsed && 'lg:justify-center lg:px-0',
                    active ? 'bg-primary-subtle text-primary' : 'text-body hover:bg-mute-soft'
                  )}
                >
                  {/* Active item gets the filled (Bold) Iconsax variant for emphasis */}
                  <Icon size={18} variant={active ? 'Bold' : 'Linear'} className="shrink-0" />
                  <span className={cn('truncate', collapsed && 'lg:hidden')}>{label}</span>
                </Link>
              );
            })}
          </div>
        ))}
      </nav>

      {/* Collapse toggle — desktop only (mobile uses the drawer + backdrop) */}
      <div className="hidden lg:block border-t border-mute p-sm">
        <button
          onClick={onToggleCollapse}
          className={cn(
            'w-full flex items-center gap-md px-md py-sm rounded-md text-sm font-medium text-body hover:bg-mute-soft transition-colors',
            collapsed && 'justify-center px-0'
          )}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {collapsed ? <ChevronRight size={18} className="shrink-0" /> : <ChevronLeft size={18} className="shrink-0" />}
          <span className={cn(collapsed && 'hidden')}>Collapse</span>
        </button>
      </div>
    </aside>
  );
}
