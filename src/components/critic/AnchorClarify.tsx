'use client';

import { tmdbImage } from '@/lib/tmdb/image';

/**
 * "WHICH ONE DID YOU MEAN?" — a question, not an error.
 *
 * Five real films are called Furious. The system refuses to guess between them,
 * and that refusal is the safety property the Critic Layer shipped. What it
 * lacked was somewhere to go: the comparison was silently dropped, which for a
 * request whose whole point IS the comparison reads as failure.
 *
 * So this is deliberately styled as part of the conversation rather than as an
 * error state — the judge understood the case and needs one detail. Each option
 * is a real catalogue identity with the two facts that actually separate these
 * titles (year and movie/series), because "Furious" three times over is not a
 * choice anyone can make.
 *
 * ACCESSIBILITY AND TOUCH ARE THE POINT HERE, not decoration: this is a
 * required interaction on the critical path. Buttons are real buttons, so
 * keyboard and screen readers work without any handling of our own; each is a
 * 44px-tall target; and the grid collapses to one column so a 390px screen
 * never needs a horizontal scroll.
 */

export interface AnchorOptionView {
  tmdbId: number;
  title: string;
  mediaType: 'movie' | 'tv';
  year: number | null;
  posterPath?: string | null;
}

export function AnchorClarify({
  question,
  options,
  onChoose,
  disabled = false,
}: {
  question: string;
  options: AnchorOptionView[];
  onChoose: (o: AnchorOptionView) => void;
  disabled?: boolean;
}) {
  if (options.length === 0) return null;
  return (
    <div data-testid="anchor-clarify" className="mt-2 rounded-lg border border-brand-400/30 bg-brand-500/[0.06] p-3">
      <p className="text-[15px] font-semibold leading-relaxed text-slate-100">{question}</p>
      <div
        role="group"
        aria-label={question}
        /* One column on a phone; two once there is room. Never more — these
           are read, not scanned past. */
        className="mt-2.5 grid grid-cols-1 gap-2 sm:grid-cols-2"
      >
        {options.map((o) => (
          <button
            key={`${o.mediaType}-${o.tmdbId}`}
            type="button"
            disabled={disabled}
            onClick={() => onChoose(o)}
            data-testid="anchor-option"
            className="flex min-h-[44px] items-center gap-2.5 rounded-md border border-white/12 bg-white/[0.04] px-2.5 py-2 text-left transition hover:border-brand-300/50 hover:bg-white/[0.08] focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-300 disabled:opacity-50"
          >
            {o.posterPath ? (
              <img
                src={tmdbImage(o.posterPath, 'w92') ?? ''}
                alt=""
                aria-hidden
                loading="lazy"
                className="h-11 w-8 shrink-0 rounded-sm object-cover"
              />
            ) : null}
            <span className="min-w-0">
              {/* The name can be long; it wraps rather than pushing the row wide. */}
              <span className="block break-words text-[15px] font-semibold leading-tight text-slate-100">
                {o.title}
              </span>
              <span className="mt-0.5 block text-[13px] text-slate-300">
                {o.year ?? 'Year unknown'} · {o.mediaType === 'tv' ? 'TV' : 'Movie'}
              </span>
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
