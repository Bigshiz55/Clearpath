/**
 * SHOWDOWN -> THE CANONICAL TASTE DNA, and nowhere else.
 *
 * Showdown's own `TraitProfile` is a local calibration state. The product's
 * permanent identity is the append-only `preference_events` log folded by
 * `src/lib/preference/engine.ts`, and this module maps one onto the other. It
 * deliberately does NOT introduce a second permanent store: a second profile is
 * a second thing to reconcile, a second thing to migrate on sign-in, and a
 * second answer to "what does this person like".
 *
 * WHY AN ATTRACTION GRADE AND NOT AN EXPERIENCE ONE. A head-to-head is a
 * PRE-WATCH statement — "I would rather watch this" — which is exactly what the
 * ATTRACTION channel means. Filing it as EXPERIENCE would claim the person had
 * seen and judged the film, which is a different and much stronger assertion
 * than they made, and would outrank the grades of titles they actually watched.
 *
 * HOW ATTRIBUTION SURVIVES THE CROSSING. The canonical engine weights an event
 * by its grade (`signals.ts`), so the natural home for "how much should this
 * count" is WHICH grade is chosen — not a new parallel weighting system that the
 * engine would have to learn about:
 *
 *   must_watch (1.1)       a clean, single-axis comparison — a Twist
 *   interested (0.8)       an ordinary well-attributed pick
 *   maybe_interested (0.3) a confounded pick across many axes
 *
 * That is the same ordering `attribution.ts` computes, expressed in the units
 * the engine already speaks. A four-axis guess cannot masquerade as a
 * certainty, because it lands two rungs lower on a ladder the engine already
 * understands.
 *
 * PURE. The write itself lives in `src/lib/actions/showdown.ts`.
 */

import type { AttractionGrade, PreferenceEvent } from '@/lib/preference/types';
import { TWIST_ATTRIBUTION_MIN } from './attribution';
import type { ShowdownDecision } from './session';

/** Below this, a pick is too confounded to assert more than mild interest. */
export const CONFOUNDED_ATTRIBUTION_MAX = 0.45;

/** Where a pick lands on the canonical attraction ladder, by attribution. */
export function gradeForAttribution(attribution: number): AttractionGrade {
  if (attribution >= TWIST_ATTRIBUTION_MIN) return 'must_watch';
  if (attribution >= CONFOUNDED_ATTRIBUTION_MAX) return 'interested';
  return 'maybe_interested';
}

export interface CanonicalTitleRef {
  /** Stable engine key, e.g. "movie:807". */
  titleId: string;
  tmdbId: number;
  mediaType: 'movie' | 'tv';
}

/**
 * The canonical events one Showdown decision produces.
 *
 * A PICK yields ONE positive event about the winner. It deliberately does not
 * also write a negative event about the loser: losing a head-to-head is not
 * dislike — the loser may be a film they love slightly less — and manufacturing
 * a negative from a comparative is the same class of error as treating "haven't
 * seen" as a rejection.
 *
 * NEITHER yields a negative event about BOTH, because refusing both is the one
 * answer that genuinely speaks against what is on screen.
 *
 * HAVEN'T SEEN yields nothing at all.
 */
export function decisionToEvents(
  decision: ShowdownDecision,
  refs: { left: CanonicalTitleRef | null; right: CanonicalTitleRef | null },
  attribution: number,
): PreferenceEvent[] {
  const at = decision.at;
  const base = {
    at,
    source: 'showdown' as const,
    dwellMs: decision.responseMs,
  };

  if (decision.verdict === 'neither') {
    const out: PreferenceEvent[] = [];
    for (const [side, ref] of [['left', refs.left], ['right', refs.right]] as const) {
      if (!ref) continue;
      out.push({
        ...base,
        id: `${decision.leftId}-${decision.rightId}-${at}-neither-${side}`,
        titleId: ref.titleId,
        action: 'unseen_not_interested',
        attractionGrade: 'not_interested',
      });
    }
    return out;
  }

  const ref = decision.verdict === 'left' ? refs.left : refs.right;
  if (!ref) return [];
  return [
    {
      ...base,
      id: `${decision.leftId}-${decision.rightId}-${at}-${decision.verdict}`,
      titleId: ref.titleId,
      action: 'unseen_interested',
      attractionGrade: gradeForAttribution(attribution),
    },
  ];
}

/**
 * Every canonical event a finished `dna`-mode session should record.
 *
 * Returns `[]` for a `tonight` session — the caller should never reach here
 * with one, and returning empty rather than throwing means a mistaken call
 * writes NOTHING rather than writing the wrong thing. Failing safe matters more
 * than failing loudly when the failure mode is "someone's identity was
 * overwritten by a Tuesday mood".
 */
export function sessionToEvents(
  decisions: readonly ShowdownDecision[],
  mode: 'dna' | 'tonight',
  resolve: (titleId: string) => CanonicalTitleRef | null,
  attributionFor: (decision: ShowdownDecision) => number,
): PreferenceEvent[] {
  if (mode !== 'dna') return [];
  const out: PreferenceEvent[] = [];
  for (const d of decisions) {
    out.push(
      ...decisionToEvents(
        d,
        { left: resolve(d.leftId), right: resolve(d.rightId) },
        attributionFor(d),
      ),
    );
  }
  return out;
}
