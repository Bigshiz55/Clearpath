'use client';

import { useMemo, useState } from 'react';
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
import { TasteFeedback } from '@/components/TasteFeedback';
import { LikeButton } from '@/components/LikeButton';
import { CardDna } from '@/components/CardDna';
import { useI18n } from '@/i18n/I18nProvider';
import type { Airing } from '@/lib/onTv';

type TimeFilter = 'all' | 'primetime' | 'nownext';
type SortFilter = 'time' | 'rating';
export type GuideMode = 'broadcast' | 'streaming';

type TFn = (key: string, params?: Record<string, string | number>) => string;

function fmtTime(time: string, t: TFn): string | null {
  const m = time.match(/^(\d{1,2}):(\d{2})/);
  if (!m) return null;
  let h = Number(m[1]);
  const min = m[2];
  const ampm = h >= 12 ? t('discover.onTvGuide.pm') : t('discover.onTvGuide.am');
  h = h % 12 || 12;
  return `${h}:${min} ${ampm}`;
}

/** "Today" / "Tomorrow" / weekday for an airing, from its real UTC timestamp. */
function dayLabel(iso: string, t: TFn, locale: string): string {
  const d = new Date(iso);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) return t('discover.onTvGuide.today');
  if (new Date(now.getTime() + 86_400_000).toDateString() === d.toDateString()) return t('discover.onTvGuide.tomorrow');
  return d.toLocaleDateString(locale, { weekday: 'short' });
}

/** A Google Calendar "add event" link so the reminder is real — the user can
 *  actually set their DVR or tune in. Built from the true airstamp + runtime. */
