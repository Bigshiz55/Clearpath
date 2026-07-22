'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { PosterCard } from './PosterCard';
import { SaveButton } from './SaveButton';
import { ReasonText } from './ReasonText';

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

/** One complete reason — never two half-lines. Joins the "because you liked X"
 *  seed and the match rationale into a single sentence. */
function fullReason(r: Rec): string | null {
  const because = r.because ? `Because you liked ${r.because}` : null;
  if (because && r.matchReason) return `${because} — ${r.matchReason}`;
  return because ?? r.matchReason ?? null;
}

export function RecommendedForYou({ label }: { label?: string | null }) {
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
        <h2 className="mt-1 text-lg font-bold text-white">Your recommendations unlock fast</h2>
        <p className="mx-auto mt-1 max-w-sm text-sm text-slate-300">Rate a handful of titles and we’ll read your taste — then this fills with picks scored just for you, each with the reason it’s here.</p>
        <Link href="/app/quiz" className="btn-primary mt-4 inline-flex">Build my Taste DNA →</Link>
      </section>
    );
  }

  return (
    <section>
      <div className="mb-3">
        <h2 className="text-lg font-semibold text-white">{cold ? 'Popular picks to start you off' : 'Recommended for you'}</h2>
        {cold ? (
          <p className="text-xs text-amber-200/90">
            We’re still getting to know you — these are well-loved, not yet personalized.{' '}
            <Link href="/app/quiz" className="font-semibold underline">Rate a few</Link> and this becomes truly yours.
          </p>
        ) : (
          <p className="text-xs text-slate-400">
            Because of what you&apos;ve watched and rated · scored for {label ?? 'your match'}
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
            >
              {(() => {
                // The call now lives in the DNA-driven badge (card top bar +
                // ratings row), so here we keep only the reason — the "why this
                // is on your list" that the call can't express on its own.
                const reason = fullReason(r);
                if (!reason) return null;
                return (
                  <div className="mt-2">
                    {/* One complete sentence; tap/click to expand the full text. */}
                    <ReasonText text={reason} className="text-[11px] text-slate-400" />
                  </div>
                );
              })()}
            </PosterCard>
          ))}
        </div>
      )}
    </section>
  );
}
