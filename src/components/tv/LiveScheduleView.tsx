'use client';

import { useMemo, useState } from 'react';
import type { ScheduleListing, ContentType } from '@/lib/viewing/schedule';
import type { ResultSet, RankingMethod } from '@/lib/viewing/contract';

/**
 * The Live TV result view.
 *
 * Three rules it enforces visually, matching the data layers underneath:
 *   * every valid airing in the window is reachable — filters narrow, they do
 *     not truncate, and Load more exposes the remainder;
 *   * one card may be highlighted as the top pick WITHOUT being removed from
 *     the list — it is rendered in place with a badge;
 *   * a provider failure and an empty schedule look different on screen.
 */

const PAGE_STEP = 24;

const FILTERS: { id: ContentType | 'all'; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'movie', label: 'Movies' },
  { id: 'series', label: 'TV Shows' },
  { id: 'sports', label: 'Sports' },
  { id: 'kids', label: 'Kids' },
  { id: 'news', label: 'News' },
];

const SORTS: { id: RankingMethod; label: string }[] = [
  { id: 'chronological', label: 'Soonest' },
  { id: 'best_match', label: 'Best match' },
  { id: 'highest_rated', label: 'Highest rated' },
];

function fmt(utc: string, tz: string): string {
  const t = Date.parse(utc);
  if (!Number.isFinite(t)) return '';
  return new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit', timeZone: tz })
    .format(new Date(t));
}

function airStatus(l: ScheduleListing, nowMs: number): 'live' | 'soon' | 'later' {
  const s = Date.parse(l.startUtc);
  const e = l.endUtc ? Date.parse(l.endUtc) : NaN;
  if (Number.isFinite(e) && s <= nowMs && e > nowMs) return 'live';
  return s - nowMs <= 30 * 60_000 ? 'soon' : 'later';
}

