'use client';

import { useEffect, useState } from 'react';
import { PosterCard } from './PosterCard';

interface Rec {
  id: number;
  mediaType: 'movie' | 'tv';
  title: string;
  year: number | null;
  posterUrl: string | null;
  personalScore: number;
  tier: string;
  primaryCall: string;
  because: string | null;
  matchReason: string | null;
}

const TIER_STYLE: Record<string, string> = {
  'Must Watch': 'text-emerald-300 border-emerald-400/30 bg-emerald-400/10',
  'Strong Watch': 'text-emerald-300 border-emerald-400/30 bg-emerald-400/10',
  'Worth Watching': 'text-brand-300 border-brand-400/30 bg-brand-400/10',
  'Possible Watch': 'text-amber-300 border-amber-400/30 bg-amber-400/10',
};

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
            >
              <div className="mt-2 space-y-1.5">
                <span
                  className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold ${
                    TIER_STYLE[r.tier] ?? 'border-white/10 bg-white/5 text-slate-300'
                  }`}
                >
                  {r.personalScore}% · {r.tier}
                </span>
                {r.because && (
                  <p className="line-clamp-1 text-[11px] text-slate-400">
                    Because you liked <span className="text-slate-300">{r.because}</span>
                  </p>
                )}
                {r.matchReason && (
                  <p className="line-clamp-1 text-[11px] text-brand-300/80">{r.matchReason}</p>
                )}
              </div>
            </PosterCard>
          ))}
        </div>
      )}
    </section>
  );
}
