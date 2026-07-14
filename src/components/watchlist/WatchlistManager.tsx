'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { Poster } from '@/components/PosterCard';
import { tmdbImage } from '@/lib/tmdb/image';
import { updateWatchlistItem, removeWatchlistItem } from '@/lib/actions/watchlist';
import { useToast } from '@/components/Toast';
import type { WatchlistStatus, MediaType } from '@/lib/types';

export interface WatchlistItem {
  id: string;
  tmdb_id: number;
  media_type: MediaType;
  title: string;
  year: number | null;
  poster_path: string | null;
  status: WatchlistStatus;
  rating: number | null;
  notes: string | null;
  priority: number;
  added_at: string;
  watched_at: string | null;
}

const STATUSES: { value: WatchlistStatus | 'all'; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'strict', label: 'Strict' },
  { value: 'possible', label: 'Possible' },
  { value: 'watching', label: 'Watching' },
  { value: 'watched', label: 'Watched' },
  { value: 'paused', label: 'Paused' },
  { value: 'dropped', label: 'Dropped' },
];

const STATUS_OPTIONS: WatchlistStatus[] = ['strict', 'possible', 'watching', 'watched', 'paused', 'dropped'];

type SortKey = 'added' | 'title' | 'rating';

export function WatchlistManager({ items: initial }: { items: WatchlistItem[] }) {
  const toast = useToast();
  const [items, setItems] = useState(initial);
  const [filter, setFilter] = useState<WatchlistStatus | 'all'>('all');
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<SortKey>('added');
  const [view, setView] = useState<'grid' | 'list'>('grid');

  const visible = useMemo(() => {
    let list = items;
    if (filter !== 'all') list = list.filter((i) => i.status === filter);
    if (query.trim()) {
      const q = query.toLowerCase();
      list = list.filter((i) => i.title.toLowerCase().includes(q));
    }
    const sorted = [...list];
    if (sort === 'title') sorted.sort((a, b) => a.title.localeCompare(b.title));
    else if (sort === 'rating') sorted.sort((a, b) => (b.rating ?? -1) - (a.rating ?? -1));
    else sorted.sort((a, b) => b.added_at.localeCompare(a.added_at));
    return sorted;
  }, [items, filter, query, sort]);

  async function changeStatus(id: string, status: WatchlistStatus) {
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, status } : i)));
    const res = await updateWatchlistItem({ itemId: id, status });
    if (!res.ok) toast.show(res.error ?? 'Could not update.', 'error');
  }

  async function remove(id: string) {
    const prev = items;
    setItems((p) => p.filter((i) => i.id !== id));
    const res = await removeWatchlistItem(id);
    if (!res.ok) {
      setItems(prev);
      toast.show(res.error ?? 'Could not remove.', 'error');
    } else {
      toast.show('Removed.', 'info');
    }
  }

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: items.length };
    for (const s of STATUS_OPTIONS) c[s] = items.filter((i) => i.status === s).length;
    return c;
  }, [items]);

  return (
    <div className="space-y-4">
      {/* Controls */}
      <div className="card p-4">
        <div className="flex flex-wrap items-center gap-2">
          {STATUSES.map((s) => (
            <button
              key={s.value}
              onClick={() => setFilter(s.value)}
              className={`chip border ${filter === s.value ? 'chip-active' : ''}`}
            >
              {s.label}
              <span className="ml-1 text-[10px] text-slate-500">{counts[s.value] ?? 0}</span>
            </button>
          ))}
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filter by title…"
            className="input max-w-xs flex-1"
            aria-label="Filter watchlist by title"
          />
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as SortKey)}
            className="input max-w-[10rem]"
            aria-label="Sort watchlist"
          >
            <option value="added">Recently added</option>
            <option value="title">Title A–Z</option>
            <option value="rating">Your rating</option>
          </select>
          <div className="ml-auto flex overflow-hidden rounded-xl border border-white/10">
            <button
              onClick={() => setView('grid')}
              className={`px-3 py-2 text-sm ${view === 'grid' ? 'bg-brand-500 text-white' : 'text-slate-300'}`}
              aria-label="Grid view"
            >
              Grid
            </button>
            <button
              onClick={() => setView('list')}
              className={`px-3 py-2 text-sm ${view === 'list' ? 'bg-brand-500 text-white' : 'text-slate-300'}`}
              aria-label="List view"
            >
              List
            </button>
          </div>
        </div>
      </div>

      {visible.length === 0 ? (
        <p className="py-10 text-center text-sm text-slate-400">Nothing matches these filters.</p>
      ) : view === 'grid' ? (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
          {visible.map((item) => (
            <div key={item.id} className="card overflow-hidden">
              <Link href={`/app/title/${item.media_type}/${item.tmdb_id}`} className="block">
                <div className="aspect-[2/3] overflow-hidden">
                  <Poster posterUrl={tmdbImage(item.poster_path, 'w342')} title={item.title} />
                </div>
              </Link>
              <div className="p-2.5">
                <div className="line-clamp-1 text-sm font-semibold text-white">{item.title}</div>
                <div className="text-xs text-slate-400">
                  {item.year ?? '—'}
                  {item.rating ? ` · ★${item.rating}` : ''}
                </div>
                <select
                  value={item.status}
                  onChange={(e) => changeStatus(item.id, e.target.value as WatchlistStatus)}
                  className="mt-2 w-full rounded-lg border border-white/10 bg-ink-900 px-2 py-1.5 text-xs text-slate-200"
                  aria-label={`Status for ${item.title}`}
                >
                  {STATUS_OPTIONS.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
                <button onClick={() => remove(item.id)} className="mt-1 w-full text-xs text-slate-500 hover:text-red-300">
                  Remove
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="card divide-y divide-white/5">
          {visible.map((item) => (
            <div key={item.id} className="flex items-center gap-3 p-3">
              <Link href={`/app/title/${item.media_type}/${item.tmdb_id}`} className="h-16 w-11 flex-shrink-0 overflow-hidden rounded-md">
                <Poster posterUrl={tmdbImage(item.poster_path, 'w185')} title={item.title} />
              </Link>
              <div className="min-w-0 flex-1">
                <Link href={`/app/title/${item.media_type}/${item.tmdb_id}`} className="line-clamp-1 text-sm font-semibold text-white hover:underline">
                  {item.title}
                </Link>
                <div className="text-xs text-slate-400">
                  {item.year ?? '—'} · {item.media_type === 'movie' ? 'Movie' : 'TV'}
                  {item.rating ? ` · ★${item.rating}/10` : ''}
                </div>
              </div>
              <select
                value={item.status}
                onChange={(e) => changeStatus(item.id, e.target.value as WatchlistStatus)}
                className="rounded-lg border border-white/10 bg-ink-900 px-2 py-1.5 text-xs text-slate-200"
                aria-label={`Status for ${item.title}`}
              >
                {STATUS_OPTIONS.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
              <button onClick={() => remove(item.id)} className="text-xs text-slate-500 hover:text-red-300">
                Remove
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
