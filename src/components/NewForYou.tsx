'use client';

import { PosterCard } from '@/components/PosterCard';
import { tmdbImage } from '@/lib/tmdb/image';
import { ReasonText } from '@/components/ReasonText';
import type { MediaType } from '@/lib/types';

export interface DigestItem {
  id: string;
  tmdb_id: number;
  media_type: MediaType;
  title: string;
  year: number | null;
  poster_path: string | null;
  personal_score: number;
  primary_call: string;
  reason: string | null;
}

export function NewForYou({ items, label }: { items: DigestItem[]; label: string }) {
  if (items.length === 0) return null;

  return (
    <section className="rounded-2xl border border-gold-400/30 bg-gradient-to-b from-gold-500/10 to-transparent p-4 sm:p-5">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-lg font-semibold text-white">
          <span>🆕</span> New for you
        </h2>
        <span className="text-xs text-slate-400">Fresh releases matched to {label.toLowerCase()}</span>
      </div>
      <div className="poster-grid">
        {items.map((item) => (
          <PosterCard
            key={item.id}
            href={`/app/title/${item.media_type}/${item.tmdb_id}`}
            mediaType={item.media_type}
            tmdbId={item.tmdb_id}
            title={item.title}
            year={item.year}
            posterUrl={tmdbImage(item.poster_path, 'w342')}
            posterPath={item.poster_path}
          >
            {item.reason && <ReasonText text={item.reason} className="mt-1.5 text-[11px] text-slate-500" />}
          </PosterCard>
        ))}
      </div>
    </section>
  );
}
