'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { NavLink } from './MoreMenu';

/** Mobile bottom bar: primary links inline + a "More" sheet for the rest, so the
 *  bar never gets crowded past the point of usability. */
export function MobileNav({ primary, secondary }: { primary: NavLink[]; secondary: NavLink[] }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  useEffect(() => setOpen(false), [pathname]);

  const isActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`);
  const secondaryActive = secondary.some((l) => isActive(l.href));

  // Short labels so six tabs stay legible and un-wrapped at 320px.
  const SHORT: Record<string, string> = {
    '/app': 'Home',
    '/app/watch': 'Watch',
    '/app/new': 'New',
    '/app/tv': 'On TV',
    '/app/watchlist': 'Saved',
  };

  return (
    <>
      {open && (
        <div className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm lg:hidden" onClick={() => setOpen(false)}>
          <div
            className="absolute inset-x-0 bottom-[calc(4.75rem+env(safe-area-inset-bottom))] mx-2 overflow-hidden rounded-2xl border border-white/10 bg-ink-850 p-2 shadow-card"
            onClick={(e) => e.stopPropagation()}
          >
            {secondary.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                className={`block rounded-xl px-4 py-3 text-sm font-semibold transition ${isActive(l.href) ? 'bg-[#ff1493]/20 text-pink-100' : 'text-slate-200 hover:bg-white/10'}`}
              >
                {l.label}
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* A FLOATING PILL, not a bar welded to the bottom edge.
          The bar shape reads as a browser chrome element; a pill that sits
          above the content reads as part of the app. It is also the single
          cheapest change that makes the whole product look current — the
          content scrolls behind and under it instead of stopping at a rule. */}
      <div
        data-app-bottomnav
        className="fixed inset-x-0 bottom-[env(safe-area-inset-bottom)] z-40 px-3 pb-2 lg:hidden"
      >
        <nav className="mx-auto flex max-w-md items-center justify-around gap-0.5 rounded-2xl border border-white/10 bg-ink-900/90 p-1 shadow-[0_8px_32px_-4px_rgba(0,0,0,0.9)] backdrop-blur-xl">
          {primary.map((l) => {
            const on = isActive(l.href);
            return (
              <Link
                key={l.href}
                href={l.href}
                aria-current={on ? 'page' : undefined}
                className={`flex min-h-[44px] flex-1 items-center justify-center rounded-xl px-1 text-[11px] font-semibold leading-none transition ${
                  on ? 'bg-[#ff1493]/20 text-pink-100' : 'text-slate-400'
                }`}
              >
                <span className="whitespace-nowrap">{SHORT[l.href] ?? l.label}</span>
              </Link>
            );
          })}
          <button
            onClick={() => setOpen((v) => !v)}
            className={`flex min-h-[44px] flex-1 items-center justify-center rounded-xl px-1 text-[11px] font-semibold leading-none transition ${
              open || secondaryActive ? 'bg-[#ff1493]/20 text-pink-100' : 'text-slate-400'
            }`}
            aria-haspopup="menu"
            aria-expanded={open}
          >
            <span className="whitespace-nowrap">More</span>
          </button>
        </nav>
      </div>
    </>
  );
}
