'use client';

/**
 * THE TWELVE-CARD GRID.
 *
 * The old title lane showed one card at a time and asked you to judge each one,
 * which is fine until it serves something you have never heard of. There is no
 * "no idea what that is" button, so the answer becomes Skip — and Skip is
 * recorded as `not_interested`. That turns ignorance into a stated dislike.
 *
 * A grid fixes it at the root, and it is what every service that does cold
 * start well already does: show twelve at once, and let people TAP THE ONES
 * THEY RECOGNISE. Recognition is fast, and it is self-selecting for signal.
 *
 * The load-bearing rule, said out loud in the UI:
 *
 *   NOT TAPPING A TITLE RECORDS NOTHING.
 *
 * Nothing here manufactures a negative. Dislikes come from "Not for me" on real
 * cards elsewhere, where the person is actually looking at something they
 * understand. Everything sent from this grid is a positive the user chose, or a
 * rating they gave a title they have seen.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { recordQuizAnswer } from '@/lib/actions/dnaQuiz';

const GRID_SIZE = 12;

/** Client-side event id — the engine is idempotent on it, so a double tap
 *  writes once rather than twice. */
const uid = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `g_${Date.now().toString(36)}_${Math.floor(Math.random() * 1e9).toString(36)}`;

interface Item {
  id: number;
  mediaType: 'movie' | 'tv';
  title: string;
  year: number | null;
  posterPath: string | null;
  posterUrl: string | null;
  genre: string | null;
}

type Rating = 'loved' | 'liked' | 'okay' | 'disliked';

/** What the user said about a tile. Absence means "said nothing" — never a no. */
type Pick =
  | { kind: 'like' }
  | { kind: 'seen'; rating: Rating };

const RATINGS: Array<{ key: Rating; label: string; emoji: string }> = [
  { key: 'loved', label: 'Loved', emoji: '❤️' },
  { key: 'liked', label: 'Liked', emoji: '👍' },
  { key: 'okay', label: 'Okay', emoji: '😐' },
  { key: 'disliked', label: 'Didn’t', emoji: '👎' },
];

