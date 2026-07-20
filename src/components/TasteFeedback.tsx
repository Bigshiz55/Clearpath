'use client';

import { useState } from 'react';
import { createPortal } from 'react-dom';
import { recordTasteFeedback } from '@/lib/actions/feedback';
import { rateQuizTitle } from '@/lib/actions/quiz';
import { useToast } from '@/components/Toast';
import type { MediaType } from '@/lib/types';

function ratingColor(n: number): string {
  if (n <= 3) return 'border-red-400/40 bg-red-500/15 text-red-100 hover:bg-red-500/25';
  if (n <= 6) return 'border-white/15 bg-white/5 text-slate-200 hover:bg-white/10';
  if (n <= 8) return 'border-brand-400/40 bg-brand-500/15 text-brand-100 hover:bg-brand-500/25';
  return 'border-gold-400/50 bg-gold-500/20 text-amber-100 hover:bg-gold-500/30';
}

type Verdict = 'seen' | 'not_interested' | 'disliked';

const OPTIONS: { verdict: Verdict; label: string; emoji: string; hint: string }[] = [
  { verdict: 'seen', label: 'Seen it', emoji: '👀', hint: 'Already watched — give it a quick 1–10' },
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
  compact = false,
  wide = false,
}: {
  tmdbId: number;
  mediaType: MediaType;
  title: string;
  year: number | null;
  posterPath: string | null;
  onFlagged?: () => void;
  /** Icon-only trigger (the red O) for the card top bar. */
  compact?: boolean;
  /** Compact variant only: grow to fill its flex track instead of a fixed square. */
  wide?: boolean;
}) {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [updating, setUpdating] = useState<Verdict | null>(null);
  const [rating, setRating] = useState(false); // "Seen it" → quick 1–10 step

  function close() {
    if (updating) return;
    setOpen(false);
    setRating(false);
  }

  // "Seen it" with a tapped score — feeds the DNA like the quiz, then the beat.
  async function rateSeen(score: number) {
    if (busy) return;
    setBusy(true);
    const res = await rateQuizTitle({ tmdbId, mediaType, title, year, posterPath, rating: score });
    setBusy(false);
    if (res.ok) {
      setUpdating('seen');
      window.setTimeout(() => {
        setUpdating(null);
        setOpen(false);
        setRating(false);
        toast.show(`Rated ${score}/10 — your DNA just got smarter. 🧬`, 'success');
        onFlagged?.();
      }, 1500);
    } else {
      toast.show(res.error ?? 'Could not save the rating.', 'error');
    }
  }

  async function choose(verdict: Verdict) {
    if (busy) return;
    setBusy(true);
    const res = await recordTasteFeedback({ tmdbId, mediaType, title, year, posterPath, verdict });
    setBusy(false);
    if (res.ok) {
      // Show the "your DNA is being rewritten" beat, then hide the card.
      setUpdating(verdict);
      window.setTimeout(() => {
        setUpdating(null);
        setOpen(false);
        toast.show(verdict === 'seen' ? 'Hidden — saved to your watchlist.' : 'Your DNA just got smarter. 🧬', 'success');
        onFlagged?.();
      }, 1500);
    } else {
      setOpen(false);
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
        className={
          compact
            ? `grid h-7 place-items-center rounded-md border border-red-400/60 bg-red-500/25 text-sm leading-none transition hover:bg-red-500/40 ${wide ? 'w-full flex-1' : 'w-7'}`
            : `items-center gap-1 rounded-lg border border-red-400/50 bg-black/60 font-bold text-red-100 backdrop-blur transition hover:bg-red-500/25 ${wide ? 'flex w-full justify-center px-3 py-3 text-sm' : 'inline-flex px-2 py-1 text-[11px]'}`
        }
      >
        <span aria-hidden className="leading-none">🚫</span>
        {!compact && ' Remove'}
      </button>

      {open &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            className="fixed inset-0 z-[100] flex items-end justify-center bg-black/60 p-4 backdrop-blur-sm sm:items-center"
            onClick={close}
          >
            <div
              className="w-full max-w-sm rounded-2xl border border-white/15 bg-ink-850 p-4 shadow-card"
              onClick={(e) => e.stopPropagation()}
            >
              {updating ? (
                <DnaUpdating verdict={updating} />
              ) : rating ? (
                <>
                  <div className="text-sm font-bold text-white">
                    👀 You’ve seen <span className="font-semibold text-slate-300">{title}</span> — how was it?
                  </div>
                  <p className="mt-0.5 text-xs text-slate-400">Tap a score. It teaches your DNA and sharpens every pick.</p>
                  <div className="mt-3 flex justify-between px-0.5 text-[11px] text-slate-500">
                    <span>Not for me</span>
                    <span>Loved it</span>
                  </div>
                  <div className="mt-1 grid grid-cols-10 gap-1.5">
                    {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
                      <button
                        key={n}
                        type="button"
                        disabled={busy}
                        onClick={() => void rateSeen(n)}
                        className={`h-10 rounded-lg border text-sm font-bold tabular-nums transition disabled:opacity-50 ${ratingColor(n)}`}
                        aria-label={`Rate ${n} out of 10`}
                      >
                        {n}
                      </button>
                    ))}
                  </div>
                  <button type="button" disabled={busy} onClick={() => void choose('seen')} className="mt-3 w-full rounded-xl border border-white/12 bg-white/5 py-2.5 text-sm font-semibold text-slate-200 transition hover:bg-white/10 disabled:opacity-50">
                    Just hide it — skip rating
                  </button>
                  <button type="button" onClick={() => setRating(false)} className="btn-ghost mt-1 w-full text-sm">
                    ← Back
                  </button>
                </>
              ) : (
                <>
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
                        onClick={() => (o.verdict === 'seen' ? setRating(true) : void choose(o.verdict))}
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
                  <button type="button" onClick={close} className="btn-ghost mt-2 w-full text-sm">
                    Cancel
                  </button>
                </>
              )}
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}

const UPDATING_NOTE: Record<Verdict, string> = {
  seen: 'Logging that you’ve seen it…',
  not_interested: 'Steering your picks away from this…',
  disliked: 'Teaching your DNA what to avoid…',
};

/** The "your DNA is being rewritten" beat shown right after a verdict. */
function DnaUpdating({ verdict }: { verdict: Verdict }) {
  return (
    <div className="animate-reveal-in flex flex-col items-center py-3 text-center">
      {/* Helix core with pulsing rings — the brain re-wiring. */}
      <div className="relative grid h-20 w-20 place-items-center">
        <span className="absolute inset-0 animate-ping rounded-full bg-brand-500/25" />
        <span className="absolute inset-1 animate-ping rounded-full bg-pink-500/25" style={{ animationDelay: '0.25s' }} />
        <span className="absolute inset-2 rounded-full border border-pink-400/40" />
        <span aria-hidden className="animate-pulse text-4xl leading-none">🧬</span>
      </div>

      <div className="mt-3 text-sm font-black tracking-tight text-white">Rewiring your DNA…</div>
      <p className="mt-0.5 text-xs text-slate-400">{UPDATING_NOTE[verdict]}</p>

      {/* Processing bar with a moving shimmer. */}
      <div className="relative mt-3 h-1.5 w-40 overflow-hidden rounded-full bg-white/10">
        <div className="h-full w-full bg-gradient-to-r from-brand-500 via-pink-500 to-brand-500" />
        <div className="absolute inset-0 -translate-x-full animate-shimmer bg-gradient-to-r from-transparent via-white/70 to-transparent" />
      </div>

      {/* Nodes lighting up as the model updates. */}
      <div className="mt-3 flex items-center gap-1.5" aria-hidden>
        {[0, 1, 2, 3, 4].map((i) => (
          <span
            key={i}
            className="h-1.5 w-1.5 animate-pulse rounded-full bg-pink-400"
            style={{ animationDelay: `${i * 0.15}s` }}
          />
        ))}
      </div>
    </div>
  );
}
