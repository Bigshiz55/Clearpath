'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { releasesEmptyState } from '@/lib/releasesDiagnostics';
import { SaveButton } from './SaveButton';
import { QuickLook, type QuickLookTarget } from './QuickLook';
import { AlgorithmScore } from './AlgorithmScore';
import { WCheck } from './WCheck';
import { CardVerdict } from './CardVerdict';
import { TrailerMedia } from './trailer/TrailerMedia';
import { ProviderChip } from './media/ProviderChip';
import type { MediaType } from '@/lib/types';

export interface WallService {
  id: number;
  name: string;
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
  /** The primary streaming provider to badge — name + VERIFIED TMDB logo path. */
  provider?: { name: string; logoPath: string | null } | null;
}

type MediaFilter = 'all' | 'movie' | 'tv';
type WindowFilter = 'recent' | 'upcoming';
type SortFilter = 'popular' | 'new' | 'top';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
/** The provider fan-out behind this feed can legitimately take a while (see
 *  servicesFeed.ts's two-phase discover + per-title provider lookups), so
 *  this is a real ceiling on a slow request, not the aggressive few-second
 *  budget a simpler fetch could hold to — but it's still bounded: a hung
 *  request must eventually surface a real error/retry instead of leaving
 *  the loading skeleton on screen forever. */
const FETCH_TIMEOUT_MS = 20000;

/** Short, relative "how fresh" label — never a bare timestamp a viewer has to
 *  do math on, and never invented precision. */
