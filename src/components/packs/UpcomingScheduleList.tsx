import { Poster } from '@/components/PosterCard';
import type { UpcomingEntry } from '@/lib/packs/schedule';

/**
 * THE SCHEDULE THAT EXISTS, when no premiere can be verified.
 *
 * Replaces the giant empty "No premieres" panel with the pack's real upcoming
 * airings. Every entry is a stored tv_airings row; the badge names the class
 * of evidence — a provider-verified premiere, a derived first-known airing
 * (labelled as derived, never passed off as verified), or plain scheduled
 * programming. See src/lib/packs/schedule.ts for the classification rules.
 */

const KIND_BADGE: Record<UpcomingEntry['kind'], { label: string; className: string } | null> = {
  verified: { label: 'Premiere', className: 'bg-brand-500/20 text-brand-100 border-brand-400/50' },
  derived: { label: 'First airing in our data', className: 'bg-amber-500/15 text-amber-200 border-amber-400/40' },
  scheduled: null,
};

function whenLabel(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

export function UpcomingScheduleList({ entries }: { entries: UpcomingEntry[] }) {
  return (
    <div data-testid="pack-upcoming-schedule">
      <p className="mb-2 text-sm text-slate-400">
        No verified premieres right now — here’s what’s actually coming up on this Pack’s channels.
      </p>
      <ul className="space-y-2">
        {entries.slice(0, 30).map((e) => {
          const badge = KIND_BADGE[e.kind];
          return (
            <li
              key={e.airingId}
              data-testid="pack-upcoming-row"
              className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.03] p-2.5"
            >
              <span className="block h-14 w-10 flex-none overflow-hidden rounded-md bg-ink-800">
                <Poster posterUrl={e.posterUrl} title={e.title} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-white">{e.title}</p>
                <p className="text-[12px] text-slate-400">
                  {e.channel} · {whenLabel(e.startAtUtc)}
                </p>
              </div>
              {badge && (
                <span className={`flex-none rounded-md border px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ${badge.className}`}>
                  {badge.label}
                </span>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
