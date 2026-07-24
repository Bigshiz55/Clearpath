import type { PersonalizedAiring } from '@/lib/ontv/types';
import { clockLabel } from '@/lib/ontv/time';
import { isForeignOriginal, englishDubAvailable, originLine } from '@/lib/lang/international';

/**
 * On TV program card — presentational, responsive, container-aware. Shows only the
 * fields that exist (missing data is omitted cleanly, never a row of dashes). Full
 * title/channel/time/Your Match/status stay visible; nothing is clipped. Actions
 * are 44px tap targets. No sports, no Judge Verity here.
 */
const bandStyle: Record<string, string> = {
  stream: 'bg-emerald-500/25 text-emerald-100',
  maybe: 'bg-amber-500/25 text-amber-100',
  skip: 'bg-slate-500/25 text-slate-200',
  unknown: 'bg-white/10 text-slate-300',
};
const bandLabel: Record<string, string> = { stream: 'STREAM IT', maybe: 'WORTH A LOOK', skip: 'SKIP', unknown: '—' };
const wjl: Record<string, { label: string; cls: string }> = {
  yes: { label: 'Yes — still worth joining', cls: 'text-emerald-300' },
  maybe: { label: 'Maybe — better from the start', cls: 'text-amber-300' },
  no: { label: 'No — too much missed', cls: 'text-slate-400' },
  not_started: { label: '', cls: '' },
};

export function ProgramCard({ item, tz, now, locale = 'en-US' }: { item: PersonalizedAiring; tz: string; now: number; locale?: string }) {
  const { program: p, channel: c, airing: a, status: s } = item;
  const onNow = s.state === 'on_now';
  const startLabel = clockLabel(a.startAt, tz, locale);
  const meta = [c.network ?? c.name, p.runtime ? `${p.runtime} min` : null, p.contentRating].filter(Boolean).join(' · ');
  const epLine = p.seasonNumber != null && p.episodeNumber != null ? `S${p.seasonNumber} E${p.episodeNumber}${p.episodeTitle ? ` · ${p.episodeTitle}` : ''}` : p.episodeTitle;

  return (
    <article className="card group flex h-full flex-col overflow-hidden">
      <div className="relative aspect-video overflow-hidden bg-gradient-to-br from-ink-700 to-ink-850">
        {p.artwork ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={p.artwork} alt="" loading="lazy" className="h-full w-full object-cover" />
        ) : null}
        <div className="absolute left-2 top-2 flex flex-wrap gap-1">
          <span className="rounded bg-black/70 px-1.5 py-0.5 text-[11px] font-bold text-white">{startLabel}</span>
          {a.isNew && <span className="rounded bg-brand-500/90 px-1.5 py-0.5 text-[10px] font-black uppercase text-white">New</span>}
          {a.isLive && !onNow && <span className="rounded bg-white/15 px-1.5 py-0.5 text-[10px] font-black uppercase text-slate-100">Live</span>}
          {onNow && <span className="rounded bg-red-500/90 px-1.5 py-0.5 text-[10px] font-black uppercase text-white">On now</span>}
        </div>
      </div>

      <div className="flex flex-1 flex-col gap-1.5 p-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h3 className="line-clamp-2 text-sm font-bold text-white">{p.title}</h3>
            {epLine && <p className="mt-0.5 line-clamp-1 text-xs text-slate-400">{epLine}</p>}
          </div>
          <span className="grid h-10 w-10 flex-none place-items-center rounded-lg bg-black/40 text-base font-black text-white" title="Your Match">{item.matchScore}</span>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <span className={`inline-flex items-center rounded-md px-1.5 py-0.5 text-[11px] font-black ${bandStyle[item.verdict]}`}>{bandLabel[item.verdict]}</span>
          <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{item.match.generalQuality ? 'General quality' : 'Your Match'}</span>
        </div>

        {meta && <p className="line-clamp-1 text-xs text-slate-400">{meta}</p>}

        {/* International origin: original language + verified English-audio status.
            Foreign original language is surfaced, never hidden. */}
        {isForeignOriginal(p.originalLanguage) && (
          <p className="line-clamp-1 text-[11px] font-semibold text-sky-300" title={originLine(p.originalLanguage, englishDubAvailable(p))}>
            {p.countryOfOrigin[0] ? `${p.countryOfOrigin[0]} · ` : ''}{originLine(p.originalLanguage, englishDubAvailable(p))}
          </p>
        )}

        {onNow ? (
          <div className="mt-0.5">
            <div className="flex items-center justify-between text-[11px] text-slate-300">
              <span>{s.minutesRemaining} min left</span>
              {item.joiningLate && item.joiningLate.verdict !== 'not_started' && (
                <span className={`font-semibold ${wjl[item.joiningLate.verdict]!.cls}`} title={item.joiningLate.reason}>
                  Join late: {item.joiningLate.verdict === 'yes' ? 'Yes' : item.joiningLate.verdict === 'maybe' ? 'Maybe' : 'No'}
                </span>
              )}
            </div>
            <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-white/10" role="progressbar" aria-valuenow={s.percentElapsed ?? 0} aria-valuemin={0} aria-valuemax={100} aria-label="Progress">
              <div className="h-full rounded-full bg-brand-500" style={{ width: `${s.percentElapsed ?? 0}%` }} />
            </div>
          </div>
        ) : (
          <p className="text-[11px] font-semibold text-brand-200">Starts in {Math.max(0, s.minutesUntilStart)} min</p>
        )}

        <div className="mt-auto grid grid-cols-4 gap-1 pt-1">
          {[
            { k: 'for', label: 'For', cls: 'border-emerald-400/50 bg-emerald-500/15 text-emerald-100' },
            { k: 'pass', label: 'Pass', cls: 'border-red-400/50 bg-red-500/15 text-red-200' },
            { k: 'save', label: 'Save', cls: 'border-white/20 bg-white/10 text-white' },
            { k: 'alert', label: onNow ? 'Watch' : 'Alert', cls: 'border-brand-400/50 bg-brand-500/20 text-brand-100' },
          ].map((b) => (
            <button key={b.k} type="button" data-testid="ontv-action" className={`flex h-11 min-w-0 items-center justify-center rounded-md border text-[11px] font-bold ${b.cls}`} aria-label={`${b.label} — ${p.title}`}>{b.label}</button>
          ))}
        </div>
      </div>
    </article>
  );
}
