'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { QuickLook, type QuickLookTarget } from './QuickLook';
import {
  airingTimeRange,
  airingTodayLine,
  formatClock,
  httpsUrl,
  safeTimeZone,
  type BriefingChannel,
  type CaseBriefingSections,
} from '@/lib/tv/caseBriefing';
import { channelIdentity, channelHue } from '@/lib/tv/channelNames';
import type { Airing } from '@/lib/onTv';

/**
 * TODAY'S CASE BRIEFING — the editorial front page over the stored schedule.
 *
 * Everything on this page was selected server-side from canonical rows
 * (`selectCaseBriefing` over the imported day, scored ONCE by the existing
 * engine); this component's whole job is presentation and tap-through.
 * A matched item opens the canonical title experience (QuickLook, with an
 * "AIRING TODAY" line); an unmatched programme opens an honest
 * schedule-detail sheet built purely from stored facts — no item is dead.
 * Rendering, filtering by channel, or reopening details never costs a
 * provider call: the reads all happened against our own tables.
 */

/** The one-shot viewer-zone correction. The server renders the briefing in
 *  the `?tz=` zone (fallback: Eastern — see caseBriefing.ts); on mount, if
 *  the browser's real zone differs, replace the URL once so the server
 *  re-briefs the viewer's own literal calendar day. `tzLock` pins harness
 *  fixtures to their scripted zone. */
function useViewerZone(tz: string, tzLock: boolean | undefined) {
  const router = useRouter();
  const done = useRef(false);
  useEffect(() => {
    if (tzLock || done.current) return;
    done.current = true;
    const zone = safeTimeZone(Intl.DateTimeFormat().resolvedOptions().timeZone);
    if (zone && zone !== tz) {
      const params = new URLSearchParams(window.location.search);
      params.set('tz', zone);
      router.replace(`?${params.toString()}`);
    }
  }, [tz, tzLock, router]);
}

export function BriefingMasthead({ channelName, dateLine }: { channelName?: string | null; dateLine: string }) {
  return (
    <header className="border-y-4 border-double border-white/25 py-4 text-center" data-testid="briefing-masthead">
      <p className="text-[11px] font-bold uppercase tracking-[0.3em] text-slate-400">WatchVerd1ct · The Docket Edition</p>
      <h1 className="mt-1 text-2xl font-black uppercase tracking-[0.12em] text-white sm:text-4xl">
        Today’s Case Briefing{channelName ? <span className="text-pink-300"> · {channelName}</span> : null}
      </h1>
      <p className="mt-1 text-sm text-slate-300">{dateLine}</p>
    </header>
  );
}

/** The honest no-briefing state. Two distinct truths, each named: no proven
 *  coverage window (nothing imported / window aged out), or a proven window
 *  that simply holds no rows for this local day. Never a mock briefing. */
export function BriefingUnavailable({ reason, dateLine }: { reason: 'no-coverage' | 'no-rows'; dateLine: string }) {
  return (
    <div className="space-y-5">
      <BriefingMasthead dateLine={dateLine} />
      <div
        className="rounded-2xl border border-amber-400/30 bg-amber-500/[0.07] p-6 text-center"
        data-testid="briefing-empty"
        data-reason={reason}
      >
        <h2 className="text-lg font-bold text-white">
          {reason === 'no-coverage'
            ? 'Today’s briefing isn’t available yet because the current TV schedule hasn’t been loaded.'
            : 'The loaded TV schedule has no programmes for today.'}
        </h2>
        <p className="mx-auto mt-2 max-w-lg text-sm text-slate-300">
          {reason === 'no-coverage'
            ? 'This page is assembled from WatchVerd1ct’s own imported listings and your real verdicts — never from guesses. As soon as a schedule import lands and its coverage window includes today, the briefing writes itself.'
            : 'A schedule is loaded, but its stored coverage doesn’t include any airings for your local calendar day. Rather than pad the page, we say so.'}
        </p>
        <div className="mt-4 flex flex-wrap justify-center gap-2">
          <Link href="/app/tv" className="rounded-lg bg-brand-500 px-3.5 py-2 text-sm font-semibold text-white transition hover:bg-brand-400">
            On TV today
          </Link>
          <Link href="/app/tv?view=guide" className="rounded-lg border border-white/15 px-3.5 py-2 text-sm font-semibold text-slate-200 transition hover:bg-white/10">
            Live TV guide
          </Link>
        </div>
      </div>
    </div>
  );
}

