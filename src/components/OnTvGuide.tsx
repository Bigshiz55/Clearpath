'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import type { Airing } from '@/lib/onTv';

type TimeFilter = 'all' | 'primetime' | 'nownext';
type SortFilter = 'time' | 'rating';

function fmtTime(t: string): string {
  const m = t.match(/^(\d{1,2}):(\d{2})/);
  if (!m) return t;
  let h = Number(m[1]);
  const min = m[2];
  const ampm = h >= 12 ? 'PM' : 'AM';
  h = h % 12 || 12;
  return `${h}:${min} ${ampm}`;
}

/** A Google Calendar "add event" link so the reminder is real — the user can
 *  actually set their DVR or tune in. Built from the true airstamp + runtime. */
function calendarUrl(a: Airing): string {
  const start = new Date(a.airstamp);
  const end = new Date(start.getTime() + (a.runtime ?? 60) * 60_000);
  const z = (d: Date) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const text = encodeURIComponent(`${a.showName} on ${a.network}`);
  const details = encodeURIComponent(
    `${a.episodeName ? `"${a.episodeName}" · ` : ''}${a.showType}${a.genres.length ? ` · ${a.genres.join(', ')}` : ''}\nAiring on ${a.network}. Added from WatchVerdict.`,
  );
  return `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${text}&dates=${z(start)}/${z(end)}&details=${details}`;
}

function ratingTone(r: number): string {
  if (r >= 8) return 'text-emerald-300';
  if (r >= 6.5) return 'text-gold-300';
  return 'text-slate-300';
}

const NOISE_TYPES = new Set(['News', 'Talk Show', 'Variety']);

