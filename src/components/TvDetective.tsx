'use client';

import { useState } from 'react';
import Link from 'next/link';
import { setTvReminder, removeTvReminder } from '@/lib/actions/tvReminders';

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
}

function whenLabel(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const time = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  if (d.toDateString() === now.toDateString()) return `Today · ${time}`;
  if (new Date(now.getTime() + 86_400_000).toDateString() === d.toDateString()) return `Tomorrow · ${time}`;
  return `${d.toLocaleDateString([], { weekday: 'long' })} · ${time}`;
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
      {p.metascore != null && <span className="text-sky-300" title="Metacritic">Ⓜ {p.metascore}</span>}
      {p.tvmaze != null && <span className="text-gold-300" title="TVmaze community score">★ {p.tvmaze.toFixed(1)}</span>}
    </div>
  );
}

export function TvDetective() {
  const [state, setState] = useState<'idle' | 'scanning' | 'done'>('idle');
  const [picks, setPicks] = useState<Pick[]>([]);
  const [reminded, setReminded] = useState<Set<number>>(new Set());
  const [busy, setBusy] = useState<number | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function scan() {
    setState('scanning');
    try {
      const res = await fetch('/api/detective');
      const data = await res.json();
      setPicks(data.picks ?? []);
      setReminded(new Set((data.remindedIds ?? []) as number[]));
    } catch {
      setPicks([]);
    } finally {
      setState('done');
    }
  }

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
            One tap and I’ll comb the <span className="font-semibold text-white">next 48 hours</span> of TV listings and
            hand you a shortlist worth recording or catching live — with the time, the channel, and every rating I can dig up.
          </p>
          {state !== 'done' && (
            <button onClick={scan} disabled={state === 'scanning'} className="btn-primary mt-4 px-5 py-2.5 disabled:opacity-70">
              {state === 'scanning' ? '🔎 On the case… scanning listings' : '🔎 Scan the next 48 hours'}
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

      {state === 'done' && (
        <div className="mt-5">
          {picks.length === 0 ? (
            <p className="text-sm text-slate-400">The trail went cold — nothing notable in the next 48 hours. Try again later.</p>
          ) : (
            <>
              <div className="mb-3 text-sm font-bold uppercase tracking-wide text-brand-300">Case file · {picks.length} worth your time</div>
              <div className="space-y-3">
                {picks.map((p) => {
                  const ep = [
                    p.season != null && p.number != null ? `S${p.season}·E${p.number}` : null,
                    p.episodeName,
                  ]
                    .filter(Boolean)
                    .join(' · ');
                  return (
                    <div key={p.id} className="flex gap-4 rounded-2xl border border-white/10 bg-white/[0.04] p-4">
                      {/* Full poster graphic */}
                      <div className="h-32 w-[88px] flex-none overflow-hidden rounded-xl border border-white/10 bg-ink-800 sm:h-36 sm:w-24">
                        {p.image ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={p.image} alt="" loading="lazy" className="h-full w-full object-cover" />
                        ) : (
                          <div className="grid h-full w-full place-items-center text-xs text-slate-500">TV</div>
                        )}
                      </div>

                      <div className="flex min-w-0 flex-1 flex-col">
                        {/* Time + channel — big and clear */}
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="rounded-lg border border-brand-400/40 bg-brand-500/20 px-2.5 py-1 text-base font-black text-brand-100">
                            {whenLabel(p.airstamp)}
                          </span>
                          <span className="rounded-lg border border-white/15 bg-white/5 px-2.5 py-1 text-base font-bold text-white">
                            📺 {p.network}
                          </span>
                        </div>

                        <div className="mt-2 line-clamp-2 text-lg font-black leading-tight text-white">{p.showName}</div>
                        {ep && <div className="mt-0.5 line-clamp-1 text-sm text-slate-300">{ep}</div>}
                        {p.showType && <div className="mt-0.5 text-xs uppercase tracking-wide text-slate-500">{p.showType}</div>}

                        <div className="mt-2"><Ratings p={p} /></div>

                        <button
                          onClick={() => toggle(p)}
                          disabled={busy === p.id}
                          className={`mt-3 self-start rounded-xl border px-4 py-2.5 text-sm font-bold transition disabled:opacity-50 ${reminded.has(p.id) ? 'border-emerald-400/50 bg-emerald-500/15 text-emerald-100' : 'border-brand-400/50 bg-brand-500/15 text-brand-100 hover:bg-brand-500/25'}`}
                          title="Get a notification 1 hour and 5 minutes before it airs"
                        >
                          {reminded.has(p.id) ? '🔔 Reminder on' : '🔔 Remind me'}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
              <button onClick={scan} className="mt-4 text-sm font-bold text-brand-300 hover:text-brand-200">🔄 Scan again</button>
            </>
          )}
        </div>
      )}
    </section>
  );
}
