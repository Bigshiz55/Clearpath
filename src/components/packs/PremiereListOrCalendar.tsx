'use client';

import { useMemo, useState } from 'react';
import { Calendar as CalendarIcon, List } from 'lucide-react';
import { Poster } from '@/components/PosterCard';
import { SeenToggle } from './SeenToggle';
import { FollowButton } from './FollowButton';

export interface CreditedPerson {
  id: string;
  name: string;
  role: string;
  following: boolean;
}

export interface PremiereEntry {
  programmeId: string;
  title: string;
  posterUrl: string | null;
  channel: string;
  /** 'YYYY-MM-DD' */
  premiereDate: string;
  startAtUtc: string;
  seen: boolean;
  people: CreditedPerson[];
  /** Personal Watch DNA match, when the title has a cached fingerprint and the
   *  user has enough learned taste to score against — null otherwise, never a
   *  fabricated number. */
  dnaScore?: { score: number; reason: string } | null;
}

function timeLabel(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

function dayLabel(dateIso: string): string {
  return new Date(`${dateIso}T00:00:00Z`).toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
}

function EntryCard({ entry, packSlug, signedIn }: { entry: PremiereEntry; packSlug: string; signedIn: boolean }) {
  return (
    <div className="flex gap-3 rounded-xl border border-white/10 bg-white/[0.04] p-3">
      <div className="h-24 w-16 flex-shrink-0 overflow-hidden rounded-lg bg-ink-800">
        <Poster posterUrl={entry.posterUrl} title={entry.title} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate font-semibold text-white">{entry.title}</p>
        <p className="text-sm text-slate-400">
          {entry.channel} · {timeLabel(entry.startAtUtc)}
        </p>
        {entry.dnaScore && (
          <p className="mt-1 inline-flex items-center gap-1.5 text-[12px] font-semibold text-emerald-300">
            <span className="rounded-full border border-emerald-400/40 bg-emerald-500/15 px-1.5 py-0.5 tabular-nums">
              {entry.dnaScore.score}
            </span>
            {entry.dnaScore.reason}
          </p>
        )}
        {entry.people.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {entry.people.map((person) => (
              <div key={person.id} className="flex items-center gap-1 rounded-full border border-white/10 bg-white/[0.03] py-0.5 pl-2 pr-0.5">
                <span className="text-[12px] text-slate-300">{person.name}</span>
                {signedIn && (
                  <FollowButton
                    subscriptionType="person"
                    subject={person.id}
                    packSlug={packSlug}
                    initialTrackingId={person.following ? person.id : null}
                    label={person.name}
                  />
                )}
              </div>
            ))}
          </div>
        )}
        {signedIn && (
          <div className="mt-2">
            <SeenToggle subjectType="programme" subjectId={entry.programmeId} packSlug={packSlug} initialSeen={entry.seen} />
          </div>
        )}
      </div>
    </div>
  );
}

/** List grouped by date, or a month calendar grid — same fetched data, purely a client-side view toggle. */
export function PremiereListOrCalendar({
  entries,
  packSlug,
  signedIn,
}: {
  entries: PremiereEntry[];
  packSlug: string;
  signedIn: boolean;
}) {
  const [view, setView] = useState<'list' | 'calendar'>('list');

  const byDate = useMemo(() => {
    const map = new Map<string, PremiereEntry[]>();
    for (const e of entries) {
      const list = map.get(e.premiereDate) ?? [];
      list.push(e);
      map.set(e.premiereDate, list);
    }
    return map;
  }, [entries]);

  const sortedDates = useMemo(() => [...byDate.keys()].sort(), [byDate]);

  // Month grid for the month of the first entry (or today if none matched).
  const monthAnchor = sortedDates[0] ?? new Date().toISOString().slice(0, 10);
  const [year, month] = monthAnchor.split('-').map(Number) as [number, number];
  const firstOfMonth = new Date(Date.UTC(year, month - 1, 1));
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const leadingBlanks = firstOfMonth.getUTCDay();
  const cells: (string | null)[] = [
    ...Array.from({ length: leadingBlanks }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => `${year}-${String(month).padStart(2, '0')}-${String(i + 1).padStart(2, '0')}`),
  ];

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <div className="inline-flex rounded-full border border-white/15 p-0.5">
          {(['list', 'calendar'] as const).map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => setView(v)}
              aria-pressed={view === v}
              className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[13px] font-semibold transition ${
                view === v ? 'bg-brand-500 text-white' : 'text-slate-300 hover:text-white'
              }`}
            >
              {v === 'list' ? <List size={14} aria-hidden /> : <CalendarIcon size={14} aria-hidden />}
              {v === 'list' ? 'List' : 'Month'}
            </button>
          ))}
        </div>
      </div>

      {view === 'list' ? (
        <div className="space-y-5">
          {sortedDates.map((date) => (
            <section key={date}>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">{dayLabel(date)}</h3>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {byDate.get(date)!.map((entry) => (
                  <EntryCard key={entry.programmeId} entry={entry} packSlug={packSlug} signedIn={signedIn} />
                ))}
              </div>
            </section>
          ))}
        </div>
      ) : (
        <div>
          <div className="grid grid-cols-7 gap-1 text-center text-[11px] font-semibold uppercase text-slate-500">
            {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => (
              <div key={d}>{d}</div>
            ))}
          </div>
          <div className="mt-1 grid grid-cols-7 gap-1">
            {cells.map((date, i) => (
              <div
                key={i}
                className={`min-h-[72px] rounded-lg border p-1 text-left ${
                  date ? 'border-white/10 bg-white/[0.03]' : 'border-transparent'
                }`}
              >
                {date && (
                  <>
                    <div className="text-[11px] text-slate-500">{Number(date.slice(-2))}</div>
                    <div className="mt-0.5 space-y-0.5">
                      {(byDate.get(date) ?? []).slice(0, 3).map((e) => (
                        <div key={e.programmeId} className="truncate rounded bg-brand-500/20 px-1 text-[11px] text-brand-200" title={e.title}>
                          {e.title}
                        </div>
                      ))}
                      {(byDate.get(date)?.length ?? 0) > 3 && (
                        <div className="text-[10px] text-slate-500">+{(byDate.get(date)?.length ?? 0) - 3} more</div>
                      )}
                    </div>
                  </>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
