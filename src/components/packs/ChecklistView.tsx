'use client';

import { useMemo, useState } from 'react';
import { Poster } from '@/components/PosterCard';
import { SeenToggle } from './SeenToggle';
import type { ChecklistItem } from '@/lib/packs/types';

type Filter = 'all' | 'watched' | 'unwatched';

/**
 * My Checklist — every programme on a Pack's stations, fast to mark watched
 * from a phone. Filters are Watched/Unwatched plus real genre tags from the
 * provider — no invented thematic buckets ("Christmas in July") without data
 * to back them.
 */
export function ChecklistView({ items, packSlug, signedIn }: { items: ChecklistItem[]; packSlug: string; signedIn: boolean }) {
  const [filter, setFilter] = useState<Filter>('all');
  const [genre, setGenre] = useState<string | null>(null);

  const genres = useMemo(() => [...new Set(items.flatMap((i) => i.genres))].sort(), [items]);

  const watchedCount = items.filter((i) => i.seen).length;

  const filtered = items.filter((i) => {
    if (filter === 'watched' && !i.seen) return false;
    if (filter === 'unwatched' && i.seen) return false;
    if (genre && !i.genres.includes(genre)) return false;
    return true;
  });

  const chip = (active: boolean) =>
    `min-h-[36px] rounded-full border px-3.5 text-sm font-semibold transition ${
      active ? 'border-brand-400/60 bg-brand-500/25 text-brand-100' : 'border-white/15 bg-white/[0.04] text-slate-300 hover:border-white/30'
    }`;

  return (
    <div className="space-y-3">
      {signedIn && (
        <p className="text-sm font-semibold text-slate-300">
          Watched {watchedCount} of {items.length}
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={() => setFilter('all')} className={chip(filter === 'all')}>All</button>
        <button type="button" onClick={() => setFilter('unwatched')} className={chip(filter === 'unwatched')}>Want to watch</button>
        <button type="button" onClick={() => setFilter('watched')} className={chip(filter === 'watched')}>Watched</button>
      </div>

      {genres.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {genres.map((g) => (
            <button
              key={g}
              type="button"
              onClick={() => setGenre(genre === g ? null : g)}
              className={`min-h-[30px] rounded-full border px-2.5 text-xs font-semibold transition ${
                genre === g ? 'border-[#ff1493]/60 bg-[#ff1493]/20 text-pink-100' : 'border-white/10 bg-white/[0.03] text-slate-400 hover:border-white/25'
              }`}
            >
              {g}
            </button>
          ))}
        </div>
      )}

      {filtered.length === 0 ? (
        <p className="rounded-xl border border-white/10 bg-white/[0.03] p-4 text-sm text-slate-400">
          Nothing matches that filter.
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((item) => (
            <div key={item.programmeId} className="flex items-center gap-3 rounded-lg border border-white/10 bg-white/[0.03] p-2.5">
              <div className="h-16 w-11 flex-shrink-0 overflow-hidden rounded bg-ink-800">
                <Poster posterUrl={item.posterUrl} title={item.title} />
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-white">{item.title}</p>
                <p className="truncate text-[12px] text-slate-400">
                  {item.releaseYear ?? ''}
                  {item.genres.length > 0 ? ` · ${item.genres.slice(0, 2).join(', ')}` : ''}
                </p>
              </div>
              {signedIn && (
                <SeenToggle subjectType="programme" subjectId={item.programmeId} packSlug={packSlug} initialSeen={item.seen} />
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
