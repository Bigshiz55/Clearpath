'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { PosterCard } from './PosterCard';
import { QuickLook, type QuickLookTarget } from './QuickLook';
import { GENRE_CHIPS } from '@/lib/finderGenres';
import { TMDB_IMAGE_BASE } from '@/lib/tmdb/image';
import type { MediaType } from '@/lib/types';
import type { BrowseMonetization, BrowseSort } from '@/lib/browse';

export interface CatalogProvider {
  id: number;
  name: string;
  logoPath: string | null;
}

interface Item {
  id: number;
  mediaType: MediaType;
  title: string;
  year: number | null;
  posterPath: string | null;
  posterUrl: string | null;
}

const MONETIZATION: { v: BrowseMonetization; label: string }[] = [
  { v: 'all', label: 'Any' },
  { v: 'flatrate', label: 'Subscription' },
  { v: 'free', label: 'Free' },
  { v: 'rent', label: 'Rent' },
  { v: 'buy', label: 'Buy' },
];

function Seg<T extends string>({ value, onChange, options }: { value: T; onChange: (v: T) => void; options: { v: T; label: string }[] }) {
  return (
    <div className="inline-flex flex-wrap rounded-lg border border-white/12 bg-white/5 p-0.5">
      {options.map((o) => (
        <button key={o.v} onClick={() => onChange(o.v)} className={`rounded-md px-3 py-1.5 text-sm font-semibold transition ${value === o.v ? 'bg-brand-500 text-white shadow-glow' : 'text-slate-300 hover:text-white'}`}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function BrowseCatalog({
  providers,
  myServiceIds,
  initialType = 'movie',
}: {
  providers: CatalogProvider[];
  myServiceIds: number[];
  initialType?: MediaType;
}) {
  const [mediaType, setMediaType] = useState<MediaType>(initialType);
  const [providerIds, setProviderIds] = useState<number[]>([]);
  const [genreIds, setGenreIds] = useState<number[]>([]);
  const [monetization, setMonetization] = useState<BrowseMonetization>('all');
  const [minRating, setMinRating] = useState(0);
  const [sort, setSort] = useState<BrowseSort>('popularity');
  const [providerQuery, setProviderQuery] = useState('');
  const [showAllProviders, setShowAllProviders] = useState(false);

  const [items, setItems] = useState<Item[]>([]);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [open, setOpen] = useState<QuickLookTarget | null>(null);

  const filterKey = `${mediaType}|${[...providerIds].sort().join(',')}|${[...genreIds].sort().join(',')}|${monetization}|${minRating}|${sort}`;

  const fetchPage = useCallback(
    async (p: number, replace: boolean) => {
      setLoading(true);
      try {
        const res = await fetch('/api/browse', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ mediaType, providerIds, genreIds, monetization, minRating: minRating || null, sort, page: p }),
        });
        const data = await res.json();
        const next: Item[] = data.items ?? [];
        setDone(next.length === 0);
        setItems((prev) => (replace ? next : [...prev, ...next]));
      } catch {
        if (replace) setItems([]);
      } finally {
        setLoading(false);
      }
    },
    [mediaType, providerIds, genreIds, monetization, minRating, sort],
  );

  // Refetch from page 1 whenever any filter changes.
  useEffect(() => {
    setPage(1);
    setDone(false);
    void fetchPage(1, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterKey]);

  function toggle<T>(list: T[], v: T): T[] {
    return list.includes(v) ? list.filter((x) => x !== v) : [...list, v];
  }

  const myInCatalog = useMemo(() => {
    const ids = new Set(providers.map((p) => p.id));
    return myServiceIds.filter((id) => ids.has(id));
  }, [providers, myServiceIds]);
  const onMine = myInCatalog.length > 0 && myInCatalog.every((id) => providerIds.includes(id)) && providerIds.length === myInCatalog.length;

  const visibleProviders = useMemo(() => {
    const q = providerQuery.trim().toLowerCase();
    let list = providers;
    if (q) list = providers.filter((p) => p.name.toLowerCase().includes(q));
    // Always keep selected providers visible.
    const selected = providers.filter((p) => providerIds.includes(p.id) && !list.includes(p));
    const base = [...selected, ...list];
    return showAllProviders || q ? base.slice(0, 60) : base.slice(0, 18);
  }, [providers, providerQuery, showAllProviders, providerIds]);

  function loadMore() {
    const next = page + 1;
    setPage(next);
    void fetchPage(next, false);
  }

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="card space-y-3 p-4">
        <div className="flex flex-wrap items-center gap-2">
          <Seg value={mediaType} onChange={setMediaType} options={[{ v: 'movie', label: 'Movies' }, { v: 'tv', label: 'Shows' }]} />
          <Seg value={monetization} onChange={setMonetization} options={MONETIZATION} />
          <Seg value={sort} onChange={setSort} options={[{ v: 'popularity', label: 'Popular' }, { v: 'rating', label: 'Top rated' }, { v: 'new', label: 'Newest' }]} />
          <div className="ml-auto flex items-center gap-2">
            <span className="text-xs font-semibold text-slate-400">Rating ≥</span>
            <input type="range" min={0} max={9} step={0.5} value={minRating} onChange={(e) => setMinRating(Number(e.target.value))} className="w-28 accent-gold-400" />
            <span className="w-8 text-xs font-bold tabular-nums text-gold-300">{minRating ? minRating.toFixed(1) : 'Any'}</span>
          </div>
        </div>

        {/* Genres */}
        <div className="flex flex-wrap gap-1.5">
          {GENRE_CHIPS.map((g) => (
            <button key={g.id} onClick={() => setGenreIds((prev) => toggle(prev, g.id))} className={`rounded-lg border px-2.5 py-1 text-xs font-semibold transition ${genreIds.includes(g.id) ? 'border-brand-400/60 bg-brand-500/20 text-brand-100' : 'border-white/12 bg-white/5 text-slate-300 hover:bg-white/10'}`}>
              {g.label}
            </button>
          ))}
        </div>

        {/* Providers — the breadth: every service TMDB tracks for the region */}
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">Service</span>
            <button onClick={() => setProviderIds([])} className={`rounded-lg border px-2.5 py-1 text-xs font-semibold transition ${providerIds.length === 0 ? 'border-brand-400/60 bg-brand-500/20 text-brand-100' : 'border-white/12 bg-white/5 text-slate-300 hover:bg-white/10'}`}>Any service</button>
            {myInCatalog.length > 0 && (
              <button onClick={() => setProviderIds(onMine ? [] : myInCatalog)} className={`rounded-lg border px-2.5 py-1 text-xs font-semibold transition ${onMine ? 'border-emerald-400/50 bg-emerald-500/15 text-emerald-100' : 'border-white/12 bg-white/5 text-slate-300 hover:bg-white/10'}`}>✅ My services</button>
            )}
            <input
              value={providerQuery}
              onChange={(e) => setProviderQuery(e.target.value)}
              placeholder="Find a service…"
              className="ml-auto w-40 rounded-lg border border-white/12 bg-ink-900/70 px-2.5 py-1 text-xs text-slate-100 placeholder:text-slate-500 outline-none focus:border-brand-400/60"
            />
          </div>
          <div className="flex flex-wrap gap-1.5">
            {visibleProviders.map((p) => {
              const active = providerIds.includes(p.id);
              const logo = p.logoPath ? `${TMDB_IMAGE_BASE}/w92${p.logoPath}` : null;
              return (
                <button key={p.id} onClick={() => setProviderIds((prev) => toggle(prev, p.id))} className={`flex items-center gap-1.5 rounded-lg border px-2 py-1 text-xs font-semibold transition ${active ? 'border-brand-400/60 bg-brand-500/20 text-brand-100' : 'border-white/12 bg-white/5 text-slate-300 hover:bg-white/10'}`}>
                  {logo ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={logo} alt="" className="h-4 w-4 rounded" loading="lazy" />
                  ) : null}
                  {p.name}
                </button>
              );
            })}
            {!providerQuery && providers.length > 18 && (
              <button onClick={() => setShowAllProviders((v) => !v)} className="rounded-lg px-2.5 py-1 text-xs font-semibold text-brand-300 hover:text-brand-200">
                {showAllProviders ? 'Fewer' : `+${providers.length - 18} more`}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Results */}
      {items.length === 0 && loading ? (
        <div className="poster-grid">
          {Array.from({ length: 12 }).map((_, i) => <div key={i} className="aspect-[2/3] animate-pulse rounded-2xl bg-white/5" />)}
        </div>
      ) : items.length === 0 ? (
        <p className="text-sm text-slate-400">Nothing matches those filters. Loosen the price, rating, or service and try again.</p>
      ) : (
        <>
          <div className="poster-grid">
            {items.map((t) => (
              <PosterCard
                key={`${t.mediaType}-${t.id}`}
                mediaType={t.mediaType}
                tmdbId={t.id}
                title={t.title}
                year={t.year}
                posterUrl={t.posterUrl}
                posterPath={t.posterPath}
                onOpen={() => setOpen({ id: t.id, mediaType: t.mediaType, title: t.title, year: t.year, posterPath: t.posterPath })}
              />
            ))}
          </div>
          <div className="flex justify-center pt-2">
            {!done ? (
              <button onClick={loadMore} disabled={loading} className="btn-secondary px-6 disabled:opacity-50">
                {loading ? 'Loading…' : 'Load more'}
              </button>
            ) : (
              <span className="text-xs text-slate-500">That’s everything for these filters.</span>
            )}
          </div>
        </>
      )}

      {open && <QuickLook target={open} onClose={() => setOpen(null)} />}
    </div>
  );
}
