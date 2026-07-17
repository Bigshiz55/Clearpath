'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { setTvReminder, removeTvReminder } from '@/lib/actions/tvReminders';
import type { Airing } from '@/lib/onTv';

type TimeFilter = 'all' | 'primetime' | 'nownext';
type SortFilter = 'time' | 'rating';
export type GuideMode = 'broadcast' | 'streaming';

function fmtTime(t: string): string | null {
  const m = t.match(/^(\d{1,2}):(\d{2})/);
  if (!m) return null;
  let h = Number(m[1]);
  const min = m[2];
  const ampm = h >= 12 ? 'PM' : 'AM';
  h = h % 12 || 12;
  return `${h}:${min} ${ampm}`;
}

/** "Today" / "Tomorrow" / weekday for an airing, from its real UTC timestamp. */
function dayLabel(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) return 'Today';
  if (new Date(now.getTime() + 86_400_000).toDateString() === d.toDateString()) return 'Tomorrow';
  return d.toLocaleDateString([], { weekday: 'short' });
}

/** A Google Calendar "add event" link so the reminder is real — the user can
 *  actually set their DVR or tune in. Built from the true airstamp + runtime. */
function calendarUrl(a: Airing): string {
  const start = new Date(a.airstamp);
  const end = new Date(start.getTime() + (a.runtime ?? 60) * 60_000);
  const z = (d: Date) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const text = encodeURIComponent(`${a.showName} on ${a.network}`);
  const details = encodeURIComponent(
    `${a.episodeName ? `"${a.episodeName}" · ` : ''}${a.showType}${a.genres.length ? ` · ${a.genres.join(', ')}` : ''}\nOn ${a.network}. Added from WatchVerdict.`,
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
  country,
  mode = 'broadcast',
  remindedIds = [],
}: {
  airings: Airing[];
  dateLabel: string;
  country: string;
  mode?: GuideMode;
  remindedIds?: number[];
}) {
  const streaming = mode === 'streaming';
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
            : 'Reminder set — we’ll ping you 1 hour and 5 minutes before it starts. ⏰',
        );
      }
    } catch {
      setNotice('Something went wrong. Please try again.');
    } finally {
      setBusy(null);
    }
  }
  const [time, setTime] = useState<TimeFilter>(streaming ? 'all' : 'primetime');
  const [sort, setSort] = useState<SortFilter>(streaming ? 'rating' : 'time');
  const [network, setNetwork] = useState<string | null>(null);
  const [hideNoise, setHideNoise] = useState(!streaming);
  const [showAllNetworks, setShowAllNetworks] = useState(false);
  const [media, setMedia] = useState<'all' | 'movie' | 'tv'>('all');

  const nowMin = useMemo(() => {
    const d = new Date();
    return d.getHours() * 60 + d.getMinutes();
  }, []);

  const channelLabel = streaming ? 'Platform' : 'Channel';

  // Channels/platforms present today, by how much they're airing.
  const networks = useMemo(() => {
    const counts = new Map<string, number>();
    for (const a of airings) counts.set(a.network, (counts.get(a.network) ?? 0) + 1);
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([n]) => n);
  }, [airings]);

  const filtered = useMemo(() => {
    let list = airings;
    if (hideNoise) list = list.filter((a) => !NOISE_TYPES.has(a.showType));
    if (media === 'movie') list = list.filter((a) => a.showType === 'Movie');
    else if (media === 'tv') list = list.filter((a) => a.showType !== 'Movie');
    if (network) list = list.filter((a) => a.network === network);
    if (!streaming) {
      if (time === 'primetime') list = list.filter((a) => a.minutes >= 18 * 60 && a.minutes <= 23 * 60);
      else if (time === 'nownext') list = list.filter((a) => a.minutes >= nowMin - 30);
    }
    const sorted = [...list];
    if (sort === 'rating') sorted.sort((a, b) => (b.rating ?? -1) - (a.rating ?? -1));
    else sorted.sort((a, b) => a.minutes - b.minutes);
    return sorted;
  }, [airings, hideNoise, network, time, sort, nowMin, streaming, media]);

  // Highlights — best-rated picks (prime-time for broadcast; overall for streaming).
  const highlights = useMemo(() => {
    return airings
      .filter((a) => !NOISE_TYPES.has(a.showType) && a.rating != null && (streaming || (a.minutes >= 18 * 60 && a.minutes <= 23 * 60)))
      .sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0))
      .slice(0, 6);
  }, [airings, streaming]);

  const shownNetworks = showAllNetworks ? networks : networks.slice(0, 10);

  if (airings.length === 0) {
    return (
      <div className="card p-6 text-center">
        <div className="text-3xl">{streaming ? '🍿' : '📡'}</div>
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
      {/* Highlights */}
      {highlights.length > 0 && (
        <section>
          <h2 className="mb-2 text-lg font-semibold text-white">
            {streaming ? '✨ Best of today’s drops' : '✨ Tonight’s highlights'}
          </h2>
          <p className="mb-3 text-xs text-slate-400">
            {streaming ? 'Highest-rated premieres on the major services' : 'Best-reviewed shows in prime time'} — rating is TVmaze’s community score.
          </p>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {highlights.map((a) => (
              <div key={a.id} className="card overflow-hidden">
                <div className="aspect-[2/3] overflow-hidden bg-ink-800">
                  {a.image ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={a.image} alt="" loading="lazy" className="h-full w-full object-cover" />
                  ) : (
                    <div className="grid h-full w-full place-items-center p-2 text-center text-[11px] text-slate-400">{a.showName}</div>
                  )}
                </div>
                <div className="p-2">
                  <div className="line-clamp-2 text-xs font-semibold text-white">{a.showName}</div>
                  <div className="mt-1 flex items-center justify-between gap-1">
                    <span className="truncate text-sm font-black tabular-nums text-white">{a.minutes > 0 ? fmtTime(a.time) ?? 'Today' : streaming ? 'Today' : 'New'}</span>
                    {a.rating != null && <span className={`flex-none text-xs font-bold ${ratingTone(a.rating)}`}>★ {a.rating.toFixed(1)}</span>}
                  </div>
                  <div className="mt-1 line-clamp-2 rounded border border-brand-400/30 bg-brand-500/15 px-1 py-0.5 text-[11px] font-bold leading-tight text-brand-100">{a.network}</div>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Controls */}
      <div className="card space-y-3 p-4">
        <div className="flex flex-wrap items-center gap-2">
          {!streaming && (
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
          <button onClick={() => setHideNoise((v) => !v)} className={`rounded-lg border px-2.5 py-1.5 text-sm font-semibold transition ${hideNoise ? 'border-emerald-400/50 bg-emerald-500/15 text-emerald-100' : 'border-white/12 bg-white/5 text-slate-300 hover:bg-white/10'}`}>
            {hideNoise ? '✓ ' : ''}Hide news &amp; talk
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <span className="mr-1 text-xs font-semibold uppercase tracking-wide text-slate-400">{channelLabel}</span>
          <button onClick={() => setNetwork(null)} className={`rounded-lg border px-2.5 py-1 text-xs font-semibold transition ${network == null ? 'border-brand-400/60 bg-brand-500/20 text-brand-100' : 'border-white/12 bg-white/5 text-slate-300 hover:bg-white/10'}`}>All {channelLabel.toLowerCase()}s</button>
          {shownNetworks.map((n) => (
            <button key={n} onClick={() => setNetwork(network === n ? null : n)} className={`rounded-lg border px-2.5 py-1 text-xs font-semibold transition ${network === n ? 'border-brand-400/60 bg-brand-500/20 text-brand-100' : 'border-white/12 bg-white/5 text-slate-300 hover:bg-white/10'}`}>{n}</button>
          ))}
          {networks.length > 10 && (
            <button onClick={() => setShowAllNetworks((v) => !v)} className="rounded-lg px-2.5 py-1 text-xs font-semibold text-brand-300 hover:text-brand-200">
              {showAllNetworks ? 'Fewer' : `+${networks.length - 10} more`}
            </button>
          )}
        </div>
        <div className="text-[11px] text-slate-400">
          {dateLabel} · {filtered.length} {streaming ? 'premiere' : 'airing'}{filtered.length === 1 ? '' : 's'}
          {!streaming && ' · times are each channel’s local broadcast time'}.
        </div>
      </div>

      {/* List */}
      {filtered.length === 0 ? (
        <p className="text-sm text-slate-400">
          Nothing matches those filters — {streaming ? `clear the ${channelLabel.toLowerCase()}` : 'widen the time window or clear the channel'}.
        </p>
      ) : (
        <div className="space-y-2">
          {filtered.map((a) => {
            const t = fmtTime(a.time);
            return (
              <div key={a.id} className="card flex items-center gap-3 p-3.5">
                <div className="w-[6.5rem] flex-none text-center sm:w-32">
                  {(() => {
                    const dl = dayLabel(a.airstamp);
                    if (t && a.minutes > 0) {
                      return (
                        <>
                          <div className="whitespace-nowrap text-2xl font-black tabular-nums leading-none text-white sm:text-3xl">{t}</div>
                          {dl !== 'Today' && <div className="mt-1 text-xs font-bold uppercase tracking-wide text-amber-300">{dl}</div>}
                        </>
                      );
                    }
                    return <div className="rounded-md bg-emerald-500/20 px-1.5 py-1.5 text-base font-black uppercase tracking-wide text-emerald-200">{streaming ? dl : 'New'}</div>;
                  })()}
                  <div className="mt-2 line-clamp-2 rounded-lg border border-brand-400/30 bg-brand-500/15 px-2 py-1.5 text-sm font-bold leading-tight text-brand-100 sm:text-base">{a.network}</div>
                </div>
                <div className="h-20 w-14 flex-none overflow-hidden rounded-md border border-white/10 bg-ink-800">
                  {a.image ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={a.image} alt="" loading="lazy" className="h-full w-full object-cover" />
                  ) : (
                    <div className="grid h-full w-full place-items-center text-[9px] text-slate-500">TV</div>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="line-clamp-2 text-base font-bold text-white sm:text-lg">{a.showName}</span>
                    {a.rating != null && <span className={`flex-none text-sm font-bold ${ratingTone(a.rating)}`}>★ {a.rating.toFixed(1)}</span>}
                  </div>
                  <div className="truncate text-xs text-slate-400">
                    {a.showType}
                    {a.episodeName ? ` · ${a.episodeName}` : ''}
                    {a.season && a.number ? ` (S${a.season}E${a.number})` : ''}
                    {a.genres.length ? ` · ${a.genres.slice(0, 2).join(', ')}` : ''}
                  </div>
                  {(a.criticRt != null || a.criticImdb != null || a.criticMeta != null) && (
                    <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm font-bold tabular-nums">
                      {a.criticRt != null && (
                        <span className={a.criticRt >= 60 ? 'text-red-300' : 'text-emerald-300'} title="Rotten Tomatoes (critics)">🍅 {a.criticRt}%</span>
                      )}
                      {a.criticImdb != null && (
                        <span className="rounded bg-[#f5c518] px-1.5 py-0.5 text-xs font-black text-black" title="IMDb">IMDb {a.criticImdb.toFixed(1)}</span>
                      )}
                      {a.criticMeta != null && <span className="text-sky-300" title="Metacritic">Ⓜ {a.criticMeta}</span>}
                    </div>
                  )}
                </div>
                <div className="flex flex-none items-center gap-1.5">
                  <button
                    onClick={() => toggleReminder(a)}
                    disabled={busy === a.id}
                    className={`rounded-lg border px-3 py-2 text-sm font-semibold transition disabled:opacity-50 ${reminded.has(a.id) ? 'border-emerald-400/50 bg-emerald-500/15 text-emerald-100' : 'border-white/12 bg-white/5 text-slate-200 hover:bg-white/10'}`}
                    title="Get a phone/PC notification 1 hour and 5 minutes before it airs"
                  >
                    {reminded.has(a.id) ? '🔔 On' : '🔔 Remind'}
                  </button>
                  <a href={calendarUrl(a)} target="_blank" rel="noopener noreferrer" className="hidden rounded-lg border border-white/12 bg-white/5 px-2 py-1.5 text-xs font-semibold text-slate-300 transition hover:bg-white/10 sm:inline-flex" title="Or add it to your calendar">
                    📅
                  </a>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
