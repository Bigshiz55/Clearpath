'use client';

import { useState } from 'react';
import Link from 'next/link';
import { setTvReminder, removeTvReminder } from '@/lib/actions/tvReminders';
import { CardDna } from '@/components/CardDna';
import { SaveButton } from '@/components/SaveButton';
import { TasteFeedback } from '@/components/TasteFeedback';
import type { MediaType } from '@/lib/types';

const VISIBLE = 12; // show a window of the pool; hiding one slides the next in

interface Pick {
  id: number;
  showName: string;
  network: string | null;
  airstamp: string;
  showType: string;
  episodeName: string | null;
  season: number | null;
  number: number | null;
  image: string | null;
  tvmaze: number | null;
  imdb: number | null;
  rottenTomatoes: number | null;
  metascore: number | null;
  tmdbId: number | null;
  mediaType: MediaType | null;
}

function whenLabel(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  // Force 12-hour AM/PM regardless of the device/server locale.
  const time = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
  if (d.toDateString() === now.toDateString()) return `Today · ${time}`;
  if (new Date(now.getTime() + 86_400_000).toDateString() === d.toDateString()) return `Tomorrow · ${time}`;
  return `${d.toLocaleDateString('en-US', { weekday: 'long' })} · ${time}`;
}

function Ratings({ p }: { p: Pick }) {
  const has = p.tvmaze != null || p.imdb != null || p.rottenTomatoes != null || p.metascore != null;
  if (!has) return <div className="text-xs text-slate-500">Ratings not available yet</div>;
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-sm font-bold tabular-nums">
      {p.rottenTomatoes != null && (
        <span className={p.rottenTomatoes >= 60 ? 'text-red-300' : 'text-emerald-300'} title="Rotten Tomatoes (critics)">🍅 {p.rottenTomatoes}%</span>
      )}
      {p.imdb != null && <span className="rounded bg-[#f5c518] px-1.5 py-0.5 text-xs font-black text-black" title="IMDb">IMDb {p.imdb.toFixed(1)}</span>}
      {p.tvmaze != null && <span className="text-gold-300" title="TVmaze community score">★ {p.tvmaze.toFixed(1)}</span>}
    </div>
  );
}

type Horizon = 12 | 24 | 48;
const HORIZONS: Horizon[] = [12, 24, 48];
const horizonLabel = (h: Horizon) => `next ${h} hours`;