function ChannelChip({ c, tz, active }: { c: BriefingChannel; tz: string; active: boolean }) {
  const logo = httpsUrl(c.logoUrl);
  return (
    <Link
      href={`?channel=${encodeURIComponent(c.name)}&tz=${encodeURIComponent(tz)}`}
      aria-label={`Open ${c.displayName} briefing`}
      aria-current={active ? 'page' : undefined}
      data-testid="briefing-rail-chip"
      data-channel={c.name}
      className={`flex w-16 flex-none flex-col items-center gap-1 rounded-xl border p-1.5 transition ${
        active ? 'border-pink-400/70 bg-pink-500/15' : 'border-white/10 bg-white/[0.04] hover:border-brand-300'
      }`}
    >
      {logo ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={logo} alt="" className="h-9 w-9 rounded-lg bg-white/10 object-contain" />
      ) : (
        <span
          aria-hidden
          className="grid h-9 w-9 place-items-center rounded-lg text-[11px] font-black text-white"
          style={{ backgroundColor: `hsl(${channelHue(c.displayName)} 45% 30%)` }}
        >
          {c.monogram}
        </span>
      )}
      <span className="w-full truncate text-center text-[10px] font-semibold leading-tight text-slate-300">
        {c.displayName}
      </span>
      {c.yours && <span aria-hidden className="-mt-0.5 h-1 w-1 rounded-full bg-pink-400" />}
    </Link>
  );
}

function ScoreBadge({ a, personalized }: { a: Airing; personalized: boolean }) {
  if (a.match == null) return null;
  return (
    <span
      className="flex-none rounded-md border border-pink-400/50 bg-pink-500/15 px-1.5 py-0.5 text-[10px] font-black uppercase tracking-wide text-pink-200"
      data-testid="briefing-score"
    >
      {personalized ? 'Your verdict' : 'Verdict'} <span className="tabular-nums text-sm">{a.match}</span>
    </span>
  );
}

function ItemRow({
  a,
  tz,
  nowMs,
  personalized,
  onOpen,
}: {
  a: Airing;
  tz: string;
  nowMs: number;
  personalized: boolean;
  onOpen: (a: Airing) => void;
}) {
  const s = Date.parse(a.airstamp);
  // Runtime-provable only — the same discipline every on-now read uses.
  const onNow = Number.isFinite(s) && a.runtime != null && a.runtime > 0 && s <= nowMs && nowMs < s + a.runtime * 60_000;
  return (
    <li>
      <button
        type="button"
        onClick={() => onOpen(a)}
        data-testid="briefing-item"
        className="flex w-full items-baseline gap-2.5 rounded-lg px-1.5 py-1.5 text-left transition hover:bg-white/[0.06]"
      >
        <span
          suppressHydrationWarning
          className={`w-[4.5rem] flex-none text-xs font-semibold tabular-nums ${onNow ? 'text-emerald-300' : 'text-gold-300'}`}
        >
          {onNow ? 'ON NOW' : Number.isFinite(s) ? formatClock(s, tz) : ''}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold text-slate-100">
            {a.showName}
            {a.isPremiere === true && (
              <span className="ml-1.5 rounded border border-gold-400/50 px-1 text-[9px] font-black uppercase tracking-wide text-gold-300">
                Premiere
              </span>
            )}
          </span>
          <span className="block truncate text-[11px] text-slate-500">
            {[channelIdentity(a.network).name, a.episodeName, a.genres[0]].filter(Boolean).join(' · ')}
          </span>
        </span>
        <ScoreBadge a={a} personalized={personalized} />
      </button>
    </li>
  );
}

