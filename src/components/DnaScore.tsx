'use client';

import { useEffect, useState } from 'react';
import type { MediaType } from '@/lib/types';
import { type DnaClientResult as Dna } from '@/lib/dnaClient';
import { personalizationView } from '@/lib/verdict/personalizationState';
import { scoreVerdict } from '@/lib/verdictVisual';
import { Verd1ctBadge } from './Verd1ctBadge';
import { fetchWithTimeout } from '@/lib/fetchWithTimeout';

/**
 * The WatchVerd1ct DNA Score — a per-user "odds you'll love it" (0..100). On the
 * title page it requests the AI adjustment layer (`?ai=1`): the deterministic
 * Watchability blend, refined by a bounded ±15 AI nudge with a one-line reason.
 * When the model has little of your data yet, it leans on the objective score.
 */
export function DnaScore({ mediaType, tmdbId }: { mediaType: MediaType; tmdbId: number }) {
  const [dna, setDna] = useState<Dna | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let active = true;
    // Dedicated fetch (not the shared card loader) so the title page gets the AI
    // adjustment + reasoning that the many-card grids deliberately skip.
    // Bounded so a stalled request can't leave the loading skeleton on
    // screen forever — a failure here degrades to no badge (the
    // deterministic score shown elsewhere on the page still stands), per
    // the AI layer's documented "always degrade, never block" contract.
    fetchWithTimeout(`/api/dna/${mediaType}/${tmdbId}?ai=1`)
      .then((r) => r.json())
      .then((d) => {
        if (!active) return;
        setDna((d?.dna as Dna | null) ?? null);
        setLoaded(true);
      })
      .catch(() => active && setLoaded(true));
    return () => {
      active = false;
    };
  }, [mediaType, tmdbId]);

  if (!loaded) {
    return <div className="h-[52px] w-40 flex-shrink-0 animate-pulse rounded-xl bg-white/5" />;
  }
  if (!dna) return null;

  // Honest personalization state — driven by the resolver's own verdict (did
  // taste actually move this number?), never by "the account has rated something".
  const view = personalizationView({
    personalized: dna.canonical?.personalized,
    canonicalLabel: dna.canonical?.label ?? null,
    sampleSize: dna.sampleSize,
    confidence: dna.confidence,
  });

  /* THE HEADLINE IS THE CANONICAL SCORE — the same number the card, the
     QuickLook and the briefing print under this label (oneVerdictLabel.test).
     The taste blend (`dna.score`) and its bounded AI refinement remain fully
     visible below in the transparency strip, labeled as the taste read —
     that is their honest home, not the brand headline. */
  const headline = dna.canonical?.score ?? dna.score;
  const v = scoreVerdict(headline);
  const adj = dna.adjustment ?? 0;
  const hasAi = adj !== 0 && dna.baseScore != null;

  return (
    <div className="flex flex-col gap-1">
      <div
        className={`flex items-center gap-3 rounded-xl border px-3 py-2 ${
          view.showDna ? 'border-brand-400/50 bg-brand-500/10' : 'border-white/12 bg-white/[0.04]'
        }`}
        title={
          view.showDna
            ? 'Your Verdict — a 0–100 estimate of how much YOU will love this, from what you’ve rated. It sharpens the more you use the app.'
            : 'Standard Score — a 0–100 estimate from critics and audience data. Rate a few titles and it becomes your personal Verdict.'
        }
      >
        <Verd1ctBadge score={headline} px={52} />
        <div className="min-w-0">
          <div className="text-[10px] font-black uppercase tracking-[0.12em] text-white">{view.header}</div>
          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className={`rounded px-1.5 py-0.5 text-[10px] font-black tracking-wide ${v.visual.badge}`}>
              {view.showDna ? '🧬' : v.emoji} {v.call}
            </span>
            <span className="text-[9px] font-semibold uppercase tracking-wide text-slate-300">{view.sub}</span>
          </div>
        </div>
      </div>

      {/* The bounded AI refinement, shown transparently: base → adjustment → final. */}
      {hasAi && (
        <div className="flex items-start gap-1.5 rounded-lg border border-white/10 bg-white/[0.03] px-2.5 py-1.5 text-[11px] text-slate-300">
          <span aria-hidden className="mt-px">🤖</span>
          <span>
            {/* The TASTE read: deterministic taste blend → bounded AI nudge.
                Named as such because the headline above is the canonical
                score, which this strip does not adjust. */}
            <span className="font-bold text-white">AI taste read {adj > 0 ? `+${adj}` : adj}</span>{' '}
            <span className="tabular-nums text-slate-400">({dna.baseScore} → {dna.score})</span>
            {dna.reasoning ? <> — {dna.reasoning}</> : null}
          </span>
        </div>
      )}
    </div>
  );
}
