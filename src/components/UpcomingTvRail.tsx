'use client';

/**
 * "COMING UP ON TV" — the home strip.
 *
 * Client, and deliberately so. This lived inside the home page (a server
 * component) and formatted its times with a bare `toLocaleTimeString`, which
 * means it rendered in the SERVER's zone — UTC on Vercel — and, because a
 * server component's HTML is never re-rendered in the browser, it stayed wrong.
 * That is the same fault already fixed on the full guide; this strip was
 * simply a second copy of it that the fix never reached.
 *
 * So the airings arrive as props and every clock is computed here, in the
 * viewer's own zone, with `suppressHydrationWarning` because a wall-clock time
 * differing between server and browser is the intended behaviour, not a bug to
 * silence. An airing that has already started says so rather than printing a
 * start time in the past under a heading that promises the future.
 *
 * Shape-wise it uses the shared `.wv-rail` so it snaps and hides its scrollbar
 * like the Top 10 does, instead of being a third hand-rolled horizontal scroll.
 */
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { airingStatus, displayClock, liveLabel } from '@/lib/viewing/clock';

export interface RailAiring {
  id: number;
  showName: string;
  network: string;
  image: string | null;
  rating: number | null;
  airstamp: string;
  /** Network-local "HH:MM" — only a fallback when the instant is unusable. */
  time: string;
  runtime: number | null;
}

/** "Today" / "Tomorrow" / weekday, from the real instant in the viewer's zone. */
function dayLabel(iso: string): string {
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return '';
  const d = new Date(ms);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) return 'Today';
  if (new Date(now.getTime() + 86_400_000).toDateString() === d.toDateString()) return 'Tomorrow';
  return d.toLocaleDateString([], { weekday: 'short' });
}

export function UpcomingTvRail({ airings }: { airings: RailAiring[] }) {
  // Ticks so a row flips to "On now" while the page is open, rather than
  // insisting a show starts in two minutes half an hour after it began.
  const [nowMs, setNowMs] = useState<number>(() => Date.now());
  useEffect(() => {
    const t = window.setInterval(() => setNowMs(Date.now()), 60_000);
    return () => window.clearInterval(t);
  }, []);

  if (airings.length === 0) return null;

  return (
    <section data-testid="upcoming-tv-rail">
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <h2 className="text-xl font-black tracking-tight text-white sm:text-2xl">📺 Coming up on TV</h2>
        <Link href="/app/tv" className="flex-none text-sm font-semibold text-brand-300 hover:underline">
          Full guide →
        </Link>
      </div>

      <ol className="wv-rail">
        {airings.map((a) => {
          const status = airingStatus(a.airstamp, a.runtime, nowMs);
          const clock = displayClock(a.airstamp, a.time);
          const when =
            status.state === 'live'
              ? liveLabel(status.startedMinutesAgo)
              : clock
                ? `${dayLabel(a.airstamp)} ${clock}`.trim()
                : dayLabel(a.airstamp);
          return (
            <li key={a.id} className="wv-rail-item" data-state={status.state}>
              <div className="aspect-[2/3] overflow-hidden rounded-xl bg-ink-800 shadow-lg shadow-black/50">
                {a.image ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={a.image} alt="" loading="lazy" className="h-full w-full object-cover" />
                ) : (
                  <div className="grid h-full w-full place-items-center p-2 text-center text-xs text-slate-400">
                    {a.showName}
                  </div>
                )}
              </div>
              <div className="mt-1.5 line-clamp-1 text-sm font-semibold text-white">{a.showName}</div>
              <div
                suppressHydrationWarning
                className={`text-xs font-bold ${status.state === 'live' ? 'text-emerald-300' : 'text-brand-200'}`}
              >
                {when}
              </div>
              <div className="flex items-center justify-between gap-1 text-xs text-slate-400">
                <span className="truncate">{a.network}</span>
                {a.rating != null && <span className="flex-none font-bold text-gold-300">★ {a.rating.toFixed(1)}</span>}
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
