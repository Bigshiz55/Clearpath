'use client';

import { useState } from 'react';
import Link from 'next/link';
import { naiveParseQuery, EMPTY_QUERY } from '@/lib/finderParse';
import { GENRE_CHIPS } from '@/lib/finderGenres';
import { SaveButton } from '@/components/SaveButton';
import { JudgeBench } from '@/components/JudgeBench';
import { RatingsStrip } from '@/components/RatingsStrip';
import { EMPTY_TILE_RATINGS, type TileRatings } from '@/lib/ratings';
import type { FinderQuery } from '@/lib/finder';
import type { Judge } from '@/lib/sponsors';

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
}

/** "9:00 PM · AMC · Wed Jul 23" — the real airtime & channel, easy to read. */
function airingLine(a: { network: string; time: string; airstamp: string }): string {
  const d = new Date(a.airstamp);
  const day = d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  let clock = '';
  const m = a.time.match(/^(\d{1,2}):(\d{2})/);
  if (m) {
    let h = Number(m[1]);
    const ampm = h >= 12 ? 'PM' : 'AM';
    h = h % 12 || 12;
    clock = `${h}:${m[2]} ${ampm}`;
  }
  return [clock, a.network, day].filter(Boolean).join(' · ');
}

const CALL_STYLE: Record<string, string> = {
  'WATCH IT': 'border-emerald-400/40 bg-emerald-500/15 text-emerald-100',
  MAYBE: 'border-yellow-400/40 bg-yellow-500/15 text-yellow-100',
  'SKIP IT': 'border-red-400/40 bg-red-500/15 text-red-100',
};

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
  label, readout, min, max, step, value, onChange, accent = false,
}: {
  label: string; readout: string; min: number; max: number; step: number; value: number; onChange: (v: number) => void; accent?: boolean;
}) {
  return (
    <div>
      <div className="mb-1 flex items-center justify-between">
        <span className="label mb-0">{label}</span>
        <span className={`text-xs font-semibold tabular-nums ${accent ? 'text-gold-400' : 'text-brand-200'}`}>{readout}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className={`w-full ${accent ? 'accent-gold-400' : 'accent-brand-500'}`}
      />
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
function paceReadout(v: number): string {
  return v <= 33 ? '🐢 Slow burn' : v >= 67 ? '⚡ Adrenaline' : '🎬 Balanced';
}

export function FinderUI({
  hasServices,
  watchers = [],
  initialJudge = null,
  embedded = false,
}: {
  hasServices: boolean;
  watchers?: WatcherOption[];
  initialJudge?: Judge | null;
  /** On the home screen the judge already lives elsewhere, so hide the bench. */
  embedded?: boolean;
}) {
  const [text, setText] = useState('');
  const [q, setQ] = useState<FinderQuery>({ ...EMPTY_QUERY });
  const [watcherIdx, setWatcherIdx] = useState(-1); // -1 = You
  const [items, setItems] = useState<ResultItem[] | null>(null);
  const [scoredFor, setScoredFor] = useState('Your match');
  const [relaxed, setRelaxed] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function onText(v: string) {
    setText(v);
    setQ(naiveParseQuery(v));
  }
  function set<K extends keyof FinderQuery>(key: K, val: FinderQuery[K]) {
    setQ((prev) => ({ ...prev, [key]: val }));
  }
  function toggleGenre(id: number) {
    setQ((prev) => ({
      ...prev,
      genreIds: prev.genreIds.includes(id) ? prev.genreIds.filter((g) => g !== id) : [...prev.genreIds, id],
    }));
  }

  async function find() {
    setLoading(true);
    setError(null);
    try {
      const watcher = watcherIdx >= 0 ? watchers[watcherIdx] : null;
      const res = await fetch('/api/finder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // Send the raw ask too, so the server can parse it smartly (actor names,
        // counts, "over 70%", etc.). Falls back to the tools below when empty.
        body: JSON.stringify({ query: q, text: text.trim(), watcher }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Failed');
      setItems(data.items ?? []);
      setScoredFor(data.scoredFor ?? 'Your match');
      setRelaxed(data.relaxed ?? null);
    } catch {
      setError('Couldn’t run that search. Try again.');
      setItems([]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-5">
      {/* Hero — the judge & the bench on the left, your plain-English ask on the right */}
      <div className={`grid gap-4 ${embedded ? '' : 'lg:grid-cols-2'}`}>
        {!embedded && <JudgeBench initialJudge={initialJudge} big />}

        <div className="card flex flex-col gap-3 p-4">
          {!embedded && <div className="eyebrow-lg">⚖️ Try your case</div>}
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
          <button onClick={find} disabled={loading} className="btn-primary w-full py-3.5 text-lg font-bold">
            {loading ? 'The court is deliberating…' : '⚖️ Submit evidence'}
          </button>
        </div>
      </div>

      {loading && (
        <div className="card p-6 text-center">
          <div className="text-sm font-semibold text-white">⚖️ The court is deliberating…</div>
          <div className="mt-1 text-xs text-slate-400">Weighing your evidence against every candidate.</div>
        </div>
      )}
      {error && <p className="text-sm text-amber-300">{error}</p>}

      {items && !loading && (
        <div>
          {relaxed && <p className="mb-3 rounded-xl border border-amber-400/30 bg-amber-500/10 p-3 text-sm text-amber-100">{relaxed}</p>}
          {items.length === 0 ? (
            <p className="text-sm text-slate-400">Nothing matched all of that — loosen a constraint (drop the match bar or a genre) and submit again.</p>
          ) : (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="text-base font-bold text-white sm:text-lg">⚖️ The verdict — {items.length} match{items.length === 1 ? '' : 'es'}, ranked by {scoredFor}:</div>
                <button
                  onClick={() => document.getElementById('evidence')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
                  className="rounded-lg border border-white/15 bg-white/5 px-3 py-1.5 text-xs font-semibold text-slate-200 transition hover:bg-white/10"
                >
                  ⚖️ Present new evidence ↓
                </button>
              </div>
              {items.map((it) => (
                <div key={`${it.mediaType}-${it.id}`} className="card flex gap-3 p-3">
                  <Link href={`/app/title/${it.mediaType}/${it.id}`} className="h-28 w-20 flex-none overflow-hidden rounded-lg border border-white/10">
                    {it.posterUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={it.posterUrl} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <div className="grid h-full w-full place-items-center bg-white/5 p-1 text-center text-[10px] text-slate-400">{it.title}</div>
                    )}
                  </Link>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <Link href={`/app/title/${it.mediaType}/${it.id}`} className="line-clamp-1 text-base font-bold text-white hover:underline sm:text-lg">
                        {it.title} {it.year ? <span className="font-normal text-slate-400">({it.year})</span> : null}
                      </Link>
                      <SaveButton tmdbId={it.id} mediaType={it.mediaType} title={it.title} year={it.year} posterPath={it.posterPath} />
                    </div>
                    <div className="mt-1 flex items-center gap-2">
                      <span className={`rounded-md border px-2 py-0.5 text-[11px] font-black ${CALL_STYLE[it.primaryCall] ?? 'border-white/15 text-slate-200'}`}>{it.primaryCall}</span>
                      <span className="text-sm font-bold tabular-nums text-gold-400">{it.matchScore}</span>
                      <span className="text-xs text-slate-400">match · {it.generalScore} overall</span>
                    </div>
                    <p className="mt-1 line-clamp-2 text-sm text-slate-300">{it.reason}</p>
                    {it.mediaType === 'tv' && it.airing && (
                      <div className="mt-2 inline-flex items-center gap-2 rounded-lg border border-brand-400/50 bg-brand-500/15 px-3 py-1.5 text-sm font-bold text-white">
                        <span aria-hidden className="text-base">📺</span>
                        <span className="tabular-nums">{airingLine(it.airing)}</span>
                      </div>
                    )}
                    <RatingsStrip ratings={it.ratings ?? EMPTY_TILE_RATINGS} title={it.title} year={it.year} decider={false} className="mt-1.5" />
                    <div className="mt-2 flex flex-wrap gap-1">
                      {it.receipts.map((r) => (
                        <span key={r} className="rounded-md border border-emerald-400/30 bg-emerald-500/10 px-2 py-0.5 text-[11px] text-emerald-100">✓ {r}</span>
                      ))}
                      {it.where && <span className="rounded-md border border-white/10 bg-white/5 px-2 py-0.5 text-[11px] text-slate-300">📺 {it.where}</span>}
                      <a href={it.deciderUrl} target="_blank" rel="noopener noreferrer" className="rounded-md border border-white/10 bg-white/5 px-2 py-0.5 text-[11px] text-brand-300 hover:bg-white/10">
                        Decider: Stream It or Skip It? ↗
                      </a>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Prepare your evidence — transparent, editable, no black box. */}
      <div id="evidence" className="card space-y-4 p-4 scroll-mt-20">
        <div className="eyebrow-lg">
          🎛️ Customize your evidence
        </div>

        {watchers.length > 0 && (
          <div>
            <div className="label">Who’s watching</div>
            <div className="flex flex-wrap gap-1.5">
              <button
                onClick={() => setWatcherIdx(-1)}
                className={`rounded-lg border px-3 py-1.5 text-sm transition ${watcherIdx === -1 ? 'border-gold-400/60 bg-gold-500/15 text-gold-400' : 'border-white/12 bg-white/5 text-slate-300 hover:bg-white/10'}`}
              >
                You
              </button>
              {watchers.map((w, i) => (
                <button
                  key={w.name}
                  onClick={() => setWatcherIdx(i)}
                  className={`rounded-lg border px-3 py-1.5 text-sm transition ${watcherIdx === i ? 'border-gold-400/60 bg-gold-500/15 text-gold-400' : 'border-white/12 bg-white/5 text-slate-300 hover:bg-white/10'}`}
                >
                  {w.name}
                </button>
              ))}
            </div>
            <p className="mt-1 text-xs text-slate-400">Scores every result against their taste — “{(watcherIdx >= 0 ? watchers[watcherIdx]!.name : 'You')} match”.</p>
          </div>
        )}

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
          <div className="label">Genres</div>
          <div className="flex flex-wrap gap-1.5">
            {GENRE_CHIPS.map((g) => (
              <button key={g.id} onClick={() => toggleGenre(g.id)} className={`rounded-lg border px-3 py-1.5 text-sm transition ${q.genreIds.includes(g.id) ? 'border-brand-400/60 bg-brand-500/20 text-brand-100' : 'border-white/12 bg-white/5 text-slate-300 hover:bg-white/10'}`}>
                {g.label}
              </button>
            ))}
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Slider label="Max length" readout={runtimeReadout(q.maxRuntime ?? 240)} min={60} max={240} step={10}
            value={q.maxRuntime ?? 240} onChange={(v) => set('maxRuntime', v >= 240 ? null : v)} />
          <Slider label="Released since" readout={releasedReadout(q.sinceMonths ? Math.max(1, Math.round(q.sinceMonths / 12)) : 0)} min={0} max={75} step={1}
            value={q.sinceMonths ? Math.max(1, Math.round(q.sinceMonths / 12)) : 0} onChange={(years) => set('sinceMonths', years === 0 ? null : years * 12)} />
          <Slider label="🍿 Popcorn meter (audience)" readout={q.minAudience ? `${q.minAudience}%+` : 'Any'} min={0} max={95} step={5}
            value={q.minAudience ?? 0} onChange={(v) => set('minAudience', v === 0 ? null : v)} />
          <Slider label="IMDb rating" readout={q.minImdb ? `${q.minImdb.toFixed(1)}+` : 'Any'} min={0} max={9} step={0.5}
            value={q.minImdb ?? 0} onChange={(v) => set('minImdb', v === 0 ? null : v)} accent />
          <Slider label={`${scoredFor} at least`} readout={q.minMatch ? `${q.minMatch}+` : 'Any'} min={0} max={95} step={5}
            value={q.minMatch ?? 0} onChange={(v) => set('minMatch', v === 0 ? null : v)} accent />
        </div>
        <p className="-mt-1 text-[11px] leading-relaxed text-slate-400">
          “Audience score” is the crowd rating from TMDB — the open stand-in for Rotten Tomatoes’ audience/Popcorn score. Drag “Released since” left to reach classics from decades back.
        </p>

        {/* Pace meter */}
        <div className="rounded-xl border border-white/10 bg-white/5 p-3">
          <div className="mb-1 flex items-center justify-between">
            <span className="label mb-0">Pace</span>
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-brand-200">{q.pace == null ? 'Any' : paceReadout(q.pace)}</span>
              <button
                onClick={() => set('pace', q.pace == null ? 50 : null)}
                className={`rounded-md border px-2 py-0.5 text-[11px] transition ${q.pace == null ? 'border-white/12 bg-white/5 text-slate-400' : 'border-brand-400/60 bg-brand-500/20 text-brand-100'}`}
              >
                {q.pace == null ? 'Set pace' : 'On'}
              </button>
            </div>
          </div>
          <input
            type="range" min={0} max={100} step={5}
            value={q.pace ?? 50}
            disabled={q.pace == null}
            onChange={(e) => set('pace', Number(e.target.value))}
            className="w-full accent-brand-500 disabled:opacity-40"
          />
          <div className="mt-0.5 flex justify-between text-[11px] text-slate-400">
            <span>🐢 Slow burn</span>
            <span>⚡ Adrenaline rush</span>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <button onClick={() => set('englishAudioOnly', !q.englishAudioOnly)} className={`rounded-lg border px-3 py-1.5 text-sm transition ${q.englishAudioOnly ? 'border-emerald-400/50 bg-emerald-500/15 text-emerald-100' : 'border-white/12 bg-white/5 text-slate-300 hover:bg-white/10'}`}>
            {q.englishAudioOnly ? '✓ ' : ''}English audio only
          </button>
          <button
            onClick={() => set('streamItOnly', !q.streamItOnly)}
            title="Only titles the judge rules Stream It — our “Watch It” verdict, à la Decider’s Stream It or Skip It."
            className={`rounded-lg border px-3 py-1.5 text-sm transition ${q.streamItOnly ? 'border-emerald-400/50 bg-emerald-500/15 text-emerald-100' : 'border-white/12 bg-white/5 text-slate-300 hover:bg-white/10'}`}
          >
            {q.streamItOnly ? '✓ ' : ''}⚖️ “Stream It” verdicts only
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

        <button onClick={find} disabled={loading} className="btn-primary w-full py-3">
          {loading ? 'The court is deliberating…' : '⚖️ Submit evidence'}
        </button>
      </div>
    </div>
  );
}
