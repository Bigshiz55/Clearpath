'use client';

import { dayLabel } from '@/lib/viewing/localDay';
import { useState } from 'react';
import Link from 'next/link';
import { RemindButton } from '@/components/RemindButton';
import { WCheck } from '@/components/WCheck';
import { CardDna } from '@/components/CardDna';
import { SaveButton } from '@/components/SaveButton';
import { CardVerdict } from '@/components/CardVerdict';
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

/** Day + clock, in the viewer's zone; the day word from the shared, DST-safe
 *  `localDay` module. */
function whenLabel(iso: string): string {
  const d = new Date(iso);
  // Force 12-hour AM/PM regardless of the device/server locale.
  const time = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
  return `${dayLabel(iso, Date.now(), 'long')} · ${time}`;
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
                    <div key={p.id} className="wv-det-row rounded-2xl border border-white/10 bg-white/[0.04] p-4" data-testid="detective-row">
                      <div className="wv-det-art">
                        {/* The W sits on the artwork here exactly as it does on
                            every card — same gesture, same place, so putting a
                            listing on the docket is the same action as putting
                            a poster on it. */}
                        <div className="relative aspect-[2/3] w-full overflow-hidden rounded-xl border border-white/10 bg-ink-800">
                          {p.tmdbId && p.mediaType && (
                            <WCheck tmdbId={p.tmdbId} mediaType={p.mediaType} title={p.showName} year={null} posterUrl={p.image ?? null} />
                          )}
                          {p.image ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={p.image} alt="" loading="lazy" className="h-full w-full object-cover" />
                          ) : (
                            <div className="grid h-full w-full place-items-center text-xs text-slate-500">TV</div>
                          )}
                        </div>
                      </div>

                      {/* The listing itself. */}
                      <div className="wv-det-info">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="rounded-lg border border-brand-400/40 bg-brand-500/20 px-2.5 py-1 text-sm font-black text-brand-100">
                            {whenLabel(p.airstamp)}
                          </span>
                          <span className="rounded-lg border border-white/15 bg-white/5 px-2.5 py-1 text-sm font-bold text-white">
                            📺 {p.network}
                          </span>
                        </div>

                        {p.tmdbId && p.mediaType ? (
                          <Link href={`/app/title/${p.mediaType}/${p.tmdbId}`} className="mt-2 line-clamp-2 block text-lg font-black leading-tight text-white hover:text-brand-200">
                            {p.showName}
                          </Link>
                        ) : (
                          <div className="mt-2 line-clamp-2 text-lg font-black leading-tight text-white">{p.showName}</div>
                        )}
                        {ep && <div className="mt-0.5 line-clamp-1 text-sm text-slate-300">{ep}</div>}
                        {p.showType && <div className="mt-0.5 text-xs uppercase tracking-wide text-slate-500">{p.showType}</div>}

                        <div className="mt-2"><Ratings p={p} /></div>
                      </div>

                      {/* Your DNA score gets its own column rather than being
                          stretched across whatever the text column left over. */}
                      <div className="wv-det-verdict">
                        {p.tmdbId && p.mediaType && <CardDna mediaType={p.mediaType} tmdbId={p.tmdbId} />}
                      </div>

                      <div className="wv-det-act">
                        {/* Not a bell. See RemindButton — the arcs only move
                            while the reminder is actually set. */}
                        <RemindButton
                          airingId={p.id}
                          showName={p.showName}
                          network={p.network}
                          airstamp={p.airstamp}
                          initialOn={reminded.has(p.id)}
                          onError={(m) => setNotice(m)}
                        />
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
                            <CardVerdict
                              tmdbId={p.tmdbId}
                              mediaType={p.mediaType}
                              title={p.showName}
                              year={null}
                              posterPath={null}
                            />
                          </>
                        )}
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
