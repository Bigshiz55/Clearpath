'use client';

import { useEffect, useRef, useState } from 'react';
import type { MediaType } from '@/lib/types';
import {
  resolveWatchPresentation,
  optionsFromCardAvailability,
  type LegacyCardAvailability,
  type WatchPresentation,
} from '@/lib/availability/watchPresentation';
import { timeAgo } from '@/lib/format/timeAgo';
import { addToWatchlist } from '@/lib/actions/watchlist';

/**
 * WHAT "CHECK AVAILABILITY" OPENS.
 *
 * Not a page, not a link — an in-app panel that immediately runs a real
 * server-side refresh and shows what came back. The button that opens it was
 * previously rendered with `href=null`: pressable-looking and inert.
 *
 * Every outcome is named. "We found nothing" and "we could not look" are
 * different answers and are shown differently, because only one of them is
 * about the title. When nothing is found the panel offers the notify path
 * rather than leaving the user at a dead end.
 */

const REASON_TEXT: Record<string, string> = {
  no_key: 'Live checking is not switched on for this deployment yet.',
  budget_exhausted: 'We have used this month’s allowance of availability checks.',
  fetch_failed: 'The availability service did not answer. Nothing has changed.',
  store_failed: 'We could not record a result, so nothing was changed.',
  rate_limited: 'This title was just checked. Try again in a minute.',
};

export function AvailabilityPanel({
  mediaType,
  tmdbId,
  title,
  originalNetwork = null,
  year = null,
  posterPath = null,
  onClose,
  onResolved,
}: {
  mediaType: MediaType;
  tmdbId: number;
  title: string;
  year?: number | null;
  posterPath?: string | null;
  originalNetwork?: string | null;
  onClose: () => void;
  /** Lets the card update itself when the refresh finds something. */
  onResolved?: (p: WatchPresentation) => void;
}) {
  const [state, setState] = useState<'checking' | 'done'>('checking');
  const [reason, setReason] = useState<string | null>(null);
  const [presentation, setPresentation] = useState<WatchPresentation | null>(null);
  const [notify, setNotify] = useState<'idle' | 'saving' | 'saved' | 'failed'>('idle');
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    closeRef.current?.focus();
    let active = true;
    fetch('/api/availability/refresh', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mediaType, tmdbId }),
    })
      .then(async (r) => ({ status: r.status, body: (await r.json()) as {
        ok?: boolean; reason?: string | null; availability?: LegacyCardAvailability | null;
      } }))
      .then(({ body }) => {
        if (!active) return;
        setReason(body.ok ? null : body.reason ?? 'fetch_failed');
        if (body.availability) {
          const { options, checked } = optionsFromCardAvailability(body.availability);
          const p = resolveWatchPresentation({ options, checked, originalNetwork });
          setPresentation(p);
          if (p.status === 'available') onResolved?.(p);
        }
        setState('done');
      })
      .catch(() => {
        if (!active) return;
        setReason('fetch_failed');
        setState('done');
      });
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mediaType, tmdbId, originalNetwork]);

  const found = presentation?.status === 'available';

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-end sm:place-items-center bg-black/70 p-0 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label={`Availability for ${title}`}
      data-testid="availability-panel"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="w-full max-w-md rounded-t-2xl sm:rounded-2xl border border-white/10 bg-ink-950 p-4 shadow-2xl">
        <div className="flex items-start justify-between gap-3">
          <h2 className="text-sm font-black uppercase tracking-wide text-slate-300">Where to watch</h2>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            data-testid="availability-panel-close"
            className="min-h-[36px] rounded-lg border border-white/15 px-3 text-xs font-bold text-slate-300"
          >
            Close
          </button>
        </div>
        <p className="mt-0.5 text-base font-semibold text-white">{title}</p>

        {state === 'checking' && (
          <p className="mt-3 text-sm text-slate-400" data-testid="availability-panel-checking">
            Checking now…
          </p>
        )}

        {state === 'done' && found && (
          <ul className="mt-3 space-y-1.5" data-testid="availability-panel-found">
            {presentation!.lines.map((l, i) => (
              <li key={`${l.text}|${i}`} className="rounded-lg border border-emerald-400/25 bg-emerald-500/10 px-2.5 py-1.5">
                <span className="text-sm font-semibold text-emerald-100">{l.text}</span>
                {l.detail && <span className="block text-xs text-slate-400">{l.detail}</span>}
                {l.href && (
                  <a href={l.href} target="_blank" rel="noopener noreferrer" className="mt-1 inline-block text-xs font-bold text-brand-200 underline">
                    Open ↗
                  </a>
                )}
              </li>
            ))}
          </ul>
        )}

        {state === 'done' && !found && (
          <p className="mt-3 text-sm text-slate-300" data-testid="availability-panel-none">
            {reason ? 'We could not check right now.' : 'No verified way to watch this was found.'}
          </p>
        )}

        {/* WHY, when there is a why. A failed check is a fact about US, not
            about the title, and conflating the two is what made the old
            unknown state feel like a verdict on the show. */}
        {state === 'done' && reason && (
          <p className="mt-1 text-xs text-slate-500" data-testid="availability-panel-reason">
            {REASON_TEXT[reason] ?? 'Something went wrong. Nothing has changed.'}
          </p>
        )}

        {state === 'done' && presentation?.lines.length === 0 && (
          <p className="mt-2 text-xs text-slate-500">
            Last checked {timeAgo(new Date().toISOString()) ?? 'just now'}
          </p>
        )}

        {/* Historical context, kept clearly apart from anything actionable. */}
        {originalNetwork && (
          <p className="mt-3 border-t border-white/10 pt-2 text-xs text-slate-500" data-testid="availability-panel-historical">
            Originally aired on {originalNetwork} <span className="text-slate-600">· historical, not current availability</span>
          </p>
        )}

        {/* A REAL MECHANISM, DESCRIBED HONESTLY.
            Saving to the watchlist is not a decorative stand-in for a notify
            feature — `watchlist_items` is the HIGHEST-priority tier the
            availability sync draws its daily batch from (see
            gatherCandidateRefs in watchmode/sync.ts), so this genuinely moves
            the title to the front of the queue. The copy says exactly that
            and promises no push notification we do not send. */}
        {state === 'done' && !found && (
          <>
            <button
              type="button"
              onClick={() => {
                setNotify('saving');
                void addToWatchlist({ tmdbId, mediaType, title, year, posterPath, status: 'strict', provenance: 'explicit_user_save' })
                  .then((r) => setNotify(r?.ok ? 'saved' : 'failed'))
                  .catch(() => setNotify('failed'));
              }}
              disabled={notify === 'saving' || notify === 'saved'}
              data-testid="availability-panel-notify"
              className="mt-3 inline-flex min-h-[40px] w-full items-center justify-center rounded-lg border border-brand-400/50 bg-brand-500/15 px-3 text-sm font-bold text-brand-100 disabled:opacity-60"
            >
              {notify === 'saving' ? 'Adding…'
                : notify === 'saved' ? 'On your list — we check these first'
                : notify === 'failed' ? 'Could not add it — try again'
                : 'Watch for it'}
            </button>
            <p className="mt-1 text-center text-[11px] text-slate-500">
              {notify === 'saved'
                ? 'It moves to the front of the availability queue.'
                : 'Adds it to your list, which we check for availability first.'}
            </p>
          </>
        )}
      </div>
    </div>
  );
}
