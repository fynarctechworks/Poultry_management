'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { NAV_GROUPS } from '@/components/nav-config';

export function Sidebar({
  userName,
  mobileOpen,
  onClose,
}: {
  userName: string;
  mobileOpen: boolean;
  onClose: () => void;
}) {
  const pathname = usePathname();

  return (
    <aside
      className={cn(
        'fixed inset-y-0 left-0 z-40 w-[248px] bg-canvas border-r border-mute flex flex-col transition-transform duration-200',
        'lg:static lg:translate-x-0',
        mobileOpen ? 'translate-x-0' : '-translate-x-full'
      )}
    >
      {/* Brand block — editorial serif wordmark (EB Garamond), not bold sans */}
      <div className="px-lg py-xl flex items-start justify-between">
        <div className="flex items-center gap-sm">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/poultry-mark.png" alt="" className="h-9 w-9 rounded-lg shrink-0" />
          <div>
            <h1 className="font-display text-xl leading-none text-ink tracking-[-0.16px]">PoultryOS</h1>
            <p className="text-[11px] text-body-soft mt-xxs truncate max-w-[150px]">{userName}</p>
          </div>
        </div>
        <button
          onClick={onClose}
          className="grid place-items-center w-9 h-9 rounded-lg text-body hover:bg-mute-soft lg:hidden"
          aria-label="Close menu"
        >
          <X size={18} />
        </button>
      </div>

      <nav className="flex-1 min-h-0 px-sm pb-md overflow-y-auto scrollbar-thin">
        {NAV_GROUPS.map((group) => (
          <div key={group.label} className="mb-lg last:mb-0">
            <p className="nav-section-label px-md mb-xs">{group.label}</p>
            {group.items.map(({ href, label, icon: Icon }) => {
              const active = pathname === href || pathname.startsWith(href + '/');
              return (
                <Link
                  key={href}
                  href={href}
                  onClick={onClose}
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
  );
}
