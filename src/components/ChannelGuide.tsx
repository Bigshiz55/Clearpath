'use client';

import { useMemo, useState } from 'react';
import {
  GUIDE_CATEGORIES,
  buildChannelGuide,
  filterGuide,
  filterGuideByCategory,
  filterGuideByMedia,
  guideSummary,
  type GuideMediaFilter,
} from '@/lib/tv/channelGuide';
import { rankGuideForTaste, type TasteRule } from '@/lib/tv/channelAffinity';
import { displayClock } from '@/lib/viewing/clock';
import { setTvReminder } from '@/lib/actions/tvReminders';
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
 * corrects, which is intended for a wall clock), and a channel we cannot see
 * simply is not a row.
 */
export function ChannelGuide({
  airings,
  nowMs,
  remindedIds = [],
  taste = [],
}: {
  airings: Airing[];
  nowMs: number;
  /** Airings this user already has a reminder for. */
  remindedIds?: number[];
  /** The user's own preference rules — the guide orders channels by them.
   *  Empty = the plain alphabetical guide, unchanged. */
  taste?: TasteRule[];
}) {
  const [query, setQuery] = useState('');
  const [media, setMedia] = useState<GuideMediaFilter>('all');
  const [cat, setCat] = useState<string | null>(null);
  const [reminded, setReminded] = useState<Set<number>>(() => new Set(remindedIds));
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
  // The header sentence counts what the toggles have left in view.
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
          : `Reminder set — we’ll ping you before ${a.showName} starts. ⏰`,
      );
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
          <b className="text-slate-200">{stats.channels}</b> channels · <b className="text-slate-200">{stats.onNow}</b> on now
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
          {([['all', 'All'], ['movie', '🎬 Movies'], ['tv', '📺 Shows']] as const).map(([v, label]) => (
            <button
              key={v}
              type="button"
              onClick={() => setMedia(v)}
              aria-pressed={media === v}
              data-testid={`guide-media-${v}`}
              className={`min-h-[36px] rounded-md px-3 text-sm font-semibold transition ${
                media === v ? 'bg-brand-500 text-white shadow-glow' : 'text-slate-300 hover:text-white'
              }`}
            >
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
        <ul className="space-y-2">
          {shown.map((r) => (
            <li key={r.network} className="card wv-tile p-3" data-testid="guide-channel">
              <div className="flex items-baseline justify-between gap-2">
                <h3 className="flex min-w-0 items-baseline gap-1.5 truncate text-sm font-black uppercase tracking-wide text-white">
                  {r.network}
                  {'forYou' in r && (r as { forYou: boolean }).forYou && (
                    <span
                      data-testid="guide-for-you"
                      title="This channel’s programming matches your taste rules"
                      className="rounded bg-[#ff1493]/20 px-1 py-0.5 text-[9px] font-black tracking-wide text-pink-200"
                    >
                      🧬 FOR YOU
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
                <div className="mt-1.5" data-testid="guide-on-now">
                  <div className="flex items-baseline gap-2">
                    <span className="min-w-0 truncate text-[15px] font-semibold text-white">
                      {r.onNow.showType === 'Movie' && <span aria-hidden className="mr-1">🎬</span>}
                      {r.onNow.showName}
                    </span>
                    {r.onNow.year != null && <span className="flex-none text-xs text-slate-500">{r.onNow.year}</span>}
                    {/* The programme's own engine match — the number the whole
                        app means by "Your NN", computed by the same
                        deterministic verdict, shown only when the listing was
                        confidently resolved to a real title. */}
                    {r.onNow.match != null && (
                      <span
                        data-testid="guide-match"
                        title={`Your match: ${r.onNow.match} — scored by your VERD1CT engine`}
                        className="flex-none rounded-md border border-[#ff1493]/50 bg-[#ff1493]/15 px-1.5 py-0.5 text-[11px] font-black tabular-nums text-pink-100"
                      >
                        Your {r.onNow.match}
                      </span>
                    )}
                  </div>
                  {/* How far in — so "join late?" is answerable at a glance. */}
                  {r.progress != null && (
                    <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-white/10" aria-hidden>
                      <div className="h-full rounded-full bg-emerald-400/80" style={{ width: `${Math.round(r.progress * 100)}%` }} />
                    </div>
                  )}
                </div>
              )}

              {r.upNext.length > 0 && (
                <div className="mt-2 space-y-0.5" data-testid="guide-up-next">
                  {r.upNext.map((a) => {
                    const isSet = reminded.has(a.id);
                    return (
                      <div key={a.id} className="flex items-center gap-2 text-[13px]">
                        <span suppressHydrationWarning className="flex-none font-bold tabular-nums text-slate-300">
                          {displayClock(a.airstamp, a.time) ?? '—'}
                        </span>
                        <span className="min-w-0 flex-1 truncate text-slate-400">
                          {a.showType === 'Movie' && <span aria-hidden className="mr-1">🎬</span>}
                          {a.showName}
                          {a.match != null && (
                            <span className="ml-1.5 rounded border border-[#ff1493]/40 bg-[#ff1493]/10 px-1 text-[10px] font-black tabular-nums text-pink-200">
                              {a.match}
                            </span>
                          )}
                        </span>
                        <button
                          type="button"
                          onClick={() => void remind(a)}
                          disabled={isSet || busy === a.id}
                          aria-label={isSet ? `Reminder set for ${a.showName}` : `Remind me before ${a.showName} starts`}
                          data-testid={`guide-remind-${a.id}`}
                          className={`grid h-8 w-8 flex-none place-items-center rounded-lg border text-sm transition active:scale-95 ${
                            isSet
                              ? 'border-emerald-400/40 bg-emerald-500/15 text-emerald-200'
                              : 'border-white/15 bg-white/[0.05] text-slate-300 hover:border-brand-300 hover:text-white'
                          }`}
                        >
                          <span aria-hidden>{isSet ? '✓' : '⏰'}</span>
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
