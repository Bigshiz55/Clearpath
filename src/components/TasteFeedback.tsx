'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { submitPassFeedback, undoPassFeedback, recordAnalyticsEvent, type FeedbackType } from '@/lib/actions/passFeedback';
import { reasonChipsFor, type ReasonDef, type TitleMetaLite } from '@/lib/feedback/reasons';
import { useToast } from '@/components/Toast';
import type { MediaType } from '@/lib/types';

/* ---------- branded line icons (no oversized emojis) ---------- */
const Ico = ({ d, className = 'h-5 w-5' }: { d: string; className?: string }) => (
  <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d={d} />
  </svg>
);
const EyeIcon = () => <Ico d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z M12 15a3 3 0 100-6 3 3 0 000 6Z" />;
const ClockIcon = () => <Ico d="M12 21a9 9 0 100-18 9 9 0 000 18Z M12 7v5l3 2" />;
const LessIcon = () => <Ico d="M4 12h16 M8 8l-4 4 4 4" />;
const DownIcon = () => <Ico d="M7 10v11 M18 3H9.6a2 2 0 00-2 1.7l-1.3 8A2 2 0 008.3 16H14l-.8 3.2A1.5 1.5 0 0014.7 21L20 13V5a2 2 0 00-2-2Z" />;

function ratingColor(n: number): string {
  if (n <= 3) return 'border-red-400/40 bg-red-500/15 text-red-100 hover:bg-red-500/25';
  if (n <= 6) return 'border-white/15 bg-white/5 text-slate-200 hover:bg-white/10';
  if (n <= 8) return 'border-brand-400/40 bg-brand-500/15 text-brand-100 hover:bg-brand-500/25';
  return 'border-gold-400/50 bg-gold-500/20 text-amber-100 hover:bg-gold-500/30';
}

const OPTIONS: { type: FeedbackType; label: string; desc: string; icon: React.ReactNode; tint: string }[] = [
  { type: 'seen', label: 'Seen it', desc: 'Already watched — give it a quick rating', icon: <EyeIcon />, tint: 'text-sky-300' },
  { type: 'not_right_now', label: 'Not right now', desc: 'Maybe another time — don’t change my Taste DNA', icon: <ClockIcon />, tint: 'text-amber-300' },
  { type: 'not_for_me', label: 'Not for me', desc: 'Show me less like this', icon: <LessIcon />, tint: 'text-fuchsia-300' },
  { type: 'didnt_like', label: 'Didn’t like it', desc: 'I watched it and it missed', icon: <DownIcon />, tint: 'text-red-300' },
];

const SECOND_HEADING: Record<Exclude<FeedbackType, 'removed_without_reason'>, string> = {
  seen: 'How would you rate',
  not_right_now: 'What made it wrong for right now?',
  not_for_me: 'What turned you off?',
  didnt_like: 'What didn’t work for you?',
};

const TOAST: Record<FeedbackType, string> = {
  seen: 'Added to your viewing history.',
  not_right_now: 'Hidden for now. Your Taste DNA was not changed.',
  not_for_me: 'Got it. We’ll show you less like this.',
  didnt_like: 'Got it. We’ll steer away from titles like this.',
  removed_without_reason: 'Removed from your picks.',
};

type Step = 'menu' | 'seen' | 'reasons' | 'saving';

