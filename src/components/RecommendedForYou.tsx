'use client';

import { useEffect, useState } from 'react';
import { PosterCard } from './PosterCard';
import { SaveButton } from './SaveButton';
import { MatchMark, MATCH_TOOLTIP } from './MatchMark';
import { ReasonText } from './ReasonText';
import { verdictVisualForTier, isTopTier } from '@/lib/verdictVisual';

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
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;
    fetch('/api/recommendations')
      .then((r) => r.json())
      .then((d) => {
        if (!active) return;
        if (d.error) setFailed(true);
        else setRecs(d.recommendations ?? []);
      })
      .catch(() => active && setFailed(true));
    return () => {
      active = false;
    };
  }, []);

  // Nothing to seed from yet (or a transient error): stay quiet, don't clutter.
  if (failed) return null;
  if (recs && recs.length === 0) return null;

  return (
    <section>
      <div className="mb-3">
        <h2 className="text-lg font-semibold text-white">Recommended for you</h2>
        <p className="text-xs text-slate-400">
          Because of what you&apos;ve watched and rated · scored for {label ?? 'your match'}
        </p>
      </div>

      {!recs ? (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="aspect-[2/3] animate-pulse rounded-2xl border border-white/10 bg-white/5"
            />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
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
                  tmdbId={r.id}
                  mediaType={r.mediaType}
                  title={r.title}
                  year={r.year}
                  posterPath={r.posterPath}
                />
              }
            >
              {(() => {
                const v = verdictVisualForTier(r.tier);
                const top = isTopTier(r.tier);
                const reason = fullReason(r);
                return (
                  <div className="mt-2 space-y-1.5">
                    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold ${top ? v.solid : v.badge}`} title={MATCH_TOOLTIP}>
                      <MatchMark size="text-[11px]" />
                      {top ? '★ ' : ''}{r.personalScore}% · {r.tier}
                    </span>
                    {reason && (
                      // One complete sentence; tap/click to expand the full text.
                      <ReasonText text={reason} className="text-[11px] text-slate-400" />
                    )}
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
