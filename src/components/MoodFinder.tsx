'use client';

import { useState } from 'react';
import Link from 'next/link';
import { MOODS } from '@/lib/moods';
import { PosterCard } from '@/components/PosterCard';
import { useT } from '@/i18n/I18nProvider';

interface Pick {
  id: number;
  mediaType: 'movie' | 'tv';
  title: string;
  year: number | null;
  posterPath: string | null;
  posterUrl: string | null;
}

export function MoodFinder({ hasServices }: { hasServices: boolean }) {
  const t = useT();
  const [active, setActive] = useState<string | null>(null);
  const [mine, setMine] = useState(false);
  const [picks, setPicks] = useState<Pick[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [surprise, setSurprise] = useState<Pick | null>(null);

  async function load(mood: string, mineFlag = mine) {
    setActive(mood);
    setLoading(true);
    setError(null);
    setSurprise(null);
    try {
      const res = await fetch(`/api/mood?mood=${mood}${mineFlag ? '&mine=1' : ''}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Failed');
      setPicks(data.picks ?? []);
      if ((data.picks ?? []).length === 0) {
        setError(mineFlag ? t('ask.moodNoneOnServices') : t('ask.moodNoPicks'));
      }
    } catch {
      setError(t('ask.moodLoadError'));
      setPicks([]);
    } finally {
      setLoading(false);
    }
  }

  function pickSurprise() {
    if (picks.length === 0) return;
    const i = Math.floor(Math.random() * picks.length);
    setSurprise(picks[i]!);
  }

  return (
    <div>
      <div className="flex flex-wrap gap-2">
        {MOODS.map((m) => (
          <button
            key={m.key}
            onClick={() => load(m.key)}
            className={`flex items-center gap-2 rounded-xl border px-3.5 py-2 text-sm font-semibold transition ${
              active === m.key
                ? 'border-brand-400/60 bg-brand-500/20 text-brand-100'
                : 'border-white/15 bg-white/5 text-slate-200 hover:bg-white/10'
            }`}
            title={m.blurb}
          >
            <span aria-hidden>{m.emoji}</span>
            {m.label}
          </button>
        ))}
      </div>

      {hasServices && (
        <label className="mt-4 inline-flex cursor-pointer items-center gap-2 text-sm text-slate-300">
          <input
            type="checkbox"
            checked={mine}
            onChange={(e) => {
              setMine(e.target.checked);
              if (active) load(active, e.target.checked);
            }}
            className="h-4 w-4 accent-brand-500"
          />
          {t('ask.onlyMyServices')}
        </label>
      )}

      {active && (
        <div className="mt-6">
          {loading ? (
            <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-6">
              {Array.from({ length: 12 }).map((_, i) => (
                <div key={i} className="aspect-[2/3] animate-pulse rounded-lg bg-white/5" />
              ))}
            </div>
          ) : error ? (
            <p className="text-sm text-amber-300">{error}</p>
          ) : (
            <>
              <div className="mb-3 flex items-center justify-between">
                <p className="text-sm text-slate-400">{t('ask.moodPicks', { count: picks.length })}</p>
                <button onClick={pickSurprise} className="btn-secondary text-sm">{t('ask.surpriseMe')}</button>
              </div>

              {surprise && (
                <div className="mb-4 flex items-center gap-4 rounded-2xl border border-brand-400/40 bg-brand-500/10 p-4">
                  {surprise.posterUrl && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={surprise.posterUrl} alt="" className="h-28 w-20 flex-none rounded-lg object-cover" />
                  )}
                  <div>
                    <div className="text-xs uppercase tracking-wide text-brand-200">{t('ask.tonightsWildcard')}</div>
                    <div className="mt-1 text-lg font-bold text-white">
                      {surprise.title} {surprise.year ? <span className="font-normal text-slate-400">({surprise.year})</span> : null}
                    </div>
                    <Link href={`/app/title/${surprise.mediaType}/${surprise.id}`} className="btn-primary mt-2 inline-flex text-sm">
                      {t('ask.getVerdict')}
                    </Link>
                  </div>
                </div>
              )}

              <div className="poster-grid">
                {picks.map((p) => (
                  <PosterCard
                    key={`${p.mediaType}-${p.id}`}
                    href={`/app/title/${p.mediaType}/${p.id}`}
                    mediaType={p.mediaType}
                    tmdbId={p.id}
                    title={p.title}
                    year={p.year}
                    posterUrl={p.posterUrl}
                    posterPath={p.posterPath}
                  />
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
