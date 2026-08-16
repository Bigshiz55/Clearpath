'use client';

import { useMemo } from 'react';
import { Clock, Film, Sparkles, Trophy } from 'lucide-react';
import { selectWhatsOnToday } from '@/lib/tv/whatsOnToday';
import type { Airing } from '@/lib/onTv';

/**
 * WHAT'S ON TODAY — a compact, sectioned read of the STORED schedule, shown
 * only while imported full-grid coverage is actually live (the page gates on
 * the same evidence the coverage banner uses). Reading it, filtering it, or
 * refreshing it never costs a provider call: every row here was already in
 * the canonical tables before this component rendered.
 *
 * Sections render only when the data supports them. "Worth Watching for You"
 * shows ONLY titles the existing engine scored (`match` from
 * scoreGuideAirings — the same number every card wears); unmatched titles
 * remain ordinary guide entries with no invented score.
 */
export function WhatsOnToday({ airings, nowMs, personalized }: { airings: Airing[]; nowMs: number; personalized: boolean }) {
  const s = useMemo(() => selectWhatsOnToday(airings, nowMs), [airings, nowMs]);

  const sections: { key: string; label: string; icon: React.ReactNode; rows: Airing[]; showScore?: boolean }[] = [
    { key: 'on-now', label: 'On Now', icon: <Clock size={14} aria-hidden />, rows: s.onNow },
    { key: 'worth-watching', label: 'Worth Watching for You', icon: <Sparkles size={14} aria-hidden />, rows: personalized ? s.worthWatching : [], showScore: true },
    { key: 'movies-today', label: 'Movies Today', icon: <Film size={14} aria-hidden />, rows: s.moviesToday },
    { key: 'sports-today', label: 'Sports Today', icon: <Trophy size={14} aria-hidden />, rows: s.sportsToday },
    { key: 'tonight', label: 'Tonight', icon: <Clock size={14} aria-hidden />, rows: s.tonight },
    { key: 'premieres', label: 'New & Premieres', icon: <Sparkles size={14} aria-hidden />, rows: s.newAndPremieres },
  ].filter((sec) => sec.rows.length > 0);

  if (sections.length === 0) return null;

  const clock = (iso: string) =>
    new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

  return (
    <section className="space-y-3" data-testid="whats-on-today" aria-label="What’s on today">
      <h2 className="text-lg font-bold text-white">What’s on today</h2>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {sections.map((sec) => (
          <div key={sec.key} className="card bg-ink-800/70 p-3" data-testid={`wot-${sec.key}`}>
            <h3 className="mb-2 flex items-center gap-1.5 text-xs font-black uppercase tracking-wide text-slate-300">
              {sec.icon}
              {sec.label}
            </h3>
            <ul className="space-y-1.5">
              {sec.rows.slice(0, 6).map((a) => (
                <li key={a.id} className="flex items-baseline gap-2 text-sm" data-testid="wot-row">
                  <span suppressHydrationWarning className="w-16 flex-none tabular-nums text-slate-400">
                    {clock(a.airstamp)}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-slate-100">{a.showName}</span>
                  <span className="max-w-[9rem] flex-none truncate text-[11px] text-slate-500">{a.network}</span>
                  {sec.showScore && a.match != null && (
                    <span className="flex-none rounded bg-brand-500/20 px-1.5 py-0.5 text-[11px] font-bold tabular-nums text-brand-200" data-testid="wot-score">
                      {a.match}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </section>
  );
}
