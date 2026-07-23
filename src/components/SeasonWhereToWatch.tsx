'use client';

import { useEffect, useState } from 'react';
import type { MediaType } from '@/lib/types';
import { useT } from '@/i18n/I18nProvider';

interface SeasonSvc {
  providerName: string;
  link?: string | null;
  type: string;
}
interface Season {
  season: number;
  services: SeasonSvc[];
}
interface Group {
  from: number;
  to: number;
  services: SeasonSvc[];
}

const key = (svcs: SeasonSvc[]) =>
  [...new Set(svcs.map((s) => s.providerName.toLowerCase()))].sort().join('|');

/**
 * "Where to watch — by season" (Watchmode episode-level). Only renders for TV
 * shows that are actually SPLIT across services (e.g. early seasons on one
 * service, later ones on another) — for a show that's all on one service the
 * main provider list already says everything, so this stays hidden.
 */
export function SeasonWhereToWatch({ mediaType, tmdbId }: { mediaType: MediaType; tmdbId: number }) {
  const t = useT();
  const [seasons, setSeasons] = useState<Season[] | null>(null);

  useEffect(() => {
    if (mediaType !== 'tv') return;
    let active = true;
    fetch(`/api/seasons/${tmdbId}`)
      .then((r) => r.json())
      .then((d) => active && setSeasons((d?.seasons as Season[]) ?? []))
      .catch(() => active && setSeasons([]));
    return () => {
      active = false;
    };
  }, [mediaType, tmdbId]);

  if (mediaType !== 'tv' || !seasons || seasons.length === 0) return null;

  // Collapse consecutive seasons that share the same service set into ranges.
  const sorted = [...seasons].sort((a, b) => a.season - b.season);
  const groups: Group[] = [];
  for (const s of sorted) {
    const last = groups[groups.length - 1];
    if (last && key(last.services) === key(s.services) && s.season === last.to + 1) {
      last.to = s.season;
    } else {
      groups.push({ from: s.season, to: s.season, services: s.services });
    }
  }

  // Only worth showing when the show is genuinely split across services.
  const distinct = new Set(groups.map((g) => key(g.services)));
  if (distinct.size < 2) return null;

  return (
    <section className="card p-4 sm:p-5">
      <h3 className="flex items-center gap-2 text-sm font-bold text-white">
        <span aria-hidden>📺</span> {t('title.whereBySeasonsText')}
      </h3>
      <p className="mt-0.5 text-xs text-slate-400">{t('title.splitAcrossServices')}</p>
      <div className="mt-3 space-y-2">
        {groups.map((g) => (
          <div key={`${g.from}-${g.to}`} className="flex flex-wrap items-center gap-2">
            <span className="min-w-[92px] text-xs font-semibold text-slate-200">
              {g.from === g.to ? t('title.seasonSingle', { n: g.from }) : t('title.seasonRange', { from: g.from, to: g.to })}
            </span>
            {g.services.map((s) =>
              s.link ? (
                <a
                  key={s.providerName}
                  href={s.link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 rounded-lg border border-white/10 bg-white/5 px-2.5 py-1 text-xs font-medium text-slate-100 transition hover:border-brand-400/60 hover:bg-brand-500/15"
                  title={t('title.openProvider', { name: s.providerName })}
                >
                  {s.providerName} <span aria-hidden className="text-brand-300">↗</span>
                </a>
              ) : (
                <span key={s.providerName} className="rounded-lg border border-white/10 bg-white/5 px-2.5 py-1 text-xs font-medium text-slate-100">
                  {s.providerName}
                </span>
              ),
            )}
          </div>
        ))}
      </div>
    </section>
  );
}
