'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { NavItem } from '@/config/nav';
import { Icon } from '@/components/icons';
import { cn } from '@/lib/utils/cn';

function useActive(href: string): boolean {
  const pathname = usePathname();
  if (href === '/') return pathname === '/';
  return pathname === href || pathname.startsWith(`${href}/`);
}

/** Desktop top-nav link. */
export function TopNavLink({ item }: { item: NavItem }) {
  const active = useActive(item.href);
  return (
    <Link
      href={item.href}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'rounded-lg px-3 py-2 text-sm font-medium transition',
        active
          ? 'bg-obsidian-800 text-ivory-50'
          : 'text-ivory-300 hover:bg-obsidian-800/60 hover:text-ivory-100',
      )}
    >
      {item.label}
    </Link>
  );
}

/** Mobile bottom-tab link with icon + label; 44px+ touch target. */
export function TabNavLink({ item }: { item: NavItem }) {
  const active = useActive(item.href);
  return (
    <Link
      href={item.href}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'flex min-h-[52px] flex-1 flex-col items-center justify-center gap-0.5 rounded-lg px-1 py-1.5 text-[11px] font-medium transition',
        active ? 'text-brass-300' : 'text-ivory-400 hover:text-ivory-100',
      )}
    >
      <Icon name={item.icon} className="h-5 w-5" />
      <span>{item.label}</span>
    </Link>
  );
}
