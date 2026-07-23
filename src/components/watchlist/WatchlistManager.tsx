'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { Poster } from '@/components/PosterCard';
import { tmdbImage } from '@/lib/tmdb/image';
import { updateWatchlistItem, removeWatchlistItem } from '@/lib/actions/watchlist';
import { useToast } from '@/components/Toast';
import { useT } from '@/i18n/I18nProvider';
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

const STATUSES: (WatchlistStatus | 'all')[] = ['all', 'strict', 'possible', 'watching', 'watched', 'paused', 'dropped'];

const STATUS_OPTIONS: WatchlistStatus[] = ['strict', 'possible', 'watching', 'watched', 'paused', 'dropped'];

type SortKey = 'added' | 'watched' | 'title' | 'rating';

export function WatchlistManager({ items: initial }: { items: WatchlistItem[] }) {
  const toast = useToast();
  const t = useT();
  const [items, setItems] = useState(initial);
  const [filter, setFilter] = useState<WatchlistStatus | 'all'>('all');
  const [favOnly, setFavOnly] = useState(false);
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<SortKey>('added');
  const [view, setView] = useState<'grid' | 'list'>('grid');

  const visible = useMemo(() => {
    let list = items;
    if (favOnly) list = list.filter((i) => i.priority >= 1);
    if (filter !== 'all') list = list.filter((i) => i.status === filter);
    if (query.trim()) {
      const q = query.toLowerCase();
      list = list.filter((i) => i.title.toLowerCase().includes(q));
    }
    const sorted = [...list];
    if (sort === 'title') sorted.sort((a, b) => a.title.localeCompare(b.title));
    else if (sort === 'rating') sorted.sort((a, b) => (b.rating ?? -1) - (a.rating ?? -1));
    else if (sort === 'watched') sorted.sort((a, b) => (b.watched_at ?? '').localeCompare(a.watched_at ?? ''));
    else sorted.sort((a, b) => b.added_at.localeCompare(a.added_at));
    return sorted;
  }, [items, filter, favOnly, query, sort]);

  async function changeStatus(id: string, status: WatchlistStatus) {
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, status } : i)));
    const res = await updateWatchlistItem({ itemId: id, status });
    if (!res.ok) toast.show(res.error ?? t('discover.watchlist.toast.couldNotUpdate'), 'error');
  }

  async function toggleFav(item: WatchlistItem) {
    const next = item.priority >= 1 ? 0 : 1;
    setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, priority: next } : i)));
    const res = await updateWatchlistItem({ itemId: item.id, priority: next });
    if (res.ok)
      toast.show(
        next ? t('discover.watchlist.toast.addedFav') : t('discover.watchlist.toast.removedFav'),
        next ? 'success' : 'info',
      );
    else {
      setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, priority: item.priority } : i)));
      toast.show(res.error ?? t('discover.watchlist.toast.couldNotUpdate'), 'error');
    }
  }

  async function remove(id: string) {
    const prev = items;
    setItems((p) => p.filter((i) => i.id !== id));
    const res = await removeWatchlistItem(id);
    if (!res.ok) {
      setItems(prev);
      toast.show(res.error ?? t('discover.watchlist.toast.couldNotRemove'), 'error');
    } else {
      toast.show(t('discover.watchlist.toast.removed'), 'info');
    }
  }

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: items.length };
    for (const s of STATUS_OPTIONS) c[s] = items.filter((i) => i.status === s).length;
    return c;
  }, [items]);
  const favCount = useMemo(() => items.filter((i) => i.priority >= 1).length, [items]);

  return (
    <div className="space-y-4">
      {/* Controls */}
      <div className="card p-4">
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => setFavOnly((v) => !v)}
            className={`chip border ${favOnly ? 'border-gold-400/60 bg-gold-500/15 text-gold-200' : ''}`}
            aria-pressed={favOnly}
          >
            {t('discover.watchlist.filters.favorites')}
            <span className="ml-1 text-[10px] text-slate-500">{favCount}</span>
          </button>
          <span className="mx-1 h-5 w-px bg-white/10" aria-hidden />
          {STATUSES.map((s) => (
            <button
              key={s}
              onClick={() => setFilter(s)}
              className={`chip border ${filter === s ? 'chip-active' : ''}`}
            >
              {t(`discover.watchlist.status.${s}`)}
              <span className="ml-1 text-[10px] text-slate-500">{counts[s] ?? 0}</span>
            </button>
          ))}
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('discover.watchlist.filterPlaceholder')}
            className="input max-w-xs flex-1"
            aria-label={t('discover.watchlist.filterAriaLabel')}
          />
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as SortKey)}
            className="input max-w-[10rem]"
            aria-label={t('discover.watchlist.sortAriaLabel')}
          >
            <option value="added">{t('discover.watchlist.sort.added')}</option>
            <option value="watched">{t('discover.watchlist.sort.watched')}</option>
            <option value="title">{t('discover.watchlist.sort.title')}</option>
            <option value="rating">{t('discover.watchlist.sort.rating')}</option>
          </select>
          <div className="ml-auto flex overflow-hidden rounded-xl border border-white/10">
            <button
              onClick={() => setView('grid')}
              className={`px-3 py-2 text-sm ${view === 'grid' ? 'bg-brand-500 text-white' : 'text-slate-300'}`}
              aria-label={t('discover.watchlist.view.gridAria')}
            >
              {t('discover.watchlist.view.grid')}
            </button>
            <button
              onClick={() => setView('list')}
              className={`px-3 py-2 text-sm ${view === 'list' ? 'bg-brand-500 text-white' : 'text-slate-300'}`}
              aria-label={t('discover.watchlist.view.listAria')}
            >
              {t('discover.watchlist.view.list')}
            </button>
          </div>
        </div>
      </div>

      {visible.length === 0 ? (
        <p className="py-10 text-center text-sm text-slate-400">{t('discover.watchlist.empty')}</p>
      ) : view === 'grid' ? (
        <div className="poster-grid">
          {visible.map((item) => (
            <div key={item.id} className="card overflow-hidden">
              <Link href={`/app/title/${item.media_type}/${item.tmdb_id}`} className="block">
                <div className="aspect-[2/3] overflow-hidden">
                  <Poster posterUrl={tmdbImage(item.poster_path, 'w342')} title={item.title} />
                </div>
              </Link>
              <div className="p-2.5">
                <div className="flex items-start justify-between gap-1.5">
                  <div className="min-w-0">
                    <div className="line-clamp-1 text-sm font-semibold text-white">{item.title}</div>
                    <div className="text-xs text-slate-400">
                      {item.year ?? '—'}
                      {item.rating ? ` · ★${item.rating}` : ''}
                    </div>
                  </div>
                  <FavStar on={item.priority >= 1} onClick={() => toggleFav(item)} />
                </div>
                <select
                  value={item.status}
                  onChange={(e) => changeStatus(item.id, e.target.value as WatchlistStatus)}
                  className="mt-2 w-full rounded-lg border border-white/10 bg-ink-900 px-2 py-1.5 text-xs text-slate-200"
                  aria-label={t('discover.watchlist.statusForAria', { title: item.title })}
                >
                  {STATUS_OPTIONS.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
                <button onClick={() => remove(item.id)} className="mt-1 w-full text-xs text-slate-500 hover:text-red-300">
                  {t('discover.watchlist.remove')}
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
                  {item.year ?? '—'} · {item.media_type === 'movie' ? t('discover.watchlist.media.movie') : t('discover.watchlist.media.tv')}
                  {item.rating ? ` · ★${item.rating}/10` : ''}
                </div>
              </div>
              <FavStar on={item.priority >= 1} onClick={() => toggleFav(item)} />
              <select
                value={item.status}
                onChange={(e) => changeStatus(item.id, e.target.value as WatchlistStatus)}
                className="rounded-lg border border-white/10 bg-ink-900 px-2 py-1.5 text-xs text-slate-200"
                aria-label={t('discover.watchlist.statusForAria', { title: item.title })}
              >
                {STATUS_OPTIONS.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
              <button onClick={() => remove(item.id)} className="text-xs text-slate-500 hover:text-red-300">
                {t('discover.watchlist.remove')}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/** A tap-to-favorite star. Filled gold when on, hollow otherwise. */
function FavStar({ on, onClick }: { on: boolean; onClick: () => void }) {
  const t = useT();
  const label = on ? t('discover.watchlist.fav.removeAria') : t('discover.watchlist.fav.addAria');
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      aria-label={label}
      title={label}
      className={`grid h-7 w-7 flex-none place-items-center rounded-md border transition ${
        on
          ? 'border-gold-400/60 bg-gold-500/20 text-gold-300'
          : 'border-white/10 bg-white/5 text-slate-500 hover:text-gold-300'
      }`}
    >
      <svg viewBox="0 0 24 24" className="h-4 w-4" fill={on ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.6" aria-hidden>
        <path d="m12 3 2.6 5.3 5.9.9-4.3 4.2 1 5.9L12 16.9 6.8 19.5l1-5.9L3.5 9.4l5.9-.9L12 3Z" strokeLinejoin="round" />
      </svg>
    </button>
  );
}
