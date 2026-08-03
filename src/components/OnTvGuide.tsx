'use client';

import { useEffect, useMemo, useState } from 'react';
import { airingStatus, displayClock, liveLabel, stillJoinable } from '@/lib/viewing/clock';
import { dayLabel, longDayLabel } from '@/lib/viewing/localDay';
import { tmdbImage, type TmdbImageSize } from '@/lib/tmdb/image';

/** Poster art comes from the canonical TMS CDN; if it fails to load, swap to the
 *  mirror once, then give up (hide) so we never loop or show a broken icon. */
function posterFallback(e: React.SyntheticEvent<HTMLImageElement>): void {
  const img = e.currentTarget;
  if (img.src.includes('zap2it.tmsimg.com')) {
    img.src = img.src.replace('zap2it.tmsimg.com', 'demo.tmsimg.com');
    return;
  }
  img.style.display = 'none';
}

/** The card poster: the listing's own art (Gracenote/TVmaze), else the TMDB
 *  poster once the title has been resolved — so cable movies still get a placard
 *  even when the channel's feed carries no thumbnail. */
function posterSrcFor(a: { image: string | null; posterPath?: string | null }, size: TmdbImageSize = 'w342'): string | null {
  return a.image ?? tmdbImage(a.posterPath ?? null, size);
}
import Link from 'next/link';
import { setTvReminder, removeTvReminder } from '@/lib/actions/tvReminders';
import { SaveButton } from '@/components/SaveButton';
import { CardVerdict } from '@/components/CardVerdict';
import { SignalIcon } from '@/components/RemindButton';
import { WCheck } from '@/components/WCheck';
import { groupByShow, repeatNote } from '@/lib/tvHighlights';
import { CardDna } from '@/components/CardDna';
import { Radio, Popcorn, Sparkles } from 'lucide-react';
import type { Airing } from '@/lib/onTv';

type TimeFilter = 'all' | 'primetime' | 'nownext';
type SortFilter = 'time' | 'rating';
export type GuideMode = 'broadcast' | 'streaming';

/**
 * The clock label for an airing, IN THE VIEWER'S OWN ZONE.
 *
 * `a.time` is a pre-formatted string from the provider, in the NETWORK's
 * timezone (Eastern, for both Gracenote and TVmaze's US grid). Printing it to
 * everybody meant a Pacific viewer saw "3:42 AM" for something starting in
 * forty minutes — a time that reads as already past, and that contradicted the
 * "next 2 hours" heading above it. The window was always computed on the real
 * instant; only the label was wrong.
 *
 * `suppressHydrationWarning` on the elements below: the server renders in its
 * own zone (UTC) and the browser corrects on hydration. That is the intended
 * behaviour for a wall-clock time, not a mismatch to fix.
 */
function fmtTime(airstamp: string | null | undefined, providerTime: string): string | null {
  return displayClock(airstamp, providerTime);
}

/* "Today" / "Tomorrow" / weekday now comes from the shared `localDay` module —
   see the import above. It compares CALENDAR days rather than adding 24h, so a
   daylight-saving day (23 or 25 hours long) cannot move the answer, and every
   surface in the app derives the words from the same function. */

/** A Google Calendar "add event" link so the reminder is real — the user can
 *  actually set their DVR or tune in. Built from the true airstamp + runtime. */
function calendarUrl(a: Airing): string {
  const start = new Date(a.airstamp);
  const end = new Date(start.getTime() + (a.runtime ?? 60) * 60_000);
  const z = (d: Date) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const text = encodeURIComponent(`${a.showName} on ${a.network}`);
  const details = encodeURIComponent(
    `${a.episodeName ? `"${a.episodeName}" · ` : ''}${a.showType}${a.genres.length ? ` · ${a.genres.join(', ')}` : ''}\nOn ${a.network}. Added from WatchVerd1ct.`,
  );
  return `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${text}&dates=${z(start)}/${z(end)}&details=${details}`;
}

function ratingTone(r: number): string {
  if (r >= 8) return 'text-emerald-300';
  if (r >= 6.5) return 'text-gold-300';
  return 'text-slate-300';
}

const NOISE_TYPES = new Set(['News', 'Talk Show', 'Variety']);

