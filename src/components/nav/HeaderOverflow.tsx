'use client';

import { useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { ViewModeToggle } from '../ViewModeToggle';
import { SignOutButton } from '../SignOutButton';

/**
 * Header overflow — the home for lower-priority account controls.
 *
 * The header used to carry the desktop-view switch and Sign out inline. Those
 * two cost roughly 220px, which pushed the right-hand cluster wide enough that
 * the primary nav overflowed its own column and rendered *underneath* them:
 * "Watchlist" and "Desktop view" occupied the same pixels at every desktop
 * width, and on a tablet the bottom tab bar was showing the same destinations
 * again, so it read as two competing navigations.
 *
 * They live here at every width instead. One code path, no breakpoint at which
 * a control is duplicated or squeezed, and the primary nav gets the room it
 * needs. A desktop-only preview switch was never main navigation anyway.
 */
export function HeaderOverflow({
  personalLabel,
  isGuest = false,
  email = null,
}: {
  personalLabel?: string | null;
  isGuest?: boolean;
  email?: string | null;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const pathname = usePathname();

  useEffect(() => setOpen(false), [pathname]);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div className="relative" ref={ref} data-testid="header-overflow">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="More options"
        className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-white/15 bg-white/5 text-slate-200 transition hover:bg-white/10"
        data-testid="header-overflow-toggle"
      >
        <span aria-hidden className="text-lg leading-none">⋯</span>
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full z-50 mt-1 w-56 rounded-xl border border-white/10 bg-ink-850 p-2 shadow-card"
          data-testid="header-overflow-menu"
        >
          {!isGuest && (personalLabel || email) && (
            <div className="px-2 pb-2 pt-1" data-testid="signed-in-as">
              {personalLabel && <div className="text-xs text-slate-400">{personalLabel}</div>}
              {email && <div className="truncate text-[11px] text-slate-500">{email}</div>}
            </div>
          )}
          <div className="flex flex-col gap-1">
            {/* Pro is inline in the header from `sm`; on a phone this is where
                it lives, because the header there has room for search instead. */}
            <Link
              href="/app/pro"
              className="w-full rounded-lg border border-gold-400/50 bg-gold-500/10 px-2.5 py-1.5 text-left text-sm font-semibold text-gold-100 transition hover:bg-gold-500/20 sm:hidden"
              role="menuitem"
            >
              ⭐ WatchVerd1ct Pro
            </Link>
            <ViewModeToggle className="w-full justify-start" />
            {!isGuest && (
              <SignOutButton className="w-full rounded-lg border border-white/15 bg-white/5 px-2.5 py-1.5 text-left text-sm font-semibold text-slate-200 transition hover:bg-white/10" />
            )}
          </div>
        </div>
      )}
    </div>
  );
}