export function TitleGridCalibration({ sessionId }: { sessionId?: string | undefined }) {
  const [items, setItems] = useState<Item[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [picks, setPicks] = useState<Record<string, Pick>>({});
  const [openRating, setOpenRating] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [savedCount, setSavedCount] = useState<number | null>(null);
  const [round, setRound] = useState(0);
  const [exhausted, setExhausted] = useState(false);
  // Every key this session has already put on screen. Sent to the server so a
  // fresh round genuinely deals fresh cards: the plan is deterministic, so
  // without it "show me 12 more" re-deals the same twelve — which it did.
  const seen = useRef<Set<string>>(new Set());

  const keyOf = (i: Item) => `${i.mediaType}:${i.id}`;

  const load = useCallback(async () => {
    setItems(null);
    setError(null);
    setPicks({});
    setOpenRating(null);
    setSavedCount(null);
    try {
      const qs = new URLSearchParams({ size: String(GRID_SIZE) });
      // Walk TMDB deeper each round so the pool itself refreshes rather than
      // being re-planned from the same forty titles. Wraps rather than running
      // off the end of what TMDB will serve.
      qs.set('page', String((round % 5) + 1));
      if (sessionId) qs.set('session', sessionId);
      const already = Array.from(seen.current).slice(-200);
      if (already.length > 0) qs.set('exclude', already.join(','));

      const res = await fetch(`/api/calibration?${qs.toString()}`, { cache: 'no-store' });
      const data = (await res.json()) as { items?: Item[]; error?: string };
      if (!res.ok) {
        setError(data.error ?? 'Could not load titles right now.');
        setItems([]);
        return;
      }
      const next = (data.items ?? []).slice(0, GRID_SIZE);
      for (const i of next) seen.current.add(`${i.mediaType}:${i.id}`);
      setExhausted(next.length === 0 && seen.current.size > 0);
      setItems(next);
    } catch {
      setError('Could not load titles right now.');
      setItems([]);
    }
  }, [sessionId, round]);

  useEffect(() => {
    void load();
  }, [load]);

  const chosen = Object.keys(picks).length;

  function toggleLike(i: Item) {
    const k = keyOf(i);
    setOpenRating(null);
    setPicks((p) => {
      const next = { ...p };
      if (next[k]?.kind === 'like') delete next[k];
      else next[k] = { kind: 'like' };
      return next;
    });
  }

  function setRating(i: Item, rating: Rating) {
    const k = keyOf(i);
    setPicks((p) => ({ ...p, [k]: { kind: 'seen', rating } }));
    setOpenRating(null);
  }

  async function submit() {
    if (!items || chosen === 0) return;
    setSaving(true);
    const results = await Promise.all(
      items.flatMap((i) => {
        const pick = picks[keyOf(i)];
        if (!pick) return []; // untouched → nothing is sent. This is the point.
        const base = {
          eventId: uid(),
          tmdbId: i.id,
          mediaType: i.mediaType,
          title: i.title,
          year: i.year,
          posterPath: i.posterPath,
          source: 'calibration',
          ...(sessionId ? { sessionId } : {}),
        };
        return [
          recordQuizAnswer(
            pick.kind === 'like'
              ? { ...base, recognition: 'unseen' as const, attraction: 'interested' as const }
              : { ...base, recognition: 'seen' as const, rating: pick.rating },
          ).catch(() => ({ ok: false })),
        ];
      }),
    );
    setSaving(false);
    setSavedCount(results.filter((r) => r.ok).length);
  }

  if (items === null) {
    return (
      <div className="card p-6 text-sm text-slate-400" data-testid="title-grid-loading">
        Pulling together a spread of films and shows…
      </div>
    );
  }

  if (savedCount !== null) {
    return (
      <div className="card p-6" data-testid="title-grid-done">
        <h2 className="text-xl font-bold text-white">Got it.</h2>
        <p className="mt-1 text-sm text-slate-300">
          {savedCount === 0
            ? 'Nothing was recorded — the ones you did not tap are not held against you.'
            : `${savedCount} ${savedCount === 1 ? 'title' : 'titles'} went into your Watch DNA.`}
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setRound((r) => r + 1)}
            className="btn-primary inline-flex min-h-[44px] items-center px-5"
            data-testid="title-grid-more"
          >
            Show me 12 more
          </button>
          <a
            href="/app/dna"
            className="inline-flex min-h-[44px] items-center rounded-lg border border-white/15 px-4 text-sm font-semibold text-slate-200 transition hover:bg-white/10"
          >
            See my Watch DNA →
          </a>
        </div>
      </div>
    );
  }

  return (
    <div data-testid="title-grid">
      <header>
        <h1 className="text-2xl font-bold text-white sm:text-3xl">Tap anything you like the look of</h1>
        <p className="mt-1 text-sm text-slate-400">
          Twelve at a time. Tap the ones you would happily watch — and if you have already seen one, say what you
          thought.{' '}
          <span className="font-semibold text-slate-300" data-testid="grid-no-penalty">
            Leaving a title alone records nothing: not recognising something is not a dislike.
          </span>
        </p>
      </header>

      {error && (
        <p className="mt-3 text-sm text-amber-200" data-testid="title-grid-error">
          {error}
        </p>
      )}

      {items.length === 0 && !error ? (
        <p className="mt-4 text-sm text-slate-400" data-testid="title-grid-empty">
          {exhausted
            ? 'That is everything I can find that you have not already seen here. Come back later and there will be more.'
            : 'Nothing to show right now.'}
        </p>
      ) : (
        <ul className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
          {items.map((i) => {
            const k = keyOf(i);
            const pick = picks[k];
            const liked = pick?.kind === 'like';
            const seen = pick?.kind === 'seen' ? pick.rating : null;
            return (
              <li key={k} className="min-w-0" data-testid={`grid-tile-${i.mediaType}-${i.id}`}>
                <button
                  type="button"
                  onClick={() => toggleLike(i)}
                  aria-pressed={liked}
                  data-testid={`grid-like-${i.id}`}
                  className={[
                    'relative block w-full overflow-hidden rounded-xl border-2 transition',
                    liked || seen
                      ? 'border-brand-400 shadow-[0_0_0_3px_rgba(168,85,247,0.25)]'
                      : 'border-white/10 hover:border-white/30',
                  ].join(' ')}
                >
                  <span className="block aspect-[2/3] w-full bg-ink-800">
                    {i.posterUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={i.posterUrl} alt="" loading="lazy" className="h-full w-full object-cover" />
                    ) : (
                      <span className="grid h-full w-full place-items-center p-2 text-center text-[11px] text-slate-400">
                        {i.title}
                      </span>
                    )}
                  </span>
                  {(liked || seen) && (
                    <span className="absolute right-1.5 top-1.5 grid h-7 w-7 place-items-center rounded-full bg-brand-500 text-sm font-black text-white">
                      {liked ? '✓' : (RATINGS.find((r) => r.key === seen)?.emoji ?? '✓')}
                    </span>
                  )}
                </button>

                <div className="mt-1 line-clamp-2 text-xs font-semibold text-white">{i.title}</div>
                <div className="text-[11px] text-slate-500">
                  {i.year ?? '—'} · {i.mediaType === 'movie' ? 'Movie' : 'TV'}
                </div>

                {openRating === k ? (
                  <div className="mt-1 flex flex-wrap gap-1" data-testid={`grid-ratings-${i.id}`}>
                    {RATINGS.map((r) => (
                      <button
                        key={r.key}
                        type="button"
                        onClick={() => setRating(i, r.key)}
                        data-testid={`grid-rate-${i.id}-${r.key}`}
                        className="inline-flex min-h-[32px] flex-1 items-center justify-center rounded-md border border-white/12 bg-white/5 px-1 text-[11px] font-semibold text-slate-200 hover:bg-white/10"
                        title={r.label}
                      >
                        {r.emoji}
                      </button>
                    ))}
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setOpenRating(k)}
                    data-testid={`grid-seen-${i.id}`}
                    className="mt-0.5 inline-flex min-h-[36px] items-center text-[11px] font-semibold text-brand-300 underline underline-offset-2 hover:text-brand-200"
                  >
                    {seen ? `Seen it · ${RATINGS.find((r) => r.key === seen)?.label}` : 'Seen it?'}
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {items.length > 0 && (
        <div className="mt-5 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={submit}
            disabled={chosen === 0 || saving}
            data-testid="title-grid-submit"
            className="btn-primary inline-flex min-h-[44px] items-center px-5 disabled:opacity-40"
          >
            {saving ? 'Saving…' : chosen === 0 ? 'Tap a few first' : `Use these ${chosen} →`}
          </button>
          <button
            type="button"
            onClick={() => setRound((r) => r + 1)}
            disabled={saving}
            data-testid="title-grid-shuffle"
            className="inline-flex min-h-[44px] items-center rounded-lg border border-white/15 px-4 text-sm font-semibold text-slate-300 transition hover:bg-white/10 disabled:opacity-40"
          >
            Nothing here I know — show me 12 more
          </button>
        </div>
      )}
    </div>
  );
}
