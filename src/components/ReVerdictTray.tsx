'use client';

/**
 * THE R TRAY — the rewatch shortlist, always visible once it exists.
 *
 * The docket tray's twin, in amber rather than pink so at a glance you know
 * which question you are building. It renders NOTHING when the R docket is
 * empty, so it never costs screen space for a feature nobody is using — and it
 * stacks ABOVE the W tray when both exist, rather than fighting it for the same
 * strip of screen.
 *
 * Opaque and unblurred, for the same iOS fixed-layer reason as the nav.
 */
import Link from 'next/link';
import { useSyncExternalStore, useState } from 'react';
import {
  clearRDocket,
  getRDocket,
  getRDocketServerSnapshot,
  removeFromRDocketStore,
  subscribeRDocket,
} from '@/lib/reverdictStore';
import { getDocket, getDocketServerSnapshot, subscribeDocket } from '@/lib/docketStore';
import { rDocketStatus, MIN_FOR_REVERDICT } from '@/lib/reverdict/docket';

export function ReVerdictTray() {
  const docket = useSyncExternalStore(subscribeRDocket, getRDocket, getRDocketServerSnapshot);
  const wDocket = useSyncExternalStore(subscribeDocket, getDocket, getDocketServerSnapshot);
  const [open, setOpen] = useState(false);
  const status = rDocketStatus(docket);

  if (docket.length === 0) return null;

  // Sit above the W tray when it is also on screen, so neither is covered.
  const bottom = wDocket.length > 0
    ? 'bottom-[calc(env(safe-area-inset-bottom)+10.5rem)] lg:bottom-[9.5rem]'
    : 'bottom-[calc(env(safe-area-inset-bottom)+5rem)] lg:bottom-4';

  return (
    <div className={`fixed inset-x-0 z-40 px-3 ${bottom}`} data-testid="reverdict-tray">
      <div className="container-page">
        <div className="rounded-2xl border-2 border-amber-400/60 bg-ink-950 p-3 shadow-[0_10px_40px_-8px_rgba(0,0,0,0.8)]">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setOpen((o) => !o)}
              aria-expanded={open}
              data-testid="reverdict-toggle"
              className="inline-flex min-h-[44px] items-center gap-2 rounded-lg px-1 text-sm font-bold text-white"
            >
              <span className="grid h-7 w-7 flex-none place-items-center rounded-full bg-gradient-to-b from-amber-400 to-amber-600 text-xs font-black text-white">
                {status.count}
              </span>
              <span data-testid="reverdict-status">{status.message}</span>
              <span aria-hidden className="text-slate-500">{open ? '▾' : '▸'}</span>
            </button>

            <div className="ml-auto flex items-center gap-2">
              <button
                type="button"
                onClick={clearRDocket}
                data-testid="reverdict-clear"
                className="inline-flex min-h-[44px] items-center rounded-lg px-3 text-xs font-semibold text-slate-400 transition hover:text-slate-200"
              >
                Clear
              </button>
              {status.ready ? (
                <Link
                  href="/app/reverdict"
                  data-testid="reverdict-deliver"
                  className="inline-flex min-h-[44px] items-center rounded-lg border-2 border-amber-200/60 bg-gradient-to-b from-amber-400 to-amber-600 px-5 text-sm font-black text-white transition hover:brightness-110"
                >
                  Deliver the re-Verd1ct →
                </Link>
              ) : (
                <span className="text-xs font-semibold text-slate-500" data-testid="reverdict-not-ready">
                  {MIN_FOR_REVERDICT} minimum
                </span>
              )}
            </div>
          </div>

          {open && (
            <ul className="mt-2 flex flex-wrap gap-1.5 border-t border-white/10 pt-2" data-testid="reverdict-list">
              {docket.map((e) => (
                <li key={e.key}>
                  <button
                    type="button"
                    onClick={() => removeFromRDocketStore(e.key)}
                    data-testid={`reverdict-remove-${e.tmdbId}`}
                    aria-label={`Take ${e.title} off the rewatch list`}
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
