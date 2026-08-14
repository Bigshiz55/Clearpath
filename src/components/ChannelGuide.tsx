'use client';

import { useMemo, useState } from 'react';
import { AlarmClock, Bookmark, Check, Dna, Film, Tv } from 'lucide-react';
import {
  GUIDE_CATEGORIES,
  buildChannelGuide,
  diagnoseMoviesEmpty,
  filterGuide,
  filterGuideByCategory,
  filterGuideByMedia,
  guideSummary,
  isPaidProgramming,
  moviesDiagnostics,
  repeatStatusFor,
  scheduleGaps,
  type GuideMediaFilter,
  type RepeatStatus,
} from '@/lib/tv/channelGuide';
import { channelIdentity, channelHue } from '@/lib/tv/channelNames';
import { rankGuideForTaste, type TasteRule } from '@/lib/tv/channelAffinity';
import { displayClock } from '@/lib/viewing/clock';
import { setTvReminder } from '@/lib/actions/tvReminders';
import { addToWatchlist } from '@/lib/actions/watchlist';
import { ScoreBadge } from '@/components/tv/ScoreBadge';
import { Verd1ctBadgePlaceholder } from '@/components/Verd1ctBadge';
import type { Airing } from '@/lib/onTv';
import { NetworkChip } from '@/components/media/ProviderChip';

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
  coverageProvable = false,
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
  /** True only while a LICENSED full-grid provider is supplying
   *  (`hasLiveFullGridProvider()` at the page). Gates every "that's the
   *  schedule" claim: without provable coverage, an empty filter result is
   *  a statement about our sources, never about the schedule. Defaults to
   *  false — the honest direction for any caller that doesn't say. */
  coverageProvable?: boolean;
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
        {/* The header sentence is computed from the SAME rows it describes.
            "N channels" read as the size of the dial — it is not; it is how
            many channels had anything to show in this window. Naming that
            makes a small number honest instead of alarming: 12 channels with
            listings is a true statement about coverage, where "12 channels"
            under a heading that said "every channel" was a contradiction the
            user was left to resolve. */}
        <p className="text-xs text-slate-400" data-testid="guide-stats">
          <b className="text-slate-200">{stats.channels}</b>{' '}
          {stats.channels === 1 ? 'channel' : 'channels'} with listings
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
        (() => {
          const coverage = { fullGridProviderLive: coverageProvable };
          const moviesZero = media === 'movie' && !query.trim();
          const d = moviesZero ? diagnoseMoviesEmpty(rows, airings, nowMs, coverage) : null;
          const diag = moviesZero ? moviesDiagnostics(rows, airings, nowMs, coverage) : null;
          return (
        <div
          className="space-y-2 rounded-xl border border-white/10 bg-white/[0.03] p-4"
          data-testid="guide-no-match"
          /* The structured record behind whichever sentence renders — the
             observability trail (coverage status, window contents, raw-vs-
             normalized classification, exclusion reason) stays queryable on
             the DOM instead of living only in prose. */
          data-coverage={diag?.coverage}
          data-listings={diag?.listingsInWindow}
          data-movie-listings={diag?.movieListings}
          data-movies-visible={diag?.moviesVisible}
          data-started-no-runtime={diag?.startedNoRuntime}
        >
          {/* THE MOVIES ZERO IS FOUR DIFFERENT TRUTHS (see diagnoseMoviesEmpty)
              and each gets its own sentence: only a PROVEN grid may call the
              window empty ("that's the schedule"); an unproven source names
              its own blind spot instead of blaming the schedule; a category/
              search intersection names the combination that removed movies;
              and movie listings hidden by a missing source runtime name the
              failing BOUNDARY out loud. The chip is never disabled, nothing
              auto-switches to All, and no unrelated channel is padded in to
              avoid the zero. */}
          <p className="text-sm text-slate-400" data-testid={d ? `guide-movies-${d.kind}` : undefined}>
            {query.trim()
              ? `Nothing in the guide matches “${query.trim()}” — by channel name or by what’s on.`
              : d
                ? (() => {
                    if (d.kind === 'filtered-out')
                      return `Movies are on in this window — but none on ${cat ? `the ${GUIDE_CATEGORIES.find((c) => c.key === cat)?.label ?? cat} channels` : 'the channels these filters leave'}. Clear a filter to see them.`;
                    if (d.kind === 'unprovable-now')
                      return `${d.startedNoRuntime} movie listing${d.startedNoRuntime === 1 ? '' : 's'} started earlier but the source sent no runtime, so the guide can’t honestly claim ${d.startedNoRuntime === 1 ? 'it’s' : 'they’re'} still on. That’s a data gap at the source, not an empty schedule.`;
                    if (d.kind === 'coverage-unprovable')
                      return `No movie appears in the listings we can see${d.channelsWithListings > 0 ? ` (${d.channelsWithListings} channel${d.channelsWithListings === 1 ? '' : 's'} with listings)` : ''} — but our current source is an episode database, not a full TV grid, and movies on cable mostly never appear in it. That’s a limit of our coverage, not proof of an empty schedule.`;
                    return `No listing in this window is classified as a movie${d.channelsWithListings > 0 ? ` — ${d.channelsWithListings} channel${d.channelsWithListings === 1 ? ' has' : 's have'} listings, all shows` : ''}. That’s the schedule, not missing data.`;
                  })()
                : coverageProvable
                  ? 'No channel we can see matches those filters right now — that’s the schedule, not missing data.'
                  : 'No channel matches those filters within the listings we can see. Our source doesn’t carry every channel, so there may simply be no data for what you’re after.'}
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
          );
        })()
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
            // SAME SHOW, BACK TO BACK — is the later slot a new episode, the
            // earlier one repeated, or can we not tell? Computed once per row
            // against the SAME visible sequence the gap detector uses, then
            // read back out by index below. index 0 (on-now, or up-next[0]
            // when nothing's on now) has nothing before it to compare against.
            const repeatTags = visible.map((a, i) => (i === 0 ? null : repeatStatusFor(visible[i - 1]!, a)));
            const upNextOffset = r.onNow ? 1 : 0;
            const forYou = 'forYou' in r && (r as { forYou: boolean }).forYou;
            // ONE SCORE, NOT AN ECHO OF IT. The on-now programme always shows
            // its score — that IS the headline. An up-next row only repeats
            // the badge when the number actually CHANGED, so three slots of
            // the same rerun don't print "Your 83" three times in a row.
            let lastShownScore = r.onNow != null && !onNowPaid ? (r.onNow.match ?? null) : null;
            return (
              <li
                key={r.network}
                // A TOUCH LIGHTER THAN THE PAGE, ON PURPOSE. `.card`'s own fill
                // (ink-850 at 70%) reads almost flush with the ink-950 page
                // behind it once the blue border went away — there was nothing
                // left marking where one card ends and the page begins. This
                // is a plain override (utilities beat `.card` in the layer
                // order), not a new class — the border logic is untouched.
                className={`card bg-ink-800/70 p-2.5 transition ${
                  forYou ? 'border-brand-400/55 shadow-[0_0_0_1px_rgba(79,134,255,0.14)]' : 'hover:border-brand-400/40'
                }`}
                data-testid="guide-channel"
              >
                <div className="flex items-baseline justify-between gap-2">
                  <h3 className="flex min-w-0 items-center gap-2 truncate text-sm font-black uppercase tracking-wide text-white">
                    {/* THE STATION'S OWN MARK WHEN WE HOLD ONE, the monogram
                        when we do not. `tv_stations.logo_url` is licensed data
                        and is plumbed through `ingestedGuide` → `channelGuide`
                        → here, so a licensed source lights every row up without
                        another change. Until then the monogram stands: it is a
                        stable, honest identity, and it is emphatically not a
                        borrowed streaming logo or a television emoji. */}
                    {r.networkLogoUrl ? (
                      <NetworkChip name={id.name} logoUrl={r.networkLogoUrl} />
                    ) : (
                      <span
                        aria-hidden
                        className="grid h-6 w-9 flex-none place-items-center rounded-md text-[9px] font-black tracking-wide"
                        style={{ backgroundColor: `hsl(${channelHue(id.name)} 45% 22%)`, color: `hsl(${channelHue(id.name)} 80% 82%)` }}
                      >
                        {id.monogram}
                      </span>
                    )}
                    <span className="truncate" title={id.mapped ? `${id.name} (${r.network})` : id.name} data-testid="guide-channel-name">
                      {id.name}
                    </span>
                    {forYou && (
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
                  // THE MOST IMPORTANT LINE ON THE CARD. A quiet raised panel
                  // and a larger, bolder title separate "on now" from the
                  // quieter up-next rows below it at a glance, not just by
                  // the "On now" pill up in the header.
                  <div
                    className={`mt-1.5 rounded-lg border border-white/[0.06] bg-white/[0.035] p-2 ${onNowPaid ? 'opacity-60' : ''}`}
                    data-testid="guide-on-now"
                  >
                    <div className="flex items-baseline gap-2">
                      <span className="flex min-w-0 items-baseline gap-1.5 truncate text-base font-bold text-white">
                        {r.onNow.showType === 'Movie' && <Film size={14} className="flex-none self-center text-slate-400" aria-hidden />}
                        <span className="truncate">{r.onNow.showName}</span>
                      </span>
                      {r.onNow.year != null && <span className="flex-none text-xs text-slate-500">{r.onNow.year}</span>}
                      {onNowPaid ? (
                        <span className="flex-none rounded bg-white/10 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-slate-400" data-testid="guide-paid">
                          Paid programming
                        </span>
                      ) : r.onNow.match != null ? (
                        <ScoreBadge score={r.onNow.match} personalized={personalized} why={r.onNow.matchWhy ?? null} />
                      ) : (
                        /* The CANONICAL missing state — scoring targets what's
                           on now first, so an unscored on-now really is a
                           missing score, said the same way every card says it.
                           (Up-next rows stay unmarked: only a bounded head of
                           the window is scored BY DESIGN, and marking design
                           as absence would be a false report.) */
                        <Verd1ctBadgePlaceholder px={28} tv={false} className="flex-none self-center" />
                      )}
                    </div>
                    {/* Episode title / case name — the only way to tell one
                        True Crime episode from another with the same show
                        name, or a rerun from tonight's new hour. */}
                    {r.onNow.episodeName && (
                      <div className="mt-0.5 truncate text-[12px] text-slate-300" data-testid="guide-on-now-episode" title={r.onNow.episodeName}>
                        {r.onNow.episodeName}
                      </div>
                    )}
                    {/* How far in — so "join late?" is answerable at a glance. */}
                    {r.progress != null && (
                      <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-white/[0.08]" aria-hidden>
                        <div
                          className="h-full rounded-full bg-emerald-400 shadow-[0_0_5px_rgba(52,211,153,0.55)]"
                          style={{ width: `${Math.round(r.progress * 100)}%` }}
                        />
                      </div>
                    )}
                    {gapAfter(r.onNow) && <GapRow gap={gapAfter(r.onNow)!} clockOf={clockOf} />}
                  </div>
                )}

                {r.upNext.length > 0 && (
                  <div className="mt-1.5 space-y-0.5" data-testid="guide-up-next">
                    {r.upNext.map((a, i) => {
                      const isSet = reminded.has(a.id);
                      const isSaved = saved.has(a.id);
                      const paid = isPaidProgramming(a);
                      const gap = gapAfter(a);
                      const repeatTag = repeatTags[i + upNextOffset];
                      // Only the FIRST slot to carry a new score value shows
                      // the badge — see `lastShownScore` above the row loop.
                      const showScore = !paid && a.match != null && a.match !== lastShownScore;
                      if (!paid && a.match != null) lastShownScore = a.match;
                      return (
                        <div key={a.id}>
                          {/* Paid programming still mutes — that dimming is
                              earning its keep (it's marking "not real
                              programming"). A normal up-next slot doesn't get
                              a blanket opacity anymore: that was stacking on
                              top of already-quiet slate colors below and the
                              two together read as faded, not calm. */}
                          <div className={`flex items-center gap-2 text-[12px] ${paid ? 'opacity-60' : ''}`}>
                            <span suppressHydrationWarning className="flex-none font-semibold tabular-nums text-slate-300">
                              {displayClock(a.airstamp, a.time) ?? '—'}
                            </span>
                            <span className="flex min-w-0 flex-1 items-center gap-1.5 truncate text-slate-300">
                              {/* The movie marker used to be a 🎬 inside the
                                  text run; it is an icon now, which neither a
                                  text assertion nor a screen reader can see.
                                  The testid gives the suite a hook and the
                                  sr-only word gives the marker a name. */}
                              {a.showType === 'Movie' && (
                                <span className="flex-none" data-testid="guide-movie-mark">
                                  <Film size={12} aria-hidden />
                                  <span className="sr-only">Movie</span>
                                </span>
                              )}
                              <span className="truncate" title={a.episodeName ? `${a.showName} — ${a.episodeName}` : a.showName}>
                                {a.showName}
                                {a.episodeName && <span className="text-slate-400"> — {a.episodeName}</span>}
                              </span>
                              {repeatTag && <RepeatTag status={repeatTag} />}
                              {showScore && <ScoreBadge score={a.match!} personalized={personalized} why={a.matchWhy ?? null} size="sm" />}
                            </span>
                            {a.tmdbId != null && a.mediaType != null && (
                              <button
                                type="button"
                                onClick={() => void save(a)}
                                disabled={isSaved || busy === a.id}
                                aria-label={isSaved ? `${a.showName} saved` : `Save ${a.showName} to your watchlist`}
                                data-testid={`guide-save-${a.id}`}
                                className={`grid h-6 w-6 flex-none place-items-center rounded-md transition active:scale-95 ${
                                  isSaved ? 'text-pink-300' : 'text-slate-400 hover:bg-white/[0.08] hover:text-pink-200'
                                }`}
                              >
                                {isSaved ? <Check size={14} aria-hidden /> : <Bookmark size={14} aria-hidden />}
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => void remind(a)}
                              disabled={isSet || busy === a.id}
                              aria-label={isSet ? `Reminder set for ${a.showName}` : `Remind me before ${a.showName} starts`}
                              data-testid={`guide-remind-${a.id}`}
                              className={`grid h-6 w-6 flex-none place-items-center rounded-md transition active:scale-95 ${
                                isSet ? 'text-emerald-300' : 'text-slate-400 hover:bg-white/[0.08] hover:text-emerald-200'
                              }`}
                            >
                              {isSet ? <Check size={14} aria-hidden /> : <AlarmClock size={14} aria-hidden />}
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

/** Same show, back to back — new episode, a repeat, or we genuinely can't tell. */
function RepeatTag({ status }: { status: RepeatStatus }) {
  if (status === 'repeat') {
    return (
      <span
        data-testid="guide-repeat-tag"
        title="Same episode as the slot before it"
        className="flex-none rounded bg-amber-500/15 px-1 py-0.5 text-[9px] font-black uppercase tracking-wide text-amber-300"
      >
        Repeat
      </span>
    );
  }
  if (status === 'new-episode') {
    return (
      <span
        data-testid="guide-repeat-tag"
        title="A different episode from the slot before it"
        className="flex-none rounded bg-emerald-500/10 px-1 py-0.5 text-[9px] font-black uppercase tracking-wide text-emerald-300"
      >
        New
      </span>
    );
  }
  // SECONDARY, NOT DISABLED. bg-white/[0.05] + slate-500 read as a greyed-out
  // control rather than a real (if uncertain) answer — bumped both a step so
  // it stays the quietest of the three tags without looking inactive.
  return (
    <span
      data-testid="guide-repeat-tag"
      title="Same show as the slot before it — we can't tell if it's a repeat"
      className="flex-none rounded bg-white/10 px-1 py-0.5 text-[9px] font-black uppercase tracking-wide text-slate-300"
    >
      Repeat unknown
    </span>
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
