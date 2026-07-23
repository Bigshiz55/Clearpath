'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { NavLink } from './MoreMenu';

/** Mobile bottom bar: primary links inline + a "More" sheet for the rest, so the
 *  bar never gets crowded past the point of usability. */
export function MobileNav({ primary, secondary, moreLabel = 'More' }: { primary: NavLink[]; secondary: NavLink[]; moreLabel?: string }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  useEffect(() => setOpen(false), [pathname]);

  const isActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`);
  const secondaryActive = secondary.some((l) => isActive(l.href));

  return (
    <>
      {open && (
        <div className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm sm:hidden" onClick={() => setOpen(false)}>
          <div
            className="absolute inset-x-0 bottom-[calc(4rem+env(safe-area-inset-bottom))] mx-2 overflow-hidden rounded-2xl border border-white/10 bg-ink-850 p-2 shadow-card"
            onClick={(e) => e.stopPropagation()}
          >
            {secondary.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                className={`block rounded-xl px-4 py-3 text-sm font-semibold transition ${isActive(l.href) ? 'bg-brand-500/20 text-brand-100' : 'text-slate-200 hover:bg-white/10'}`}
              >
                {l.label}
              </Link>
            ))}
          </div>
        </div>
      )}

      <nav className="fixed inset-x-0 bottom-0 z-40 flex items-center justify-around border-t border-white/10 bg-ink-950/95 px-2 pt-2 pb-[calc(0.5rem+env(safe-area-inset-bottom))] backdrop-blur sm:hidden">
        {primary.map((l) => (
          <Link
            key={l.href}
            href={l.href}
            className={`flex flex-1 flex-col items-center gap-0.5 rounded-lg px-1 py-1 text-[11px] ${isActive(l.href) ? 'font-semibold text-brand-200' : 'text-slate-300'}`}
          >
            {l.label}
          </Link>
        ))}
        <button
          onClick={() => setOpen((v) => !v)}
          className={`flex flex-1 flex-col items-center gap-0.5 rounded-lg px-1 py-1 text-[11px] ${open || secondaryActive ? 'font-semibold text-brand-200' : 'text-slate-300'}`}
          aria-haspopup="menu"
          aria-expanded={open}
        >
          {moreLabel}
        </button>
      </nav>
    </>
  );
}