function Section({
  id,
  kicker,
  personal,
  rows,
  tz,
  nowMs,
  personalized,
  onOpen,
}: {
  id: string;
  kicker: string;
  personal?: boolean;
  rows: Airing[];
  tz: string;
  nowMs: number;
  personalized: boolean;
  onOpen: (a: Airing) => void;
}) {
  if (rows.length === 0) return null;
  return (
    <section data-testid={`briefing-${id}`} aria-label={kicker}>
      <h2
        className={`border-t pt-2 text-[11px] font-black uppercase tracking-[0.22em] ${
          personal ? 'border-pink-400/40 text-pink-300' : 'border-white/20 text-slate-300'
        }`}
      >
        {kicker}
      </h2>
      <ul className="mt-1.5 space-y-0.5">
        {rows.map((a) => (
          <ItemRow key={a.id} a={a} tz={tz} nowMs={nowMs} personalized={personalized} onOpen={onOpen} />
        ))}
      </ul>
    </section>
  );
}

/** Honest schedule-detail sheet for a programme the engine has NOT matched to
 *  a catalog title: stored facts, plainly labelled — never a dead tap, never
 *  an invented rating. */
function ScheduleDetail({ a, tz, onClose }: { a: Airing; tz: string; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);
  const art = httpsUrl(a.image);
  return (
    <div
      className="fixed inset-0 z-[60] flex items-end justify-center bg-black/70 p-0 backdrop-blur-sm sm:items-center sm:p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={`${a.showName} schedule details`}
    >
      <div
        data-testid="briefing-schedule-detail"
        className="relative max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-t-2xl border border-white/10 bg-ink-900 p-5 shadow-card sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="absolute right-3 top-3 grid h-9 w-9 place-items-center rounded-full bg-black/60 text-lg text-white backdrop-blur transition hover:bg-black/80"
          aria-label="Close"
        >
          ✕
        </button>
        <p className="text-[11px] font-black uppercase tracking-wider text-gold-300">{airingTodayLine(a, tz)}</p>
        <h2 className="mt-1 pr-10 text-xl font-bold text-white">{a.showName}</h2>
        <p className="mt-0.5 text-xs text-slate-400">
          {[a.showType !== 'Scripted' ? a.showType : null, a.episodeName, a.season != null && a.number != null ? `S${a.season} · E${a.number}` : null]
            .filter(Boolean)
            .join(' · ') || 'Scheduled programme'}
          {a.isPremiere === true ? ' · Premiere' : ''}
        </p>
        {art && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={art} alt="" className="mt-3 max-h-44 w-full rounded-xl object-cover" />
        )}
        {a.genres.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {a.genres.map((g) => (
              <span key={g} className="rounded-full border border-white/10 bg-white/5 px-2.5 py-0.5 text-xs text-slate-300">
                {g}
              </span>
            ))}
          </div>
        )}
        {a.summary && <p className="mt-3 text-sm leading-relaxed text-slate-200">{a.summary}</p>}
        <p className="mt-4 border-t border-white/10 pt-3 text-xs text-slate-500">
          Schedule facts from the stored TV listings. This programme isn’t matched to a catalog title yet, so there’s no
          verdict to show — and we don’t invent one.
        </p>
        <p className="mt-2 text-xs text-slate-400">
          Time shown in your local time · {airingTimeRange(a, tz)}
        </p>
      </div>
    </div>
  );
}

