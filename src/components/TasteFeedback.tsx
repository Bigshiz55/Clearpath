'use client';

import { useState } from 'react';
import { createPortal } from 'react-dom';
import { recordTasteFeedback } from '@/lib/actions/feedback';
import { useToast } from '@/components/Toast';
import type { MediaType } from '@/lib/types';

type Verdict = 'seen' | 'not_interested' | 'disliked';

const OPTIONS: { verdict: Verdict; label: string; emoji: string; hint: string }[] = [
  { verdict: 'seen', label: 'Seen it', emoji: '👀', hint: 'Already watched — just hide it' },
  { verdict: 'not_interested', label: 'Not interested', emoji: '🙅', hint: 'Not my thing — show me less like this' },
  { verdict: 'disliked', label: 'Didn’t like it', emoji: '👎', hint: 'A miss — steer my DNA away from it' },
];

/**
 * A "not for me" flag on a card. Opens a small sheet (Seen it / Not interested
 * / Didn't like it); each choice feeds the WatchVerdict DNA Score so the next
 * picks improve, and the title is saved to your watchlist (dropped/watched) so
 * you can still look it up later. Calls `onFlagged` so the grid hides the card.
 */
export function TasteFeedback({
  tmdbId,
  mediaType,
  title,
  year,
  posterPath,
  onFlagged,
}: {
  tmdbId: number;
  mediaType: MediaType;
  title: string;
  year: number | null;
  posterPath: string | null;
  onFlagged?: () => void;
}) {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  async function choose(verdict: Verdict) {
    if (busy) return;
    setBusy(true);
    const res = await recordTasteFeedback({ tmdbId, mediaType, title, year, posterPath, verdict });
    setBusy(false);
    setOpen(false);
    if (res.ok) {
      toast.show(verdict === 'seen' ? 'Hidden — saved to your watchlist.' : 'Noted — your DNA is learning. 🧬', 'success');
      onFlagged?.();
    } else {
      toast.show(res.error ?? 'Could not save.', 'error');
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setOpen(true);
        }}
        aria-label="Remove — tell us why"
        title="Remove from your picks"
        className="inline-flex items-center gap-1 rounded-lg border border-red-400/50 bg-black/60 px-2 py-1 text-[11px] font-bold text-red-100 backdrop-blur transition hover:bg-red-500/25"
      >
        <span aria-hidden className="text-sm leading-none">🚫</span> Remove
      </button>

      {open &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            className="fixed inset-0 z-[100] flex items-end justify-center bg-black/60 p-4 backdrop-blur-sm sm:items-center"
            onClick={() => setOpen(false)}
          >
            <div
              className="w-full max-w-sm rounded-2xl border border-white/15 bg-ink-850 p-4 shadow-card"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="text-sm font-bold text-white">
                🚫 Remove <span className="font-semibold text-slate-300">{title}</span> — why?
              </div>
              <p className="mt-0.5 text-xs text-slate-400">We’ll hide it from your picks; it stays in your watchlist to look up later.</p>
              <div className="mt-3 space-y-2">
                {OPTIONS.map((o) => (
                  <button
                    key={o.verdict}
                    type="button"
                    disabled={busy}
                    onClick={() => void choose(o.verdict)}
                    className="flex w-full items-center gap-3 rounded-xl border border-white/12 bg-white/5 p-3 text-left transition hover:bg-white/10 disabled:opacity-50"
                  >
                    <span aria-hidden className="text-2xl leading-none">{o.emoji}</span>
                    <span className="min-w-0">
                      <span className="block text-sm font-semibold text-white">{o.label}</span>
                      <span className="block text-xs text-slate-400">{o.hint}</span>
                    </span>
                  </button>
                ))}
              </div>
              <button type="button" onClick={() => setOpen(false)} className="btn-ghost mt-2 w-full text-sm">
                Cancel
              </button>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
