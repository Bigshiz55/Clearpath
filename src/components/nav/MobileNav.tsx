'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { NavLink } from './MoreMenu';
import { navHref } from '@/lib/nav/returnTo';

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
      {/* No blur on the scrim either — a full-screen fixed layer with a
          backdrop filter is the same iOS compositing trap. A plain scrim does
          the job. */}
      {open && (
        <div className="fixed inset-0 z-40 bg-black/70 lg:hidden" onClick={() => setOpen(false)}>
          <div
            className="absolute inset-x-0 bottom-[calc(var(--wv-bottom-nav-h)+env(safe-area-inset-bottom))] mx-2 overflow-hidden rounded-2xl border border-white/10 bg-ink-850 p-2 shadow-card"
            onClick={(e) => e.stopPropagation()}
          >
            {secondary.map((l) => (
              <Link
                key={l.href}
                // The tour carries where you are now, so its Done returns here.
                href={navHref(l.href, pathname)}
                className={`block rounded-xl px-4 py-3 text-sm font-semibold transition ${isActive(l.href) ? 'bg-[#ff1493]/20 text-pink-100' : 'text-slate-200 hover:bg-white/10'}`}
              >
                {l.label}
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* WELDED TO THE BOTTOM EDGE, AND OPAQUE.
          It shipped briefly as a floating translucent pill inset from the edges.
          Two problems, and the second is the serious one:
            • Content showed through and around it, so it read as something
              stuck on top of the page rather than part of the app.
            • `backdrop-filter` on a `position: fixed` element is the classic
              iOS Safari repaint trap. Combined with `background-attachment:
              fixed` on the body (now also gone), Safari can leave the fixed
              layer painted at a stale offset during a scroll — which is how a
              bottom bar ends up sitting in the middle of the screen over a
              poster. It measures correctly in Chromium, so the layout was never
              wrong; the compositing was.
          So: no blur, no translucency, no inset. An opaque bar on the edge
          cannot be composited to the wrong place, and nothing shows through. */}
      <div
        data-app-bottomnav
        className="fixed inset-x-0 bottom-0 z-40 border-t border-white/10 bg-ink-950 pb-[env(safe-area-inset-bottom)] lg:hidden"
      >
        <nav className="mx-auto flex max-w-md items-center justify-around gap-0.5 px-2 py-1">
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
