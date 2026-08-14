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
 * Nothing here manufactures a negative from silence. But a title someone
 * DOES recognise and DOES have an opinion on is exactly the case the old
 * one-at-a-time lane got right — so "Doesn't look good" lives here too, as
 * its own explicit button next to "Looks good" and "Seen it?". The
 * difference from Skip is the whole point: Skip was never a choice, this is
 * one. Everything sent from this grid is either a positive the user chose, a
 * negative they chose, or a rating on a title they have seen — never an
 * inference from a tile nobody touched.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { SeeRecommendations } from '@/components/SeeRecommendations';
import { recordQuizAnswer } from '@/lib/actions/dnaQuiz';
import { DnaBurst } from '@/components/DnaBurst';
import { RecommendationSlate } from '@/components/RecommendationSlate';
import { analysePicks, type AnalysedPick, type PickAnalysis } from '@/lib/preference/pickAnalysis';
import { EARLY_COMPLETE } from '@/lib/preference/calibration';
import { reportReliabilityEvent } from '@/lib/monitoringClient';

const GRID_SIZE = 12;
/** No single fetch attempt may hang the loading state forever — abort and
 *  surface a real error/retry by this point (matches the reliability-sprint
 *  standard: a useful error or fallback no later than 8s). */
const FETCH_TIMEOUT_MS = 8000;

/** Client-side event id — the engine is idempotent on it, so a double tap
 *  writes once rather than twice. */
const uid = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `g_${Date.now().toString(36)}_${Math.floor(Math.random() * 1e9).toString(36)}`;