export function CaseBriefing({
  briefing,
  tz,
  tzLock,
  nowMs,
  personalized,
  dateLine,
}: {
  briefing: CaseBriefingSections;
  tz: string;
  tzLock?: boolean;
  nowMs: number;
  personalized: boolean;
  dateLine: string;
}) {
  useViewerZone(tz, tzLock);
  const [look, setLook] = useState<{ target: QuickLookTarget; line: string } | null>(null);
  const [detail, setDetail] = useState<Airing | null>(null);

  const open = (a: Airing) => {
    if (a.tmdbId != null && a.mediaType) {
      setLook({
        target: { id: a.tmdbId, mediaType: a.mediaType, title: a.showName, year: a.year ?? null, posterPath: a.posterPath ?? null },
        line: airingTodayLine(a, tz),
      });
    } else {
      setDetail(a);
    }
  };

  const activeChannel = briefing.channel;
  const channelDisplay = activeChannel
    ? (briefing.channels.find((c) => c.name === activeChannel)?.displayName ?? channelIdentity(activeChannel).name)
    : null;
  // Rail order: the reader's own scored channels lead, the rest alphabetical.
  const rail = useMemo(
    () => [...briefing.channels.filter((c) => c.yours), ...briefing.channels.filter((c) => !c.yours)],
    [briefing.channels],
  );

  const lead = briefing.leadCase;
  const leadArt = lead ? httpsUrl(lead.image) : null;

  return (
    <div className="space-y-5" data-testid="briefing-root">
      <BriefingMasthead channelName={channelDisplay} dateLine={dateLine} />

      {/* THE CHANNEL RAIL — every channel still carrying something today, the
          reader's own channels first. Horizontal by design (it is a rail);
          the PAGE is the only vertical scroller. Filtering re-reads stored
          rows on the server — never a provider call. */}
      <nav aria-label="Channels" data-testid="briefing-rail" className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1.5">
        <Link
          href={`?tz=${encodeURIComponent(tz)}`}
          aria-label="Open the full briefing — all channels"
          aria-current={activeChannel == null ? 'page' : undefined}
          data-testid="briefing-rail-all"
          className={`flex w-16 flex-none flex-col items-center justify-center gap-1 rounded-xl border p-1.5 transition ${
            activeChannel == null ? 'border-pink-400/70 bg-pink-500/15' : 'border-white/10 bg-white/[0.04] hover:border-brand-300'
          }`}
        >
          <span aria-hidden className="grid h-9 w-9 place-items-center rounded-lg bg-brand-500/30 text-[11px] font-black text-white">
            ALL
          </span>
          <span className="text-[10px] font-semibold text-slate-300">All channels</span>
        </Link>
        {rail.map((c) => (
          <ChannelChip key={c.name} c={c} tz={tz} active={c.name === activeChannel} />
        ))}
      </nav>

      {briefing.poolCount === 0 ? (
        /* HONEST EMPTY — a real zero from the stored schedule, named. */
        <div
          className="rounded-2xl border border-amber-400/30 bg-amber-500/[0.07] p-5 text-center"
          data-testid={activeChannel ? 'briefing-channel-empty' : 'briefing-day-done'}
        >
          <h2 className="text-lg font-bold text-white">
            {activeChannel ? `Nothing more on ${channelDisplay} today` : 'The day’s docket is closed'}
          </h2>
          <p className="mx-auto mt-1.5 max-w-md text-sm text-slate-300">
            {activeChannel
              ? 'The stored schedule has no remaining programmes for this channel today. That’s the schedule speaking, not a gap on our side.'
              : 'Nothing further is scheduled for today in the stored listings. Tomorrow’s briefing assembles itself after midnight, your time.'}
          </p>
          <div className="mt-3 flex flex-wrap justify-center gap-2">
            {activeChannel && (
              <Link href={`?tz=${encodeURIComponent(tz)}`} className="rounded-lg bg-brand-500 px-3.5 py-2 text-sm font-semibold text-white transition hover:bg-brand-400">
                Back to the full briefing
              </Link>
            )}
            <Link href="/app/tv?view=guide" className="rounded-lg border border-white/15 px-3.5 py-2 text-sm font-semibold text-slate-200 transition hover:bg-white/10">
              Open the channel guide
            </Link>
          </div>
        </div>
      ) : (
        <>
          {/* LEAD CASE — the engine's single best argument for tonight. */}
          {lead && (
            <article data-testid="briefing-lead">
              <button
                type="button"
                onClick={() => open(lead)}
                data-testid="briefing-item"
                className="grid w-full grid-cols-1 gap-4 rounded-2xl border border-pink-400/30 bg-gradient-to-br from-pink-500/[0.08] via-transparent to-brand-500/[0.08] p-4 text-left transition hover:border-pink-400/60 sm:p-5 lg:grid-cols-5"
              >
                {leadArt && (
                  <div className="lg:col-span-2">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={leadArt} alt="" className="max-h-56 w-full rounded-xl object-cover" />
                  </div>
                )}
                <div className={leadArt ? 'lg:col-span-3' : 'lg:col-span-5'}>
                  <p className="text-[11px] font-black uppercase tracking-[0.25em] text-pink-300">Lead case</p>
                  <h2 className="mt-1 text-2xl font-black leading-tight text-white sm:text-3xl">{lead.showName}</h2>
                  <p className="mt-1 text-[11px] font-black uppercase tracking-wider text-gold-300">{airingTodayLine(lead, tz)}</p>
                  <div className="mt-2.5 flex flex-wrap items-center gap-2">
                    <ScoreBadge a={lead} personalized={personalized} />
                    {lead.genres.slice(0, 3).map((g) => (
                      <span key={g} className="rounded-full border border-white/10 bg-white/5 px-2.5 py-0.5 text-xs text-slate-300">
                        {g}
                      </span>
                    ))}
                  </div>
                  {/* The badge's "why" comes from the engine's own working
                      (matchWhy) or doesn't appear. Never composed here. */}
                  {lead.matchWhy && (
                    <p className="mt-2 text-sm italic text-slate-300" data-testid="briefing-why">
                      Why it’s in your briefing: {lead.matchWhy}
                    </p>
                  )}
                  {lead.summary && <p className="mt-2 line-clamp-3 text-sm leading-relaxed text-slate-400">{lead.summary}</p>}
                </div>
              </button>
            </article>
          )}

          {!personalized && (
            <p className="rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm text-slate-300" data-testid="briefing-unpersonalized-note">
              This edition reports the schedule. Rate more titles and the briefing starts arguing your side of it —{' '}
              <Link href="/app/learn" className="font-semibold text-brand-300 hover:underline">
                teach the Judge your taste →
              </Link>
            </p>
          )}

          {/* THE FRONT PAGE — a main column and a sidebar, not a shelf wall. */}
          {/* grid-cols-1 is load-bearing: an implicit auto column sizes to
              max-content and overflows narrow phones; minmax(0,1fr) doesn't. */}
          <div className="grid grid-cols-1 gap-x-8 gap-y-5 lg:grid-cols-3">
            <div className="space-y-5 lg:col-span-2">
              <Section id="top-cases" kicker="Top cases today" personal rows={briefing.topCases} tz={tz} nowMs={nowMs} personalized={personalized} onOpen={open} />
              <Section id="tonight" kicker="Tonight’s docket" rows={briefing.tonightsDocket} tz={tz} nowMs={nowMs} personalized={personalized} onOpen={open} />
              <Section id="movies" kicker="Movies on the docket" rows={briefing.moviesOnTheDocket} tz={tz} nowMs={nowMs} personalized={personalized} onOpen={open} />
            </div>
            <div className="space-y-5">
              {briefing.wildcard && (
                <section data-testid="briefing-wildcard" aria-label="The wildcard">
                  <h2 className="border-t border-gold-400/40 pt-2 text-[11px] font-black uppercase tracking-[0.22em] text-gold-300">
                    The wildcard
                  </h2>
                  <p className="mt-1 text-[11px] text-slate-500">Scored for you, outside your usual genres.</p>
                  <ul className="mt-1 space-y-0.5">
                    <ItemRow a={briefing.wildcard} tz={tz} nowMs={nowMs} personalized={personalized} onOpen={open} />
                  </ul>
                </section>
              )}
              <Section id="worth" kicker="Worth watching for you" personal rows={briefing.worthWatching} tz={tz} nowMs={nowMs} personalized={personalized} onOpen={open} />
              <Section id="sports" kicker="Live & sports" rows={briefing.liveAndSports} tz={tz} nowMs={nowMs} personalized={personalized} onOpen={open} />
              <Section id="premieres" kicker="New & premieres" rows={briefing.newAndPremieres} tz={tz} nowMs={nowMs} personalized={personalized} onOpen={open} />
              <Section id="late" kicker="The late-night file" rows={briefing.lateNightFile} tz={tz} nowMs={nowMs} personalized={personalized} onOpen={open} />
            </div>
          </div>
        </>
      )}

      {look && <QuickLook target={look.target} airingLine={look.line} onClose={() => setLook(null)} />}
      {detail && <ScheduleDetail a={detail} tz={tz} onClose={() => setDetail(null)} />}
    </div>
  );
}