function calendarUrl(a: Airing, t: TFn): string {
  const start = new Date(a.airstamp);
  const end = new Date(start.getTime() + (a.runtime ?? 60) * 60_000);
  const z = (d: Date) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const text = encodeURIComponent(t('discover.onTvGuide.calendarText', { show: a.showName, network: a.network }));
  const details = encodeURIComponent(
    `${a.episodeName ? `"${a.episodeName}" · ` : ''}${a.showType}${a.genres.length ? ` · ${a.genres.join(', ')}` : ''}\n${t('discover.onTvGuide.calendarDetails', { network: a.network })}`,
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
  windowHours = null,
}: {
  airings: Airing[];
  dateLabel: string;
  country: string;
  mode?: GuideMode;
  remindedIds?: number[];
  /** When set, `airings` is already filtered to [now, now+N h]; present it as a
   *  soonest-first "coming on in the next N hours" view (no prime-time filter). */
  windowHours?: number | null;
}) {
  const { t, plural, locale } = useI18n();
  const streaming = mode === 'streaming';
  const windowed = windowHours != null;
  const [reminded, setReminded] = useState<Set<number>>(new Set(remindedIds));
  const [busy, setBusy] = useState<number | null>(null);
  const [notice, setNotice] = useState<{ msg: string; settings: boolean } | null>(null);
  const [hidden, setHidden] = useState<Set<number>>(new Set());
  const remove = (id: number) => setHidden((s) => new Set(s).add(id));

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
          setNotice({ msg: res.error ?? t('discover.onTvGuide.couldNotSetReminder'), settings: false });
          return;
        }
        setReminded((s) => new Set(s).add(a.id));
        setNotice({
          msg: res.needsNotifications
            ? t('discover.onTvGuide.reminderSetNotif')
            : t('discover.onTvGuide.reminderSet'),
          settings: !!res.needsNotifications,
        });
      }
    } catch {
      setNotice({ msg: t('discover.onTvGuide.somethingWrong'), settings: false });
    } finally {
      setBusy(null);
    }
  }
  const [time, setTime] = useState<TimeFilter>(streaming || windowed ? 'all' : 'primetime');
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
    if (windowed) return airings.filter((a) => !NOISE_TYPES.has(a.showType)).slice(0, 10);
    return airings
      .filter((a) => !NOISE_TYPES.has(a.showType) && a.rating != null && (streaming || (a.minutes >= 18 * 60 && a.minutes <= 23 * 60)))
      .sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0))
      .slice(0, 10);
  }, [airings, streaming, windowed]);
  const highlights = highlightPool.filter((a) => !hidden.has(a.id)).slice(0, 6);

  if (airings.length === 0) {
    return (
      <div className="card p-6 text-center">
        <div className="text-3xl">{streaming ? '🍿' : '📡'}</div>
        <h2 className="mt-3 text-lg font-semibold text-white">
          {streaming ? t('discover.onTvGuide.emptyStreamingHeading') : t('discover.onTvGuide.emptyBroadcastHeading')}
        </h2>
        <p className="mx-auto mt-1 max-w-md text-sm text-slate-400">
          {streaming
            ? t('discover.onTvGuide.emptyStreamingBody')
            : t('discover.onTvGuide.emptyBroadcastBody', { country })}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {notice && (
        <div className="flex items-center justify-between gap-3 rounded-xl border border-brand-400/40 bg-brand-500/10 px-4 py-3 text-sm text-brand-100">
          <span>{notice.msg}</span>
          <span className="flex flex-none items-center gap-3">
            {notice.settings && <Link href="/app/settings" className="font-bold underline">{t('discover.onTvGuide.turnOn')}</Link>}
            <button onClick={() => setNotice(null)} aria-label={t('discover.onTvGuide.dismiss')} className="text-lg leading-none text-slate-300 hover:text-white">×</button>
          </span>
        </div>
      )}
      {/* Highlights */}
      {highlights.length > 0 && (
        <section>
          <h2 className="mb-2 text-lg font-semibold text-white">
            {windowed ? t('discover.onTvGuide.highlightsWindow', { hours: windowHours ?? 0 }) : streaming ? t('discover.onTvGuide.highlightsStreaming') : t('discover.onTvGuide.highlightsBroadcast')}
          </h2>
          <p className="mb-3 text-xs text-slate-400">
            {windowed
              ? t('discover.onTvGuide.subWindow')
              : streaming
                ? t('discover.onTvGuide.subStreaming')
                : t('discover.onTvGuide.subBroadcast')}{' '}
            {t('discover.onTvGuide.ratingSuffix')}
          </p>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
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
                <div key={a.id} className="card flex flex-col overflow-hidden">
                  {/* Action row on top of the placard — For · Pass · Save — the
                      same groove as every other card in the app. */}
                  {resolved && (
                    <div className="flex items-center gap-1 border-b border-white/10 bg-ink-900/85 px-1.5 py-1.5">
                      <LikeButton tmdbId={a.tmdbId!} mediaType={a.mediaType!} title={a.showName} year={a.year ?? null} posterPath={a.posterPath ?? null} onFlagged={() => remove(a.id)} />
                      <TasteFeedback compact wide tmdbId={a.tmdbId!} mediaType={a.mediaType!} title={a.showName} year={a.year ?? null} posterPath={a.posterPath ?? null} onFlagged={() => remove(a.id)} />
                      <SaveButton wide tmdbId={a.tmdbId!} mediaType={a.mediaType!} title={a.showName} year={a.year ?? null} posterPath={a.posterPath ?? null} onSaved={() => remove(a.id)} />
                    </div>
                  )}
                  {resolved ? (
                    <Link href={`/app/title/${a.mediaType}/${a.tmdbId}`} className="block aspect-[2/3] overflow-hidden bg-ink-800">{poster}</Link>
                  ) : (
                    <div className="aspect-[2/3] overflow-hidden bg-ink-800">{poster}</div>
                  )}
                  <div className="flex flex-1 flex-col p-2">
                    <div className="line-clamp-2 text-xs font-semibold text-white">{a.showName}</div>
                    <div className="mt-1 flex items-center justify-between gap-1">
                      <span className="truncate text-sm font-black tabular-nums text-white">{a.minutes > 0 ? fmtTime(a.time, t) ?? t('discover.onTvGuide.today') : streaming ? t('discover.onTvGuide.today') : t('discover.onTvGuide.newLabel')}</span>
                      {a.rating != null && <span className={`flex-none text-xs font-bold ${ratingTone(a.rating)}`}>★ {a.rating.toFixed(1)}</span>}
                    </div>
                    {(a.criticRt != null || a.criticImdb != null) && (
                      <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] font-bold tabular-nums">
                        {a.criticRt != null && <span className={a.criticRt >= 60 ? 'text-red-300' : 'text-emerald-300'} title={t('discover.onTvGuide.rottenTomatoes')}>🍅 {a.criticRt}%</span>}
                        {a.criticImdb != null && <span className="rounded bg-[#f5c518] px-1 text-[10px] font-black text-black" title="IMDb">IMDb {a.criticImdb.toFixed(1)}</span>}
                      </div>
                    )}
                    <div className="mt-1 line-clamp-1 rounded border border-brand-400/30 bg-brand-500/15 px-1 py-0.5 text-[11px] font-bold leading-tight text-brand-100">{a.network}</div>
                    {resolved && <CardDna mediaType={a.mediaType!} tmdbId={a.tmdbId!} className="mt-1.5" />}
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
              {([['primetime', 'primeTime'], ['nownext', 'nowNext'], ['all', 'allDay']] as const).map(([v, k]) => (
                <button key={v} onClick={() => setTime(v)} className={`rounded-md px-3 py-1.5 text-sm font-semibold transition ${time === v ? 'bg-brand-500 text-white shadow-glow' : 'text-slate-300 hover:text-white'}`}>{t(`discover.onTvGuide.${k}`)}</button>
              ))}
            </div>
          )}
          <div className="inline-flex rounded-lg border border-white/12 bg-white/5 p-0.5">
            {([['all', 'all'], ['movie', 'movies'], ['tv', 'shows']] as const).map(([v, k]) => (
              <button key={v} onClick={() => setMedia(v)} className={`rounded-md px-3 py-1.5 text-sm font-semibold transition ${media === v ? 'bg-brand-500 text-white shadow-glow' : 'text-slate-300 hover:text-white'}`}>{t(`discover.onTvGuide.${k}`)}</button>
            ))}
          </div>
          <div className="inline-flex rounded-lg border border-white/12 bg-white/5 p-0.5">
            {([['time', streaming ? t('discover.onTvGuide.defaultSort') : t('discover.onTvGuide.byTime')], ['rating', t('discover.onTvGuide.topRated')]] as const).map(([v, label]) => (
              <button key={v} onClick={() => setSort(v)} className={`rounded-md px-3 py-1.5 text-sm font-semibold transition ${sort === v ? 'bg-brand-500 text-white shadow-glow' : 'text-slate-300 hover:text-white'}`}>{label}</button>
            ))}
          </div>
        </div>
        <div className="text-[11px] text-slate-400">
          {dateLabel} · {plural(streaming ? 'discover.onTvGuide.premieres' : 'discover.onTvGuide.airings', filtered.length)}
          {!streaming && ` · ${t('discover.onTvGuide.localTimes')}`}.
        </div>
      </div>

      {/* List */}
      {filtered.length === 0 ? (
        <p className="text-sm text-slate-400">
          {t('discover.onTvGuide.listEmpty')}
        </p>
      ) : (
        <div className="space-y-2">
          {filtered.map((a) => {
            const timeLabel = fmtTime(a.time, t);
            return (
              <div key={a.id} className="card flex items-center gap-3 p-3.5">
                <div className="w-[5rem] flex-none text-center sm:w-28">
                  {(() => {
                    const dl = dayLabel(a.airstamp, t, locale);
                    if (timeLabel && a.minutes > 0) {
                      return (
                        <>
                          <div className="whitespace-nowrap text-lg font-black tabular-nums leading-none text-white sm:text-2xl">{timeLabel}</div>
                          {dl !== t('discover.onTvGuide.today') && <div className="mt-1 text-xs font-bold uppercase tracking-wide text-amber-300">{dl}</div>}
                        </>
                      );
                    }
                    return <div className="rounded-md bg-emerald-500/20 px-1.5 py-1.5 text-base font-black uppercase tracking-wide text-emerald-200">{streaming ? dl : t('discover.onTvGuide.newLabel')}</div>;
                  })()}
                  <div className="mt-2 line-clamp-2 rounded-lg border border-brand-400/30 bg-brand-500/15 px-2 py-1.5 text-sm font-bold leading-tight text-brand-100 sm:text-base">{a.network}</div>
                </div>
                <div className="h-20 w-14 flex-none overflow-hidden rounded-md border border-white/10 bg-ink-800">
                  {posterSrcFor(a, 'w185') ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={posterSrcFor(a, 'w185')!} alt="" loading="lazy" onError={posterFallback} className="h-full w-full object-cover" />
                  ) : (
                    <div className="grid h-full w-full place-items-center text-[9px] text-slate-500">{t('discover.onTvGuide.tvBadge')}</div>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="line-clamp-2 text-lg font-bold leading-snug text-white sm:text-xl">{a.showName}</div>
                  <div className="truncate text-xs text-slate-400">
                    {a.showType}
                    {a.episodeName ? ` · ${a.episodeName}` : ''}
                    {a.season && a.number ? ` (S${a.season}E${a.number})` : ''}
                    {a.genres.length ? ` · ${a.genres.slice(0, 2).join(', ')}` : ''}
                  </div>
                  {(a.rating != null || a.criticRt != null || a.criticImdb != null) && (
                    <div className="mt-1.5 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-sm font-bold tabular-nums">
                      {a.rating != null && (
                        <span className={ratingTone(a.rating)} title={t('discover.onTvGuide.tvmazeScore')}>★ {a.rating.toFixed(1)}</span>
                      )}
                      {a.criticRt != null && (
                        <span className={a.criticRt >= 60 ? 'text-red-300' : 'text-emerald-300'} title={t('discover.onTvGuide.rtCritics')}>🍅 {a.criticRt}%</span>
                      )}
                      {a.criticImdb != null && (
                        <span className="rounded bg-[#f5c518] px-1.5 py-0.5 text-xs font-black text-black" title="IMDb">IMDb {a.criticImdb.toFixed(1)}</span>
                      )}
                    </div>
                  )}
                </div>
                <div className="flex flex-none items-center gap-1.5">
                  <button
                    onClick={() => toggleReminder(a)}
                    disabled={busy === a.id}
                    className={`whitespace-nowrap rounded-lg border px-2.5 py-2 text-sm font-semibold transition disabled:opacity-50 sm:px-3 ${reminded.has(a.id) ? 'border-emerald-400/50 bg-emerald-500/15 text-emerald-100' : 'border-white/12 bg-white/5 text-slate-200 hover:bg-white/10'}`}
                    title={t('discover.onTvGuide.remindTitle')}
                  >
                    🔔<span className="ml-1 hidden sm:inline">{reminded.has(a.id) ? t('discover.onTvGuide.on') : t('discover.onTvGuide.remind')}</span>
                  </button>
                  <a href={calendarUrl(a, t)} target="_blank" rel="noopener noreferrer" className="hidden rounded-lg border border-white/12 bg-white/5 px-2 py-1.5 text-xs font-semibold text-slate-300 transition hover:bg-white/10 sm:inline-flex" title={t('discover.onTvGuide.calendarTitle')}>
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
