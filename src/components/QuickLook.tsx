'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { RatingsStrip } from './RatingsStrip';
import { SaveButton } from './SaveButton';
import { EMPTY_TILE_RATINGS, type TileRatings } from '@/lib/ratings';
import type { MediaType } from '@/lib/types';
import { useT } from '@/i18n/I18nProvider';

export interface QuickLookTarget {
  id: number;
  mediaType: MediaType;
  title: string;
  year: number | null;
  posterPath: string | null;
}

interface QuickLookData {
  id: number;
  mediaType: MediaType;
  title: string;
  year: number | null;
  overview: string | null;
  backdropUrl: string | null;
  posterUrl: string | null;
  trailerUrl: string | null;
  genres: string[];
  contentRating: string | null;
  status: string | null;
  runtime: string | null;
  score: number;
  standardScore: number;
  ratings: TileRatings;
  where: string[];
}

/** Pull the YouTube video id out of a watch/short url so we can embed it. */
function youTubeId(url: string | null): string | null {
  if (!url) return null;
  const m = url.match(/(?:v=|youtu\.be\/|embed\/)([\w-]{6,})/);
  return m ? m[1]! : null;
}

export function QuickLook({ target, onClose }: { target: QuickLookTarget; onClose: () => void }) {
  const t = useT();
  const [data, setData] = useState<QuickLookData | null>(null);
  const [failed, setFailed] = useState(false);
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    let active = true;
    setData(null);
    setFailed(false);
    setPlaying(false);
    fetch(`/api/quicklook/${target.mediaType}/${target.id}`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => active && setData(d as QuickLookData))
      .catch(() => active && setFailed(true));
    return () => {
      active = false;
    };
  }, [target.id, target.mediaType]);

  // Close on Escape; lock body scroll while open.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  const vid = youTubeId(data?.trailerUrl ?? null);
  const heroUrl = data?.backdropUrl ?? data?.posterUrl ?? null;
  const titleHref = `/app/title/${target.mediaType}/${target.id}`;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end justify-center bg-black/70 p-0 backdrop-blur-sm sm:items-center sm:p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={t('title.quickLookAria', { title: target.title })}
    >
      <div
        className="relative max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-t-2xl border border-white/10 bg-ink-900 shadow-card sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close */}
        <button
          onClick={onClose}
          className="absolute right-3 top-3 z-20 grid h-9 w-9 place-items-center rounded-full bg-black/60 text-lg text-white backdrop-blur transition hover:bg-black/80"
          aria-label={t('title.close')}
        >
          ✕
        </button>

        {/* Hero: trailer, else backdrop with a play button */}
        <div className="relative aspect-video w-full overflow-hidden bg-ink-850">
          {playing && vid ? (
            <iframe
              className="h-full w-full"
              src={`https://www.youtube.com/embed/${vid}?autoplay=1&rel=0`}
              title={t('title.trailerTitle', { title: target.title })}
              allow="autoplay; encrypted-media; picture-in-picture"
              allowFullScreen
            />
          ) : (
            <>
              {heroUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={heroUrl} alt="" className="h-full w-full object-cover" />
              ) : (
                <div className="grid h-full w-full place-items-center text-slate-600">{t('title.noImage')}</div>
              )}
              <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-ink-900 via-ink-900/20 to-transparent" />
              {vid && (
                <button
                  onClick={() => setPlaying(true)}
                  className="absolute inset-0 grid place-items-center"
                  aria-label={t('title.playTrailer')}
                >
                  <span className="grid h-16 w-16 place-items-center rounded-full bg-white/90 text-2xl text-ink-950 shadow-glow transition hover:scale-105">
                    ▶
                  </span>
                </button>
              )}
            </>
          )}
        </div>

        {/* Body */}
        <div className="space-y-3 p-4 sm:p-5">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 className="text-xl font-bold text-white">{target.title}</h2>
              <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-slate-300">
                <span className="uppercase tracking-wide">{target.mediaType === 'movie' ? t('card.movie') : t('card.tv')}</span>
                {data?.year && <span>· {data.year}</span>}
                {data?.runtime && <span>· {data.runtime}</span>}
                {data?.contentRating && (
                  <span className="rounded border border-white/20 px-1 text-[10px]">{data.contentRating}</span>
                )}
                {data?.status && target.mediaType === 'tv' && <span>· {data.status}</span>}
              </div>
            </div>
            <div className="flex-none">
              <SaveButton tmdbId={target.id} mediaType={target.mediaType} title={target.title} year={target.year} posterPath={target.posterPath} variant="inline" />
            </div>
          </div>

          {/* Ratings */}
          <RatingsStrip ratings={data?.ratings ?? EMPTY_TILE_RATINGS} title={target.title} year={target.year} standard loading={!data && !failed} />

          {/* Genres */}
          {data && data.genres.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {data.genres.map((g) => (
                <span key={g} className="rounded-full border border-white/10 bg-white/5 px-2.5 py-0.5 text-xs text-slate-300">{g}</span>
              ))}
            </div>
          )}

          {/* Synopsis */}
          {data?.overview && <p className="text-sm leading-relaxed text-slate-200">{data.overview}</p>}
          {failed && <p className="text-sm text-slate-400">{t('title.quickLoadFailed')}</p>}

          {/* Where to watch */}
          {data && data.where.length > 0 && (
            <div className="text-xs text-slate-300">
              <span className="text-slate-400">{t('title.streamingOn')}</span> {data.where.join(' · ')}
            </div>
          )}

          {/* Actions */}
          <div className="flex flex-wrap gap-2 pt-1">
            <Link href={titleHref} className="btn-primary flex-1 sm:flex-none">{t('title.seeFullVerdict')}</Link>
            {vid && !playing && (
              <button onClick={() => setPlaying(true)} className="btn-secondary flex-1 sm:flex-none">{t('title.playTrailerBtn')}</button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
