import Link from 'next/link';
import { tmdbImage } from '@/lib/tmdb/client';
import type { Briefing, BriefingPerson } from '@/lib/briefing';

function NotableList({ person }: { person: BriefingPerson }) {
  if (person.notableFor.length === 0) return null;
  return (
    <div className="mt-0.5 text-xs text-slate-400">
      Known for:{' '}
      {person.notableFor.map((n, i) => (
        <span key={`${n.mediaType}-${n.id}`}>
          {i > 0 && ', '}
          <Link href={`/app/title/${n.mediaType}/${n.id}`} className="text-brand-300 hover:underline">
            {n.title}
            {n.year ? ` (${n.year})` : ''}
          </Link>
          {n.voteAverage != null && <span className="text-gold-400"> ★{n.voteAverage.toFixed(1)}</span>}
        </span>
      ))}
    </div>
  );
}

function PersonAvatar({ person }: { person: BriefingPerson }) {
  const img = tmdbImage(person.profilePath, 'w185');
  return img ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={img} alt="" className="h-12 w-12 flex-shrink-0 rounded-full object-cover" loading="lazy" />
  ) : (
    <div className="grid h-12 w-12 flex-shrink-0 place-items-center rounded-full bg-white/10 text-sm font-bold text-slate-300">
      {person.name.slice(0, 1)}
    </div>
  );
}

export function TitleBriefing({ briefing, keywords = [] }: { briefing: Briefing; keywords?: string[] }) {
  const themes = keywords.filter((k) => k && k.length <= 24).slice(0, 10);
  const hasAnything = briefing.leads.length > 0 || briefing.cast.length > 0 || briefing.franchise || themes.length > 0;
  if (!hasAnything) return null;

  return (
    <section className="card p-5 sm:p-6">
      <h2 className="text-lg font-semibold text-white">The Dossier</h2>
      <p className="mt-1 text-xs text-slate-500">
        Who made it, who’s in it, and what it’s really about — every name, rating, and tag is real TMDB data,
        nothing invented.
      </p>

      {briefing.leads.length > 0 && (
        <div className="mt-4">
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">Made by</div>
          <ul className="mt-2 space-y-2">
            {briefing.leads.map((p) => (
              <li key={`lead-${p.id}`} className="flex items-start gap-3 rounded-xl border border-white/10 bg-white/5 p-3">
                <span className="grid h-8 w-8 flex-shrink-0 place-items-center rounded-lg bg-white/10 text-sm">🎬</span>
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-white">
                    {p.name} <span className="font-normal text-slate-400">· {p.role}</span>
                  </div>
                  <NotableList person={p} />
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {briefing.cast.length > 0 && (
        <div className="mt-5">
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">Starring</div>
          <ul className="mt-2 space-y-2">
            {briefing.cast.map((p) => (
              <li key={`cast-${p.id}`} className="flex items-start gap-3">
                <PersonAvatar person={p} />
                <div className="min-w-0 pt-0.5">
                  <div className="text-sm font-semibold text-white">
                    {p.name}
                    {p.role && p.role !== 'Cast' ? (
                      <span className="font-normal text-slate-400"> as {p.role}</span>
                    ) : null}
                  </div>
                  <NotableList person={p} />
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {themes.length > 0 && (
        <div className="mt-5">
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">Themes &amp; motifs</div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {themes.map((t) => (
              <span key={t} className="rounded-md bg-white/5 px-2 py-0.5 text-xs capitalize text-slate-300">{t}</span>
            ))}
          </div>
        </div>
      )}

      {briefing.franchise && (
        <div className="mt-5 border-t border-white/10 pt-5">
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">
            Part of {briefing.franchise.name}
          </div>
          <div className="mt-3 grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-6">
            {briefing.franchise.parts.map((part) => (
              <Link key={part.id} href={`/app/title/movie/${part.id}`} className="group block">
                <div className="relative aspect-[2/3] overflow-hidden rounded-lg border border-white/10">
                  {tmdbImage(part.posterPath, 'w185') ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={tmdbImage(part.posterPath, 'w185')!}
                      alt=""
                      className="h-full w-full object-cover transition group-hover:scale-105"
                      loading="lazy"
                    />
                  ) : (
                    <div className="grid h-full w-full place-items-center bg-white/5 p-1 text-center text-[10px] text-slate-400">
                      {part.title}
                    </div>
                  )}
                </div>
                <div className="mt-1 line-clamp-1 text-xs text-slate-300">
                  {part.title}
                  {part.year ? <span className="text-slate-500"> ({part.year})</span> : null}
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
