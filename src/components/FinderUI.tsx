'use client';

import { useState } from 'react';
import Link from 'next/link';
import { naiveParseQuery, EMPTY_QUERY } from '@/lib/finderParse';
import { GENRE_CHIPS } from '@/lib/finderGenres';
import { SaveButton } from '@/components/SaveButton';
import type { FinderQuery } from '@/lib/finder';

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

export function FinderUI({ hasServices }: { hasServices: boolean }) {
  const [text, setText] = useState('');
  const [q, setQ] = useState<FinderQuery>({ ...EMPTY_QUERY });
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
      const res = await fetch('/api/finder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: q }),
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
      <div>
        <textarea
          value={text}
          onChange={(e) => onText(e.target.value)}
          rows={2}
          placeholder="Tell me exactly what you want… “a crime thriller under 140 min, out in the last 2 years, 80+ match”"
          className="input min-h-[64px] w-full resize-none"
        />
        <div className="mt-2 flex flex-wrap gap-1.5">
          {EXAMPLES.map((ex) => (
            <button key={ex} onClick={() => onText(ex)} className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-slate-300 hover:bg-white/10">
              {ex}
            </button>
          ))}
        </div>
      </div>

      {/* Transparent, editable parse — no black box. */}
      <div className="card space-y-4 p-4">
        <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">Here’s how I read that — tweak anything</div>

        <div>
          <div className="label">Type</div>
          <Seg value={q.mediaType} onChange={(v) => set('mediaType', v)} options={[{ v: 'any', label: 'Any' }, { v: 'movie', label: 'Movies' }, { v: 'tv', label: 'Shows' }]} />
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
          <div>
            <div className="label">Max length</div>
            <Seg value={q.maxRuntime ?? 0} onChange={(v) => set('maxRuntime', v === 0 ? null : v)} options={[{ v: 0, label: 'Any' }, { v: 90, label: '≤90m' }, { v: 120, label: '≤2h' }, { v: 140, label: '≤140m' }]} />
          </div>
          <div>
            <div className="label">Released</div>
            <Seg value={q.sinceMonths ?? 0} onChange={(v) => set('sinceMonths', v === 0 ? null : v)} options={[{ v: 0, label: 'Any time' }, { v: 12, label: '1 year' }, { v: 24, label: '2 years' }, { v: 60, label: '5 years' }]} />
          </div>
          <div>
            <div className="label">Audience at least</div>
            <Seg value={q.minAudience ?? 0} onChange={(v) => set('minAudience', v === 0 ? null : v)} options={[{ v: 0, label: 'Any' }, { v: 70, label: '70%' }, { v: 80, label: '80%' }, { v: 90, label: '90%' }]} />
          </div>
          <div>
            <div className="label">{scoredFor} at least</div>
            <Seg value={q.minMatch ?? 0} onChange={(v) => set('minMatch', v === 0 ? null : v)} options={[{ v: 0, label: 'Any' }, { v: 70, label: '70' }, { v: 80, label: '80' }, { v: 90, label: '90' }]} />
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <button onClick={() => set('englishAudioOnly', !q.englishAudioOnly)} className={`rounded-lg border px-3 py-1.5 text-sm transition ${q.englishAudioOnly ? 'border-emerald-400/50 bg-emerald-500/15 text-emerald-100' : 'border-white/12 bg-white/5 text-slate-300 hover:bg-white/10'}`}>
            {q.englishAudioOnly ? '✓ ' : ''}English audio only
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
          {loading ? 'Finding your matches…' : '🔎 Find it'}
        </button>
      </div>

      {error && <p className="text-sm text-amber-300">{error}</p>}

      {items && !loading && (
        <div>
          {relaxed && <p className="mb-3 rounded-xl border border-amber-400/30 bg-amber-500/10 p-3 text-sm text-amber-100">{relaxed}</p>}
          {items.length === 0 ? (
            <p className="text-sm text-slate-400">Nothing matched all of that — loosen a constraint (drop the match bar or a genre) and try again.</p>
          ) : (
            <div className="space-y-3">
              <div className="text-sm text-slate-400">{items.length} real matches, ranked by {scoredFor} — each shows what it satisfied.</div>
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
                      <Link href={`/app/title/${it.mediaType}/${it.id}`} className="line-clamp-1 font-semibold text-white hover:underline">
                        {it.title} {it.year ? <span className="font-normal text-slate-400">({it.year})</span> : null}
                      </Link>
                      <SaveButton tmdbId={it.id} mediaType={it.mediaType} title={it.title} year={it.year} posterPath={it.posterPath} />
                    </div>
                    <div className="mt-1 flex items-center gap-2">
                      <span className={`rounded-md border px-2 py-0.5 text-[11px] font-black ${CALL_STYLE[it.primaryCall] ?? 'border-white/15 text-slate-200'}`}>{it.primaryCall}</span>
                      <span className="text-sm font-bold tabular-nums text-gold-400">{it.matchScore}</span>
                      <span className="text-xs text-slate-500">match · {it.generalScore} overall</span>
                    </div>
                    <p className="mt-1 line-clamp-2 text-xs text-slate-300">{it.reason}</p>
                    <div className="mt-2 flex flex-wrap gap-1">
                      {it.receipts.map((r) => (
                        <span key={r} className="rounded-md border border-emerald-400/30 bg-emerald-500/10 px-2 py-0.5 text-[11px] text-emerald-100">✓ {r}</span>
                      ))}
                      {it.where && <span className="rounded-md border border-white/10 bg-white/5 px-2 py-0.5 text-[11px] text-slate-300">📺 {it.where}</span>}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
