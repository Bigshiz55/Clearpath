/**
 * GROUNDED EXPLANATIONS (pure, no I/O).
 *
 * Every claim must name the field it came from, the value it read, and how much
 * that value is trusted. A claim with no source is not generated — there is no
 * path in this module that produces prose from nothing.
 *
 * The three rules:
 *   1. Unknown produces NO claim. Not a hedged claim, not a default — silence.
 *      "We have limited data about its violence level" is a separate, explicit
 *      gap notice, never a substitute for the claim itself.
 *   2. Low confidence downgrades the wording ("appears to be") rather than the
 *      claim's presence.
 *   3. Availability is only ever asserted from a FRESH check. A stale row
 *      becomes "should be confirmed", never "is on Netflix".
 */

import type { SynthTitle } from './synthCatalog';
import type { DeepScored } from './rank';
import type { ParsedRequest } from './intent';

export interface Evidence {
  claim: string;
  sourceField: string;
  value: string;
  confidence: number;
  /** False means we deliberately refused to assert it. */
  supported: boolean;
}

export interface Explanation {
  /** Human-readable sentence, assembled only from supported evidence. */
  sentence: string;
  evidence: Evidence[];
  /** Fields the request cared about that we simply do not know. */
  gaps: string[];
}

const STALE_DAYS = 14;

/** Confidence → hedging. High asserts; low qualifies; nothing invents. */
function phrase(text: string, confidence: number): string {
  if (confidence >= 0.75) return text;
  if (confidence >= 0.5) return `appears to be ${text}`;
  return `may be ${text}`;
}

/**
 * Build the evidence set for one title against one request. `deep` supplies the
 * group-fit numbers; both are optional so a title can be explained before deep
 * ranking has run.
 */
export function explainTitle(
  title: SynthTitle,
  request: ParsedRequest,
  deep?: DeepScored,
): Explanation {
  const evidence: Evidence[] = [];
  const gaps: string[] = [];
  const conf = title.metadataConfidence;

  // ---- genre match: only claimed when the request actually asked ----
  const wanted = request.soft_preferences.genres.map((g) => g.value);
  const matched = title.genres.filter((g) => wanted.includes(g));
  if (wanted.length > 0 && matched.length > 0) {
    evidence.push({
      claim: `matches the ${matched.join(' and ')} you asked for`,
      sourceField: 'catalog_titles.genres',
      value: title.genres.join(', '),
      confidence: conf,
      supported: true,
    });
  }

  // ---- runtime: a hard constraint, so state the number, not an adjective ----
  if (request.hard_filters.max_runtime_minutes != null) {
    if (title.runtimeMinutes == null) {
      gaps.push('runtime is unknown, so the time limit could not be checked');
    } else {
      evidence.push({
        claim: `runs ${title.runtimeMinutes} minutes`,
        sourceField: 'catalog_titles.runtime_minutes',
        value: String(title.runtimeMinutes),
        confidence: 1,
        supported: true,
      });
    }
  }

  // ---- experience traits the request mentioned ----
  const TRAIT_CLAIMS: { feature: keyof SynthTitle['features']; asked: string[]; high: string; low: string }[] = [
    { feature: 'dialogueDensity', asked: ['dialogue_forward'], high: 'dialogue-forward', low: 'light on dialogue' },
    { feature: 'gore', asked: ['graphic_gore'], high: 'graphic', low: 'restrained about gore' },
    { feature: 'violence', asked: ['graphic_violence'], high: 'violent', low: 'not especially violent' },
    { feature: 'humor', asked: ['funny'], high: 'funny', low: 'not a comedy' },
    { feature: 'endingSatisfaction', asked: ['satisfying_ending'], high: 'a satisfying ending', low: 'an unresolved ending' },
    { feature: 'mainstream', asked: ['unusual', 'mainstream'], high: 'widely seen', low: 'off the beaten track' },
  ];
  const mentioned = new Set<string>([
    ...request.soft_preferences.narrative_traits.map((n) => n.value),
    ...request.soft_preferences.moods.map((m) => m.value),
    ...request.negative_preferences.map((n) => n.value),
  ]);

  for (const t of TRAIT_CLAIMS) {
    if (!t.asked.some((a) => mentioned.has(a))) continue;
    const v = title.features[t.feature];
    if (v == null) {
      // RULE 1: unknown produces no claim, only an explicit gap.
      gaps.push(`we have limited data about its ${String(t.feature)}`);
      continue;
    }
    evidence.push({
      claim: phrase(v >= 0.5 ? t.high : t.low, conf),
      sourceField: `title_features.${String(t.feature)}`,
      value: v.toFixed(2),
      confidence: conf,
      supported: true,
    });
  }

  // ---- availability: never asserted from a stale row ----
  const fresh = title.availability.filter((a) => a.verifiedDaysAgo <= STALE_DAYS);
  const stale = title.availability.filter((a) => a.verifiedDaysAgo > STALE_DAYS);
  if (fresh.length > 0) {
    const best = fresh.reduce((a, b) => (a.confidence >= b.confidence ? a : b));
    evidence.push({
      claim: `is on ${best.provider}`,
      sourceField: 'title_availability.provider',
      value: `${best.provider} (${best.monetization}), checked ${best.verifiedDaysAgo}d ago`,
      confidence: best.confidence,
      supported: true,
    });
  } else if (stale.length > 0) {
    evidence.push({
      claim: `was last seen on ${stale[0]!.provider} — availability should be confirmed`,
      sourceField: 'title_availability.verified_at',
      value: `stale by ${stale[0]!.verifiedDaysAgo - STALE_DAYS}d`,
      confidence: 0.3,
      supported: false, // deliberately NOT asserted
    });
  } else {
    gaps.push('we have no confirmed way to watch it');
  }

  // ---- group fit, only when deep ranking produced it ----
  if (deep) {
    const lowest = deep.lowestMemberScore;
    evidence.push({
      claim: lowest >= 0.5
        ? 'everyone in the room scores it acceptably'
        : 'one person is a weaker fit than the others',
      sourceField: 'deep.lowestMemberScore',
      value: lowest.toFixed(3),
      confidence: 0.8,
      supported: true,
    });
  }

  const supported = evidence.filter((e) => e.supported);
  const sentence = supported.length > 0
    ? `This ${supported.map((e) => e.claim).join(', ')}.`
    : 'We do not have enough verified data about this title to explain the match.';

  return { sentence, evidence, gaps };
}

/** An explanation is valid only when every asserted claim carries a source. */
export function unsupportedClaimCount(e: Explanation): number {
  return e.evidence.filter((x) => x.supported && (!x.sourceField || x.value === '')).length;
}
