'use client';

/**
 * THE DOCKET BAR — the docket, always visible once it exists.
 *
 * A shortlist you cannot see is a shortlist you forget you started. It states
 * the count and the action in one line — "N on your docket · Hit the Gavel" —
 * so the mechanic never depends on a tooltip to be understood. It renders
 * NOTHING when the docket is empty, so it never costs anyone screen space for
 * a feature they are not using.
 *
 * FULL-WIDTH, NOT A CORNER WIDGET. A small `right`-anchored block clips at the
 * viewport edge the moment the "Desktop view" toggle overrides the meta
 * viewport width, or on any surface that doesn't reserve
 * `env(safe-area-inset-right)` (nothing in this codebase does). A bar spanning
 * `inset-x-0` has no horizontal edge to clip against, at any width.
 *
 * AND IT IS NOT ON THE VERDICT PAGE. The bar's entire job is to carry you TO
 * the ruling; once you are reading one, it is offering to take you where you
 * already are. Anything it does there, the page does better: Clear is "Start
 * a new docket", and Deliver is the thing you just did.
 */
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useSyncExternalStore, useState } from 'react';
import { Gavel } from 'lucide-react';
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
  // Only .count and .ready are read from docketStatus — its .message /
  // .longMessage strings belong to the old corner widget's copy and are
  // superseded here by the "N on your docket · Hit the Gavel" pattern.
  const status = docketStatus(docket);
  const need = MIN_FOR_VERDICT - status.count;

  // Hooks run first, unconditionally — an early return above them would break
  // the rules of hooks the moment either condition changed between renders.
  // The decision itself is pure and lives in `docket.ts`, where it is tested.
  if (trayHidden(pathname, docket.length)) return null;

  return (
    <>
      {/* THE BAR PAYS FOR ITS OWN SPACE. It is `fixed`, so it floats over the
          page — and the page's layout pads for the bottom nav but knows nothing
          about a bar that only sometimes exists. The spacer is rendered in
          normal flow, exactly when the bar is, and covers its height — so the
          bottom of the content can always scroll clear of it. */}
      <div aria-hidden data-testid="docket-spacer" className="h-28" />
      <div
        className="fixed inset-x-0 bottom-[calc(env(safe-area-inset-bottom)+5rem)] z-40 lg:bottom-0"
        data-testid="docket-tray"
      >
        <div className="mx-auto max-w-3xl bg-ink-950 shadow-[0_-10px_40px_-8px_rgba(0,0,0,0.85)] ring-1 ring-[#ff1493]/40 lg:rounded-t-2xl lg:border lg:border-b-0 lg:border-[#ff1493]/40">
          {open && (
            <div className="border-b border-white/10 px-3 pb-2 pt-3">
              <ul className="flex max-h-[40vh] flex-col gap-1 overflow-y-auto" data-testid="docket-list">
                {docket.map((e) => (
                  <li key={e.key}>
                    <button
                      type="button"
                      onClick={() => removeFromDocketStore(e.key)}
                      data-testid={`docket-remove-${e.tmdbId}`}
                      aria-label={`Take ${e.title} off the docket`}
                      className="inline-flex min-h-[44px] w-full items-center gap-2 rounded-lg border border-white/15 bg-white/5 px-3 text-left text-sm font-semibold text-slate-200 transition hover:bg-white/10"
                    >
                      <span className="min-w-0 flex-1 truncate">{e.title}</span>
                      <span aria-hidden className="flex-none text-slate-500">✕</span>
                    </button>
                  </li>
                ))}
              </ul>
              {/* Clear-everything lives INSIDE the expanded panel: on a bar
                  shared with the Gavel action, a one-tap destroy-the-whole-
                  docket button beside it is an accident waiting to happen. */}
              <button
                type="button"
                onClick={clearDocket}
                data-testid="docket-clear"
                className="mt-2 inline-flex min-h-[36px] w-full items-center justify-center rounded-lg px-2 text-sm font-semibold text-slate-400 transition hover:text-slate-200"
              >
                Clear all
              </button>
            </div>
          )}

          <div className="flex min-h-[44px] items-center justify-between gap-2 px-3 py-2 pb-[calc(env(safe-area-inset-bottom)+0.5rem)] lg:pb-2">
            {/* TAPPING THE COUNT OPENS THE DOCKET — reviewable, not a black box. */}
            <button
              type="button"
              onClick={() => setOpen((o) => !o)}
              aria-expanded={open}
              aria-label={`${status.count} on your docket. Tap to see them.`}
              data-testid="docket-toggle"
              className="flex min-h-[44px] flex-1 items-center gap-2 truncate rounded-lg px-1 text-left transition hover:bg-white/5"
            >
              <span
                data-testid="docket-count"
                className="grid h-7 w-7 flex-none place-items-center rounded-full bg-gradient-to-b from-[#ff62b6] to-[#ff1493] text-xs font-black text-white"
              >
                {status.count}
              </span>
              <span data-testid="docket-status" className="min-w-0 flex-1 truncate text-sm font-bold text-slate-100">
                on your docket
              </span>
              <span aria-hidden className="flex-none text-[10px] text-slate-500">
                {open ? '▾' : '▴'}
              </span>
            </button>

            <span aria-hidden className="flex-none text-sm font-bold text-slate-500">
              ·
            </span>

            {status.ready ? (
              <Link
                href="/app/verdict"
                data-testid="docket-deliver"
                aria-label={`Hit the gavel — ${status.count} titles on your docket`}
                className="inline-flex min-h-[44px] flex-none items-center gap-1.5 rounded-xl bg-[#ff1493] px-4 text-sm font-black text-white ring-1 ring-pink-200/60 transition hover:brightness-110 focus:outline-none focus-visible:ring-2 focus-visible:ring-white active:scale-95"
              >
                <Gavel aria-hidden className="h-4 w-4" strokeWidth={2.5} />
                <span className="whitespace-nowrap">Hit the Gavel</span>
              </Link>
            ) : (
              // VISIBLE BUT DISABLED, rather than absent. A control that
              // appears only once you have earned it cannot teach you how to
              // earn it — and the count alone does not say what it unlocks.
              <button
                type="button"
                disabled
                data-testid="docket-not-ready"
                aria-label={`Gavel unavailable — ${need} more needed for a verdict`}
                className="inline-flex min-h-[44px] flex-none cursor-not-allowed items-center gap-1.5 rounded-xl bg-white/5 px-3 text-sm font-black text-slate-500 ring-1 ring-white/10"
              >
                <Gavel aria-hidden className="h-4 w-4 opacity-50" strokeWidth={2.5} />
                <span className="whitespace-nowrap">{need} more</span>
              </button>
            )}
          </div>

          {/* The full sentence, for assistive tech — the bar's own text is
              split across two tap targets and reads correctly on its own, but
              a screen reader gets one clean announcement instead. */}
          <span className="sr-only" role="status" aria-live="polite" data-testid="docket-announce">
            {status.ready
              ? `${status.count} on your docket. Hit the Gavel.`
              : `${status.count} on your docket. ${need} more to unlock the gavel.`}
          </span>
        </div>
      </div>
    </>
  );
}
