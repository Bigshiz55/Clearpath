'use client';

import { useCallback, useEffect, useState } from 'react';
import { RatingsStrip } from './RatingsStrip';
import { SaveButton } from './SaveButton';
import { QuickLook, type QuickLookTarget } from './QuickLook';
import { CardRatings } from './CardRatings';
import type { MediaType } from '@/lib/types';

export interface WallService {
  id: number;
  name: string;
  emoji?: string;
}

interface WallItem {
  id: number;
  mediaType: MediaType;
  title: string;
  year: number | null;
  posterPath: string | null;
  posterUrl: string | null;
  releaseDate?: string | null;
}

type MediaFilter = 'all' | 'movie' | 'tv';
type WindowFilter = 'recent' | 'upcoming';
type SortFilter = 'popular' | 'new' | 'top';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** Short, human date label like "Aug 3" (no fabricated precision). */
function dateLabel(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return null;
  const month = MONTHS[Number(m[2]) - 1];
  return month ? `${month} ${Number(m[3])}` : null;
}

/** Days from today to an ISO date (positive = future). */
function daysUntil(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return null;
  return Math.round((t - Date.now()) / 86_400_000);
}

function Seg<T extends string>({
  value, onChange, options,
}: { value: T; onChange: (v: T) => void; options: { v: T; label: string }[] }) {
  return (
    <div className="inline-flex rounded-lg border border-white/12 bg-white/5 p-0.5">
      {options.map((o) => (
        <button
          key={o.v}
          onClick={() => onChange(o.v)}
          className={`rounded-md px-3 py-1.5 text-sm font-semibold transition ${
            value === o.v ? 'bg-brand-500 text-white shadow-glow' : 'text-slate-300 hover:text-white'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function ReleaseWall({
  services,
  myServiceIds,
}: {
  services: WallService[];
  myServiceIds: number[];
}) {
  const [mediaType, setMediaType] = useState<MediaFilter>('all');
  const [win, setWin] = useState<WindowFilter>('recent');
  const [sort, setSort] = useState<SortFilter>('popular');
  const [providerIds, setProviderIds] = useState<number[]>([]);
  const [showAllPlatforms, setShowAllPlatforms] = useState(false);

  const [items, setItems] = useState<WallItem[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState<QuickLookTarget | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/releases', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mediaType, window: win, sort, providerIds }),
      });
      const data = await res.json();
      setItems(data.items ?? []);
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [mediaType, win, sort, providerIds]);

  useEffect(() => {
    void load();
  }, [load]);

  const hasMine = myServiceIds.length > 0;
  const onMine = hasMine && myServiceIds.every((id) => providerIds.includes(id)) && providerIds.length === myServiceIds.length;

  function toggleProvider(id: number) {
    setProviderIds((prev) => (prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id]));
  }
  const shownServices = showAllPlatforms ? services : services.slice(0, 6);

  return (
    <div className="space-y-4">
      {/* ---- Controls ---- */}
      <div className="card space-y-3 p-4">
        <div className="flex flex-wrap items-center gap-2">
          <Seg value={mediaType} onChange={setMediaType} options={[{ v: 'all', label: 'All' }, { v: 'movie', label: 'Movies' }, { v: 'tv', label: 'Shows' }]} />
          <Seg value={win} onChange={setWin} options={[{ v: 'recent', label: 'Out now' }, { v: 'upcoming', label: 'Upcoming' }]} />
          <Seg value={sort} onChange={setSort} options={[{ v: 'popular', label: 'Popular' }, { v: 'new', label: win === 'upcoming' ? 'Soonest' : 'Newest' }, { v: 'top', label: 'Top rated' }]} />
        </div>

        {/* Platform filter — cover every service, plus a one-tap "my services". */}
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="mr-1 text-xs font-semibold uppercase tracking-wide text-slate-400">Platform</span>
          <button
            onClick={() => setProviderIds([])}
            className={`rounded-lg border px-2.5 py-1 text-xs font-semibold transition ${providerIds.length === 0 ? 'border-brand-400/60 bg-brand-500/20 text-brand-100' : 'border-white/12 bg-white/5 text-slate-300 hover:bg-white/10'}`}
          >
            All platforms
          </button>
          {hasMine && (
            <button
              onClick={() => setProviderIds(onMine ? [] : myServiceIds)}
              className={`rounded-lg border px-2.5 py-1 text-xs font-semibold transition ${onMine ? 'border-emerald-400/50 bg-emerald-500/15 text-emerald-100' : 'border-white/12 bg-white/5 text-slate-300 hover:bg-white/10'}`}
            >
              ✅ My services
            </button>
          )}
          {shownServices.map((s) => (
            <button
              key={s.id}
              onClick={() => toggleProvider(s.id)}
              className={`rounded-lg border px-2.5 py-1 text-xs font-semibold transition ${providerIds.includes(s.id) ? 'border-brand-400/60 bg-brand-500/20 text-brand-100' : 'border-white/12 bg-white/5 text-slate-300 hover:bg-white/10'}`}
            >
              {s.emoji ? `${s.emoji} ` : ''}{s.name}
            </button>
          ))}
          {services.length > 6 && (
            <button onClick={() => setShowAllPlatforms((v) => !v)} className="rounded-lg px-2.5 py-1 text-xs font-semibold text-brand-300 hover:text-brand-200">
              {showAllPlatforms ? 'Fewer' : `+${services.length - 6} more`}
            </button>
          )}
        </div>
      </div>

      {/* ---- Grid ---- */}
      {loading && items == null ? (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
          {Array.from({ length: 12 }).map((_, i) => (
            <div key={i} className="aspect-[2/3] animate-pulse rounded-2xl bg-white/5" />
          ))}
        </div>
      ) : items && items.length > 0 ? (
        <div className={`grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 ${loading ? 'opacity-60' : ''}`}>
          {items.map((t) => {
            const label = dateLabel(t.releaseDate);
            const d = daysUntil(t.releaseDate);
            const soon = win === 'upcoming' && d != null && d <= 14;
            return (
              <div key={`${t.mediaType}-${t.id}`} className="card group relative h-full overflow-hidden text-left transition hover:border-white/20 hover:shadow-glow">
                <button
                  onClick={() => setOpen({ id: t.id, mediaType: t.mediaType, title: t.title, year: t.year, posterPath: t.posterPath })}
                  className="relative block aspect-[2/3] w-full overflow-hidden"
                  aria-label={`Quick look at ${t.title}`}
                >
                  {t.posterUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={t.posterUrl} alt="" loading="lazy" className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.04]" />
                  ) : (
                    <div className="grid h-full w-full place-items-center bg-gradient-to-br from-ink-700 to-ink-850 p-2 text-center text-[11px] text-slate-400">{t.title}</div>
                  )}
                  <span className="pointer-events-none absolute left-2 top-2 rounded-md bg-black/60 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-200 backdrop-blur">
                    {t.mediaType === 'movie' ? 'Movie' : 'TV'}
                  </span>
                  {label && (
                    <span className={`pointer-events-none absolute bottom-2 left-2 rounded-md px-2 py-0.5 text-[10px] font-bold backdrop-blur ${soon ? 'bg-emerald-500/85 text-white' : 'bg-black/65 text-slate-100'}`}>
                      {win === 'upcoming' ? `📅 ${label}` : label}
                    </span>
                  )}
                  <span className="pointer-events-none absolute inset-0 grid place-items-center bg-black/0 opacity-0 transition group-hover:bg-black/30 group-hover:opacity-100">
                    <span className="grid h-11 w-11 place-items-center rounded-full bg-white/90 text-lg text-ink-950">▶</span>
                  </span>
                </button>
                <div className="absolute right-2 top-2 z-10">
                  <SaveButton tmdbId={t.id} mediaType={t.mediaType} title={t.title} year={t.year} posterPath={t.posterPath} />
                </div>
                <div className="p-3">
                  <button onClick={() => setOpen({ id: t.id, mediaType: t.mediaType, title: t.title, year: t.year, posterPath: t.posterPath })} className="block text-left">
                    <div className="line-clamp-2 text-sm font-semibold text-white">{t.title}</div>
                    <div className="mt-0.5 text-xs text-slate-400">{t.year ?? '—'}</div>
                  </button>
                  <CardRatings mediaType={t.mediaType} tmdbId={t.id} title={t.title} year={t.year} className="mt-1.5" />
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <p className="text-sm text-slate-400">
          {win === 'upcoming'
            ? 'No upcoming titles match these filters yet. Try “All platforms”, or switch back to Out now.'
            : 'Nothing matched these filters. Try “All platforms” or a different sort.'}
        </p>
      )}

      {open && <QuickLook target={open} onClose={() => setOpen(null)} />}
    </div>
  );
}
