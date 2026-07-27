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
 */
import Link from 'next/link';
import { useSyncExternalStore, useState } from 'react';
import {
  clearDocket,
  getDocket,
  getDocketServerSnapshot,
  removeFromDocketStore,
  subscribeDocket,
} from '@/lib/docketStore';
import { docketStatus, MIN_FOR_VERDICT } from '@/lib/verdict/docket';

export function DocketTray() {
  const docket = useSyncExternalStore(subscribeDocket, getDocket, getDocketServerSnapshot);
  const [open, setOpen] = useState(false);
  const status = docketStatus(docket);

  if (docket.length === 0) return null;

  return (
    <div
      className="fixed inset-x-0 bottom-[calc(env(safe-area-inset-bottom)+5rem)] z-40 px-3 lg:bottom-4"
      data-testid="docket-tray"
    >
      <div className="container-page">
        <div className="rounded-2xl border-2 border-[#ff1493]/50 bg-ink-950/95 p-3 shadow-[0_10px_40px_-8px_rgba(0,0,0,0.8)] backdrop-blur">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setOpen((o) => !o)}
              aria-expanded={open}
              data-testid="docket-toggle"
              className="inline-flex min-h-[40px] items-center gap-2 rounded-lg px-1 text-sm font-bold text-white"
            >
              <span className="grid h-7 w-7 flex-none place-items-center rounded-full bg-gradient-to-b from-[#ff62b6] to-[#ff1493] text-xs font-black text-white">
                {status.count}
              </span>
              <span data-testid="docket-status">{status.message}</span>
              <span aria-hidden className="text-slate-500">{open ? '▾' : '▸'}</span>
            </button>

            <div className="ml-auto flex items-center gap-2">
              <button
                type="button"
                onClick={clearDocket}
                data-testid="docket-clear"
                className="inline-flex min-h-[40px] items-center rounded-lg px-3 text-xs font-semibold text-slate-400 transition hover:text-slate-200"
              >
                Clear
              </button>
              {status.ready ? (
                <Link
                  href="/app/verdict"
                  data-testid="docket-deliver"
                  className="inline-flex min-h-[44px] items-center rounded-lg border-2 border-pink-200/60 bg-gradient-to-b from-[#ff62b6] to-[#ff1493] px-5 text-sm font-black text-white transition hover:brightness-110"
                >
                  Deliver the Verd1ct →
                </Link>
              ) : (
                <span className="text-xs font-semibold text-slate-500" data-testid="docket-not-ready">
                  {MIN_FOR_VERDICT} minimum
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
