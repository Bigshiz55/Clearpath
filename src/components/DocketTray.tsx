'use client';

/**
 * THE TRAY — the docket, always visible once it exists.
 *
 * A shortlist you cannot see is a shortlist you forget you started. It shows
 * the count, what is on it, and the one action that closes it. It renders
 * NOTHING when the docket is empty, so it never costs anyone screen space for a
 * feature they are not using.
 *
 * It sits above the mobile tab bar rather than over it — covering navigation to
 * advertise a feature is how a tray becomes a nuisance.
 *
 * AND IT IS NOT ON THE VERDICT PAGE. The tray's entire job is to carry you TO
 * the ruling; once you are reading one, it is offering to take you where you
 * already are. Worse, it sat on top of that page's own two buttons — "Take me
 * to it" and "Start a new docket" — so the one screen with a decision on it was
 * the one screen where you could not act on it. Anything the tray does there,
 * the page does better: Clear is "Start a new docket", and Deliver is the thing
 * you just did.
 */
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useSyncExternalStore, useState } from 'react';
import {
  clearDocket,
  getDocket,
  getDocketServerSnapshot,
  removeFromDocketStore,
  subscribeDocket,
} from '@/lib/docketStore';
import { docketStatus, trayHidden, MIN_FOR_VERDICT } from '@/lib/verdict/docket';

export function DocketTray() {
  const docket = useSyncExternalStore(subscribeDocket, getDocket, getDocketServerSnapshot);
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const status = docketStatus(docket);

  // Hooks run first, unconditionally — an early return above them would break
  // the rules of hooks the moment either condition changed between renders.
  // The decision itself is pure and lives in `docket.ts`, where it is tested.
  if (trayHidden(pathname, docket.length)) return null;

  return (
    <div
      className="fixed inset-x-0 bottom-[calc(env(safe-area-inset-bottom)+5rem)] z-40 px-2 lg:bottom-4"
      data-testid="docket-tray"
    >
      <div className="container-page">
        {/* Opaque, and no backdrop-filter — same iOS fixed-layer repaint trap
            the bottom nav hit. See MobileNav. */}
        <div className="rounded-2xl border-2 border-[#ff1493]/50 bg-ink-950 px-2 py-2 shadow-[0_10px_40px_-8px_rgba(0,0,0,0.8)]">
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setOpen((o) => !o)}
              aria-expanded={open}
              aria-label={`${status.message} — ${status.count} on the docket. Tap to see them.`}
              data-testid="docket-toggle"
              className="inline-flex min-h-[36px] min-w-0 items-center gap-1.5 rounded-lg px-0.5 text-sm font-bold text-white"
            >
              <span data-testid="docket-count" className="wv-tray-count grid h-7 w-7 flex-none place-items-center rounded-full bg-gradient-to-b from-[#ff62b6] to-[#ff1493] text-xs font-black text-white">
                {status.count}
              </span>
              <span data-testid="docket-status" className="wv-tray-status truncate">{status.message}</span>
              <span aria-hidden className="text-slate-500">{open ? '▾' : '▸'}</span>
            </button>

            <div className="ml-auto flex flex-none items-center gap-1">
              <button
                type="button"
                onClick={clearDocket}
                data-testid="docket-clear"
                className="inline-flex min-h-[36px] items-center rounded-lg px-2 text-xs font-semibold text-slate-400 transition hover:text-slate-200"
              >
                Clear
              </button>
              {status.ready ? (
                <Link
                  href="/app/verdict"
                  data-testid="docket-deliver"
                  className="inline-flex min-h-[40px] flex-none items-center rounded-lg border-2 border-pink-200/60 bg-gradient-to-b from-[#ff62b6] to-[#ff1493] px-3.5 text-sm font-black text-white transition hover:brightness-110"
                >
                  Deliver →
                </Link>
              ) : (
                // Nothing here. The message already says how many more are
                // needed, and restating it as "3 minimum" cost the row the
                // width that made it wrap in the first place.
                <span className="sr-only" data-testid="docket-not-ready">
                  {MIN_FOR_VERDICT} needed for a verdict
                </span>
              )}
            </div>
          </div>

          {open && (
            <ul className="mt-2 flex flex-wrap gap-1.5 border-t border-white/10 pt-2" data-testid="docket-list">
              {docket.map((e) => (
                <li key={e.key}>
                  <button
                    type="button"
                    onClick={() => removeFromDocketStore(e.key)}
                    data-testid={`docket-remove-${e.tmdbId}`}
                    aria-label={`Take ${e.title} off the docket`}
                    className="inline-flex min-h-[36px] max-w-[15rem] items-center gap-1.5 rounded-full border border-white/15 bg-white/5 px-3 text-xs font-semibold text-slate-200 transition hover:bg-white/10"
                  >
                    <span className="truncate">{e.title}</span>
                    <span aria-hidden className="flex-none text-slate-500">✕</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
