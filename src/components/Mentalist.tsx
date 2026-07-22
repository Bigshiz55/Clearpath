'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Poster, PosterCard } from './PosterCard';
import { SaveButton } from './SaveButton';
import { addToWatchlist } from '@/lib/actions/watchlist';

interface SearchHit {
  id: number;
  mediaType: 'movie' | 'tv';
  title: string;
  year: number | null;
  posterPath: string | null;
  posterUrl: string | null;
}

interface Pick {
  id: number;
  mediaType: 'movie' | 'tv';
  title: string;
  year: number | null;
  posterPath: string | null;
  posterUrl: string | null;
  match: number;
  primaryCall: string;
  reason: string;
  because: string | null;
  commitment: string;
  where: string | null;
  stretch: boolean;
}

interface Dna {
  summary: string;
  dials: { label: string; lean: string }[];
  predictions: string[];
  seeds: string[];
}

const MAX = 7;
const MIN = 3;
type Verdict = 'hit' | 'meh' | 'miss';

export function Mentalist() {
  const [seeds, setSeeds] = useState<SearchHit[]>([]);
  const [q, setQ] = useState('');
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [searching, setSearching] = useState(false);
  const [reading, setReading] = useState(false);
  const [dna, setDna] = useState<Dna | null>(null);
  const [picks, setPicks] = useState<Pick[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState<Record<number, Verdict>>({});
  const [saved, setSaved] = useState(false);
  const [savingAll, setSavingAll] = useState(false);
  const seedKeys = new Set(seeds.map((s) => `${s.mediaType}-${s.id}`));

  // Debounced title search.
  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) { setHits([]); return; }
    let active = true;
    setSearching(true);
    const t = setTimeout(async () => {
      try {
        const r = await fetch(`/api/search?q=${encodeURIComponent(term)}`);
        const d = await r.json();
        if (active) setHits((d.results ?? []) as SearchHit[]);
      } catch {
        if (active) setHits([]);
      } finally {
        if (active) setSearching(false);
      }
    }, 250);
    return () => { active = false; clearTimeout(t); };
  }, [q]);

  function addSeed(h: SearchHit) {
    if (seeds.length >= MAX || seedKeys.has(`${h.mediaType}-${h.id}`)) return;
    setSeeds((s) => [...s, h]);
    setQ('');
    setHits([]);
  }
  function removeSeed(h: SearchHit) {
    setSeeds((s) => s.filter((x) => !(x.id === h.id && x.mediaType === h.mediaType)));
  }

  const readMind = useCallback(async () => {
    if (seeds.length < MIN || reading) return;
    setReading(true);
    setError(null);
    setDna(null);
    setPicks(null);
    setSaved(false);
    setConfirmed({});
    try {
      const r = await fetch('/api/mentalist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ seeds: seeds.map((s) => ({ id: s.id, mediaType: s.mediaType })) }),
      });
      const d = await r.json();
      if (d.error) { setError(d.error); return; }
      setDna(d.dna ?? null);
      setPicks((d.picks ?? []) as Pick[]);
    } catch {
      setError('Something went wrong reading your taste. Try again.');
    } finally {
      setReading(false);
    }
  }, [seeds, reading]);

  async function saveAll() {
    if (!picks || savingAll) return;
    setSavingAll(true);
    try {
      await Promise.all(
        picks.map((p) =>
          addToWatchlist({
            tmdbId: p.id, mediaType: p.mediaType, title: p.title, year: p.year, posterPath: p.posterPath, status: 'strict',
          }).catch(() => {}),
        ),
      );
      setSaved(true);
    } finally {
      setSavingAll(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Seed picker */}
      <div className="card p-5">
        <h2 className="text-lg font-bold text-white">1 · Name {MIN}–{MAX} you genuinely loved</h2>
        <p className="mt-1 text-sm text-slate-400">Shows or movies — the ones that are so you. We read the hidden threads between them.</p>

        {seeds.length > 0 && (
          <div className="mt-4 flex flex-wrap gap-2">
            {seeds.map((s) => (
              <span key={`${s.mediaType}-${s.id}`} className="flex items-center gap-2 rounded-full border border-brand-400/40 bg-brand-500/15 py-1 pl-1 pr-2 text-sm text-white">
                <span className="h-8 w-6 overflow-hidden rounded"><Poster posterUrl={s.posterUrl} title={s.title} /></span>
                <span className="max-w-[9rem] truncate font-semibold">{s.title}</span>
                <button onClick={() => removeSeed(s)} className="text-slate-300 hover:text-white" aria-label={`Remove ${s.title}`}>✕</button>
              </span>
            ))}
          </div>
        )}

        {seeds.length < MAX && (
          <div className="relative mt-4">
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search a title you love…"
              className="w-full rounded-xl border border-white/15 bg-ink-950/70 px-3 py-2.5 text-sm text-white placeholder:text-slate-500 focus:border-brand-400 focus:outline-none"
            />
            {(hits.length > 0 || searching) && q.trim().length >= 2 && (
              <div className="absolute z-20 mt-1 max-h-80 w-full overflow-y-auto rounded-xl border border-white/15 bg-ink-900/98 p-1 shadow-2xl backdrop-blur">
                {searching && hits.length === 0 && <div className="px-3 py-2 text-sm text-slate-400">Searching…</div>}
                {hits.filter((h) => !seedKeys.has(`${h.mediaType}-${h.id}`)).map((h) => (
                  <button key={`${h.mediaType}-${h.id}`} onClick={() => addSeed(h)} className="flex w-full items-center gap-3 rounded-lg px-2 py-1.5 text-left hover:bg-white/10">
                    <span className="h-12 w-8 flex-none overflow-hidden rounded"><Poster posterUrl={h.posterUrl} title={h.title} /></span>
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-semibold text-white">{h.title}</span>
                      <span className="text-xs text-slate-400">{h.mediaType === 'tv' ? 'TV' : 'Movie'}{h.year ? ` · ${h.year}` : ''}</span>
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        <div className="mt-4 flex items-center gap-3">
          <button onClick={() => void readMind()} disabled={seeds.length < MIN || reading} className="btn-primary disabled:cursor-not-allowed disabled:opacity-50">
            {reading ? '🔮 Reading your mind…' : '🔮 Read my viewing mind'}
          </button>
          <span className="text-xs text-slate-500">{seeds.length}/{MAX} added{seeds.length < MIN ? ` · ${MIN - seeds.length} more to go` : ''}</span>
        </div>
        {error && <p className="mt-3 text-sm text-rose-300">{error}</p>}
      </div>

      {reading && (
        <div className="card flex flex-col items-center gap-3 p-10 text-center">
          <span className="h-10 w-10 animate-spin rounded-full border-2 border-white/20 border-t-brand-400" />
          <div className="text-lg font-bold text-white">Reading the threads between your picks…</div>
          <p className="text-sm text-slate-400">Fingerprinting tone, pace, motifs and lead characters.</p>
        </div>
      )}

      {/* Viewing DNA read-back */}
      {dna && !reading && (
        <div className="card border-brand-400/30 bg-gradient-to-br from-brand-500/10 to-transparent p-5">
          <h2 className="text-lg font-bold text-white">🧬 Your Viewing DNA</h2>
          <p className="mt-2 text-sm text-slate-200">{dna.summary}</p>
          {dna.dials.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2">
              {dna.dials.map((d) => (
                <span key={d.label} className="rounded-full border border-white/12 bg-white/5 px-2.5 py-1 text-xs text-slate-200">
                  {d.label}: <span className="font-semibold text-white">{d.lean}</span>
                </span>
              ))}
            </div>
          )}
          {dna.predictions.length > 0 && (
            <div className="mt-5">
              <div className="text-xs font-semibold uppercase tracking-wide text-brand-200">Did we read you right?</div>
              <ul className="mt-2 space-y-2">
                {dna.predictions.map((p, i) => (
                  <li key={i} className="flex flex-col gap-1.5 rounded-xl border border-white/10 bg-white/[0.03] p-2.5 sm:flex-row sm:items-center sm:justify-between">
                    <span className="text-sm text-slate-100">{p}</span>
                    <span className="flex flex-none gap-1">
                      {([['hit', '🎯 Nailed it'], ['meh', '≈ Sorta'], ['miss', '✕ Nope']] as const).map(([v, label]) => (
                        <button
                          key={v}
                          onClick={() => setConfirmed((c) => ({ ...c, [i]: v }))}
                          className={`rounded-lg px-2 py-1 text-[11px] font-semibold transition ${confirmed[i] === v ? 'bg-brand-500 text-white' : 'border border-white/15 text-slate-300 hover:text-white'}`}
                        >
                          {label}
                        </button>
                      ))}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* Predicted picks */}
      {picks && !reading && (
        picks.length === 0 ? (
          <div className="card p-6 text-center text-sm text-slate-400">
            We couldn’t find enough strong matches for that mix — try swapping in a couple of more mainstream favorites.
          </div>
        ) : (
          <div>
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-bold text-white">🎯 We predict you’ll pick these</h2>
                <p className="text-xs text-slate-400">Ranked by how strongly your fingerprint points to each. Tap any for its VERD1CT + where to watch.</p>
              </div>
              <button onClick={() => void saveAll()} disabled={savingAll || saved} className="btn-secondary disabled:opacity-50">
                {saved ? '✓ Saved to watchlist' : savingAll ? 'Saving…' : '+ Save all to watchlist'}
              </button>
            </div>
            <div className="poster-grid">
              {picks.map((p) => (
                <PosterCard
                  key={`${p.mediaType}-${p.id}`}
                  href={`/app/title/${p.mediaType}/${p.id}`}
                  title={p.title}
                  year={p.year}
                  mediaType={p.mediaType}
                  posterUrl={p.posterUrl}
                  overlay={<SaveButton wide tmdbId={p.id} mediaType={p.mediaType} title={p.title} year={p.year} posterPath={p.posterPath} />}
                >
                  <div className="mt-2 flex items-center justify-between gap-2">
                    <span className="rounded-md bg-brand-500/20 px-1.5 py-0.5 text-[11px] font-black tabular-nums text-brand-100">{p.match}% match</span>
                    {p.stretch && <span className="rounded-md bg-gold-500/20 px-1.5 py-0.5 text-[10px] font-bold text-amber-200">STRETCH</span>}
                  </div>
                  <p className="mt-1 line-clamp-3 text-[11px] text-slate-400">{p.reason}</p>
                  <div className="mt-1 text-[10px] text-slate-500">{p.commitment}{p.where ? ` · ${p.where}` : ''}</div>
                </PosterCard>
              ))}
            </div>
          </div>
        )
      )}
    </div>
  );
}