function agoLabel(iso: string | null): string | null {
  if (!iso) return null;
  const ms = Date.now() - Date.parse(iso);
  if (!Number.isFinite(ms) || ms < 0) return null;
  if (ms < 60_000) return 'just now';
  const mins = Math.round(ms / 60_000);
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return `${days}d ago`;
}

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
  // When the fetch resolves 200 but one or more of the underlying TMDB calls
  // failed (see servicesFeed.ts's `degraded`), a THIN result must not be read
  // as "confirmed empty" — see the empty-state branch below.
  const [degraded, setDegraded] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);
  // Monotonic request id: a slower earlier fetch must never overwrite a newer
  // filter combination's results (latest state wins).
  const seqRef = useRef(0);
  // `load` is memoized on the FILTER deps only (so changing a filter — not
  // every items/loading update — is what re-triggers a fetch); reading
  // `items` through a ref instead of the state variable directly means the
  // Retry button (which calls this same memoized closure) always sees
  // what's actually on screen right now, not a stale snapshot from whenever
  // the filters last changed.
  const itemsRef = useRef<WallItem[] | null>(null);
  itemsRef.current = items;

  const load = useCallback(async () => {
    setLoading(true);
    setErrored(false);
    const mySeq = ++seqRef.current;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    try {
      const res = await fetch('/api/releases', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mediaType, window: win, sort, providerIds }),
        signal: controller.signal,
      });
      const data = await res.json();
      if (mySeq !== seqRef.current) return; // superseded by a newer request
      if (!res.ok) {
        // A REAL failure: never discard whatever was already on screen — the
        // point of "cached last-known-good" is that a failed refresh doesn't
        // blank out a perfectly good previous view.
        setErrored(true);
      } else {
        const receivedItems = (data.items ?? []) as WallItem[];
        const isDegraded = Boolean(data.degraded);
        setDegraded(isDegraded);
        // Only replace what's on screen with a thin/empty degraded result if
        // there's nothing better already showing — otherwise keep the last
        // confirmed-good set rather than regressing to "fewer/no results"
        // because of a partial upstream hiccup.
        const current = itemsRef.current;
        if (!(isDegraded && receivedItems.length === 0 && current && current.length > 0)) {
          setItems(receivedItems);
        }
        if (typeof data.updatedAt === 'string') setLastUpdated(data.updatedAt);
      }
    } catch {
      // A network error and a timed-out abort both land here — either way,
      // the honest treatment is identical: "couldn't confirm," not "empty."
      if (mySeq === seqRef.current) setErrored(true);
    } finally {
      clearTimeout(timer);
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

  const ago = agoLabel(lastUpdated);

  return (
    <div className="space-y-4">
      {/* ---- Controls ---- */}
      <div className="card space-y-3 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <Seg value={mediaType} onChange={setMediaType} options={[{ v: 'all', label: 'All' }, { v: 'movie', label: 'Movies' }, { v: 'tv', label: 'Shows' }]} />
            <Seg value={win} onChange={setWin} options={[{ v: 'recent', label: 'Out now' }, { v: 'upcoming', label: 'Upcoming' }]} />
            <Seg value={sort} onChange={setSort} options={[{ v: 'popular', label: 'Popular' }, { v: 'new', label: win === 'upcoming' ? 'Soonest' : 'Newest' }, { v: 'top', label: 'Top rated' }]} />
          </div>
          {ago && (
            <span data-testid="releases-updated" className="text-[11px] font-medium text-slate-500">
              Updated {ago}
            </span>
          )}
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
              <ProviderChip data={{ name: s.name, providerId: s.id }} withLabel />
            </button>
          ))}
          {services.length > 6 && (
            <button onClick={() => setShowAllPlatforms((v) => !v)} className="rounded-lg px-2.5 py-1 text-xs font-semibold text-brand-300 hover:text-brand-200">
              {showAllPlatforms ? 'Fewer' : `+${services.length - 6} more`}
            </button>
          )}
        </div>
      </div>

      {/* A real failure that still has a last-known-good set on screen: keep
          showing it (never blank out a working view) but disclose that the
          latest refresh didn't succeed, with its own Retry. */}
      {errored && items && items.length > 0 && (
        <div
          role="status"
          data-testid="releases-stale-banner"
          className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-400/40 bg-amber-500/10 px-3 py-2 text-xs font-medium text-amber-100"
        >
          <span>Showing the last titles we could confirm{ago ? ` (${ago})` : ''} — the latest refresh failed.</span>
          <button
            type="button"
            onClick={() => void load()}
            className="rounded-md border border-amber-400/50 bg-amber-500/15 px-2.5 py-1 font-semibold hover:bg-amber-500/25"
          >
            Retry
          </button>
        </div>
      )}
      {/* A 200 that came back thin/degraded but we still had something better
          on screen (so `items` wasn't overwritten) — same disclosure, no
          separate error state needed since nothing was lost. */}
      {!errored && degraded && items && items.length > 0 && (
        <div
          role="status"
          data-testid="releases-degraded-banner"
          className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-400/40 bg-amber-500/10 px-3 py-2 text-xs font-medium text-amber-100"
        >
          <span>Some sources didn’t respond — this list may be incomplete.</span>
          <button
            type="button"
            onClick={() => void load()}
            className="rounded-md border border-amber-400/50 bg-amber-500/15 px-2.5 py-1 font-semibold hover:bg-amber-500/25"
          >
            Refresh
          </button>
        </div>
      )}

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
              <div key={`${t.mediaType}-${t.id}`} className="card wv-tile group wv-card text-left">
                {/* The W lives on the artwork on every surface — a new release
                    goes on the docket with the same gesture as anything else. */}
                {/* TrailerMedia is the OUTER element (matches PosterCard) so its
                    inline ▶ Trailer button + player controls are SIBLINGS of the
                    QuickLook button, never nested inside it — a trailer tap plays
                    inline and never opens QuickLook. */}
                <div className="wv-card-art">
                  <WCheck tmdbId={t.id} mediaType={t.mediaType} title={t.title} year={t.year} posterUrl={t.posterUrl} />
                  <TrailerMedia tmdbId={t.id} mediaType={t.mediaType} title={t.title}>
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
                        <span className={`pointer-events-none absolute bottom-1 left-1 rounded-md px-2 py-0.5 text-[10px] font-bold backdrop-blur ${soon ? 'bg-emerald-500/85 text-white' : 'bg-black/65 text-slate-100'}`}>
                          {win === 'upcoming' ? `📅 ${label}` : label}
                        </span>
                      )}
                    </button>
                  </TrailerMedia>
                </div>
                <div className="wv-card-body">
                  <button onClick={() => setOpen({ id: t.id, mediaType: t.mediaType, title: t.title, year: t.year, posterPath: t.posterPath })} className="block text-left">
                    <div className="line-clamp-2 text-sm font-semibold text-white">{t.title}</div>
                    <div className="mt-0.5 text-xs text-slate-400">{t.year ?? '—'}</div>
                    {t.provider && (
                      <div className="mt-1">
                        <ProviderChip data={{ name: t.provider.name, logoPath: t.provider.logoPath }} withLabel />
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
                  <div className="wv-act-row mt-2" data-testid="release-actions">
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
              {(es.actions.length > 0 || es.retry) && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {es.retry && (
                    <button
                      type="button"
                      onClick={() => void load()}
                      data-testid="releases-empty-retry"
                      className="rounded-lg border border-brand-400/50 bg-brand-500/15 px-3 py-1.5 text-xs font-semibold text-brand-100 hover:bg-brand-500/25"
                    >
                      Try again
                    </button>
                  )}
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
