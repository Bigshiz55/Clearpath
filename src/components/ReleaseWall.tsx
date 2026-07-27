'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { releasesEmptyState } from '@/lib/releasesDiagnostics';
import { SaveButton } from './SaveButton';
import { QuickLook, type QuickLookTarget } from './QuickLook';
import { AlgorithmScore } from './AlgorithmScore';
import { WCheck } from './WCheck';
import { CardVerdict } from './CardVerdict';
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
  network?: string | null;
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
  const [errored, setErrored] = useState(false);
  // Monotonic request id: a slower earlier fetch must never overwrite a newer
  // filter combination's results (latest state wins).
  const seqRef = useRef(0);

  const load = useCallback(async () => {
    setLoading(true);
    setErrored(false);
    const mySeq = ++seqRef.current;
    try {
      const res = await fetch('/api/releases', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mediaType, window: win, sort, providerIds }),
      });
      const data = await res.json();
      if (mySeq !== seqRef.current) return; // superseded by a newer request
      if (!res.ok) { setErrored(true); setItems([]); }
      else setItems(data.items ?? []);
    } catch {
      if (mySeq === seqRef.current) { setErrored(true); setItems([]); }
    } finally {
      if (mySeq === seqRef.current) setLoading(false);
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
        <div className="poster-grid">
          {Array.from({ length: 12 }).map((_, i) => (
            <div key={i} className="h-[13rem] animate-pulse rounded-2xl bg-white/5 sm:aspect-[2/3] sm:h-auto" />
          ))}
        </div>
      ) : items && items.length > 0 ? (
        <div className={`poster-grid ${loading ? 'opacity-60' : ''}`}>
          {items.map((t) => {
            const label = dateLabel(t.releaseDate);
            const d = daysUntil(t.releaseDate);
            const soon = win === 'upcoming' && d != null && d <= 14;
            return (
              <div key={`${t.mediaType}-${t.id}`} className="card group wv-card text-left transition hover:border-white/20 hover:shadow-glow">
                {/* The W lives on the artwork on every surface — a new release
                    goes on the docket with the same gesture as anything else. */}
                <div className="wv-card-art">
                  <WCheck tmdbId={t.id} mediaType={t.mediaType} title={t.title} year={t.year} posterUrl={t.posterUrl} />
                <button
                  onClick={() => setOpen({ id: t.id, mediaType: t.mediaType, title: t.title, year: t.year, posterPath: t.posterPath })}
                  className="block h-full w-full"
                  aria-label={`Quick look at ${t.title}`}
                >
                  {t.posterUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={t.posterUrl} alt="" loading="lazy" className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.04]" />
                  ) : (
                    <div className="grid h-full w-full place-items-center bg-gradient-to-br from-ink-700 to-ink-850 p-2 text-center text-[11px] text-slate-400">{t.title}</div>
                  )}
                  {label && (
                    <span className={`pointer-events-none absolute bottom-2 left-2 rounded-md px-2 py-0.5 text-[10px] font-bold backdrop-blur ${soon ? 'bg-emerald-500/85 text-white' : 'bg-black/65 text-slate-100'}`}>
                      {win === 'upcoming' ? `📅 ${label}` : label}
                    </span>
                  )}
                  <span className="pointer-events-none absolute inset-0 grid place-items-center bg-black/0 opacity-0 transition group-hover:bg-black/30 group-hover:opacity-100">
                    <span className="grid h-11 w-11 place-items-center rounded-full bg-white/90 text-lg text-ink-950">▶</span>
                  </span>
                </button>
                </div>
                <div className="wv-card-body">
                  <button onClick={() => setOpen({ id: t.id, mediaType: t.mediaType, title: t.title, year: t.year, posterPath: t.posterPath })} className="block text-left">
                    <div className="line-clamp-2 text-sm font-semibold text-white">{t.title}</div>
                    <div className="mt-0.5 text-xs text-slate-400">{t.year ?? '—'}</div>
                    {t.network && (
                      <div className="mt-1 inline-flex max-w-full items-center gap-1 rounded-md border border-brand-400/50 bg-brand-500/20 px-2 py-1 text-xs font-bold text-brand-100">
                        <span aria-hidden>📺</span>
                        <span className="truncate">{t.network}</span>
                      </div>
                    )}
                  </button>
                  <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide text-slate-400">
                    <span className="rounded bg-white/10 px-1.5 py-0.5">{t.mediaType === 'movie' ? 'Movie' : 'TV'}</span>
                    {label && <span data-testid="release-date">{label}</span>}
                  </div>
                  <AlgorithmScore mediaType={t.mediaType} tmdbId={t.id} title={t.title} year={t.year} className="mt-2" />
                  {/* Actions sit with the information they act on, rather than in
                      a toolbar above the artwork. Save is the ordinary watchlist
                      save; FOR / AGAINST teach the DNA and say so.
                      NONE of them take the card out of the wall. Removing a tile
                      reflowed every tile after it, and it took the undo with it —
                      each control now shows its own state in place and can be
                      tapped again to reverse it. */}
                  <div className="mt-2 flex flex-wrap items-center gap-1.5" data-testid="release-actions">
                    {/* FOR · AGAINST · SAVE, in that order, on every surface.
                        Save came first here, so the verdict pair was split and
                        the same three controls sat in a different sequence from
                        every other card — muscle memory from one grid tapped
                        the wrong thing on the next. */}
                    <CardVerdict
                      tmdbId={t.id}
                      mediaType={t.mediaType}
                      title={t.title}
                      year={t.year}
                      posterPath={t.posterPath}
                    />
                    <SaveButton
                      wide
                      tmdbId={t.id}
                      mediaType={t.mediaType}
                      title={t.title}
                      year={t.year}
                      posterPath={t.posterPath}
                    />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        (() => {
          // Diagnostic empty state: distinguish an UNSUPPORTED combination
          // (upcoming + a provider filter, which TMDB can't verify) from genuine
          // no-data and from an API error — each with truthful recovery actions.
          const es = releasesEmptyState({ window: win, providerIds, itemCount: 0, errored });
          return (
            <div className="text-sm text-slate-400" role="status" data-testid="releases-empty" data-reason={es.reason}>
              <p>{es.message}</p>
              {es.actions.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {es.actions.map((a) => (
                    <button
                      key={a.label}
                      type="button"
                      onClick={() => {
                        if (a.patch.providerIds !== undefined) setProviderIds(a.patch.providerIds);
                        if (a.patch.window !== undefined) setWin(a.patch.window);
                      }}
                      className="rounded-lg border border-brand-400/50 bg-brand-500/15 px-3 py-1.5 text-xs font-semibold text-brand-100 hover:bg-brand-500/25"
                    >
                      {a.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          );
        })()
      )}

      {open && <QuickLook target={open} onClose={() => setOpen(null)} />}
    </div>
  );
}