export function OnTvGuide({
  airings,
  dateLabel,
  dateIso = null,
  country,
  mode = 'broadcast',
  remindedIds = [],
  windowHours = null,
}: {
  airings: Airing[];
  /** Fallback label for surfaces that already have a non-date caption
   *  ("Next 6 hours"). When `dateIso` is set, THAT wins — see below. */
  dateLabel: string;
  /** The instant the caption is about. Formatted HERE, in the browser, so the
   *  header cannot say "Tuesday, Jul 29" over rows that say "Today": a server
   *  render freezes the date in the server's zone (UTC on Vercel), which at
   *  6pm in California is already the next day. */
  dateIso?: string | null;
  country: string;
  mode?: GuideMode;
  remindedIds?: number[];
  /** When set, `airings` is already filtered to [now, now+N h]; present it as a
   *  soonest-first "coming on in the next N hours" view (no prime-time filter). */
  windowHours?: number | null;
}) {
  const streaming = mode === 'streaming';
  const windowed = windowHours != null;
  const [reminded, setReminded] = useState<Set<number>>(new Set(remindedIds));
  const [busy, setBusy] = useState<number | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function toggleReminder(a: Airing) {
    setBusy(a.id);
    try {
      if (reminded.has(a.id)) {
        await removeTvReminder(a.id);
        setReminded((s) => {
          const n = new Set(s);
          n.delete(a.id);
          return n;
        });
      } else {
        const res = await setTvReminder({ airingId: a.id, showName: a.showName, network: a.network, airstamp: a.airstamp, url: '/app/tv' });
        if (!res.ok) {
          setNotice(res.error ?? 'Could not set the reminder.');
          return;
        }
        setReminded((s) => new Set(s).add(a.id));
        setNotice(
          res.needsNotifications
            ? 'Reminder set! Turn on notifications in Settings so we can ping you 1 hour and 5 minutes before.'
            : 'Reminder set — we’ll ping you 1 hour and 5 minutes before it starts.',
        );
      }
    } catch {
      setNotice('Something went wrong. Please try again.');
    } finally {
      setBusy(null);
    }
  }
  const [time, setTime] = useState<TimeFilter>(streaming || windowed ? 'all' : 'primetime');
  // "Now" for the live/upcoming split. Set on mount and ticked every minute, so
  // a card that starts while you are looking at it flips to "On now" instead of
  // sitting there with a time that has quietly passed. Rendering it on the
  // SERVER would freeze it at request time, which is how a stale label survives.
  const [nowMs, setNowMs] = useState<number>(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNowMs(Date.now()), 60_000);
    return () => window.clearInterval(id);
  }, []);
  const [sort, setSort] = useState<SortFilter>(streaming ? 'rating' : 'time');
  const [media, setMedia] = useState<'all' | 'movie' | 'tv'>('all');

  const nowMin = useMemo(() => {
    const d = new Date();
    return d.getHours() * 60 + d.getMinutes();
  }, []);

  const filtered = useMemo(() => {
    let list = airings;
    if (media === 'movie') list = list.filter((a) => a.showType === 'Movie');
    else if (media === 'tv') list = list.filter((a) => a.showType !== 'Movie');
    if (!streaming) {
      if (time === 'primetime') list = list.filter((a) => a.minutes >= 18 * 60 && a.minutes <= 23 * 60);
      else if (time === 'nownext') list = list.filter((a) => a.minutes >= nowMin - 30);
    }
    const sorted = [...list];
    if (sort === 'rating') sorted.sort((a, b) => (b.rating ?? -1) - (a.rating ?? -1));
    else sorted.sort((a, b) => a.minutes - b.minutes);
    return sorted;
  }, [airings, time, sort, nowMin, streaming, media]);

  // Highlights — best-rated picks (prime-time for broadcast; overall for streaming).
  // In windowed mode the airings are already the curated next-N-hours set, so we
  // keep them soonest-first (their given order) rather than re-filtering to prime time.
  const highlightPool = useMemo(() => {
    // Windowed mode used to cap at 10 here AND the highlight strip cut that to
    // 6, so a healthy schedule could never show more than six cards up top no
    // matter how much real inventory arrived. The window set is already the
    // curated result; show it all and let the list below carry the rest.
    // `stillJoinable` re-checks against the ticking clock: the server filtered
    // the set at request time, but a tab left open (or a cached render) can
    // outlive that — a card whose show is now mostly over quietly leaves the
    // strip instead of advertising a start time hours in the past.
    if (windowed) return airings.filter((a) => !NOISE_TYPES.has(a.showType) && stillJoinable(a.airstamp, a.runtime, nowMs));
    return airings
      .filter((a) => !NOISE_TYPES.has(a.showType) && a.rating != null && (streaming || (a.minutes >= 18 * 60 && a.minutes <= 23 * 60)))
      .sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0))
      .slice(0, 10);
  }, [airings, streaming, windowed, nowMs]);
  // ONE CARD PER SHOW. A back-to-back double bill — "World War II with Tom
  // Hanks" at 8:00 and again at 9:00 — took two of six highlight slots to name
  // one programme. The extra showings are kept, not dropped, so a card can say
  // "also at 9:00" rather than quietly losing a time somebody was planning
  // around. The full list below still carries every airing; that IS the
  // schedule, and this only governs the shortlist.
  const highlightGroups = useMemo(() => groupByShow(highlightPool), [highlightPool]);
  const alsoAiring = useMemo(
    () => new Map(highlightGroups.map((g) => [g.pick.id, g.others])),
    [highlightGroups],
  );
  const highlightVisible = useMemo(() => highlightGroups.map((g) => g.pick), [highlightGroups]);
  const highlights = windowed ? highlightVisible : highlightVisible.slice(0, 6);

  if (airings.length === 0) {
    return (
      <div className="card p-6 text-center">
        <div className="grid place-items-center text-slate-400">{streaming ? <Popcorn size={28} aria-hidden /> : <Radio size={28} aria-hidden />}</div>
        <h2 className="mt-3 text-lg font-semibold text-white">
          {streaming ? 'No major streaming premieres today' : 'No listings right now'}
        </h2>
        <p className="mx-auto mt-1 max-w-md text-sm text-slate-400">
          {streaming
            ? 'Nothing new dropped on the big services today — check back tomorrow.'
            : `We couldn’t load today’s ${country} broadcast schedule. It refreshes hourly — check back shortly.`}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {notice && (
        <div className="flex items-center justify-between gap-3 rounded-xl border border-brand-400/40 bg-brand-500/10 px-4 py-3 text-sm text-brand-100">
          <span>{notice}</span>
          <span className="flex flex-none items-center gap-3">
            {notice.includes('Settings') && <Link href="/app/settings" className="font-bold underline">Turn on</Link>}
            <button onClick={() => setNotice(null)} aria-label="Dismiss" className="text-lg leading-none text-slate-300 hover:text-white">×</button>
          </span>
        </div>
      )}
      {/* Highlights. In windowed mode the PAGE's H1 already says "Coming on in
          the next N hours" — repeating it here as an H2 with its own explainer
          printed the same sentence twice and pushed the first card row below
          the fold. The strip starts straight at the cards; the other modes
          keep their (non-duplicated) headings. */}
      {highlights.length > 0 && (
        <section>
          {!windowed && (
            <h2 className="mb-2 flex items-center gap-2 text-lg font-semibold text-white">
              <Sparkles size={16} className="text-slate-400" aria-hidden />
              {streaming ? 'Best of today’s drops' : 'Tonight’s highlights'}
            </h2>
          )}
          {!windowed && (
            <p className="mb-3 text-xs text-slate-400">
              {streaming ? 'Highest-rated premieres on the major services' : 'Best-reviewed shows in prime time'} — rating
              is TVmaze’s community score.
            </p>
          )}
          {/* THE SHARED CARD SHAPE, not a third copy of one.
              This strip drew TWO columns on a phone with a hand-rolled card. At
              390px that made each cell ~173px, and an action row inside it had
              ~157px for FOR · AGAINST · SAVE — about 48px a button for a word
              that measures 57. The row is now the full width of the card and
              the card is `.poster-grid` + `.wv-card`: a row on a phone (poster
              at a third of the width, the facts beside it), a column from `sm`,
              exactly like every other grid in the app. */}
          <div className="poster-grid" data-testid="tv-highlights">
            {highlights.map((a) => {
              const posterSrc = posterSrcFor(a);
              const poster = posterSrc ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={posterSrc} alt="" loading="lazy" onError={posterFallback} className="h-full w-full object-cover" />
              ) : (
                <div className="grid h-full w-full place-items-center p-2 text-center text-[11px] text-slate-400">{a.showName}</div>
              );
              const resolved = a.tmdbId != null && a.mediaType != null;
              return (
                <div key={a.id} className="card wv-tile flex flex-col overflow-hidden">
                  <div className="wv-card flex-1">
                    {/* The W, on the artwork, exactly where it is on every other
                        card — so putting an airing on the docket is the same
                        gesture as putting a poster on it. */}
                    <div className="wv-card-art wv-art-video bg-ink-800">
                      {resolved && (
                        <WCheck tmdbId={a.tmdbId!} mediaType={a.mediaType!} title={a.showName} year={a.year ?? null} posterUrl={a.image ?? null} />
                      )}
                      {resolved ? (
                        <Link href={`/app/title/${a.mediaType}/${a.tmdbId}`} className="block h-full">{poster}</Link>
                      ) : (
                        poster
                      )}
                    </div>
                    <div className="wv-card-body">
                      <div className="line-clamp-2 text-sm font-semibold leading-snug text-white">{a.showName}</div>
                      <div className="mt-1 flex items-center justify-between gap-1">
                        {(() => {
                          // A start time in the past under "coming on" reads as
                          // stale data. If it's running, the card says so — the
                          // same label the list rows use.
                          const st = streaming ? null : airingStatus(a.airstamp, a.runtime, nowMs);
                          if (st?.state === 'live') {
                            return (
                              <span suppressHydrationWarning data-testid="airing-live" className="truncate rounded-md bg-emerald-500/20 px-1.5 py-0.5 text-[11px] font-black uppercase tracking-wide text-emerald-200">
                                {liveLabel(st.startedMinutesAgo)}
                              </span>
                            );
                          }
                          return (
                            <span suppressHydrationWarning className="truncate text-base font-black tabular-nums text-white">{a.minutes > 0 ? fmtTime(a.airstamp, a.time) ?? 'Today' : streaming ? 'Today' : 'New'}</span>
                          );
                        })()}
                        {a.rating != null && <span className={`flex-none text-sm font-bold ${ratingTone(a.rating)}`}>★ {a.rating.toFixed(1)}</span>}
                      </div>
                      {/* The showings this card stands in for. Deduping the strip
                          must not lose a time somebody could have watched. */}
                      {(() => {
                        const note = repeatNote((alsoAiring.get(a.id) ?? []).map((o) => fmtTime(o.airstamp, o.time)));
                        return note ? (
                          <div suppressHydrationWarning className="mt-0.5 truncate text-[11px] font-semibold text-slate-400" data-testid="also-airing">
                            {note}
                          </div>
                        ) : null;
                      })()}
                      {(a.criticRt != null || a.criticImdb != null) && (
                        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] font-bold tabular-nums">
                          {a.criticRt != null && <span className={a.criticRt >= 60 ? 'text-red-300' : 'text-emerald-300'} title="Rotten Tomatoes">🍅 {a.criticRt}%</span>}
                          {a.criticImdb != null && <span className="rounded bg-[#f5c518] px-1 text-[10px] font-black text-black" title="IMDb">IMDb {a.criticImdb.toFixed(1)}</span>}
                        </div>
                      )}
                      <div className="mt-1 line-clamp-1 rounded border border-brand-400/30 bg-brand-500/15 px-1 py-0.5 text-[11px] font-bold leading-tight text-brand-100">{a.network}</div>
                      {resolved && <CardDna mediaType={a.mediaType!} tmdbId={a.tmdbId!} className="mt-1.5" />}
                      {/* THE DECISION ROW, BELOW THE TITLE — and only on a card
                          that resolved to a real title. An unresolved listing
                          used to reserve this slot with a "Not matched to a
                          title yet" box, which put an internal pipeline state
                          on nearly every broadcast card; there is nothing to
                          rule on there, so nothing renders. */}
                      {resolved && (
                        <div className="wv-act-row mt-2 border-t border-white/10 pt-2">
                          <CardVerdict tmdbId={a.tmdbId!} mediaType={a.mediaType!} title={a.showName} year={a.year ?? null} posterPath={a.posterPath ?? null} />
                          <SaveButton wide tmdbId={a.tmdbId!} mediaType={a.mediaType!} title={a.showName} year={a.year ?? null} posterPath={a.posterPath ?? null} />
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Controls */}
      <div className="card space-y-3 p-4">
        <div className="flex flex-wrap items-center gap-2">
          {!streaming && !windowed && (
            <div className="inline-flex rounded-lg border border-white/12 bg-white/5 p-0.5">
              {([['primetime', 'Prime time'], ['nownext', 'Now & next'], ['all', 'All day']] as const).map(([v, label]) => (
                <button key={v} onClick={() => setTime(v)} className={`rounded-md px-3 py-1.5 text-sm font-semibold transition ${time === v ? 'bg-brand-500 text-white shadow-glow' : 'text-slate-300 hover:text-white'}`}>{label}</button>
              ))}
            </div>
          )}
          <div className="inline-flex rounded-lg border border-white/12 bg-white/5 p-0.5">
            {([['all', 'All'], ['movie', 'Movies'], ['tv', 'Shows']] as const).map(([v, label]) => (
              <button key={v} onClick={() => setMedia(v)} className={`rounded-md px-3 py-1.5 text-sm font-semibold transition ${media === v ? 'bg-brand-500 text-white shadow-glow' : 'text-slate-300 hover:text-white'}`}>{label}</button>
            ))}
          </div>
          <div className="inline-flex rounded-lg border border-white/12 bg-white/5 p-0.5">
            {([['time', streaming ? 'Default' : 'By time'], ['rating', 'Top rated']] as const).map(([v, label]) => (
              <button key={v} onClick={() => setSort(v)} className={`rounded-md px-3 py-1.5 text-sm font-semibold transition ${sort === v ? 'bg-brand-500 text-white shadow-glow' : 'text-slate-300 hover:text-white'}`}>{label}</button>
            ))}
          </div>
        </div>
        <div suppressHydrationWarning className="text-[11px] text-slate-400">
          {(dateIso ? longDayLabel(dateIso, nowMs) : '') || dateLabel} · {filtered.length} {streaming ? 'premiere' : 'airing'}{filtered.length === 1 ? '' : 's'}
          {!streaming && ' · times shown in your local time'}.
        </div>
      </div>

      {/* List — SAME `.poster-grid` + `.wv-card` tile shape as the highlights
          strip above, not a second hand-rolled row layout. This used to be a
          five-column `.wv-tv-row` grid stacked one per line: on a wide screen
          that meant one card's worth of information per full-width row, and
          only the highlight strip actually used the real estate. The extra
          facts the row carried that the strip doesn't — Remind/Calendar,
          the day label, episode/season, and an honest "no ratings yet" line
          when we hold nothing — are folded into the same card body below the
          network chip, so nothing that was visible before is lost. */}
      {filtered.length === 0 ? (
        <p className="text-sm text-slate-400">
          Nothing on right now for that view — try a different time window or type.
        </p>
      ) : (
        <div className="poster-grid" data-testid="tv-list">
          {filtered.map((a) => {
            const t = fmtTime(a.airstamp, a.time);
            const status = airingStatus(a.airstamp, a.runtime, nowMs);
            const resolved = a.tmdbId != null && a.mediaType != null;
            const dl = dayLabel(a.airstamp, nowMs);
            const posterSrc = posterSrcFor(a);
            const poster = posterSrc ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={posterSrc} alt="" loading="lazy" onError={posterFallback} className="h-full w-full object-cover" />
            ) : (
              <div className="grid h-full w-full place-items-center p-2 text-center text-[11px] text-slate-400">{a.showName}</div>
            );
            const hasRatings = a.rating != null || a.criticRt != null || a.criticImdb != null;
            return (
              <div key={a.id} className="card wv-tile flex flex-col overflow-hidden" data-testid="airing-row" data-state={status.state}>
                <div className="wv-card flex-1">
                  <div className="wv-card-art wv-art-video bg-ink-800">
                    {resolved && (
                      <WCheck tmdbId={a.tmdbId!} mediaType={a.mediaType!} title={a.showName} year={a.year ?? null} posterUrl={a.image ?? null} />
                    )}
                    {resolved ? (
                      <Link href={`/app/title/${a.mediaType}/${a.tmdbId}`} className="block h-full">{poster}</Link>
                    ) : (
                      poster
                    )}
                  </div>
                  <div className="wv-card-body">
                    <div className="line-clamp-2 text-sm font-semibold leading-snug text-white">{a.showName}</div>
                    <div className="mt-1 flex items-center justify-between gap-1">
                      {status.state === 'live' ? (
                        <span suppressHydrationWarning data-testid="airing-live" className="truncate rounded-md bg-emerald-500/20 px-1.5 py-0.5 text-[11px] font-black uppercase tracking-wide text-emerald-200">
                          {liveLabel(status.startedMinutesAgo)}
                        </span>
                      ) : (
                        <span suppressHydrationWarning className="truncate text-base font-black tabular-nums text-white">
                          {t && a.minutes > 0 ? t : streaming ? dl : 'New'}
                        </span>
                      )}
                      {a.rating != null && <span className={`flex-none text-sm font-bold ${ratingTone(a.rating)}`}>★ {a.rating.toFixed(1)}</span>}
                    </div>
                    {status.state !== 'live' && dl !== 'Today' && (
                      <div className="mt-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-300">{dl}</div>
                    )}
                    <div className="mt-0.5 line-clamp-1 text-[11px] text-slate-400">
                      {a.showType}
                      {a.episodeName ? ` · ${a.episodeName}` : ''}
                      {a.season && a.number ? ` (S${a.season}E${a.number})` : ''}
                      {a.genres.length ? ` · ${a.genres.slice(0, 2).join(', ')}` : ''}
                    </div>
                    {a.criticRt != null || a.criticImdb != null ? (
                      <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] font-bold tabular-nums">
                        {a.criticRt != null && <span className={a.criticRt >= 60 ? 'text-red-300' : 'text-emerald-300'} title="Rotten Tomatoes">🍅 {a.criticRt}%</span>}
                        {a.criticImdb != null && <span className="rounded bg-[#f5c518] px-1 text-[10px] font-black text-black" title="IMDb">IMDb {a.criticImdb.toFixed(1)}</span>}
                      </div>
                    ) : !hasRatings ? (
                      <div className="mt-1 text-[11px] text-slate-500" data-testid="no-ratings">No ratings for this one yet.</div>
                    ) : null}
                    <div className="mt-1 line-clamp-1 rounded border border-brand-400/30 bg-brand-500/15 px-1 py-0.5 text-[11px] font-bold leading-tight text-brand-100" data-testid="airing-channel">{a.network}</div>
                    {resolved && <CardDna mediaType={a.mediaType!} tmdbId={a.tmdbId!} className="mt-1.5" />}

                    <div className="mt-2 flex items-center gap-1.5 border-t border-white/10 pt-2">
                      <button
                        onClick={() => toggleReminder(a)}
                        disabled={busy === a.id}
                        className={`wv-tv-act ${reminded.has(a.id) ? 'wv-tv-act--on' : ''}`}
                        title="Get a notification 1 hour and 5 minutes before it airs"
                        data-testid="airing-remind"
                      >
                        {/* Not a bell — the same broadcast mark the Detective uses,
                            and it only pulses once the reminder is actually set. */}
                        <SignalIcon on={reminded.has(a.id)} className="h-4 w-4" />
                        <span className="hidden sm:inline">{reminded.has(a.id) ? 'On' : 'Remind'}</span>
                      </button>
                      <a
                        href={calendarUrl(a)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="wv-tv-act"
                        title="Add it to your calendar"
                        data-testid="airing-calendar"
                      >
                        📅
                      </a>
                    </div>

                    {/* Same decision the Highlights cards offer — only where
                        there's a real title to rule on, exactly like that
                        strip's own gate. */}
                    {resolved && (
                      <div className="wv-act-row mt-2 border-t border-white/10 pt-2" data-testid="airing-decision">
                        <CardVerdict tmdbId={a.tmdbId!} mediaType={a.mediaType!} title={a.showName} year={a.year ?? null} posterPath={a.posterPath ?? null} />
                        <SaveButton wide tmdbId={a.tmdbId!} mediaType={a.mediaType!} title={a.showName} year={a.year ?? null} posterPath={a.posterPath ?? null} />
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