async function fetchWithTimeout(url: string, ms: number): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    return await fetch(url, { cache: 'no-store', signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

interface Item {
  id: number;
  mediaType: 'movie' | 'tv';
  title: string;
  year: number | null;
  posterPath: string | null;
  posterUrl: string | null;
  genre: string | null;
  /** A one-or-two-sentence synopsis so a tile you don't recognise still makes
   *  sense. Real TMDB overview; null when TMDB has none (never invented). */
  overview: string | null;
}

type Rating = 'loved' | 'liked' | 'okay' | 'disliked';

/** What the user said about a tile. Absence means "said nothing" — never a no.
 *  `not_interested` IS a real negative, unlike absence — it only ever gets
 *  written when someone taps "Doesn't look good" for themselves. */
type Pick =
  | { kind: 'like'; id: string }
  | { kind: 'not_interested'; id: string }
  | { kind: 'seen'; rating: Rating; id: string };

/* LABELED CONTROLS, EMOJI IN SUPPORT. The rating chips used to render the
   emoji ALONE with the word hidden in a hover tooltip — an emoji-first
   control asks every user to translate 😐, and translation is exactly the
   ambiguity a taste instrument cannot afford. The label is the control now;
   the emoji rides along as a decorative icon (aria-hidden at the render
   site). Keys and semantics are untouched — only the presentation grew up. */
const RATINGS: Array<{ key: Rating; label: string; emoji: string }> = [
  { key: 'loved', label: 'Loved', emoji: '❤️' },
  { key: 'liked', label: 'Liked', emoji: '👍' },
  { key: 'okay', label: 'Okay', emoji: '😐' },
  { key: 'disliked', label: 'Didn’t', emoji: '👎' },
];

/** The finite onboarding progress model /api/calibration already computes
 *  (see calibrationProgress in lib/preference/calibration.ts) — reused here
 *  verbatim rather than re-derived, so the number on screen always matches
 *  what the server actually counted. */
interface CalProgress {
  index: number;
  size: number;
  percent: number;
  reachedEarly: boolean;
  complete: boolean;
}

/** In-progress picks are draft data, not yet written anywhere server-side —
 *  losing them on a refresh or a flaky connection means real work vanishes.
 *  Mirrored to localStorage (best-effort; private browsing / quota failures
 *  are silently ignored, same as the rest of the app) and cleared once every
 *  picked title has actually been saved. */
function draftKey(sessionId?: string): string {
  return `wv.calibration.draft.v1${sessionId ? `:${sessionId}` : ''}`;
}

interface Draft {
  picks: Record<string, Pick>;
  items: Array<[string, Item]>;
}

function loadDraft(sessionId?: string): Draft | null {
  try {
    const raw = localStorage.getItem(draftKey(sessionId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Draft;
    if (!parsed || typeof parsed !== 'object' || !parsed.picks || !Array.isArray(parsed.items)) return null;
    return parsed;
  } catch {
    return null;
  }
}

function saveDraft(sessionId: string | undefined, draft: Draft) {
  try {
    localStorage.setItem(draftKey(sessionId), JSON.stringify(draft));
  } catch {
    /* private mode / quota — the round just isn't refresh-safe this time */
  }
}

function clearDraft(sessionId?: string) {
  try {
    localStorage.removeItem(draftKey(sessionId));
  } catch {
    /* nothing to clean up if this throws */
  }
}

export function TitleGridCalibration({ sessionId }: { sessionId?: string | undefined }) {
  const [items, setItems] = useState<Item[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [picks, setPicks] = useState<Record<string, Pick>>({});
  const [openRating, setOpenRating] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [savedCount, setSavedCount] = useState<number | null>(null);
  // The read-back is built from the picks AS SUBMITTED — snapshotted here so a
  // later round cannot rewrite what a finished run said about you.
  const [analysis, setAnalysis] = useState<PickAnalysis | null>(null);
  const [round, setRound] = useState(0);
  const [exhausted, setExhausted] = useState(false);
  // The server's own onboarding progress model (see calibrationProgress) —
  // the single source of truth for "how close to unlocked," never re-derived.
  const [progress, setProgress] = useState<CalProgress | null>(null);
  // Set only when some (not all) picks failed to save — the ones that DID
  // save are removed from `picks` immediately, so retrying only resends what
  // actually failed rather than double-writing (harmless either way, since
  // writes are idempotent on eventId, but this keeps the count on screen honest).
  const [saveIssue, setSaveIssue] = useState<string | null>(null);
  // A round already restored from a previous, uncompleted session — used only
  // to decide whether to mention it, once, in the header.
  const [restoredDraft, setRestoredDraft] = useState(false);
  // The DNA pop, in the centre of the tile you just chose. Same moment the
  // rest of the app gives you for a For/Pass — this is the only feedback that
  // a tap did anything, so it belongs here more than anywhere.
  const [burst, setBurst] = useState<{ cx: number; cy: number } | null>(null);
  // Every title picked across EVERY round, not just the one on screen. A round
  // is a dealer, not a session: dealing twelve more used to wipe the six you
  // had already chosen, which threw the work away without ever saving it.
  const chosenItems = useRef<Map<string, Item>>(new Map());
  // Every key this session has already put on screen. Sent to the server so a
  // fresh round genuinely deals fresh cards: the plan is deterministic, so
  // without it "show me 12 more" re-deals the same twelve — which it did.
  const seen = useRef<Set<string>>(new Set());

  const keyOf = (i: Item) => `${i.mediaType}:${i.id}`;

  // RESTORE UNSAVED WORK, ONCE, ON MOUNT. Picks only ever reach the server on
  // "Done" (see submit()), so a refresh or a crash mid-round used to discard
  // everything silently. This runs before the first `load()` paints anything,
  // so a returning visitor sees their prior picks already counted.
  useEffect(() => {
    const draft = loadDraft(sessionId);
    if (!draft || Object.keys(draft.picks).length === 0) return;
    for (const [k, item] of draft.items) chosenItems.current.set(k, item);
    setPicks(draft.picks);
    setRestoredDraft(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // MIRROR EVERY PICK TO LOCAL STORAGE, IMMEDIATELY. Best-effort — a refresh
  // or the tab dying mid-round no longer means redoing the work.
  useEffect(() => {
    if (Object.keys(picks).length === 0) {
      clearDraft(sessionId);
      return;
    }
    saveDraft(sessionId, { picks, items: Array.from(chosenItems.current.entries()) });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [picks, sessionId]);

  const load = useCallback(async () => {
    setItems(null);
    setError(null);
    setOpenRating(null);
    // NOT `setPicks({})`. A new round adds twelve more cards; it does not
    // discard what you already chose.
    try {
      // NO REPEATS, GUARANTEED HERE.
      //
      // The server excludes what it knows about, but this component is the one
      // making the promise on screen, so it enforces it itself: anything this
      // session has already shown is filtered out again on arrival, and if a
      // page comes back thin we walk deeper until we have a full twelve or run
      // out of catalog. A stale deployment, a cached response or a server that
      // ignores `exclude` can no longer produce the same twelve twice.
      const fresh: Item[] = [];
      let lastError: string | null = null;

      for (let attempt = 0; attempt < 5 && fresh.length < GRID_SIZE; attempt++) {
        const qs = new URLSearchParams({ size: String(GRID_SIZE * 2) });
        // Walk TMDB deeper so the pool itself refreshes rather than being
        // re-planned from the same forty titles.
        qs.set('page', String(((round + attempt) % 5) + 1));
        if (sessionId) qs.set('session', sessionId);
        const already = Array.from(seen.current).slice(-200);
        if (already.length > 0) qs.set('exclude', already.join(','));

        // Bounded — a hung request must not leave the loading state on
        // screen forever (see FETCH_TIMEOUT_MS).
        const res = await fetchWithTimeout(`/api/calibration?${qs.toString()}`, FETCH_TIMEOUT_MS);
        const data = (await res.json()) as {
          items?: Item[];
          error?: string;
          answered?: number;
          progress?: CalProgress;
        };
        if (!res.ok) {
          lastError = data.error ?? 'Could not load titles right now.';
          break;
        }
        // The server's own progress model — always present on a 200, so this
        // stays accurate even on a round that comes back thin or empty.
        if (data.progress) setProgress(data.progress);
        let added = 0;
        for (const i of data.items ?? []) {
          const k = `${i.mediaType}:${i.id}`;
          if (seen.current.has(k) || fresh.some((f) => keyOf(f) === k)) continue;
          fresh.push(i);
          added += 1;
          if (fresh.length >= GRID_SIZE) break;
        }
        // A page that produced nothing new means deeper pages are unlikely to
        // either — stop rather than hammering TMDB.
        if (added === 0 && attempt > 0) break;
      }

      if (fresh.length === 0 && lastError) {
        setError(lastError);
        setItems([]);
        reportReliabilityEvent('quiz_load_failure', { reason: 'api_error' });
        return;
      }
      for (const i of fresh) seen.current.add(keyOf(i));
      setExhausted(fresh.length === 0 && seen.current.size > 0);
      setItems(fresh);
    } catch (e) {
      const timedOut = e instanceof DOMException && e.name === 'AbortError';
      setError(
        timedOut
          ? 'That took too long to load. Check your connection and try again.'
          : 'Could not load titles right now.',
      );
      setItems([]);
      reportReliabilityEvent('quiz_load_failure', { reason: timedOut ? 'timeout' : 'exception' });
    }
  }, [sessionId, round]);

  useEffect(() => {
    void load();
  }, [load]);

  const chosen = Object.keys(picks).length;

  /** After a save, the next twelve start a fresh run — the picks just written
   *  must not be counted (or re-written) a second time. */
  function startNewRun() {
    setPicks({});
    chosenItems.current.clear();
    setSavedCount(null);
    setAnalysis(null);
    setSaveIssue(null);
    setRound((r) => r + 1);
  }

  function toggleLike(i: Item, el: HTMLElement | null) {
    const k = keyOf(i);
    setOpenRating(null);
    setPicks((p) => {
      const next = { ...p };
      if (next[k]?.kind === 'like') {
        delete next[k];
        chosenItems.current.delete(k);
      } else {
        next[k] = { kind: 'like', id: uid() };
        chosenItems.current.set(k, i);
        const r = el?.closest('li')?.getBoundingClientRect();
        if (r) setBurst({ cx: r.left + r.width / 2, cy: r.top + r.height / 2 });
      }
      return next;
    });
  }

  /** The one explicit negative this grid allows — real evidence because it is
   *  chosen, not assumed from silence (see the module doc comment). Toggles
   *  the same way "Looks good" does, so tapping it twice is a real undo. */
  function toggleNotInterested(i: Item, el: HTMLElement | null) {
    const k = keyOf(i);
    setOpenRating(null);
    setPicks((p) => {
      const next = { ...p };
      if (next[k]?.kind === 'not_interested') {
        delete next[k];
        chosenItems.current.delete(k);
      } else {
        next[k] = { kind: 'not_interested', id: uid() };
        chosenItems.current.set(k, i);
        const r = el?.closest('li')?.getBoundingClientRect();
        if (r) setBurst({ cx: r.left + r.width / 2, cy: r.top + r.height / 2 });
      }
      return next;
    });
  }

  function setRating(i: Item, rating: Rating, el: HTMLElement | null) {
    const k = keyOf(i);
    setPicks((p) => ({ ...p, [k]: { kind: 'seen', rating, id: p[k]?.id ?? uid() } }));
    chosenItems.current.set(k, i);
    setOpenRating(null);
    const r = el?.closest('li')?.getBoundingClientRect();
    if (r) setBurst({ cx: r.left + r.width / 2, cy: r.top + r.height / 2 });
  }

  async function submit() {
    if (chosen === 0) return;
    setSaving(true);
    setSaveIssue(null);
    // Everything picked across every round — a title chosen three rounds ago is
    // still a title you chose. The snapshot is taken here, before any await,
    // so it can't drift if a tile is tapped mid-save.
    const toSend = Array.from(chosenItems.current.values()).flatMap((i) => {
      const pick = picks[keyOf(i)];
      return pick ? [{ item: i, pick }] : []; // untouched → nothing is sent. This is the point.
    });

    const results = await Promise.all(
      toSend.map(async ({ item: i, pick }) => {
        const base = {
          // Stable per-pick id (assigned when the tile was tapped, not here) —
          // a retry after a partial failure resends the SAME id, so a write
          // that actually landed server-side but whose response was lost
          // (a timeout, a dropped connection) is a safe no-op, never a
          // duplicate DNA event.
          eventId: pick.id,
          tmdbId: i.id,
          mediaType: i.mediaType,
          title: i.title,
          year: i.year,
          posterPath: i.posterPath,
          source: 'calibration',
          ...(sessionId ? { sessionId } : {}),
        };
        const ok = await recordQuizAnswer(
          pick.kind === 'like'
            ? { ...base, intent: 'looks_good' as const }
            : pick.kind === 'not_interested'
              ? { ...base, intent: 'not_interested' as const }
              : { ...base, intent: 'seen' as const, rating: pick.rating },
        )
          .then((r) => r.ok)
          .catch(() => false);
        return { key: keyOf(i), item: i, pick, ok };
      }),
    );
    setSaving(false);

    const failed = results.filter((r) => !r.ok);
    if (failed.length > 0) {
      // NOT a silent under-count. Whatever DID save is removed from the
      // pending set (so a retry can't double-submit it); whatever failed
      // stays exactly as picked, in `picks` and in the localStorage draft,
      // so "Retry saving" resends only what's actually missing.
      const failedKeys = new Set(failed.map((r) => r.key));
      setPicks((p) => {
        const next: Record<string, Pick> = {};
        for (const [k, v] of Object.entries(p)) if (failedKeys.has(k)) next[k] = v;
        return next;
      });
      for (const r of results) if (r.ok) chosenItems.current.delete(r.key);
      setSaveIssue(
        failed.length === toSend.length
          ? `Couldn't save ${failed.length === 1 ? 'that pick' : `any of those ${failed.length} picks`} — check your connection and try again.`
          : `${toSend.length - failed.length} of ${toSend.length} saved. ${failed.length} couldn't be saved — try again.`,
      );
      return; // stay on the picking screen; do NOT show a false "done" state.
    }

    setAnalysis(
      analysePicks(
        toSend.map(({ item: i, pick: p }): AnalysedPick => ({
          title: i.title,
          year: i.year,
          mediaType: i.mediaType,
          genre: i.genre,
          kind: p.kind,
          ...(p.kind === 'seen' ? { rating: p.rating } : {}),
        })),
        new Date().getFullYear(),
      ),
    );
    setSavedCount(results.length);
    clearDraft(sessionId);
  }

  if (items === null) {
    return (
      <div className="card p-6 text-sm text-slate-400" data-testid="title-grid-loading">
        Pulling together a spread of films and shows…
        {restoredDraft && (
          <span className="mt-2 block text-xs text-slate-500" data-testid="title-grid-restored">
            Your unsaved picks from last time are still here.
          </span>
        )}
      </div>
    );
  }

  if (savedCount !== null) {
    // The payoff. Finishing used to say "Got it." and stop — the one moment
    // someone has just done the work, and it handed back nothing. Read the
    // picks straight back to them, then show what those picks actually buy.
    return (
      <div className="space-y-5" data-testid="title-grid-done">
        <section className="card p-5 sm:p-6">
          {/* THE UNLOCK MOMENT, STATED PLAINLY. `progress` is the server's own
              onboarding model (calibrationProgress) — reachedEarly is the same
              10-title threshold the rest of the app (DNA_PERSONAL_MIN) treats
              as "enough to personalize." Shown once it's actually true, never
              claimed early. */}
          {progress?.reachedEarly && (
            <p
              className="mb-3 inline-flex items-center gap-1.5 rounded-full border border-[#ff1493]/40 bg-[#ff1493]/10 px-3 py-1 text-xs font-bold text-pink-100"
              data-testid="personalization-unlocked"
            >
              🔓 Personalized matching is unlocked
            </p>
          )}
          <div className="text-xs font-bold uppercase tracking-wide text-[#ff1493]">What your picks say</div>
          <h2 className="mt-1 text-2xl font-black text-white sm:text-3xl" data-testid="analysis-headline">
            {analysis?.headline ?? 'Saved.'}
          </h2>
          <p className="mt-1 text-sm text-slate-300">
            {savedCount === 0
              ? 'Nothing was recorded — the ones you did not tap are not held against you.'
              : `${savedCount} ${savedCount === 1 ? 'title' : 'titles'} went into your Watch DNA.`}
          </p>

          {analysis && analysis.facts.length > 0 && (
            <dl className="mt-4 grid gap-3 sm:grid-cols-2" data-testid="analysis-facts">
              {analysis.facts.map((f) => (
                <div key={f.key} className="rounded-xl border border-white/10 bg-white/[0.04] p-3">
                  <dt className="text-[11px] font-bold uppercase tracking-wide text-slate-400">{f.label}</dt>
                  <dd className="mt-0.5 text-sm font-semibold text-white">{f.detail}</dd>
                </div>
              ))}
            </dl>
          )}

          {analysis && (
            <p className="mt-3 text-xs text-slate-500" data-testid="analysis-caveat">
              {analysis.caveat}
              {!analysis.enough && ' Another round or two and this gets a lot sharper.'}
            </p>
          )}

          {/* The picks just moved the DNA, so the default action is to go see
              what that bought. "Keep going" was primary here and there was no
              route to recommendations at all — the reward for finishing was
              the offer to do it again. */}
          <div className="mt-5 flex flex-wrap items-center gap-2">
            <SeeRecommendations taught={savedCount} />
            <button
              type="button"
              onClick={startNewRun}
              className="inline-flex min-h-[48px] items-center rounded-lg border border-white/15 px-5 text-sm font-semibold text-slate-200 transition hover:bg-white/10"
              data-testid="title-grid-more"
            >
              Keep going — 12 more
            </button>
            <a
              href="/app/dna"
              className="inline-flex min-h-[48px] items-center rounded-lg border-2 border-[#ff1493]/45 bg-[#ff1493]/10 px-5 text-sm font-bold text-pink-100 transition hover:bg-[#ff1493]/20"
            >
              See my full Watch DNA →
            </a>
          </div>
        </section>

        {/* What it bought. The slate ranks from the DNA that just changed, so
            this is the first real evidence the picks did anything. */}
        <section className="card p-5 sm:p-6" data-testid="analysis-recommendations">
          <h3 className="text-lg font-bold text-white">Because of those picks</h3>
          <p className="mt-0.5 text-sm text-slate-400">
            Ranked against your Watch DNA as it stands right now — react to any of them and it keeps learning.
          </p>
          <div className="mt-4">
            <RecommendationSlate surface="grid-calibration" {...(sessionId ? { sessionId } : {})} />
          </div>
        </section>
      </div>
    );
  }

  return (
    <div data-testid="title-grid">
      <header>
        <h1 className="text-2xl font-bold text-white sm:text-3xl">Tap anything you like the look of</h1>
        <p className="mt-1 text-sm text-slate-400">
          Twelve at a time. Say what you think of the ones you recognise — good or not — and if you have already
          seen one, say what you thought.{' '}
          <span className="font-semibold text-slate-300" data-testid="grid-no-penalty">
            Leaving a title alone records nothing: not recognising something is not a dislike.
          </span>
        </p>

        {/* PROGRESS, TIED TO THE REAL UNLOCK THRESHOLD. `progress` is the
            server's own onboarding model, never re-derived here — so the bar
            can't drift from what actually unlocks personalized matching. */}
        {progress && !progress.complete && (
          <div className="mt-3" data-testid="calibration-progress">
            <div className="flex items-center justify-between text-xs font-semibold text-slate-400">
              <span>
                {progress.reachedEarly
                  ? 'Personalized matching is unlocked — every extra pick sharpens it further.'
                  : `${progress.index - 1} of ${EARLY_COMPLETE} answered to unlock personalized matching`}
              </span>
              <span>{progress.percent}%</span>
            </div>
            <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-white/10">
              <div
                className={`h-full rounded-full transition-all ${progress.reachedEarly ? 'bg-[#ff1493]' : 'bg-brand-400'}`}
                style={{ width: `${Math.min(100, progress.percent)}%` }}
              />
            </div>
          </div>
        )}
      </header>

      {error && (
        <div className="mt-3 flex flex-wrap items-center gap-2" data-testid="title-grid-error">
          <p className="text-sm text-amber-200">{error}</p>
          <button
            type="button"
            onClick={() => void load()}
            className="inline-flex min-h-[36px] items-center rounded-lg border border-amber-400/40 bg-amber-500/10 px-3 text-xs font-bold text-amber-100 transition hover:bg-amber-500/20"
            data-testid="title-grid-retry"
          >
            ↻ Retry
          </button>
        </div>
      )}

      {saveIssue && (
        <div className="mt-3 flex flex-wrap items-center gap-2 rounded-lg border border-amber-400/30 bg-amber-500/10 p-3" data-testid="title-grid-save-issue">
          <p className="text-sm text-amber-100">{saveIssue}</p>
          <button
            type="button"
            onClick={submit}
            disabled={saving}
            className="inline-flex min-h-[36px] items-center rounded-lg border border-amber-400/40 bg-amber-500/15 px-3 text-xs font-bold text-amber-100 transition hover:bg-amber-500/25 disabled:opacity-40"
            data-testid="title-grid-retry-save"
          >
            {saving ? 'Retrying…' : '↻ Retry saving'}
          </button>
        </div>
      )}

      {items.length === 0 && !error ? (
        <div className="mt-4" data-testid="title-grid-empty">
          <p className="text-sm text-slate-400">
            {exhausted
              ? 'That is everything I can find that you have not already seen here. Come back later and there will be more.'
              : "We couldn't put together a fresh set of titles just now."}
          </p>
          {!exhausted && (
            <button
              type="button"
              onClick={() => void load()}
              className="mt-2 inline-flex min-h-[40px] items-center rounded-lg border border-white/15 px-4 text-sm font-semibold text-slate-200 transition hover:bg-white/10"
            >
              ↻ Try again
            </button>
          )}
        </div>
      ) : (
        <ul className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
          {items.map((i) => {
            const k = keyOf(i);
            const pick = picks[k];
            const liked = pick?.kind === 'like';
            const notInterested = pick?.kind === 'not_interested';
            const seen = pick?.kind === 'seen' ? pick.rating : null;
            return (
              <li key={k} className="min-w-0" data-testid={`grid-tile-${i.mediaType}-${i.id}`}>
                <div
                  className={[
                    'relative block w-full overflow-hidden rounded-xl border-2 transition',
                    liked || seen
                      ? 'border-brand-400 shadow-[0_0_0_3px_rgba(168,85,247,0.25)]'
                      : notInterested
                        ? 'border-slate-500'
                        : 'border-white/10',
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
                  {notInterested && (
                    <span className="absolute right-1.5 top-1.5 grid h-7 w-7 place-items-center rounded-full bg-slate-700 text-sm font-black text-white">
                      ✕
                    </span>
                  )}
                </div>

                <div className="mt-1 line-clamp-2 text-xs font-semibold text-white">{i.title}</div>
                <div className="text-[11px] text-slate-500">
                  {i.year ?? '—'} · {i.mediaType === 'movie' ? 'Movie' : 'TV'}
                </div>

                {/* THE GIST, FOR A TILE YOU DON'T RECOGNISE. A poster + a title
                    is no help when you've never heard of the thing, and this
                    grid's whole job is reacting to what you recognise — so each
                    tile carries a one-or-two-sentence synopsis. Real TMDB
                    overview, clamped to two lines; simply absent (never a
                    placeholder) when TMDB has none. */}
                {i.overview && (
                  <p
                    className="mt-1 line-clamp-2 text-[11px] leading-snug text-slate-400"
                    title={i.overview}
                    data-testid={`grid-overview-${i.id}`}
                  >
                    {i.overview}
                  </p>
                )}

                {/* THE TWO OPINIONS ON A TITLE YOU RECOGNISE. Both are chosen,
                    both are real signal — "Doesn't look good" only ever writes
                    because someone tapped it, never from leaving the tile
                    alone (see the module doc comment above). */}
                <div className="mt-1 grid grid-cols-2 gap-1">
                  <button
                    type="button"
                    onClick={(e) => toggleLike(i, e.currentTarget)}
                    aria-pressed={liked}
                    data-testid={`grid-like-${i.id}`}
                    className={[
                      'inline-flex min-h-[36px] items-center justify-center rounded-lg border px-1 text-[11px] font-bold leading-tight transition',
                      liked
                        ? 'border-brand-400 bg-brand-500/25 text-brand-100'
                        : 'border-white/12 bg-white/5 text-slate-300 hover:bg-white/10',
                    ].join(' ')}
                  >
                    <span aria-hidden>👍</span>&nbsp;Looks good
                  </button>
                  <button
                    type="button"
                    onClick={(e) => toggleNotInterested(i, e.currentTarget)}
                    aria-pressed={notInterested}
                    data-testid={`grid-bad-${i.id}`}
                    className={[
                      'inline-flex min-h-[36px] items-center justify-center rounded-lg border px-1 text-[11px] font-bold leading-tight transition',
                      notInterested
                        ? 'border-slate-400 bg-white/10 text-slate-100'
                        : 'border-white/12 bg-white/5 text-slate-300 hover:bg-white/10',
                    ].join(' ')}
                  >
                    <span aria-hidden>👎</span>&nbsp;Doesn&rsquo;t look good
                  </button>
                </div>

                {openRating === k ? (
                  <div className="mt-1 grid grid-cols-2 gap-1" data-testid={`grid-ratings-${i.id}`}>
                    {RATINGS.map((r) => {
                      const selected = seen === r.key;
                      return (
                        <button
                          key={r.key}
                          type="button"
                          onClick={(e) => setRating(i, r.key, e.currentTarget)}
                          aria-pressed={selected}
                          data-testid={`grid-rate-${i.id}-${r.key}`}
                          className={[
                            'inline-flex min-h-[40px] items-center justify-center gap-1 rounded-lg border px-1 text-[11px] font-bold leading-tight transition',
                            'focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-300',
                            selected
                              ? 'border-brand-400 bg-brand-500/25 text-brand-100'
                              : 'border-white/12 bg-white/5 text-slate-200 hover:bg-white/10',
                          ].join(' ')}
                        >
                          <span aria-hidden>{r.emoji}</span> {r.label}
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setOpenRating(k)}
                    data-testid={`grid-seen-${i.id}`}
                    className="mt-1 inline-flex min-h-[40px] w-full items-center justify-center rounded-lg border border-[#ff1493]/45 bg-[#ff1493]/10 px-2 text-xs font-bold text-pink-200 transition hover:bg-[#ff1493]/20"
                  >
                    {seen ? `Seen it · ${RATINGS.find((r) => r.key === seen)?.label}` : 'Seen it?'}
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {/* Keep going for as long as you like. The end button is the ONLY thing
          that writes — dealing another twelve never discards what you picked,
          and the running total says so. More rounds is the fastest way to a
          real profile, so nothing here rushes you off the screen. */}
      <div className="sticky bottom-0 mt-5 flex flex-wrap items-center gap-2 bg-gradient-to-t from-ink-950 via-ink-950/95 to-transparent pb-2 pt-4">
        <button
          type="button"
          onClick={submit}
          disabled={chosen === 0 || saving}
          data-testid="title-grid-submit"
          className="btn-primary inline-flex min-h-[48px] items-center px-6 text-base disabled:opacity-40"
        >
          {saving ? 'Saving…' : chosen === 0 ? 'Pick a few first' : `Done — add ${chosen} to my DNA →`}
        </button>
        {items.length > 0 && (
          <button
            type="button"
            onClick={() => setRound((r) => r + 1)}
            disabled={saving}
            data-testid="title-grid-shuffle"
            className="inline-flex min-h-[48px] items-center rounded-lg border-2 border-[#ff1493]/45 bg-[#ff1493]/10 px-5 text-sm font-bold text-pink-100 transition hover:bg-[#ff1493]/20 disabled:opacity-40"
          >
            Show me 12 more
          </button>
        )}
        {chosen > 0 && (
          <span className="text-sm font-semibold text-slate-300" data-testid="grid-running-total">
            {chosen} picked so far · keep going, nothing reaches your Watch DNA until you hit Done — but a refresh
            won&rsquo;t lose them
          </span>
        )}
      </div>

      {burst && <DnaBurst cx={burst.cx} cy={burst.cy} kind="up" onDone={() => setBurst(null)} />}
    </div>
  );
}
