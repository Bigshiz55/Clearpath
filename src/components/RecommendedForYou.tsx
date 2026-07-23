'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { PosterCard } from './PosterCard';
import { SaveButton } from './SaveButton';
import { useT } from '@/i18n/I18nProvider';

interface Rec {
  id: number;
  mediaType: 'movie' | 'tv';
  title: string;
  year: number | null;
  posterPath: string | null;
  posterUrl: string | null;
  personalScore: number;
  tier: string;
  primaryCall: string;
  because: string | null;
  matchReason: string | null;
}

export function RecommendedForYou({ label }: { label?: string | null }) {
  const t = useT();
  const [recs, setRecs] = useState<Rec[] | null>(null);
  const [cold, setCold] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;
    fetch('/api/recommendations')
      .then((r) => r.json())
      .then((d) => {
        if (!active) return;
        if (d.error) setFailed(true);
        else { setRecs(d.recommendations ?? []); setCold(!!d.cold); }
      })
      .catch(() => active && setFailed(true));
    return () => {
      active = false;
    };
  }, []);

  if (failed) return null;

  // Empty & new: don't go silent — invite them to build their DNA. Silence at
  // the first moment wastes the onboarding; an honest nudge earns the next tap.
  if (recs && recs.length === 0) {
    return (
      <section className="rounded-2xl border border-brand-400/30 bg-brand-500/10 p-5 text-center">
        <div className="text-2xl">🧬</div>
        <h2 className="mt-1 text-lg font-bold text-white">{t('discover.recForYou.unlockFast')}</h2>
        <p className="mx-auto mt-1 max-w-sm text-sm text-slate-300">{t('discover.recForYou.unlockBody')}</p>
        <Link href="/app/quiz" className="btn-primary mt-4 inline-flex">{t('discover.recForYou.buildDna')}</Link>
      </section>
    );
  }

  return (
    <section>
      <div className="mb-3">
        <h2 className="text-lg font-semibold text-white">{cold ? t('discover.recForYou.popularStart') : t('discover.recForYou.recommended')}</h2>
        {cold ? (
          <p className="text-xs text-amber-200/90">
            {t('discover.recForYou.coldA')}
            <Link href="/app/quiz" className="font-semibold underline">{t('discover.recForYou.rateAFew')}</Link>{t('discover.recForYou.coldB')}
          </p>
        ) : (
          <p className="text-xs text-slate-400">
            {t('discover.recForYou.because', { label: label ?? t('discover.common.yourMatch') })}
          </p>
        )}
      </div>

      {!recs ? (
        <div className="poster-grid">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="aspect-[2/3] animate-pulse rounded-2xl border border-white/10 bg-white/5"
            />
          ))}
        </div>
      ) : (
        <div className="poster-grid">
          {recs.map((r) => (
            <PosterCard
              key={`${r.mediaType}-${r.id}`}
              href={`/app/title/${r.mediaType}/${r.id}`}
              title={r.title}
              year={r.year}
              mediaType={r.mediaType}
              posterUrl={r.posterUrl}
              overlay={
                <SaveButton
                  wide
                  removeOnSave
                  tmdbId={r.id}
                  mediaType={r.mediaType}
                  title={r.title}
                  year={r.year}
                  posterPath={r.posterPath}
                />
              }
            />
          ))}
        </div>
      )}
    </section>
  );
}