export function TasteFeedback({
  tmdbId,
  mediaType,
  title,
  year,
  posterPath,
  onFlagged,
  compact = false,
  wide = false,
  source = null,
  position = null,
  matchScore = null,
  sessionId = null,
}: {
  tmdbId: number;
  mediaType: MediaType;
  title: string;
  year: number | null;
  posterPath: string | null;
  onFlagged?: () => void;
  compact?: boolean;
  wide?: boolean;
  source?: string | null;
  position?: number | null;
  matchScore?: number | null;
  sessionId?: string | null;
}) {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<Step>('menu');
  const [choice, setChoice] = useState<FeedbackType | null>(null);
  const [rating, setRating] = useState<number | null>(null);
  const [reasons, setReasons] = useState<string[]>([]);
  const [meta, setMeta] = useState<TitleMetaLite | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const openedAt = useRef(0);

  const ctx = { source, position, matchScore, sessionId, tmdbId, mediaType };

  // Load title metadata once per open so the reason chips adapt to this title.
  useEffect(() => {
    if (!open || meta) return;
    let active = true;
    fetch(`/api/title-meta?type=${mediaType}&id=${tmdbId}`)
      .then((r) => r.json())
      .then((d) => { if (active && d.meta) setMeta(d.meta as TitleMetaLite); })
      .catch(() => {});
    return () => { active = false; };
  }, [open, meta, mediaType, tmdbId]);

  // Escape-to-close + focus the dialog when it opens.
  useEffect(() => {
    if (!open) return;
    dialogRef.current?.focus();
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') close(); }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  function openModal(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    setOpen(true);
    setStep('menu');
    setChoice(null);
    setRating(null);
    setReasons([]);
    openedAt.current = Date.now();
    void recordAnalyticsEvent('recommendation_pass_opened', { tmdbId, mediaType, source, position, matchScore });
  }

  function close() {
    if (step === 'saving') return;
    setOpen(false);
  }

  function pick(type: FeedbackType) {
    void recordAnalyticsEvent('pass_reason_type_selected', { tmdbId, choice: type, source });
    setChoice(type);
    if (type === 'seen') { setStep('seen'); return; }
    setStep('reasons');
  }

  function toggleReason(code: string) {
    setReasons((r) => (r.includes(code) ? r.filter((x) => x !== code) : [...r, code]));
  }

  async function finalize(type: FeedbackType, opts: { rating?: number | null; reasons?: string[]; skipped?: boolean }) {
    setStep('saving');
    const timeMs = Date.now() - openedAt.current;
    void recordAnalyticsEvent(opts.skipped ? 'pass_skipped_reason' : 'pass_completed', {
      ...ctx, choice: type, reasons: opts.reasons ?? [], rated: opts.rating != null, timeMs,
    });
    if (type === 'seen') void recordAnalyticsEvent('title_marked_seen', { tmdbId, mediaType });
    if (opts.rating != null) void recordAnalyticsEvent('title_rated', { tmdbId, rating: opts.rating });

    const res = await submitPassFeedback({
      tmdbId, mediaType, title, year, posterPath,
      feedbackType: type,
      rating: opts.rating ?? null,
      reasonCodes: opts.reasons ?? [],
      source, position, matchScore, sessionId,
    });

    setOpen(false);
    if (!res.ok) { toast.show(res.error ?? 'Could not save.', 'error'); return; }
    onFlagged?.();
    toast.show(TOAST[type], 'success', {
      label: 'Undo',
      onClick: () => {
        void recordAnalyticsEvent('pass_undone', { tmdbId, choice: type });
        void undoPassFeedback({ tmdbId, mediaType });
        toast.show('Undone — it’ll come back to your picks.', 'info');
      },
    });
  }

  const seenBucket = (rating ?? 7) >= 7 ? 'seen_high' : 'seen_low';
  const chips: ReasonDef[] =
    step === 'seen'
      ? reasonChipsFor(meta, seenBucket)
      : choice === 'not_for_me'
        ? reasonChipsFor(meta, 'not_for_me')
        : choice === 'didnt_like'
          ? reasonChipsFor(meta, 'didnt_like')
          : reasonChipsFor(meta, 'not_right_now');

  return (
    <>
      <button
        type="button"
        onClick={openModal}
        aria-label="Pass on this title"
        title="Pass on this title"
        className={
          compact
            ? `grid h-7 place-items-center rounded-md border border-red-400/50 bg-red-500/15 text-red-200 transition hover:bg-red-500/30 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-400/60 ${wide ? 'w-full flex-1' : 'w-7'}`
            : `items-center gap-1 rounded-lg border border-red-400/50 bg-black/60 font-bold text-red-100 backdrop-blur transition hover:bg-red-500/25 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-400/60 ${wide ? 'flex w-full justify-center px-3 py-3 text-sm' : 'inline-flex px-2 py-1 text-[11px]'}`
        }
      >
        <span aria-hidden className="grid place-items-center">
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden>
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </span>
        {!compact && ' Pass'}
      </button>

      {open &&
        typeof document !== 'undefined' &&
        createPortal(
          <div className="fixed inset-0 z-[100] flex items-end justify-center bg-black/60 p-4 backdrop-blur-sm sm:items-center" onClick={close}>
            <div
              ref={dialogRef}
              tabIndex={-1}
              role="dialog"
              aria-modal="true"
              aria-label={`Feedback on ${title}`}
              className="w-full max-w-sm rounded-2xl border border-white/15 bg-ink-850 p-4 shadow-card outline-none ring-1 ring-white/5"
              onClick={(e) => e.stopPropagation()}
            >
              {step === 'saving' ? (
                <div className="flex flex-col items-center gap-3 py-8 text-center">
                  <span className="h-9 w-9 animate-spin rounded-full border-2 border-white/20 border-t-brand-400" />
                  <div className="text-sm font-bold text-white">Got it — improving your picks…</div>
                </div>
              ) : step === 'menu' ? (
                <>
                  <h2 className="pr-6 text-base font-bold text-white">
                    Why are you passing on <span className="text-brand-200">{title}</span>?
                  </h2>
                  <p className="mt-1 text-xs text-slate-400">We’ll remove it from these picks. Your answer can help improve future recommendations.</p>
                  <div className="mt-3 space-y-2">
                    {OPTIONS.map((o) => (
                      <button
                        key={o.type}
                        type="button"
                        onClick={() => pick(o.type)}
                        className="flex w-full items-center gap-3 rounded-xl border border-white/12 bg-white/5 p-3 text-left transition hover:border-white/25 hover:bg-white/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-400/60"
                      >
                        <span className={`grid h-9 w-9 flex-none place-items-center rounded-lg bg-white/5 ${o.tint}`}>{o.icon}</span>
                        <span className="min-w-0">
                          <span className="block text-sm font-semibold text-white">{o.label}</span>
                          <span className="block text-xs text-slate-400">{o.desc}</span>
                        </span>
                      </button>
                    ))}
                  </div>
                  <div className="mt-3 flex items-center justify-between">
                    <button type="button" onClick={() => void finalize('removed_without_reason', { skipped: true })} className="text-xs font-semibold text-slate-400 underline-offset-2 hover:text-slate-200 hover:underline">
                      Just remove it
                    </button>
                    <button type="button" onClick={close} className="rounded-lg px-3 py-1.5 text-sm font-semibold text-slate-300 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-white/30">
                      Cancel
                    </button>
                  </div>
                </>
              ) : step === 'seen' ? (
                <div className="animate-reveal-in">
                  <h2 className="text-sm font-bold text-white">{SECOND_HEADING.seen} <span className="text-brand-200">{title}</span>?</h2>
                  <div className="mt-2 flex justify-between px-0.5 text-[11px] text-slate-500"><span>Not for me</span><span>Loved it</span></div>
                  <div className="mt-1 grid grid-cols-10 gap-1.5">
                    {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
                      <button
                        key={n}
                        type="button"
                        onClick={() => setRating(n)}
                        aria-label={`Rate ${n} out of 10`}
                        className={`h-10 rounded-lg border text-sm font-bold tabular-nums transition focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-400/60 ${rating === n ? 'ring-2 ring-white/70 ' : ''}${ratingColor(n)}`}
                      >
                        {n}
                      </button>
                    ))}
                  </div>

                  {rating != null && (
                    <div className="mt-3 animate-reveal-in">
                      <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{rating >= 7 ? 'What worked? (optional)' : 'What missed? (optional)'}</div>
                      <div className="mt-1.5 flex flex-wrap gap-1.5">
                        {chips.map((c) => (
                          <Chip key={c.code} def={c} on={reasons.includes(c.code)} onClick={() => toggleReason(c.code)} />
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="mt-4 flex items-center gap-2">
                    <button type="button" disabled={rating == null} onClick={() => void finalize('seen', { rating, reasons })} className="btn-primary flex-1 disabled:opacity-40">
                      Save rating
                    </button>
                    <button type="button" onClick={() => void finalize('seen', { rating: null, skipped: true })} className="rounded-xl border border-white/12 bg-white/5 px-3 py-2 text-sm font-semibold text-slate-200 hover:bg-white/10">
                      Skip rating
                    </button>
                  </div>
                  <button type="button" onClick={() => setStep('menu')} className="mt-1 w-full text-xs text-slate-500 hover:text-slate-300">← Back</button>
                </div>
              ) : (
                <div className="animate-reveal-in">
                  <h2 className="text-sm font-bold text-white">{choice ? SECOND_HEADING[choice as Exclude<FeedbackType, 'removed_without_reason'>] : ''}</h2>
                  <p className="mt-0.5 text-xs text-slate-400">
                    {choice === 'not_right_now' ? 'Optional — this won’t change your Taste DNA.' : 'Pick any that apply — all optional.'}
                  </p>

                  {choice === 'didnt_like' && (
                    <div className="mt-3">
                      <div className="mb-1 flex justify-between px-0.5 text-[11px] text-slate-500"><span>Your score (optional)</span><span>{rating ?? '—'}/10</span></div>
                      <div className="grid grid-cols-10 gap-1">
                        {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
                          <button key={n} type="button" onClick={() => setRating(n)} aria-label={`Rate ${n} out of 10`} className={`h-8 rounded-md border text-xs font-bold tabular-nums transition ${rating === n ? 'ring-2 ring-white/70 ' : ''}${ratingColor(n)}`}>{n}</button>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {chips.map((c) => (
                      <Chip key={c.code} def={c} on={reasons.includes(c.code)} onClick={() => toggleReason(c.code)} />
                    ))}
                  </div>

                  <div className="mt-4 flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => void finalize(choice!, { rating: choice === 'didnt_like' ? rating : null, reasons })}
                      className="btn-primary flex-1"
                    >
                      Done
                    </button>
                    <button
                      type="button"
                      onClick={() => void finalize(choice!, { rating: null, reasons: [], skipped: true })}
                      className="rounded-xl border border-white/12 bg-white/5 px-3 py-2 text-sm font-semibold text-slate-200 hover:bg-white/10"
                    >
                      {choice === 'not_right_now' ? 'Skip — hide for now' : 'Skip'}
                    </button>
                  </div>
                  <button type="button" onClick={() => setStep('menu')} className="mt-1 w-full text-xs text-slate-500 hover:text-slate-300">← Back</button>
                </div>
              )}
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}

function Chip({ def, on, onClick }: { def: ReasonDef; on: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      className={`rounded-full border px-3 py-1.5 text-xs font-medium transition focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-400/60 ${
        on ? 'border-brand-400/60 bg-brand-500/25 text-white' : 'border-white/15 bg-white/5 text-slate-300 hover:bg-white/10'
      }`}
    >
      {def.label}
    </button>
  );
}
