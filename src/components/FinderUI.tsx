'use client';

import { dayLabel } from '@/lib/viewing/localDay';
import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { naiveParseQuery, EMPTY_QUERY } from '@/lib/finderParse';
import { canonicalQueryKey, activeFilterChips } from '@/lib/refineState';
import { STREAMING_SERVICES } from '@/lib/services';
import { GENRE_CHIPS } from '@/lib/finderGenres';
import { PosterCard } from '@/components/PosterCard';
import { MatchMark } from '@/components/MatchMark';
import { WhyVerdict } from '@/components/verdict/WhyVerdict';
import { buildPills } from '@/lib/verdict/pills';
import { type TileRatings } from '@/lib/ratings';
import type { FinderQuery } from '@/lib/finder';

export interface WatcherOption {
  name: string;
  love: string[];
  avoid: string[];
}

interface ResultItem {
  id: number;
  mediaType: 'movie' | 'tv';
  title: string;
  year: number | null;
  posterPath: string | null;
  posterUrl: string | null;
  matchScore: number;
  generalScore: number;
  primaryCall: string;
  reason: string;
  where: string | null;
  receipts: string[];
  deciderUrl: string;
  ratings?: TileRatings;
  airing?: { network: string; time: string; airstamp: string } | null;
  /** "Why this Verd1ct?" — real reasons/requirements/confidence from the engine. */
  explain?: {
    rose: string[];
    heldBack: string[];
    requirements: { label: string; satisfied: boolean; evidence: string }[];
    availability: { text: string; confidence: string } | null;
    confidence: { level: 'high' | 'medium' | 'low'; because: string[] };
  };
  /** Floor-weighted joint verdict when several people are watching. */
  household?: {
    score: number;
    call: 'strong' | 'good' | 'toss_up' | 'warning';
    perMember: { name: string; match: number }[];
    explanation: string[];
  } | null;
}

/** How far ahead a broadcast still counts as "what to watch" — 48 hours. A show
 *  on hiatus whose next new episode is a fall premiere months out isn't
 *  something you can watch now, so we simply don't show an airtime for it. */
const AIRING_WINDOW_MS = 48 * 60 * 60 * 1000;

/**
 * A show's next airing, but only when it's within the next 48 hours of the
 * search — the window you can actually act on. Returns null otherwise (e.g. a
 * premiere months away), so no months-out date ever shows up as an airtime.
 * "8:00 PM · CBS · Tonight" / "… · Tomorrow" / "… · Wed Jul 23".
 */
function airingInfo(a: { network: string; time: string; airstamp: string }): { text: string } | null {
  const airMs = Date.parse(a.airstamp);
  if (!Number.isFinite(airMs)) return null;
  const now = Date.now();
  // Beyond the 48h window (or more than a few hours past) it isn't watch-now.
  if (airMs - now > AIRING_WINDOW_MS || airMs - now < -3 * 60 * 60 * 1000) return null;

  const d = new Date(airMs);
  // The day word comes from the shared, DST-safe `localDay` module (calendar
  // comparison, never `now + 24h`). "Today" reads as "Tonight" here because
  // this row is specifically about tonight's viewing.
  const label = dayLabel(airMs, now, 'short');
  const day = label === 'Today' ? 'Tonight' : label;

  let clock = '';
  const m = a.time.match(/^(\d{1,2}):(\d{2})/);
  if (m) {
    let h = Number(m[1]);
    const ampm = h >= 12 ? 'PM' : 'AM';
    h = h % 12 || 12;
    clock = `${h}:${m[2]} ${ampm}`;
  }
  return { text: [clock, a.network, day].filter(Boolean).join(' · ') };
}


const EXAMPLES = [
  'A crime thriller movie under 140 minutes, out in the last 24 months, match 80+',
  'A bingeable show, all episodes out, audience 80%+, English audio, on my services',
  'Something funny and short I can watch tonight on my services',
];

