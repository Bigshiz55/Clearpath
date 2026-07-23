'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Poster } from './PosterCard';
import { rateQuizTitle } from '@/lib/actions/quiz';
import { useI18n } from '@/i18n/I18nProvider';

interface Item {
  id: number;
  mediaType: 'movie' | 'tv';
  title: string;
  year: number | null;
  posterPath: string | null;
  posterUrl: string | null;
}

interface Rec {
  id: number;
  mediaType: 'movie' | 'tv';
  title: string;
  year: number | null;
  posterUrl: string | null;
  because: string | null;
}

const GOAL = 30;
type Choice = 'yes' | 'no' | 'maybe' | 'skip';
const RATING: Record<Exclude<Choice, 'skip'>, number> = { yes: 9, maybe: 6, no: 2 };

/**
 * Rapid taste game — one tile up top, four quick calls (Yes / No / Maybe / Haven't
 * seen) and it flies to the next. Each rating feeds your DNA. A round is 30; hit
 * 30 and it recalculates your algorithm. Endless — the more you play, the sharper
 * your recommendations get. `totalRated` seeds the lifetime counter.
 */
export function LikeHateGame({ totalRated = 0 }: { totalRated?: number }) {
  const { t, plural } = useI18n();
  const [queue, setQueue] = useState<Item[]>([]);
  const [idx, setIdx] = useState(0);
  const [total, setTotal] = useState(totalRated); // lifetime, persists
  const [round, setRound] = useState(0); // 0..GOAL for the current round
  const [phase, setPhase] = useState<'play' | 'calc' | 'done'>('play');
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [dry, setDry] = useState(false);
  const [recs, setRecs] = useState<Rec[] | null>(null); // the end-of-round DNA reveal
  const [recsFailed, setRecsFailed] = useState(false);
  const [fb, setFb] = useState(''); // current feedback line, e.g. "no westerns"
  const [feedbackLog, setFeedbackLog] = useState<string[]>([]); // all notes, compounded
  const [refining, setRefining] = useState(false);
  const [note, setNote] = useState(''); // read-back of the applied filters
  const [tuningDone, setTuningDone] = useState(false); // hides the floating bar
  const seen = useRef<Set<string>>(new Set());
  const fetching = useRef(false);

  // The "empty combination" message is client-set; comparing against it (rather
  // than sniffing English text) keeps the read-back styling correct in any locale.
  const comboEmptyMsg = t('ask.comboEmpty');

  const fetchBatch = useCallback(async () => {
    if (fetching.current || dry) return;
    fetching.current = true;
    try {
      const r = await fetch('/api/quiz', { cache: 'no-store' });
      const d = await r.json();
      if (d.error) {
        setFailed(true);
        return;
      }
      const fresh: Item[] = (d.items ?? []).filter((it: Item) => !seen.current.has(`${it.mediaType}-${it.id}`));
      fresh.forEach((it) => seen.current.add(`${it.mediaType}-${it.id}`));
      if (fresh.length === 0) setDry(true);
      else setQueue((q) => [...q, ...fresh]);
    } catch {
      setFailed(true);
    } finally {
      fetching.current = false;
      setLoading(false);
    }
  }, [dry]);

  useEffect(() => { void fetchBatch(); }, [fetchBatch]);

  useEffect(() => {
    if (queue.length - idx <= 5 && !failed) void fetchBatch();
  }, [idx, queue.length, failed, fetchBatch]);

  const current = queue[idx] ?? null;

  const decide = useCallback(
    (kind: Choice) => {
      if (phase !== 'play') return;
      const c = queue[idx];
      if (!c) return;
      if (kind !== 'skip') {
        setTotal((t) => t + 1);
        setRound((r) => {
          const n = r + 1;
          if (n >= GOAL) setPhase('calc');
          return n;
        });
        void rateQuizTitle({
          tmdbId: c.id,
          mediaType: c.mediaType,
          title: c.title,
          year: c.year,
          posterPath: c.posterPath,
          rating: RATING[kind],
        }).catch(() => {});
      }
      setIdx((i) => i + 1);
    },
    [phase, queue, idx],
  );

  // Calculate → done. Build the DNA reveal (up to 60 taste-matched titles) while
  // a brief "crunching" beat plays, and only flip to the reveal once both the
  // minimum beat and the fetch have finished, so it never flashes empty.
  useEffect(() => {
    if (phase !== 'calc') return;
    let active = true;
    setRecs(null);
    setRecsFailed(false);
    const beat = new Promise<void>((res) => setTimeout(res, 1200));
    const load = fetch('/api/recommendations?full=1', { cache: 'no-store' })
      .then((r) => r.json())
      .then((d) => {
        if (!active) return;
        if (d.error) setRecsFailed(true);
        else setRecs((d.recommendations ?? []) as Rec[]);
      })
      .catch(() => active && setRecsFailed(true));
    void Promise.all([beat, load]).then(() => active && setPhase('done'));
    return () => {
      active = false;
    };
  }, [phase]);

  // Keyboard: → Yes · ← No · ↑ Maybe · ↓ Haven't seen.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (phase !== 'play') return;
      const map: Record<string, Choice> = { ArrowRight: 'yes', ArrowLeft: 'no', ArrowUp: 'maybe', ArrowDown: 'skip' };
      const k = map[e.key];
      if (k) { e.preventDefault(); decide(k); }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [decide, phase]);

  function nextRound() {
    setRound(0);
    setRecs(null);
    setRecsFailed(false);
    setFb('');
    setFeedbackLog([]);
    setNote('');
    setTuningDone(false);
    setPhase('play');
  }

  // Recalculate the reveal from plain-English feedback ("too many old movies,
  // I don't like westerns"). Feedback COMPOUNDS — every note you've given is
  // re-sent so the filters stack — and the box clears after each pass so you can
  // keep refining. The server parses it into real genre/recency/type/length
  // filters and reruns the recommender.
  const recalc = useCallback(async () => {
    const text = fb.trim();
    if (!text || refining) return;
    const combined = [...feedbackLog, text];
    setRefining(true);
    try {
      const r = await fetch('/api/recommendations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ feedback: combined.join('. ') }),
        cache: 'no-store',
      });
      const d = await r.json();
      if (!d.error) {
        const list = (d.recommendations ?? []) as Rec[];
        if (list.length > 0) {
          setRecs(list);
          setFeedbackLog(combined);
          setNote(typeof d.note === 'string' ? d.note : '');
          setFb(''); // clear so you can add more feedback
        } else {
          // Don't blank the list — that combo was too strict. Let them loosen.
          setNote(comboEmptyMsg);
        }
      }
    } catch {
      /* keep the current list on a transient failure */
    } finally {
      setRefining(false);
    }
  }, [fb, refining, feedbackLog, comboEmptyMsg]);

  // The one big promise, always on screen.
  const Banner = (
    <div className="mb-4 rounded-2xl border border-brand-400/40 bg-gradient-to-r from-brand-500/20 to-fuchsia-500/15 px-4 py-3 text-center">
      <div className="text-base font-black text-white sm:text-lg">{t('ask.sharperPlay')}</div>
      <div className="mt-0.5 text-xs text-brand-100">
        {t('ask.youveRatedPrefix')}<span className="font-black tabular-nums text-white">{total}</span>{plural('ask.titleWord', total, {})}
      </div>
    </div>
  );

  if (failed) {
    return <p className="mt-6 rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-200">{t('ask.likeHateLoadError')}</p>;
  }

  if (phase === 'calc') {
    return (
      <div className="mt-5">
        {Banner}
        <div className="card flex flex-col items-center gap-3 p-10 text-center">
          <span className="h-10 w-10 animate-spin rounded-full border-2 border-white/20 border-t-brand-400" />
          <div className="text-lg font-bold text-white">{t('ask.crunching')}</div>
          <p className="text-sm text-slate-400">{plural('ask.rereading', total, { count: total })}</p>
        </div>
      </div>
    );
  }

  if (phase === 'done') {
    const hasRecs = recs != null && recs.length > 0;
    const showBar = hasRecs && !tuningDone;
    const isComboEmpty = note === comboEmptyMsg;
    return (
      <div className={`mt-5 ${showBar ? 'pb-32' : ''}`}>
        {Banner}
        <div className="card p-5 sm:p-7">
          <div className="text-center">
            <div className="text-4xl">🧬</div>
            <h2 className="mt-3 text-xl font-bold text-white sm:text-2xl">{t('ask.dnaBuilt')}</h2>
            <p className="mx-auto mt-2 max-w-md text-sm text-slate-400">
              {t('ask.builtFromPrefix')}<span className="font-bold text-white">{total}</span>{t('ask.builtFromSuffix')}
            </p>
          </div>

          {hasRecs ? (
            <>
              <div className={`mt-5 grid grid-cols-3 gap-3 transition-opacity sm:grid-cols-4 md:grid-cols-5 ${refining ? 'opacity-50' : ''}`}>
                {recs!.map((r) => (
                  <Link key={`${r.mediaType}-${r.id}`} href={`/app/title/${r.mediaType}/${r.id}`} className="group block">
                    <div className="aspect-[2/3] overflow-hidden rounded-xl border border-white/10 shadow-card transition group-hover:border-white/25 group-active:scale-95">
                      <Poster posterUrl={r.posterUrl} title={r.title} />
                    </div>
                    <div className="mt-1 line-clamp-1 text-[11px] font-semibold text-white">{r.title}</div>
                    {r.because ? (
                      <div className="line-clamp-1 text-[10px] text-brand-200">♥ {r.because}</div>
                    ) : (
                      <div className="line-clamp-1 text-[10px] text-slate-500">{t('ask.matchedToTaste')}</div>
                    )}
                  </Link>
                ))}
              </div>
              <p className="mt-3 text-center text-[11px] text-slate-500">
                {t('ask.picksVerdict', { count: recs!.length })}
              </p>
            </>
          ) : recsFailed || (recs != null && recs.length === 0) ? (
            <p className="mt-6 text-center text-sm text-slate-400">
              {t('ask.rateMoreFill')}{' '}
              <Link href="/app/watch" className="text-brand-300 underline">{t('ask.browseWatchNow')}</Link>
            </p>
          ) : (
            <div className="mt-6 grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-5">
              {Array.from({ length: 10 }).map((_, i) => (
                <div key={i} className="aspect-[2/3] animate-pulse rounded-xl border border-white/10 bg-white/5" />
              ))}
            </div>
          )}

          <div className="mt-7 flex flex-wrap justify-center gap-3">
            <button onClick={nextRound} className="btn-primary">{t('ask.rate30More')}</button>
            <Link href="/app/watch" className="btn-secondary">{t('ask.openWatchNow')}</Link>
          </div>
        </div>

        {/* Floating tuner — always in reach while you scroll the picks. Compounds
            your feedback, clears after each pass, and locks in with Done. */}
        {showBar && (
          <div className="fixed inset-x-0 bottom-0 z-40 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
            <div className="mx-auto max-w-2xl rounded-2xl border border-white/15 bg-ink-900/95 p-3 shadow-2xl shadow-black/50 backdrop-blur">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-300">{t('ask.tellChange')}</span>
                {note && (
                  <span className={`ml-2 truncate text-[11px] ${isComboEmpty ? 'text-amber-300' : 'text-brand-200'}`}>
                    {isComboEmpty ? note : t('ask.applied', { note })}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                <input
                  value={fb}
                  onChange={(e) => setFb(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') { e.preventDefault(); void recalc(); }
                  }}
                  disabled={refining}
                  placeholder={t('ask.tunerPlaceholder')}
                  className="min-w-0 flex-1 rounded-xl border border-white/15 bg-ink-950/70 px-3 py-2 text-sm text-white placeholder:text-slate-500 focus:border-brand-400 focus:outline-none disabled:opacity-60"
                />
                <button
                  onClick={() => void recalc()}
                  disabled={refining || fb.trim().length === 0}
                  className="btn-primary shrink-0 px-3 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {refining ? '…' : t('ask.recalculate')}
                </button>
                <button
                  onClick={() => setTuningDone(true)}
                  disabled={refining}
                  className="btn-secondary shrink-0 px-3"
                >
                  {t('ask.done')}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Reopen the tuner after Done. */}
        {hasRecs && tuningDone && (
          <button
            onClick={() => setTuningDone(false)}
            className="fixed bottom-4 right-4 z-40 rounded-full border border-white/15 bg-ink-900/95 px-4 py-2 text-sm font-semibold text-white shadow-2xl shadow-black/50 backdrop-blur"
          >
            {t('ask.tunePicks')}
          </button>
        )}
      </div>
    );
  }

  if (!current) {
    if (loading) {
      return (
        <div className="mt-8 flex flex-col items-center gap-3 text-slate-400">
          <span className="h-8 w-8 animate-spin rounded-full border-2 border-white/20 border-t-brand-400" />
          <span className="text-sm">{t('ask.loadingTitles')}</span>
        </div>
      );
    }
    return (
      <div className="mt-8 card p-8 text-center">
        <div className="text-4xl">🧬</div>
        <h2 className="mt-3 text-xl font-bold text-white">{plural('ask.youveRatedBang', total, { count: total })}</h2>
        <p className="mx-auto mt-2 max-w-sm text-sm text-slate-400">{t('ask.nothingLeft')}</p>
        <Link href="/app" className="btn-primary mt-6 inline-flex">{t('ask.seeMyRecs')}</Link>
      </div>
    );
  }

  const pct = (round / GOAL) * 100;

  return (
    <div className="mt-5">
      {Banner}

      {/* Round progress toward 30 */}
      <div className="mb-1.5 flex items-center justify-between text-xs">
        <span className="font-semibold text-slate-300">{t('ask.thisRound', { round, goal: GOAL })}</span>
        <span className="text-slate-500">{t('ask.toRecalc', { n: GOAL - round })}</span>
      </div>
      <div className="mb-4 h-1.5 w-full overflow-hidden rounded-full bg-white/10">
        <div className="h-full rounded-full bg-gradient-to-r from-brand-500 to-fuchsia-500 transition-[width] duration-300" style={{ width: `${pct}%` }} />
      </div>

      {/* The tile */}
      <div key={idx} className="animate-fade-up flex flex-col items-center text-center">
        <div className="h-56 w-40 overflow-hidden rounded-2xl border border-white/10 shadow-card sm:h-64 sm:w-44">
          <Poster posterUrl={current.posterUrl} title={current.title} />
        </div>
        <div className="mt-2.5 flex items-center gap-2">
          <span className="rounded bg-white/10 px-1.5 py-0.5 text-[10px] uppercase text-slate-300">{current.mediaType === 'movie' ? t('ask.movie') : t('ask.tv')}</span>
          <h2 className="text-base font-bold text-white sm:text-lg">
            {current.title}
            {current.year ? <span className="font-normal text-slate-400"> ({current.year})</span> : null}
          </h2>
        </div>
      </div>

      {/* Four calls in a row */}
      <div className="mt-5 grid grid-cols-4 gap-2">
        {([
          { k: 'yes', emoji: '👍', label: t('ask.yes'), cls: 'border-emerald-400/50 bg-emerald-500/15 text-emerald-100 hover:bg-emerald-500/25' },
          { k: 'no', emoji: '👎', label: t('ask.no'), cls: 'border-red-400/50 bg-red-500/15 text-red-100 hover:bg-red-500/25' },
          { k: 'maybe', emoji: '🤔', label: t('ask.maybe'), cls: 'border-amber-400/50 bg-amber-500/15 text-amber-100 hover:bg-amber-500/25' },
          { k: 'skip', emoji: '🤷', label: t('ask.haventSeen'), cls: 'border-white/15 bg-white/5 text-slate-300 hover:bg-white/10' },
        ] as const).map((b) => (
          <button
            key={b.k}
            onClick={() => decide(b.k)}
            className={`flex flex-col items-center justify-center gap-1 rounded-2xl border-2 py-3.5 font-black leading-tight transition active:scale-95 ${b.cls}`}
          >
            <span className="text-2xl leading-none">{b.emoji}</span>
            <span className="text-center text-[11px]">{b.label}</span>
          </button>
        ))}
      </div>
      <p className="mt-2 text-center text-[11px] text-slate-500">{t('ask.keyboardHint')}</p>
    </div>
  );
}
