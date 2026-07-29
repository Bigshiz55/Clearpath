'use client';

import { useEffect, useState } from 'react';
import type { MediaType } from '@/lib/types';
import { loadDna, isPersonalized, type DnaClientResult } from '@/lib/dnaClient';
import { verdictConfidence, type EvidenceLevel } from '@/lib/verdict/confidence';
import { ConfidenceBadge } from './ConfidenceBadge';

/**
 * HOW SURE ARE WE — on the page where the decision is actually made.
 *
 * A match percentage and a confidence are different claims: an 87 built from
 * four of your ratings is not the same statement as an 87 built from ninety,
 * and showing only the number manufactures precision the evidence does not
 * support.
 *
 * IT LIVES HERE, NOT ON EVERY GRID CARD. The card's score panel is a measured
 * space — three separate layout tests defend its height and its one-line
 * ratings row — and a fourth element in it either wrapped the panel onto an
 * extra row or squeezed the rating chips until they clipped. The verdict page
 * is where a user goes to decide, and it has the room to say this properly.
 *
 * `ratingSourceCount` comes from the deterministic engine's own available
 * sources, so the evidence half of the claim is real rather than assumed.
 */
export function VerdictConfidence({
  mediaType,
  tmdbId,
  ratingSourceCount,
  availabilityVerified = false,
  className = '',
}: {
  mediaType: MediaType;
  tmdbId: number;
  /** How many independent rating sources the engine actually holds. */
  ratingSourceCount: number;
  /** Whether we have a confirmed place to watch, not an inferred one. */
  availabilityVerified?: boolean;
  className?: string;
}) {
  const [dna, setDna] = useState<DnaClientResult | null>(null);
  const [settled, setSettled] = useState(false);

  useEffect(() => {
    let active = true;
    loadDna(mediaType, tmdbId)
      .then((d) => {
        if (!active) return;
        setDna(d);
        setSettled(true);
      })
      .catch(() => active && setSettled(true));
    return () => {
      active = false;
    };
  }, [mediaType, tmdbId]);

  // Nothing is claimed until we know what we hold. A confidence badge that
  // guesses while it loads is the exact overstatement this exists to prevent.
  if (!settled) return null;

  // The evidence half mirrors `explainVerdict`'s own rule: two or more
  // independent sources (plus verified availability) is a strong base; one is
  // middling; none is not an evidence base at all.
  let evidence: EvidenceLevel = 'low';
  if (ratingSourceCount >= 2) evidence = availabilityVerified ? 'high' : 'medium';
  else if (ratingSourceCount === 1) evidence = 'medium';

  const view = verdictConfidence({
    evidence,
    sampleSize: dna?.sampleSize ?? 0,
    personalized: isPersonalized(dna),
  });

  return <ConfidenceBadge view={view} size="md" className={className} />;
}
