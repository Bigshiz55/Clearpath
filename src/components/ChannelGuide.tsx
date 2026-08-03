'use client';

import { useMemo, useState } from 'react';
import { AlarmClock, Bookmark, Check, Dna, Film, Tv } from 'lucide-react';
import {
  GUIDE_CATEGORIES,
  buildChannelGuide,
  filterGuide,
  filterGuideByCategory,
  filterGuideByMedia,
  guideSummary,
  isPaidProgramming,
  scheduleGaps,
  type GuideMediaFilter,
} from '@/lib/tv/channelGuide';
import { channelIdentity, channelHue } from '@/lib/tv/channelNames';
import { rankGuideForTaste, type TasteRule } from '@/lib/tv/channelAffinity';
import { displayClock } from '@/lib/viewing/clock';
import { setTvReminder } from '@/lib/actions/tvReminders';
import { addToWatchlist } from '@/lib/actions/watchlist';
import { ScoreBadge } from '@/components/tv/ScoreBadge';
import type { Airing } from '@/lib/onTv';

/**
 * THE CHANNEL GUIDE — the cable-box view.
 *
 * One row per channel: what is on RIGHT NOW with how far through it is, then
 * what is up next with real clock times. Channels live now lead. A search box
 * on top, because nobody scans three hundred rows for Hallmark — and it
 * matches what is ON a channel too, so "football" finds ESPN.
 *
 * Data honesty carries through from the module: "on now" is only claimed when
 * the runtime proves it, times render in the viewer's own zone
 * (`suppressHydrationWarning` — the server renders UTC and the browser
 * corrects, which is intended for a wall clock), a channel we cannot see
 * simply is not a row, and a HOLE in a channel's data renders as "no listing
 * data" instead of silently jumping three hours.
 */
