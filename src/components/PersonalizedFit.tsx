'use client';

import { useEffect, useState } from 'react';
import { loadDna, type DnaClientResult } from '@/lib/dnaClient';
import { buildFitReasons } from '@/lib/verdict/fitReasons';
import type { MediaType } from '@/lib/types';

/**
 * WHY YOU'LL LIKE IT · WATCH OUT · FOR YOU / AGAINST YOU.
 *
 * The personalization block in More Info. Every word it prints is derived from
 * evidence the engine already holds — it composes nothing of its own and calls
 * no model:
 *
 *   • `loadDna` returns `fit.agree` / `fit.clash`: the axes of THIS title that
 *     agree or clash with what THIS user rates highly. Null when there is no
 *     profile or no cached fingerprint, and the client never fakes it.
 *   • `buildFitReasons` turns those axes into the two sentences, and is the
 *     same composer the card's one-line `CardFit` already uses — so the drawer
 *     and the card cannot drift into saying different things about one title.
 *
 * SILENCE IS A VALID ANSWER. `buildFitReasons` refuses to personalize below
 * `MIN_SAMPLES_FOR_FIT` rated titles, and returns `caution: null` when there is
 * nothing truthful to warn about. Both are honoured literally: no profile → the
 * whole block renders nothing; no caution → no WATCH OUT heading. Filling those
 * boxes with "you'll love the gripping story" would be inventing a preference
 * the user never expressed, which is the one thing this block must never do.
 *
 * DIRECTIONAL CONSISTENCY WITH THE SCORE comes for free rather than by rule:
 * the sentences and the score are computed from the SAME axes, so a title
 * cannot score 84 STREAM IT while this block lists three devastating clashes —
 * the clashes would have moved the score. The only guard added here is against
 * the "nothing here matches your taste" fallback being dressed up as a reason
 * to watch, which is a real finding but not a positive one.
 */
export function PersonalizedFit({
  mediaType,
  tmdbId,
  className = '',
}: {
  mediaType: MediaType;
  tmdbId: number;
  className?: string;
}) {
  const [dna, setDna] = useState<DnaClientResult | null>(null);

  useEffect(() => {
    let active = true;
    // Same per-title fetch the score already makes — deduped in dnaClient.
    loadDna(mediaType, tmdbId).then((d) => active && setDna(d));
    return () => {
      active = false;
    };
  }, [mediaType, tmdbId]);

  const agree = dna?.fit?.agree ?? [];
  const clash = dna?.fit?.clash ?? [];
  const r = buildFitReasons({ agree, clash, samples: dna?.sampleSize ?? 0 });

  // Not personal yet → say nothing. The score's own label already carries
  // "WatchVerd1ct" rather than "Your VERD1CT" in that state, so the absence
  // here is consistent with what the number claims.
  if (!r.personalized) return null;
  const positiveIsReal = !/nothing here matches/i.test(r.positive);
  if (!positiveIsReal && !r.caution) return null;

  return (
    <div className={`space-y-3 ${className}`} data-testid="mi-fit">
      {positiveIsReal && (
        <section data-testid="mi-why">
          <h3 className="text-[11px] font-black uppercase tracking-wide text-emerald-300">Why you’ll like it</h3>
          <p className="mt-1 text-sm leading-relaxed text-emerald-100/90">{r.positive}</p>
        </section>
      )}

      {r.caution && (
        <section data-testid="mi-watch-out">
          <h3 className="text-[11px] font-black uppercase tracking-wide text-amber-300">Watch out</h3>
          <p className="mt-1 text-sm leading-relaxed text-amber-100/90">{r.caution}</p>
        </section>
      )}

      {/* The axes themselves, named. The sentences above argue; these show the
          working — and they are the same objects the sentences were built from,
          so they can never disagree with them. Three each: past that it stops
          being a summary. */}
      {(agree.length > 0 || clash.length > 0) && (
        <div className="grid gap-3 sm:grid-cols-2">
          {agree.length > 0 && (
            <section data-testid="mi-for-you">
              <h4 className="text-[10px] font-black uppercase tracking-wide text-slate-400">For you</h4>
              <ul className="mt-1 space-y-0.5">
                {agree.slice(0, 3).map((a) => (
                  <li key={a.label} className="text-[13px] leading-snug text-emerald-200/90" title={a.note}>
                    <span aria-hidden>✓ </span>{a.label}
                  </li>
                ))}
              </ul>
            </section>
          )}
          {clash.length > 0 && (
            <section data-testid="mi-against-you">
              <h4 className="text-[10px] font-black uppercase tracking-wide text-slate-400">Against you</h4>
              <ul className="mt-1 space-y-0.5">
                {clash.slice(0, 3).map((c) => (
                  <li key={c.label} className="text-[13px] leading-snug text-amber-200/90" title={c.note}>
                    <span aria-hidden>– </span>{c.label}
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      )}
    </div>
  );
}