export function TvDetective() {
  const [state, setState] = useState<'idle' | 'scanning' | 'done'>('idle');
  const [hours, setHours] = useState<Horizon>(48);
  const [picks, setPicks] = useState<Pick[]>([]);
  const [reminded, setReminded] = useState<Set<number>>(new Set());
  const [hidden, setHidden] = useState<Set<number>>(new Set());
  const [busy, setBusy] = useState<number | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // Triage: drop a pick and let the next reserve item slide into view.
  function remove(id: number, note?: string) {
    setHidden((s) => new Set(s).add(id));
    if (note) setNotice(note);
  }

  async function scan(h: Horizon = hours) {
    setState('scanning');
    setHidden(new Set());
    try {
      const res = await fetch(`/api/detective?hours=${h}`);
      const data = await res.json();
      setPicks(data.picks ?? []);
      setReminded(new Set((data.remindedIds ?? []) as number[]));
    } catch {
      setPicks([]);
    } finally {
      setState('done');
    }
  }

  // Change the scan window. Re-scan immediately if we've already run one so the
  // list always matches the selected horizon.
  function pickHorizon(h: Horizon) {
    if (h === hours) return;
    setHours(h);
    if (state !== 'idle') scan(h);
  }

  const HorizonToggle = (
    <div className="inline-flex rounded-xl border border-white/15 bg-ink-900/60 p-1" role="group" aria-label="Scan window">
      {HORIZONS.map((h) => (
        <button
          key={h}
          type="button"
          onClick={() => pickHorizon(h)}
          disabled={state === 'scanning'}
          aria-pressed={hours === h}
          className={`rounded-lg px-3 py-1.5 text-sm font-bold transition disabled:opacity-60 ${
            hours === h ? 'bg-brand-500 text-white shadow' : 'text-slate-300 hover:text-white'
          }`}
        >
          {h}h
        </button>
      ))}
    </div>
  );

  async function toggle(p: Pick) {
    setBusy(p.id);
    try {
      if (reminded.has(p.id)) {
        await removeTvReminder(p.id);
        setReminded((s) => {
          const n = new Set(s);
          n.delete(p.id);
          return n;
        });
      } else {
        const r = await setTvReminder({ airingId: p.id, showName: p.showName, network: p.network, airstamp: p.airstamp, url: '/app/tv' });
        if (!r.ok) {
          setNotice(r.error ?? 'Could not set the reminder.');
          return;
        }
        setReminded((s) => new Set(s).add(p.id));
        setNotice(r.needsNotifications ? 'On the case! Turn on notifications in Settings so we can ping you before it airs.' : 'On the case — we’ll ping you 1 hour and 5 minutes before it starts. 🕵️');
      }
    } catch {
      setNotice('Something went wrong. Please try again.');
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="overflow-hidden rounded-2xl border border-brand-400/30 bg-gradient-to-br from-brand-500/12 to-ink-850 p-5">
      <div className="flex items-start gap-4">
        <span className="text-4xl" aria-hidden>🕵️</span>
        <div className="min-w-0 flex-1">
          <h2 className="text-lg font-bold text-white sm:text-xl">TV Guide Detective</h2>
          <p className="mt-1 text-sm text-slate-300">
            One tap and I’ll comb the <span className="font-semibold text-white">{horizonLabel(hours)}</span> of TV listings and
            hand you a shortlist worth recording or catching live — with the time, the channel, and every rating I can dig up.
          </p>
          <div className="mt-3">
            <div className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-400">How far ahead?</div>
            {HorizonToggle}
          </div>
          {state !== 'done' && (
            <button onClick={() => scan()} disabled={state === 'scanning'} className="btn-primary mt-4 px-5 py-2.5 disabled:opacity-70">
              {state === 'scanning' ? '🔎 On the case… scanning listings' : `🔎 Scan the ${horizonLabel(hours)}`}
            </button>
          )}
        </div>
      </div>

      {notice && (
        <div className="mt-4 flex items-center justify-between gap-3 rounded-xl border border-brand-400/40 bg-brand-500/10 px-4 py-3 text-sm text-brand-100">
          <span>{notice}</span>
          <span className="flex flex-none items-center gap-3">
            {notice.includes('Settings') && <Link href="/app/settings" className="font-bold underline">Turn on</Link>}
            <button onClick={() => setNotice(null)} aria-label="Dismiss" className="text-lg leading-none">×</button>
          </span>
        </div>
      )}

      {state === 'done' && (() => {
        const visible = picks.filter((p) => !hidden.has(p.id)).slice(0, VISIBLE);
        return (
        <div className="mt-5">
          {picks.length === 0 ? (
            <p className="text-sm text-slate-400">The trail went cold — nothing notable in the {horizonLabel(hours)}. Try a wider window or check back later.</p>
          ) : visible.length === 0 ? (
            <p className="text-sm text-slate-400">You’ve been through them all. Scan again or widen the window for more.</p>
          ) : (
            <>
              <div className="mb-3 text-sm font-bold uppercase tracking-wide text-brand-300">Case file · {visible.length} worth your time</div>
              <div className="space-y-3">
                {visible.map((p) => {
                  const ep = [
                    p.season != null && p.number != null ? `S${p.season}·E${p.number}` : null,
                    p.episodeName,
                  ]
                    .filter(Boolean)
                    .join(' · ');
                  return (
                    <div key={p.id} className="flex gap-4 rounded-2xl border border-white/10 bg-white/[0.04] p-4">
                      {/* Left column — poster + the actions, stacked under it. */}
                      <div className="flex w-32 flex-none flex-col gap-2 sm:w-36">
                        <div className="aspect-[2/3] w-full overflow-hidden rounded-xl border border-white/10 bg-ink-800">
                          {p.image ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={p.image} alt="" loading="lazy" className="h-full w-full object-cover" />
                          ) : (
                            <div className="grid h-full w-full place-items-center text-xs text-slate-500">TV</div>
                          )}
                        </div>

                        <button
                          onClick={() => toggle(p)}
                          disabled={busy === p.id}
                          className={`flex w-full items-center justify-center gap-1.5 rounded-xl border py-3 text-sm font-bold transition disabled:opacity-50 ${reminded.has(p.id) ? 'border-emerald-400/50 bg-emerald-500/15 text-emerald-100' : 'border-brand-400/50 bg-brand-500/15 text-brand-100 hover:bg-brand-500/25'}`}
                          title="Get a notification 1 hour and 5 minutes before it airs"
                        >
                          {reminded.has(p.id) ? '🔔 On' : '🔔 Remind'}
                        </button>
                        {p.tmdbId && p.mediaType && (
                          <>
                            <SaveButton
                              tmdbId={p.tmdbId}
                              mediaType={p.mediaType}
                              title={p.showName}
                              year={null}
                              posterPath={null}
                              variant="inline"
                              wide
                              onSaved={() => remove(p.id, 'Added to your list — pulled in another pick.')}
                            />
                            <TasteFeedback
                              tmdbId={p.tmdbId}
                              mediaType={p.mediaType}
                              title={p.showName}
                              year={null}
                              posterPath={null}
                              wide
                              onFlagged={() => remove(p.id)}
                            />
                          </>
                        )}
                      </div>

                      {/* Right column — the listing details. */}
                      <div className="flex min-w-0 flex-1 flex-col">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="rounded-lg border border-brand-400/40 bg-brand-500/20 px-2.5 py-1 text-base font-black text-brand-100">
                            {whenLabel(p.airstamp)}
                          </span>
                          <span className="rounded-lg border border-white/15 bg-white/5 px-2.5 py-1 text-base font-bold text-white">
                            📺 {p.network}
                          </span>
                        </div>

                        {p.tmdbId && p.mediaType ? (
                          <Link href={`/app/title/${p.mediaType}/${p.tmdbId}`} className="mt-2 line-clamp-2 text-lg font-black leading-tight text-white hover:text-brand-200">
                            {p.showName}
                          </Link>
                        ) : (
                          <div className="mt-2 line-clamp-2 text-lg font-black leading-tight text-white">{p.showName}</div>
                        )}
                        {ep && <div className="mt-0.5 line-clamp-1 text-sm text-slate-300">{ep}</div>}
                        {p.showType && <div className="mt-0.5 text-xs uppercase tracking-wide text-slate-500">{p.showType}</div>}

                        <div className="mt-2"><Ratings p={p} /></div>
                        {/* Your DNA score for this show (when it resolves + you're personalized). */}
                        {p.tmdbId && p.mediaType && <CardDna mediaType={p.mediaType} tmdbId={p.tmdbId} className="mt-2" />}
                      </div>
                    </div>
                  );
                })}
              </div>
              <button onClick={() => scan()} className="mt-4 text-sm font-bold text-brand-300 hover:text-brand-200">🔄 Scan again</button>
            </>
          )}
        </div>
        );
      })()}
    </section>
  );
}