function Seg<T extends string | number>({
  value, options, onChange,
}: { value: T; options: { v: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((o) => (
        <button
          key={String(o.v)}
          onClick={() => onChange(o.v)}
          className={`rounded-lg border px-3 py-1.5 text-sm transition ${
            value === o.v ? 'border-brand-400/60 bg-brand-500/20 text-brand-100' : 'border-white/12 bg-white/5 text-slate-300 hover:bg-white/10'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function Slider({
  label, readout, min, max, step, value, onChange, accent = false, icon, minLabel, maxLabel, hint,
}: {
  label: string; readout: string; min: number; max: number; step: number; value: number; onChange: (v: number) => void;
  accent?: boolean;
  /** Small glyph before the label (e.g. the "your match" brain). */
  icon?: React.ReactNode;
  /** What the far-left / far-right ends of the track mean — makes the direction clear. */
  minLabel?: string;
  maxLabel?: string;
  /** One-line explanation of what this slider controls. */
  hint?: string;
}) {
  return (
    <div>
      <div className="mb-1 flex items-center justify-between gap-2">
        <span className="label mb-0 flex items-center gap-1">{icon}{label}</span>
        <span className={`text-xs font-semibold tabular-nums ${accent ? 'text-gold-400' : 'text-brand-200'}`}>{readout}</span>
      </div>
      {hint && <p className="mb-1 text-[11px] leading-tight text-slate-400">{hint}</p>}
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className={`w-full ${accent ? 'accent-gold-400' : 'accent-brand-500'}`}
      />
      {(minLabel || maxLabel) && (
        <div className="mt-0.5 flex justify-between text-[10px] uppercase tracking-wide text-slate-500">
          <span>{minLabel}</span>
          <span>{maxLabel}</span>
        </div>
      )}
    </div>
  );
}

function runtimeReadout(v: number): string {
  if (v >= 240) return 'Any length';
  const h = Math.floor(v / 60);
  const m = v % 60;
  return h > 0 ? `≤ ${h}h ${m ? `${m}m` : ''}`.trim() : `≤ ${m}m`;
}
function releasedReadout(years: number): string {
  if (years <= 0) return 'Any year';
  const from = new Date().getFullYear() - years;
  return `${from} → now`;
}

export function FinderUI({
  hasServices,
  watchers = [],
  embedded = false,
}: {
  hasServices: boolean;
  watchers?: WatcherOption[];
  /** On the home screen the judge already lives elsewhere, so hide the bench. */
  embedded?: boolean;
}) {
  const [text, setText] = useState('');
  const [q, setQ] = useState<FinderQuery>({ ...EMPTY_QUERY });
  // Who's watching — MULTI-select co-watchers. "You" is always in the room;
  // selecting anyone else switches to household mode (floor-weighted joint
  // scoring server-side, never a blind average).
  const [watcherSel, setWatcherSel] = useState<Set<number>>(new Set());
  const [items, setItems] = useState<ResultItem[] | null>(null);
  const [scoredFor, setScoredFor] = useState('Your match');
  const [relaxed, setRelaxed] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // The canonical key of the request the current results came from. Comparing
  // it to the key of the CURRENT controls is what detects "these results are
  // stale relative to the filters" — no guessing from individual fields.
  const [lastRunKey, setLastRunKey] = useState<string | null>(null);
  // Fields the user has set BY HAND since the current ask was typed. The server
  // re-parses the free text on every run, so without this list a slider drag
  // after a text search is silently overwritten by the sentence and the results
  // come back identical — the control looks broken because it is being
  // discarded. Typing a new ask clears it; so does adopting the server's parse.
  const [touched, setTouched] = useState<Set<string>>(new Set());
  const [justUpdated, setJustUpdated] = useState(false);
  // Latest-request-wins: a monotonic id + AbortController so a slow older
  // response can never overwrite a newer result set.
  const seqRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);

  function onText(v: string) {
    setText(v);
    setQ(naiveParseQuery(v));
    // A new sentence supersedes the manual edits made against the old one.
    setTouched(new Set());
  }

  // Deep-link support: "State Your Case" (and links) can open the Finder pre-
  // filled with a plain-English ask and/or an explicit provider, and auto-run —
  // e.g. /app/finder?providers=9&q=…&run=1 for "something on Prime Video".
  const searchParams = useSearchParams();
  const seeded = useRef(false);
  const seededRun = useRef(false);
  useEffect(() => {
    if (seeded.current) return;
    seeded.current = true;
    const qText = searchParams.get('q');
    const providers = searchParams.get('providers');
    if (!qText && !providers) return;
    const ids = (providers ?? '')
      .split(',')
      .map((s) => Number.parseInt(s, 10))
      .filter((n) => Number.isFinite(n));
    const seededQuery: FinderQuery = { ...naiveParseQuery(qText ?? ''), ...(ids.length ? { providerIds: ids } : {}) };
    if (qText) setText(qText);
    setQ(seededQuery);
    if (searchParams.get('run') === '1') {
      seededRun.current = true;
      void find(seededQuery, qText ?? '');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  // A seeded run (e.g. tapping "Best movies on Netflix") lands the user at the
  // top of the bench, but the results render below the intro — so once the
  // auto-search finishes, glide straight to them instead of leaving the user
  // staring at an empty-looking input screen.
  useEffect(() => {
    if (!seededRun.current || loading || !items) return;
    seededRun.current = false;
    requestAnimationFrame(() => {
      document.getElementById('finder-results')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }, [loading, items]);
  function set<K extends keyof FinderQuery>(key: K, val: FinderQuery[K]) {
    setQ((prev) => ({ ...prev, [key]: val }));
    setTouched((prev) => new Set(prev).add(key as string));
  }
  function toggleGenre(id: number) {
    setQ((prev) => ({
      ...prev,
      genreIds: prev.genreIds.includes(id) ? prev.genreIds.filter((g) => g !== id) : [...prev.genreIds, id],
    }));
    setTouched((prev) => new Set(prev).add('genreIds'));
  }
  async function find(qOverride?: FinderQuery, textOverride?: string) {
    const mySeq = ++seqRef.current;
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;
    setLoading(true);
    setError(null);
    // Selected co-watchers — any selection means the household (You + them)
    // decides together.
    const selected = watchers.filter((_, i) => watcherSel.has(i));
    const householdMode = selected.length > 0;
    const effQuery = qOverride ?? q;
    const effText = (textOverride ?? text).trim();
    const runKey = canonicalQueryKey(effQuery, effText, ['You', ...selected.map((w) => w.name)].join('+'));
    const isRefinement = items != null;
    try {
      const res = await fetch('/api/finder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // Send the raw ask too, so the server can parse it smartly (actor names,
        // counts, "over 70%", etc.). Falls back to the tools below when empty.
        body: JSON.stringify({
          query: effQuery,
          text: effText,
          // Hand-set fields win over the re-parse of `text`.
          overrides: Array.from(touched),
          // Household (array): the server scores every member (You + each
          // selected watcher) and ranks by the floor-weighted joint verdict.
          ...(householdMode ? { watchers: selected } : {}),
        }),
        signal: ac.signal,
      });
      const data = await res.json();
      if (mySeq !== seqRef.current) return; // superseded — a newer request owns the screen
      if (!res.ok) throw new Error(data.error ?? 'Failed');
      setItems(data.items ?? []);
      setScoredFor(data.scoredFor ?? 'Your match');
      setRelaxed(data.relaxed ?? null);
      // ADOPT WHAT ACTUALLY RAN. The server parses the ask far better than the
      // client's regex does, so the sliders and the "Filtering by" chips must
      // show ITS constraints, not the client's guess — otherwise the chips
      // claim "Last 16 yr / Match 40+" while the search really ran "24 months /
      // 80+", and any subsequent drag starts from a number the user never saw.
      const applied = data.query ? ({ ...EMPTY_QUERY, ...(data.query as Partial<FinderQuery>) }) : null;
      if (applied) {
        setQ(applied);
        setTouched(new Set());
      }
      setLastRunKey(
        applied
          ? canonicalQueryKey(applied, effText, ['You', ...selected.map((w) => w.name)].join('+'))
          : runKey,
      );
      if (isRefinement) {
        setJustUpdated(true);
        window.setTimeout(() => setJustUpdated(false), 4000);
      }
    } catch (e) {
      if (mySeq !== seqRef.current || (e instanceof DOMException && e.name === 'AbortError')) return;
      setError('Couldn’t run that search. Try again.');
      setItems([]);
      setLastRunKey(runKey);
    } finally {
      if (mySeq === seqRef.current) setLoading(false);
    }
  }

  const providerFilterNames = (q.providerIds ?? [])
    .map((id) => STREAMING_SERVICES.find((s) => s.id === id || s.ids.includes(id))?.name)
    .filter((n): n is string => Boolean(n));

  // Staleness: the controls' canonical key vs. the key the results were
  // fetched with. When they differ, the results no longer reflect the filters.
  const currentKey = canonicalQueryKey(
    q,
    text.trim(),
    ['You', ...watchers.filter((_, i) => watcherSel.has(i)).map((w) => w.name)].join('+'),
  );
  const filtersChanged = items != null && !loading && lastRunKey != null && currentKey !== lastRunKey;
  const filterChips = activeFilterChips(q);
  const ctaLabel = loading ? 'Searching…' : items != null ? 'Update results' : 'Find titles';

  return (
    <div className="space-y-5">
      {(q.providerIds?.length ?? 0) > 0 && (
        <div className="mx-auto flex w-full max-w-2xl items-center justify-between gap-2 rounded-xl border border-brand-400/40 bg-brand-500/10 px-3.5 py-2.5 text-sm text-brand-100">
          <span>📺 Filtered to <b className="text-white">{providerFilterNames.join(', ') || 'your pick'}</b> — real availability from TMDB.</span>
          <button onClick={() => set('providerIds', [])} className="flex-none text-xs font-semibold text-brand-200 underline underline-offset-2 hover:text-white">Clear</button>
        </div>
      )}
      {/* On the home screen, both ways to search live inside ONE outlined box —
          "say what you want" OR "build it by hand" — so it reads as two options
          in a single section. Elsewhere the wrapper is transparent (`contents`)
          — it encloses the RESULTS too, so any width put on it would cap the
          grid; the question column is capped on the form div below instead. */}
      <div className={embedded ? 'space-y-5 rounded-3xl border-2 border-brand-400/40 bg-brand-500/[0.05] p-4 sm:p-6' : 'contents'}>
        {embedded && (
          <div className="flex items-center gap-2 text-2xl font-extrabold text-white sm:text-3xl">
            Your search
          </div>
        )}

        {/* One column. This was `lg:grid-cols-2` from when a second panel sat
            beside the ask; that panel is long gone, so on a laptop it left the
            box stranded in the left half with an empty column beside it.
            Standalone, the question keeps a readable centered column — a
            1500px textarea is a worse textarea — while the results grid below
            takes the whole container. That split IS the desktop layout. */}
        <div className={`grid gap-4 ${embedded ? '' : 'mx-auto w-full max-w-2xl'}`}>

        <div className={embedded ? 'flex flex-col gap-3' : 'card flex flex-col gap-3 p-4'}>
          {!embedded && <div className="eyebrow-lg">Refine your search</div>}
          <textarea
            value={text}
            onChange={(e) => onText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                void find();
              }
            }}
            rows={3}
            placeholder="Tell me exactly what you want, then hit Enter… “a crime thriller under 140 min, out in the last 2 years, 80+ match”"
            className="input min-h-[110px] w-full flex-1 resize-none text-base sm:text-lg"
          />
          <div className="flex flex-wrap gap-1.5">
            {EXAMPLES.map((ex) => (
              <button key={ex} onClick={() => onText(ex)} className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-slate-300 hover:bg-white/10">
                {ex}
              </button>
            ))}
          </div>
          <button onClick={() => void find()} disabled={loading} className="btn-primary w-full py-2.5 text-base font-semibold sm:w-auto sm:self-start sm:px-8">
            {ctaLabel}
          </button>
        </div>
      </div>

      {loading && (
        <div className="card mx-auto w-full max-w-2xl p-6 text-center">
          <div className="text-sm font-semibold text-white">Searching…</div>
          <div className="mt-1 text-xs text-slate-400">Checking every candidate against your requirements.</div>
        </div>
      )}
      {error && <p className="mx-auto w-full max-w-2xl text-sm text-amber-300">{error}</p>}

      {items && !loading && (
        <div id="finder-results" className="scroll-mt-4">
          {filtersChanged && (
            <div
              data-testid="filters-changed"
              className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-amber-400/40 bg-amber-500/10 px-3.5 py-2.5 text-sm text-amber-100"
            >
              <span>Filters changed — these results don’t reflect them yet.</span>
              <button onClick={() => void find()} className="flex-none rounded-lg border border-amber-300/50 bg-amber-400/20 px-3 py-1.5 text-xs font-bold text-amber-50 transition hover:bg-amber-400/30">
                Update results
              </button>
            </div>
          )}
          {justUpdated && !filtersChanged && (
            <p data-testid="results-updated" role="status" className="mb-3 rounded-xl border border-emerald-400/30 bg-emerald-500/10 px-3.5 py-2.5 text-sm text-emerald-100">
              ✓ Results updated — everything below matches your current filters.
            </p>
          )}
          {relaxed && <p className="mb-3 rounded-xl border border-amber-400/30 bg-amber-500/10 p-3 text-sm text-amber-100">{relaxed}</p>}
          {items.length === 0 ? (
            <p className="text-sm text-slate-400">Nothing matched all of that — loosen a constraint (drop the match bar or a genre) and search again.</p>
          ) : (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="inline-flex flex-wrap items-center gap-1 text-base font-bold text-white sm:text-lg">
                  {items.length} match{items.length === 1 ? '' : 'es'} for you, ranked by
                  <MatchMark size="text-sm" /> {scoredFor}:
                </div>
                <button
                  onClick={() => document.getElementById('evidence')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
                  className="rounded-lg border border-white/15 bg-white/5 px-3 py-1.5 text-xs font-semibold text-slate-200 transition hover:bg-white/10"
                >
                  Update search ↓
                </button>
              </div>
              {filterChips.length > 0 && (
                <div data-testid="active-filters" className="flex flex-wrap items-center gap-1.5 text-[11px]">
                  <span className="uppercase tracking-wide text-slate-500">Filtering by</span>
                  {filterChips.map((c) => (
                    <span key={c} className="rounded-md border border-brand-400/30 bg-brand-500/10 px-2 py-0.5 font-semibold text-brand-100">{c}</span>
                  ))}
                </div>
              )}
              <div className="poster-grid">
                {/* `it.reason` used to render inside each card as a sentence
                    beside the poster ("A near-perfect match — …"). Removed on
                    request: it restated what the badge and Why-this-Verd1ct
                    already say, and was a third of every card's height. The
                    reasons live on in the Why-this-Verd1ct panel, which is
                    where a reader who wants them goes. */}
                {items.map((it) => (
                  <PosterCard
                    key={`${it.mediaType}-${it.id}`}
                    href={`/app/title/${it.mediaType}/${it.id}`}
                    mediaType={it.mediaType}
                    tmdbId={it.id}
                    title={it.title}
                    year={it.year}
                    posterUrl={it.posterUrl}
                    posterPath={it.posterPath}
                    evidence={
                      <>
                        {/* ONE NUMBER PER CARD. The badge above is the score;
                            this row no longer restates it, nor the year or
                            runtime the heading and facts line already carry
                            (`buildPills` drops all of them). What is left is
                            the next step — where to watch, drawn as a real
                            affordance rather than a tag — and any evidence the
                            card has not said elsewhere, kept quiet beside it. */}
                        {/* RESERVED, EVEN WHEN EMPTY. A card without a
                            streaming match (no `where`) rendered nothing here
                            at all, so the row below it — Why this Verd1ct,
                            then FOR · AGAINST · SAVE — sat 36px higher than on
                            a neighbouring card that DID have a pill, and a row
                            of five cards read as five different heights. The
                            zone is now always present; the pills inside it are
                            not (`result-pills` still renders zero elements
                            when there is nothing to show). */}
                        <div className="min-h-[36px]">
                          {(() => {
                            const pills = buildPills({ receipts: it.receipts, where: it.where });
                            if (pills.length === 0) return null;
                            return (
                              <div data-testid="result-pills" className="flex flex-wrap items-center gap-1.5">
                                {pills.map((p) => (
                                  <span
                                    key={p.label}
                                    data-tone={p.tone}
                                    className={
                                      p.tone === 'watch'
                                        ? 'inline-flex min-h-[36px] items-center gap-1.5 rounded-lg border border-brand-400/50 bg-brand-500/15 px-3 text-[13px] font-bold text-white'
                                        : 'inline-flex min-h-[36px] items-center rounded-lg border border-white/10 bg-white/[0.04] px-2.5 text-[12px] text-slate-400'
                                    }
                                  >
                                    {p.tone === 'watch' ? <><span aria-hidden>📺</span>{p.label}</> : `✓ ${p.label}`}
                                  </span>
                                ))}
                              </div>
                            );
                          })()}
                        </div>
                        {(() => {
                          const info = it.mediaType === 'tv' && it.airing ? airingInfo(it.airing) : null;
                          if (!info) return null;
                          return (
                            <div className="inline-flex items-center gap-2 rounded-lg border border-brand-400/50 bg-brand-500/15 px-2 py-1 text-xs font-bold text-white">
                              <span aria-hidden>📺</span>
                              <span className="tabular-nums">{info.text}</span>
                            </div>
                          );
                        })()}
                        {it.household && (
                          <div
                            data-testid="household-verdict"
                            data-call={it.household.call}
                            className={`rounded-lg border p-2 text-xs ${
                              it.household.call === 'warning'
                                ? 'border-amber-400/40 bg-amber-500/10 text-amber-100'
                                : 'border-emerald-400/30 bg-emerald-500/10 text-emerald-100'
                            }`}
                          >
                            <div className="font-black">
                              {it.household.call === 'warning' ? '⚠️ HOUSEHOLD WARNING' : `HOUSEHOLD MATCH: ${it.household.score}`}
                            </div>
                            <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 tabular-nums">
                              {it.household.perMember.map((m) => (
                                <span key={m.name}>{m.name}: <b>{m.match}</b></span>
                              ))}
                            </div>
                            {it.household.explanation[0] && <p className="mt-1 opacity-90">{it.household.explanation[0]}</p>}
                          </div>
                        )}
                        {it.explain && <WhyVerdict data={it.explain} />}
                      </>
                    }
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* OR — type an opening statement above, or build the case with the controls. */}
      <div className={`flex items-center gap-4 ${embedded ? '' : 'mx-auto w-full max-w-2xl'}`} aria-hidden>
        <span className="h-0.5 flex-1 rounded-full bg-white/15" />
        <span className="text-3xl font-black uppercase tracking-[0.15em] text-slate-300 sm:text-4xl">OR</span>
        <span className="h-0.5 flex-1 rounded-full bg-white/15" />
      </div>

      {/* Submit your evidence — transparent, editable, no black box. The
          builder is a form, and forms keep the readable column standalone. */}
      <div id="evidence" className={embedded ? 'space-y-4 scroll-mt-20' : 'card mx-auto w-full max-w-2xl space-y-4 p-4 scroll-mt-20'}>
        <div className="flex items-center gap-2 text-2xl font-extrabold text-white sm:text-3xl">
          Refine your search
        </div>

        {watchers.length > 0 && (
          <div>
            <div className="label">Who’s watching</div>
            <div className="flex flex-wrap gap-1.5">
              <button
                aria-pressed="true"
                title="You're always in the room — add co-watchers to decide together"
                className="rounded-lg border border-gold-400/60 bg-gold-500/15 px-3 py-1.5 text-sm text-gold-400"
              >
                ✓ You
              </button>
              {watchers.map((w, i) => (
                <button
                  key={w.name}
                  aria-pressed={watcherSel.has(i)}
                  onClick={() =>
                    setWatcherSel((prev) => {
                      const next = new Set(prev);
                      if (next.has(i)) next.delete(i);
                      else next.add(i);
                      return next;
                    })
                  }
                  className={`rounded-lg border px-3 py-1.5 text-sm transition ${watcherSel.has(i) ? 'border-gold-400/60 bg-gold-500/15 text-gold-400' : 'border-white/12 bg-white/5 text-slate-300 hover:bg-white/10'}`}
                >
                  {watcherSel.has(i) ? '✓ ' : ''}{w.name}
                </button>
              ))}
            </div>
            <p className="mt-1 text-xs text-slate-400">
              {watcherSel.size > 0
                ? `Household mode — every result is scored for each of you and ranked by the joint verdict (never a plain average).`
                : 'Add co-watchers to score every result for the whole room.'}
            </p>
          </div>
        )}

        <div className="grid gap-4 sm:grid-cols-[auto_1fr] sm:items-start">
          <div>
            <div className="label">Type</div>
            <Seg
              value={q.liveOnly ? 'live' : q.mediaType === 'movie' ? 'movie' : 'tv'}
              onChange={(v) =>
                setQ((prev) => ({
                  ...prev,
                  mediaType: v === 'movie' ? 'movie' : 'tv',
                  liveOnly: v === 'live',
                }))
              }
              options={[
                { v: 'movie', label: 'Movies' },
                { v: 'tv', label: 'Shows' },
                { v: 'live', label: 'Live TV' },
              ]}
            />
            {q.liveOnly && (
              <p className="mt-1 text-[11px] text-slate-400">Shows with a real upcoming airing — channel & time on each result.</p>
            )}
          </div>

          <div>
            <div className="label">Your services</div>
            <a
              href="/app/settings"
              className="inline-flex items-center gap-2 rounded-lg border border-brand-400/50 bg-brand-500/15 px-3 py-2 text-sm font-semibold text-brand-100 transition hover:bg-brand-500/25"
            >
              <span aria-hidden>⚙️</span> Adjust your services
            </a>
            <p className="mt-1 text-[11px] text-slate-400">
              Results prefer the streaming services &amp; channels you have — set those up in Settings.
            </p>
          </div>
        </div>

        <div>
          <div className="label">Genres</div>
          <div className="flex flex-wrap gap-1.5">
            {GENRE_CHIPS.map((g) => (
              <button key={g.id} onClick={() => toggleGenre(g.id)} className={`rounded-lg border px-3 py-1.5 text-sm transition ${q.genreIds.includes(g.id) ? 'border-brand-400/60 bg-brand-500/20 text-brand-100' : 'border-white/12 bg-white/5 text-slate-300 hover:bg-white/10'}`}>
                {g.label}
              </button>
            ))}
          </div>
        </div>

        <div className="grid gap-5 sm:grid-cols-2">
          <Slider label="Max length" hint="The longest a movie can run" readout={runtimeReadout(q.maxRuntime ?? 240)} min={60} max={240} step={10}
            minLabel="1 hr" maxLabel="Any length"
            value={q.maxRuntime ?? 240} onChange={(v) => set('maxRuntime', v >= 240 ? null : v)} />
          <Slider label="How far back" hint="How old a title can be" readout={releasedReadout(q.sinceMonths ? Math.max(1, Math.round(q.sinceMonths / 12)) : 0)} min={0} max={75} step={1}
            minLabel="Any year" maxLabel="Classics"
            value={q.sinceMonths ? Math.max(1, Math.round(q.sinceMonths / 12)) : 0} onChange={(years) => set('sinceMonths', years === 0 ? null : years * 12)} />
          <Slider label="🍿 Audience score" hint="Minimum crowd score" readout={q.minAudience ? `${q.minAudience}%+` : 'Any'} min={0} max={95} step={5}
            minLabel="Any" maxLabel="Crowd-loved"
            value={q.minAudience ?? 0} onChange={(v) => set('minAudience', v === 0 ? null : v)} />
          <Slider label="IMDb rating" hint="Minimum IMDb score" readout={q.minImdb ? `${q.minImdb.toFixed(1)}+` : 'Any'} min={0} max={9} step={0.5}
            minLabel="Any" maxLabel="9.0 +"
            value={q.minImdb ?? 0} onChange={(v) => set('minImdb', v === 0 ? null : v)} accent />
          <Slider label={`${scoredFor} at least`} icon={<MatchMark size="text-sm" />} hint="How well it must fit your taste" readout={q.minMatch ? `${q.minMatch}+` : 'Any'} min={0} max={95} step={5}
            minLabel="Any" maxLabel="Best fit for you"
            value={q.minMatch ?? 0} onChange={(v) => set('minMatch', v === 0 ? null : v)} accent />
        </div>
        <p className="-mt-1 text-[11px] leading-relaxed text-slate-400">
          Each slider stays at “Any” until you drag it right. “Audience score” is the crowd rating from TMDB user
          votes — a real audience signal, but not Rotten Tomatoes’ own audience score.
        </p>

        <div className="flex flex-wrap gap-2">
          <button onClick={() => set('englishAudioOnly', !q.englishAudioOnly)} className={`rounded-lg border px-3 py-1.5 text-sm transition ${q.englishAudioOnly ? 'border-emerald-400/50 bg-emerald-500/15 text-emerald-100' : 'border-white/12 bg-white/5 text-slate-300 hover:bg-white/10'}`}>
            {q.englishAudioOnly ? '✓ ' : ''}English audio only
          </button>
          <button
            onClick={() => set('streamItOnly', !q.streamItOnly)}
            title="Only titles the judge rules Stream It — our “Watch It” verdict."
            className={`rounded-lg border px-3 py-1.5 text-sm transition ${q.streamItOnly ? 'border-emerald-400/50 bg-emerald-500/15 text-emerald-100' : 'border-white/12 bg-white/5 text-slate-300 hover:bg-white/10'}`}
          >
            {q.streamItOnly ? '✓ ' : ''}“Stream It” only
          </button>
          {q.mediaType !== 'movie' && (
            <button
              onClick={() => set('bingeableOnly', !q.bingeableOnly)}
              title="TV only: every episode of the latest season is already out — nothing left to wait on (vs. an ongoing, week-to-week release)."
              className={`rounded-lg border px-3 py-1.5 text-sm transition ${q.bingeableOnly ? 'border-emerald-400/50 bg-emerald-500/15 text-emerald-100' : 'border-white/12 bg-white/5 text-slate-300 hover:bg-white/10'}`}
            >
              {q.bingeableOnly ? '✓ ' : ''}📺 All episodes out
            </button>
          )}
          <button
            onClick={() => set('upcoming', !q.upcoming)}
            title="Only titles that haven't come out yet — upcoming movies and brand-new shows. Something else nobody else lets you search."
            className={`rounded-lg border px-3 py-1.5 text-sm transition ${q.upcoming ? 'border-amber-400/50 bg-amber-500/15 text-amber-100' : 'border-white/12 bg-white/5 text-slate-300 hover:bg-white/10'}`}
          >
            {q.upcoming ? '✓ ' : ''}🔮 Upcoming only
          </button>
          <button
            onClick={() => set('onMyServices', !q.onMyServices)}
            disabled={!hasServices}
            title={hasServices ? '' : 'Add your services in Settings first'}
            className={`rounded-lg border px-3 py-1.5 text-sm transition disabled:opacity-40 ${q.onMyServices ? 'border-emerald-400/50 bg-emerald-500/15 text-emerald-100' : 'border-white/12 bg-white/5 text-slate-300 hover:bg-white/10'}`}
          >
            {q.onMyServices ? '✓ ' : ''}Only on my services
          </button>
        </div>

        <button onClick={() => void find()} disabled={loading} className="btn-primary w-full py-2.5 text-base font-semibold sm:w-auto sm:self-start sm:px-8">
          {ctaLabel}
        </button>
      </div>
      </div>
    </div>
  );
}