export function ChannelGuide({
  airings,
  nowMs,
  remindedIds = [],
  taste = [],
  personalized = false,
}: {
  airings: Airing[];
  nowMs: number;
  /** Airings this user already has a reminder for. */
  remindedIds?: number[];
  /** The user's own preference rules — the guide orders channels by them.
   *  Empty = the plain alphabetical guide, unchanged. */
  taste?: TasteRule[];
  /** True only when this user has rated enough titles that a score is
   *  genuinely THEIRS — gates the "Your NN" label (see ScoreBadge). */
  personalized?: boolean;
}) {
  const [query, setQuery] = useState('');
  const [media, setMedia] = useState<GuideMediaFilter>('all');
  const [cat, setCat] = useState<string | null>(null);
  const [reminded, setReminded] = useState<Set<number>>(() => new Set(remindedIds));
  const [saved, setSaved] = useState<Set<number>>(() => new Set());
  const [busy, setBusy] = useState<number | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  // TASTE ORDERS THE DIAL. Same live-first guarantee, but inside each group
  // the user's own rule weights decide who leads — Investigation Discovery
  // before ESPN for a true-crime lover, Syfy sunk for a sci-fi avoider —
  // and zero-affinity channels keep their alphabetical place.
  const rows = useMemo(() => rankGuideForTaste(buildChannelGuide(airings, nowMs), taste), [airings, nowMs, taste]);
  // One-tap narrowing on top of the ranked rows: movie/show first, then a
  // channel group. Order is preserved — filters never re-rank.
  const narrowed = useMemo(() => filterGuideByCategory(filterGuideByMedia(rows, media), cat), [rows, media, cat]);
  const shown = useMemo(() => filterGuide(narrowed, query), [narrowed, query]);
  // The header sentence counts what the toggles have left in view. "On now" is
  // deliberately not one of the numbers: guide channels almost always have
  // something on, so it tracked the channel count and said nothing.
  const stats = guideSummary(narrowed);
  const filtersOn = media !== 'all' || cat != null;

  // A QUICK REMINDER, RIGHT ON THE ROW. The guide is where you notice that a
  // Hallmark movie starts at 10 — making you leave for another screen to be
  // reminded of it is how the thought gets lost. Same server action, same
  // 1h+5m pings as everywhere else; failures are said out loud, never faked.
  async function remind(a: Airing) {
    if (busy != null) return;
    setBusy(a.id);
    try {
      const res = await setTvReminder({ airingId: a.id, showName: a.showName, network: a.network, airstamp: a.airstamp, url: '/app/tv?view=guide' });
      if (!res.ok) {
        setNotice(res.error ?? 'Could not set the reminder.');
        return;
      }
      setReminded((s) => new Set(s).add(a.id));
      setNotice(
        res.needsNotifications
          ? `Reminder set for ${a.showName}! Turn on notifications in Settings so we can ping you.`
          : `Reminder set — we’ll ping you before ${a.showName} starts.`,
      );
    } catch {
      setNotice('Something went wrong. Please try again.');
    } finally {
      setBusy(null);
    }
  }

  // SAVE, RIGHT ON THE ROW TOO — a reminder is "tonight", the watchlist is
  // "someday", and noticing a title in the guide raises both. Only offered
  // when the listing resolved to a real TMDB title; a save needs an identity.
  async function save(a: Airing) {
    if (busy != null || a.tmdbId == null || a.mediaType == null) return;
    setBusy(a.id);
    try {
      const res = await addToWatchlist({
        tmdbId: a.tmdbId,
        mediaType: a.mediaType,
        title: a.showName,
        year: a.year ?? null,
        posterPath: a.posterPath ?? null,
        status: 'possible',
      });
      if (!res.ok) {
        setNotice(res.error ?? 'Could not save that.');
        return;
      }
      setSaved((s) => new Set(s).add(a.id));
      setNotice(`Saved ${a.showName} to your watchlist.`);
    } catch {
      setNotice('Something went wrong. Please try again.');
    } finally {
      setBusy(null);
    }
  }

  if (rows.length === 0) {
    return (
      <div className="rounded-2xl border border-amber-400/30 bg-amber-500/[0.07] p-4 text-center" data-testid="guide-empty">
        <p className="text-sm text-slate-300">
          The full guide has nothing it can show for this window yet — the grid refreshes hourly.
          The highlights above are still live.
        </p>
      </div>
    );
  }

  const clockOf = (ms: number) =>
    new Date(ms).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

  return (
    <div className="space-y-3" data-testid="channel-guide">
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Find a channel or a show — Hallmark, ESPN, a title…"
          aria-label="Search the channel guide"
          data-testid="guide-search"
          className="min-h-[44px] w-full flex-1 rounded-xl border border-white/15 bg-ink-950/70 px-3.5 text-sm text-white placeholder:text-slate-500 focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-400/40 sm:max-w-md"
        />
        {/* The header sentence is computed from the SAME rows it describes. */}
        <p className="text-xs text-slate-400" data-testid="guide-stats">
          <b className="text-slate-200">{stats.channels}</b> channels
          {stats.movies > 0 && <> · <b className="text-slate-200">{stats.movies}</b> movies</>}
        </p>
      </div>

      {/* ONE-TAP NARROWING. A 188-channel dial needs more than a search box:
          movie-or-show first, then the channel groups a cable viewer actually
          thinks in. Groups come from channel identity (the grid has no
          per-programme genre to filter by) — a channel matching no group just
          stays under All. */}
      <div className="flex flex-wrap items-center gap-2" data-testid="guide-filters">
        <div className="inline-flex flex-none rounded-lg border border-white/12 bg-white/5 p-0.5">
          {(
            [
              ['all', 'All', null],
              ['movie', 'Movies', Film],
              ['tv', 'Shows', Tv],
            ] as const
          ).map(([v, label, Icon]) => (
            <button
              key={v}
              type="button"
              onClick={() => setMedia(v)}
              aria-pressed={media === v}
              data-testid={`guide-media-${v}`}
              className={`inline-flex min-h-[36px] items-center gap-1.5 rounded-md px-3 text-sm font-semibold transition ${
                media === v ? 'bg-brand-500 text-white shadow-glow' : 'text-slate-300 hover:text-white'
              }`}
            >
              {Icon && <Icon size={16} aria-hidden />}
              {label}
            </button>
          ))}
        </div>
        <div className="flex min-w-0 flex-1 items-center gap-1.5 overflow-x-auto pb-0.5" data-testid="guide-cats">
          {GUIDE_CATEGORIES.map((c) => {
            const active = cat === c.key;
            return (
              <button
                key={c.key}
                type="button"
                onClick={() => setCat(active ? null : c.key)}
                aria-pressed={active}
                data-testid={`guide-cat-${c.key}`}
                className={`min-h-[36px] flex-none whitespace-nowrap rounded-full border px-3 text-xs font-bold transition ${
                  active
                    ? 'border-[#ff1493]/60 bg-[#ff1493]/20 text-pink-100'
                    : 'border-white/15 bg-white/[0.04] text-slate-300 hover:border-white/30 hover:text-white'
                }`}
              >
                {c.label}
              </button>
            );
          })}
        </div>
      </div>

      {notice && (
        <p role="status" className="rounded-xl border border-emerald-400/30 bg-emerald-500/10 px-3.5 py-2.5 text-sm text-emerald-100" data-testid="guide-note">
          {notice}
        </p>
      )}

      {shown.length === 0 ? (
        <div className="space-y-2 rounded-xl border border-white/10 bg-white/[0.03] p-4" data-testid="guide-no-match">
          <p className="text-sm text-slate-400">
            {query.trim()
              ? `Nothing in the guide matches “${query.trim()}” — by channel name or by what’s on.`
              : 'No channel we can see matches those filters right now — that’s the schedule, not missing data.'}
          </p>
          {filtersOn && (
            <button
              type="button"
              onClick={() => {
                setMedia('all');
                setCat(null);
              }}
              data-testid="guide-clear"
              className="rounded-lg border border-white/15 bg-white/[0.05] px-3 py-1.5 text-xs font-bold text-slate-200 transition hover:border-brand-300 hover:text-white"
            >
              Show every channel
            </button>
          )}
        </div>
      ) : (
        <ul className="grid grid-cols-1 items-start gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {shown.map((r) => {
            // CHANNEL IDENTITY, not FCC paperwork. "KWPXDT" means nothing to a
            // viewer whose cable box says ION; the mapping names what it can
            // prove and falls back to the call sign — never a guess. The chip
            // is a stable monogram, not a hotlinked logo.
            const id = channelIdentity(r.network);
            // Paid programming gets the guide's floor, not its shine: the slot
            // is real (hiding it would fake the schedule) but it renders muted
            // and scoreless — an infomercial does not earn a match number.
            const onNowPaid = r.onNow != null && isPaidProgramming(r.onNow);
            // The holes between the rows we SHOW — an unexplained jump from
            // 6:00 to 9:00 is a claim about the schedule we can't back.
            const visible = [...(r.onNow ? [r.onNow] : []), ...r.upNext];
            const gaps = scheduleGaps(visible);
            const gapAfter = (a: Airing) =>
              gaps.find((g) => {
                const end = Date.parse(a.airstamp) + (a.runtime ?? 0) * 60_000;
                return Math.abs(g.fromMs - end) < 60_000;
              });
            return (
              <li key={r.network} className="card wv-tile p-3" data-testid="guide-channel">
                <div className="flex items-baseline justify-between gap-2">
                  <h3 className="flex min-w-0 items-center gap-2 truncate text-sm font-black uppercase tracking-wide text-white">
                    <span
                      aria-hidden
                      className="grid h-6 w-9 flex-none place-items-center rounded-md text-[9px] font-black tracking-wide"
                      style={{ backgroundColor: `hsl(${channelHue(id.name)} 45% 22%)`, color: `hsl(${channelHue(id.name)} 80% 82%)` }}
                    >
                      {id.monogram}
                    </span>
                    <span className="truncate" title={id.mapped ? `${id.name} (${r.network})` : id.name} data-testid="guide-channel-name">
                      {id.name}
                    </span>
                    {'forYou' in r && (r as { forYou: boolean }).forYou && (
                      <span
                        data-testid="guide-for-you"
                        title="This channel’s programming matches your taste rules"
                        className="inline-flex items-center gap-0.5 rounded bg-[#ff1493]/20 px-1 py-0.5 text-[9px] font-black tracking-wide text-pink-200"
                      >
                        <Dna size={10} aria-hidden /> FOR YOU
                      </span>
                    )}
                  </h3>
                  {r.onNow && (
                    <span className="flex-none rounded bg-emerald-500/20 px-1.5 py-0.5 text-[10px] font-black uppercase tracking-wide text-emerald-200">
                      On now
                    </span>
                  )}
                </div>

                {r.onNow && (
                  <div className={`mt-1.5 ${onNowPaid ? 'opacity-60' : ''}`} data-testid="guide-on-now">
                    <div className="flex items-baseline gap-2">
                      <span className="flex min-w-0 items-baseline gap-1.5 truncate text-[15px] font-semibold text-white">
                        {r.onNow.showType === 'Movie' && <Film size={14} className="flex-none self-center text-slate-400" aria-hidden />}
                        <span className="truncate">{r.onNow.showName}</span>
                      </span>
                      {r.onNow.year != null && <span className="flex-none text-xs text-slate-500">{r.onNow.year}</span>}
                      {onNowPaid ? (
                        <span className="flex-none rounded bg-white/10 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-slate-400" data-testid="guide-paid">
                          Paid programming
                        </span>
                      ) : (
                        r.onNow.match != null && (
                          <ScoreBadge score={r.onNow.match} personalized={personalized} why={r.onNow.matchWhy ?? null} />
                        )
                      )}
                    </div>
                    {/* How far in — so "join late?" is answerable at a glance. */}
                    {r.progress != null && (
                      <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-white/10" aria-hidden>
                        <div className="h-full rounded-full bg-emerald-400/80" style={{ width: `${Math.round(r.progress * 100)}%` }} />
                      </div>
                    )}
                    {gapAfter(r.onNow) && <GapRow gap={gapAfter(r.onNow)!} clockOf={clockOf} />}
                  </div>
                )}

                {r.upNext.length > 0 && (
                  <div className="mt-2 space-y-0.5" data-testid="guide-up-next">
                    {r.upNext.map((a) => {
                      const isSet = reminded.has(a.id);
                      const isSaved = saved.has(a.id);
                      const paid = isPaidProgramming(a);
                      const gap = gapAfter(a);
                      return (
                        <div key={a.id}>
                          <div className={`flex items-center gap-2 text-[13px] ${paid ? 'opacity-60' : ''}`}>
                            <span suppressHydrationWarning className="flex-none font-bold tabular-nums text-slate-300">
                              {displayClock(a.airstamp, a.time) ?? '—'}
                            </span>
                            <span className="flex min-w-0 flex-1 items-center gap-1.5 truncate text-slate-400">
                              {a.showType === 'Movie' && <Film size={13} className="flex-none" aria-hidden />}
                              <span className="truncate">{a.showName}</span>
                              {!paid && a.match != null && (
                                <ScoreBadge score={a.match} personalized={personalized} why={a.matchWhy ?? null} size="sm" />
                              )}
                            </span>
                            {a.tmdbId != null && a.mediaType != null && (
                              <button
                                type="button"
                                onClick={() => void save(a)}
                                disabled={isSaved || busy === a.id}
                                aria-label={isSaved ? `${a.showName} saved` : `Save ${a.showName} to your watchlist`}
                                data-testid={`guide-save-${a.id}`}
                                className={`grid h-8 w-8 flex-none place-items-center rounded-lg border transition active:scale-95 ${
                                  isSaved
                                    ? 'border-[#ff1493]/40 bg-[#ff1493]/15 text-pink-200'
                                    : 'border-white/15 bg-white/[0.05] text-slate-300 hover:border-brand-300 hover:text-white'
                                }`}
                              >
                                {isSaved ? <Check size={16} aria-hidden /> : <Bookmark size={16} aria-hidden />}
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => void remind(a)}
                              disabled={isSet || busy === a.id}
                              aria-label={isSet ? `Reminder set for ${a.showName}` : `Remind me before ${a.showName} starts`}
                              data-testid={`guide-remind-${a.id}`}
                              className={`grid h-8 w-8 flex-none place-items-center rounded-lg border transition active:scale-95 ${
                                isSet
                                  ? 'border-emerald-400/40 bg-emerald-500/15 text-emerald-200'
                                  : 'border-white/15 bg-white/[0.05] text-slate-300 hover:border-brand-300 hover:text-white'
                              }`}
                            >
                              {isSet ? <Check size={16} aria-hidden /> : <AlarmClock size={16} aria-hidden />}
                            </button>
                          </div>
                          {gap && <GapRow gap={gap} clockOf={clockOf} />}
                        </div>
                      );
                    })}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

/** "We can't see this stretch" — a hole in the data, named instead of skipped. */
function GapRow({ gap, clockOf }: { gap: { fromMs: number; toMs: number }; clockOf: (ms: number) => string }) {
  return (
    <div
      suppressHydrationWarning
      data-testid="guide-gap"
      className="mt-0.5 rounded-md border border-dashed border-white/10 px-2 py-1 text-[11px] text-slate-500"
    >
      No listing data {clockOf(gap.fromMs)}–{clockOf(gap.toMs)}
    </div>
  );
}
