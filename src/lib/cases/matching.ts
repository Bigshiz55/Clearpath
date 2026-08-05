import 'server-only';
import { normalizeDiacritics, type EpisodeInput, type CaseIdentifiers } from './extraction';

/**
 * Candidate Case matching — pure, deterministic scoring over extracted
 * identifiers. Never merges anything itself; it only proposes candidates for
 * the review queue (`reviewQueue.ts`). See PROPOSAL_THRESHOLD below for the
 * confidence cutoff and the reasoning for it.
 */

export interface MatchCandidate {
  episodeAId: number;
  episodeBId: number;
  confidence: number;
  reasons: string[];
}

/**
 * Comparison-only normalization: case-fold, trim, and strip diacritics so
 * "JonBenét" and "JonBenet" resolve to the same entity. Extracted records
 * keep the original spelling — only this comparison ever sees the
 * normalized form.
 */
function normalizeName(name: string): string {
  return normalizeDiacritics(name.toLowerCase().trim());
}

/** True if any subject name is shared (exact, case-insensitive) between the two episodes. */
function sharedSubjectNames(a: CaseIdentifiers, b: CaseIdentifiers): string[] {
  const bNames = new Set(b.subjectNames.map(normalizeName));
  return a.subjectNames.filter((n) => bNames.has(normalizeName(n)));
}

/**
 * Score a pair of episodes' extracted identifiers. Weighted toward the
 * strongest, least-coincidental signal (a shared named subject); weak
 * generic signals (same crime type — most episodes are "murder") barely move
 * the needle on their own, since two unrelated murders sharing a genre-level
 * label is not evidence of the same real-world Case.
 */
export function scoreMatch(a: CaseIdentifiers, b: CaseIdentifiers): { confidence: number; reasons: string[] } {
  const reasons: string[] = [];
  let confidence = 0;

  const shared = sharedSubjectNames(a, b);
  if (shared.length > 0) {
    confidence += 0.6;
    reasons.push(`shared subject: ${shared.join(', ')}`);
  }

  // Only a year the TEXT states counts. `yearFromText === false` means the
  // value is just the episode's air year, which every programme in a listings
  // window shares — agreement there is arithmetic, not evidence.
  const yearIsEvidence = a.yearFromText !== false && b.yearFromText !== false;
  if (yearIsEvidence && a.year != null && b.year != null && a.year === b.year) {
    confidence += 0.15;
    reasons.push(`same year: ${a.year}`);
  }

  if (a.location && b.location && a.location === b.location) {
    confidence += 0.15;
    reasons.push(`same location: ${a.location}`);
  }

  if (a.crimeType && b.crimeType && a.crimeType === b.crimeType) {
    confidence += 0.1;
    reasons.push(`same crime type: ${a.crimeType}`);
  }

  return { confidence: Math.min(1, confidence), reasons };
}

/**
 * Below this, a pair is not even worth surfacing to a human reviewer — e.g.
 * "same year" alone (0.15) or "same crime type" alone (0.1) is coincidence
 * noise across a true-crime catalog where most episodes are murders from the
 * last 30 years. A shared named subject alone (0.6) already clears it, which
 * is deliberate: a name match is the strongest single signal this extractor
 * produces and is worth a human's attention on its own.
 *
 * This threshold governs what gets PROPOSED to the review queue — it is not
 * an auto-merge threshold. Nothing in this pipeline auto-merges a Case at
 * any confidence; every candidate, however high its score, requires a
 * decision from `reviewQueue.ts` (approve/reject).
 */
export const PROPOSAL_THRESHOLD = 0.5;

export interface EpisodeExtraction {
  episode: EpisodeInput;
  identifiers: CaseIdentifiers;
}

/**
 * Pure — proposes candidate Case pairs across a full extracted set. O(n^2)
 * pair comparison; fine for a batch job over a few hundred programmes.
 * Callers (reviewQueue.ts) are responsible for skipping pairs already
 * decided (approved/rejected) so a rejected pair is never re-proposed.
 */
export function proposeMatches(extractions: EpisodeExtraction[]): MatchCandidate[] {
  const candidates: MatchCandidate[] = [];
  for (let i = 0; i < extractions.length; i++) {
    for (let j = i + 1; j < extractions.length; j++) {
      const a = extractions[i]!;
      const b = extractions[j]!;
      const { confidence, reasons } = scoreMatch(a.identifiers, b.identifiers);
      if (confidence >= PROPOSAL_THRESHOLD) {
        candidates.push({
          episodeAId: a.episode.tvmazeEpisodeId,
          episodeBId: b.episode.tvmazeEpisodeId,
          confidence,
          reasons,
        });
      }
    }
  }
  return candidates;
}