export function LiveScheduleView({
  data,
  timeZone,
  nowMs,
}: {
  data: ResultSet<ScheduleListing>;
  timeZone: string;
  nowMs: number;
}) {
  const [filter, setFilter] = useState<ContentType | 'all'>('all');
  const [sort, setSort] = useState<RankingMethod>(data.rankingMethod);
  const [shown, setShown] = useState(PAGE_STEP);

  // Counts per filter, so a tab that would be empty says so before it is clicked.
  const counts = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of data.results) {
      const k = r.contentType ?? 'other';
      m.set(k, (m.get(k) ?? 0) + 1);
    }
    return m;
  }, [data.results]);

  const view = useMemo(() => {
    const base = filter === 'all'
      ? data.results
      : data.results.filter((r) => (r.contentType ?? 'other') === filter);
    const byTime = (a: ScheduleListing, b: ScheduleListing) =>
      Date.parse(a.startUtc) - Date.parse(b.startUtc);
    const out = [...base];
    if (sort === 'highest_rated') out.sort((a, b) => (b.rating ?? -1) - (a.rating ?? -1) || byTime(a, b));
    else out.sort(byTime);
    return out;
  }, [data.results, filter, sort]);

  const topPick = data.topPickIndex != null ? data.results[data.topPickIndex] : null;

  // The highlighted pick must be ON SCREEN in the first batch. Chronological
  // order can place the best match well down the list; badging a card the user
  // has to press Load more to reach is not a recommendation. We extend the
  // initial batch to reach it rather than reordering — the schedule stays in
  // the order the user asked for, and nothing is removed.
  const topIdxInView = topPick ? view.findIndex((v) => v.listingId === topPick.listingId) : -1;
  const effectiveShown = topIdxInView >= 0 ? Math.max(shown, topIdxInView + 1) : shown;
  const visible = view.slice(0, effectiveShown);

  // A failure and an empty schedule are different screens.
  const failed = data.totalAvailable === 0 && data.statusMessage
    && !/no matching titles/i.test(data.statusMessage);

  return (
    <div className="space-y-4" data-testid="live-schedule">
      {/* Context bar: what we asked for, what came back, from where. */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm">
        <span
          className="font-semibold text-white"
          data-testid="result-count"
          data-total={data.totalAvailable}
          data-filtered={view.length}
        >
          {view.length === data.totalAvailable
            ? `${data.totalAvailable} airings`
            : `${view.length} of ${data.totalAvailable} airings`}
        </span>
        <span className="text-slate-400" data-testid="shown-count" data-shown={visible.length}>
          showing {visible.length}
        </span>
        {data.region && <span className="text-slate-400">{data.region}</span>}
        <span className="text-slate-400" data-testid="active-sort">
          sorted by {SORTS.find((s) => s.id === sort)?.label ?? sort}
        </span>
        <span
          className={`ml-auto rounded-full px-2 py-0.5 text-xs font-semibold ${
            data.status === 'healthy'
              ? 'bg-emerald-500/15 text-emerald-200'
              : 'bg-amber-500/15 text-amber-100'
          }`}
          data-testid="source-status"
        >
          {data.status}
          {data.fallbackUsed ? ' · fallback' : ''}
        </span>
      </div>

      {data.statusMessage && (
        <p
          className="rounded-xl border border-amber-400/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-100"
          data-testid="status-message"
          role={failed ? 'alert' : undefined}
        >
          {data.statusMessage}
        </p>
      )}

      {data.totalAvailable > 0 && (
        <>
          <div className="flex flex-wrap gap-2" role="group" aria-label="Filter by type">
            {FILTERS.map((f) => {
              const n = f.id === 'all' ? data.results.length : (counts.get(f.id) ?? 0);
              return (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => { setFilter(f.id); setShown(PAGE_STEP); }}
                  disabled={n === 0}
                  aria-pressed={filter === f.id}
                  data-testid={`filter-${f.id}`}
                  className={`rounded-full border px-3 py-1.5 text-sm font-semibold transition disabled:opacity-40 ${
                    filter === f.id
                      ? 'border-brand-400 bg-brand-500/20 text-white'
                      : 'border-white/15 bg-white/5 text-slate-300 hover:bg-white/10'
                  }`}
                >
                  {f.label} <span className="tabular-nums opacity-70">{n}</span>
                </button>
              );
            })}
          </div>

          <div className="flex flex-wrap gap-2" role="group" aria-label="Sort">
            {SORTS.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => setSort(s.id)}
                aria-pressed={sort === s.id}
                data-testid={`sort-${s.id}`}
                className={`rounded-lg border px-3 py-1.5 text-sm transition ${
                  sort === s.id
                    ? 'border-white/40 bg-white/15 text-white'
                    : 'border-white/15 bg-white/5 text-slate-300 hover:bg-white/10'
                }`}
              >
                {s.label}
              </button>
            ))}
          </div>

          <ul className="space-y-2" data-testid="airing-list">
            {visible.map((l) => {
              const st = airStatus(l, nowMs);
              const isTop = topPick != null && l.listingId === topPick.listingId;
              return (
                <li
                  key={l.listingId}
                  data-testid="airing-card"
                  className={`card flex items-start gap-3 p-3.5 ${isTop ? 'border-brand-400/60 bg-brand-500/10' : ''}`}
                >
                  <div className="w-20 flex-none text-center sm:w-24">
                    <div className="whitespace-nowrap text-lg font-black tabular-nums text-white">
                      {fmt(l.startUtc, timeZone)}
                    </div>
                    {l.endUtc && (
                      <div className="text-[11px] text-slate-400">
                        to {fmt(l.endUtc, timeZone)}
                      </div>
                    )}
                    <div className="mt-1.5 line-clamp-2 rounded-lg border border-brand-400/30 bg-brand-500/15 px-1.5 py-1 text-xs font-bold text-brand-100">
                      {l.channelName}
                    </div>
                    {l.channelNumber && (
                      <div className="mt-0.5 text-[10px] text-slate-500">ch {l.channelNumber}</div>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      {isTop && (
                        <span
                          className="rounded bg-brand-500/30 px-1.5 py-0.5 text-[10px] font-black uppercase tracking-wide text-brand-100"
                          data-testid="top-pick-badge"
                        >
                          Top pick
                        </span>
                      )}
                      {st === 'live' && (
                        <span className="rounded bg-red-500/25 px-1.5 py-0.5 text-[10px] font-black uppercase text-red-200">
                          On now
                        </span>
                      )}
                      {/* Only when the PROVIDER flagged it — never inferred. */}
                      {l.isNew && (
                        <span className="rounded bg-emerald-500/20 px-1.5 py-0.5 text-[10px] font-black uppercase text-emerald-200">
                          New
                        </span>
                      )}
                    </div>
                    <div className="mt-0.5 line-clamp-2 text-lg font-bold leading-snug text-white">
                      {l.title}
                    </div>
                    <div className="truncate text-xs text-slate-400">
                      {l.contentType ?? 'programme'}
                      {l.episodeTitle ? ` · ${l.episodeTitle}` : ''}
                      {l.seasonNumber && l.episodeNumber ? ` (S${l.seasonNumber}E${l.episodeNumber})` : ''}
                    </div>
                    {/* Missing rating, poster or synopsis never removes the row. */}
                    {l.rating != null && (
                      <div className="mt-1 text-sm font-bold tabular-nums text-amber-200">
                        ★ {l.rating.toFixed(1)}
                        {l.ratingSource && (
                          <span className="ml-1 text-[10px] font-normal text-slate-500">{l.ratingSource}</span>
                        )}
                      </div>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>

          {effectiveShown < view.length && (
            <button
              type="button"
              onClick={() => setShown(effectiveShown + PAGE_STEP)}
              data-testid="load-more"
              className="btn-secondary w-full"
            >
              Load more — {view.length - effectiveShown} more airings
            </button>
          )}
          {effectiveShown >= view.length && data.hasMore && (
            <p className="text-center text-xs text-slate-500" data-testid="more-server-side">
              {data.totalAvailable - data.totalReturned} further airings are available in this window.
            </p>
          )}
        </>
      )}
    </div>
  );
}