export function OnTvGuide({ airings, dateLabel, country }: { airings: Airing[]; dateLabel: string; country: string }) {
  const [time, setTime] = useState<TimeFilter>('primetime');
  const [sort, setSort] = useState<SortFilter>('time');
  const [network, setNetwork] = useState<string | null>(null);
  const [hideNoise, setHideNoise] = useState(true);
  const [showAllNetworks, setShowAllNetworks] = useState(false);

  const nowMin = useMemo(() => {
    const d = new Date();
    return d.getHours() * 60 + d.getMinutes();
  }, []);

  // Networks present today, by how much they're airing — for the channel filter.
  const networks = useMemo(() => {
    const counts = new Map<string, number>();
    for (const a of airings) counts.set(a.network, (counts.get(a.network) ?? 0) + 1);
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([n]) => n);
  }, [airings]);

  const filtered = useMemo(() => {
    let list = airings;
    if (hideNoise) list = list.filter((a) => !NOISE_TYPES.has(a.showType));
    if (network) list = list.filter((a) => a.network === network);
    if (time === 'primetime') list = list.filter((a) => a.minutes >= 18 * 60 && a.minutes <= 23 * 60);
    else if (time === 'nownext') list = list.filter((a) => a.minutes >= nowMin - 30);
    const sorted = [...list];
    if (sort === 'rating') sorted.sort((a, b) => (b.rating ?? -1) - (a.rating ?? -1));
    else sorted.sort((a, b) => a.minutes - b.minutes);
    return sorted;
  }, [airings, hideNoise, network, time, sort, nowMin]);

  // Tonight's highlights — best-rated prime-time picks, regardless of the filters.
  const highlights = useMemo(() => {
    return airings
      .filter((a) => !NOISE_TYPES.has(a.showType) && a.rating != null && a.minutes >= 18 * 60 && a.minutes <= 23 * 60)
      .sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0))
      .slice(0, 6);
  }, [airings]);

  const shownNetworks = showAllNetworks ? networks : networks.slice(0, 10);

  if (airings.length === 0) {
    return (
      <div className="card p-6 text-center">
        <div className="text-3xl">📡</div>
        <h2 className="mt-3 text-lg font-semibold text-white">No listings right now</h2>
        <p className="mx-auto mt-1 max-w-md text-sm text-slate-400">
          We couldn’t load today’s {country} broadcast schedule. It refreshes hourly — check back shortly.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Highlights */}
      {highlights.length > 0 && (
        <section>
          <h2 className="mb-2 text-lg font-semibold text-white">✨ Tonight’s highlights</h2>
          <p className="mb-3 text-xs text-slate-400">Best-reviewed shows in prime time — rating is TVmaze’s community score.</p>
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
                  <div className="mt-1 flex items-center justify-between text-[11px]">
                    <span className="text-slate-300">{fmtTime(a.time)}</span>
                    {a.rating != null && <span className={ratingTone(a.rating)}>★ {a.rating.toFixed(1)}</span>}
                  </div>
                  <div className="truncate text-[11px] text-slate-400">{a.network}</div>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Controls */}
      <div className="card space-y-3 p-4">
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex rounded-lg border border-white/12 bg-white/5 p-0.5">
            {([['primetime', 'Prime time'], ['nownext', 'Now & next'], ['all', 'All day']] as const).map(([v, label]) => (
              <button key={v} onClick={() => setTime(v)} className={`rounded-md px-3 py-1.5 text-sm font-semibold transition ${time === v ? 'bg-brand-500 text-white shadow-glow' : 'text-slate-300 hover:text-white'}`}>{label}</button>
            ))}
          </div>
          <div className="inline-flex rounded-lg border border-white/12 bg-white/5 p-0.5">
            {([['time', 'By time'], ['rating', 'Top rated']] as const).map(([v, label]) => (
              <button key={v} onClick={() => setSort(v)} className={`rounded-md px-3 py-1.5 text-sm font-semibold transition ${sort === v ? 'bg-brand-500 text-white shadow-glow' : 'text-slate-300 hover:text-white'}`}>{label}</button>
            ))}
          </div>
          <button onClick={() => setHideNoise((v) => !v)} className={`rounded-lg border px-2.5 py-1.5 text-sm font-semibold transition ${hideNoise ? 'border-emerald-400/50 bg-emerald-500/15 text-emerald-100' : 'border-white/12 bg-white/5 text-slate-300 hover:bg-white/10'}`}>
            {hideNoise ? '✓ ' : ''}Hide news &amp; talk
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <span className="mr-1 text-xs font-semibold uppercase tracking-wide text-slate-400">Channel</span>
          <button onClick={() => setNetwork(null)} className={`rounded-lg border px-2.5 py-1 text-xs font-semibold transition ${network == null ? 'border-brand-400/60 bg-brand-500/20 text-brand-100' : 'border-white/12 bg-white/5 text-slate-300 hover:bg-white/10'}`}>All channels</button>
          {shownNetworks.map((n) => (
            <button key={n} onClick={() => setNetwork(network === n ? null : n)} className={`rounded-lg border px-2.5 py-1 text-xs font-semibold transition ${network === n ? 'border-brand-400/60 bg-brand-500/20 text-brand-100' : 'border-white/12 bg-white/5 text-slate-300 hover:bg-white/10'}`}>{n}</button>
          ))}
          {networks.length > 10 && (
            <button onClick={() => setShowAllNetworks((v) => !v)} className="rounded-lg px-2.5 py-1 text-xs font-semibold text-brand-300 hover:text-brand-200">
              {showAllNetworks ? 'Fewer' : `+${networks.length - 10} more`}
            </button>
          )}
        </div>
        <div className="text-[11px] text-slate-400">{dateLabel} · {filtered.length} airing{filtered.length === 1 ? '' : 's'} · times are each channel’s local broadcast time.</div>
      </div>

      {/* Schedule list */}
      {filtered.length === 0 ? (
        <p className="text-sm text-slate-400">Nothing matches those filters — widen the time window or clear the channel.</p>
      ) : (
        <div className="space-y-2">
          {filtered.map((a) => (
            <div key={a.id} className="card flex items-center gap-3 p-3">
              <div className="w-16 flex-none text-center">
                <div className="text-sm font-bold tabular-nums text-white">{fmtTime(a.time)}</div>
                <div className="mt-0.5 truncate text-[11px] font-semibold text-brand-200">{a.network}</div>
              </div>
              <div className="h-16 w-11 flex-none overflow-hidden rounded-md border border-white/10 bg-ink-800">
                {a.image ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={a.image} alt="" loading="lazy" className="h-full w-full object-cover" />
                ) : (
                  <div className="grid h-full w-full place-items-center text-[9px] text-slate-500">TV</div>
                )}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="line-clamp-1 text-sm font-semibold text-white">{a.showName}</span>
                  {a.rating != null && <span className={`flex-none text-xs font-semibold ${ratingTone(a.rating)}`}>★ {a.rating.toFixed(1)}</span>}
                </div>
                <div className="truncate text-[11px] text-slate-400">
                  {a.showType}
                  {a.episodeName ? ` · ${a.episodeName}` : ''}
                  {a.season && a.number ? ` (S${a.season}E${a.number})` : ''}
                  {a.genres.length ? ` · ${a.genres.slice(0, 2).join(', ')}` : ''}
                </div>
              </div>
              <div className="flex flex-none items-center gap-1.5">
                <a href={calendarUrl(a)} target="_blank" rel="noopener noreferrer" className="rounded-lg border border-white/12 bg-white/5 px-2.5 py-1.5 text-xs font-semibold text-slate-200 transition hover:bg-white/10" title="Add to Google Calendar so you can record or tune in">
                  ＋ Remind me
                </a>
                <Link href={`/app/ask?q=${encodeURIComponent(a.showName)}`} className="hidden rounded-lg border border-white/12 bg-white/5 px-2.5 py-1.5 text-xs font-semibold text-brand-300 transition hover:bg-white/10 sm:inline-flex" title="See WatchVerdict's take">
                  ⚖️ Verdict
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
