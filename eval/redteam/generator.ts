/**
 * SEMANTIC RED-TEAM — seeded, reproducible request + candidate-pool generator.
 *
 * Deterministic from a seed: the same seed reproduces the exact same cases, so
 * any failure prints a one-line reproduction. Each case is a natural-language
 * request (subject × count × media × phrasing × typos/synonyms) plus a shuffled
 * candidate pool of central titles and controlled decoys with GROUND-TRUTH
 * labels — the traps the evaluator must reject.
 */

import {
  CURATED,
  syntheticCentral,
  syntheticDecoys,
  type Candidate,
  type SubjectCorpus,
} from './corpus';

/** mulberry32 — tiny deterministic PRNG. */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const pick = <T>(r: () => number, xs: T[]): T => xs[Math.floor(r() * xs.length) % xs.length]!;
const shuffle = <T>(r: () => number, xs: T[]): T[] => {
  const a = xs.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
};

const NUM_WORD = ['one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight'];

/** A light typo generator — deletion/transposition, seedable. */
function maybeTypo(r: () => number, word: string): string {
  if (r() > 0.25 || word.length < 5) return word;
  const i = 1 + Math.floor(r() * (word.length - 2));
  if (r() < 0.5) return word.slice(0, i) + word.slice(i + 1); // deletion
  return word.slice(0, i) + word[i + 1]! + word[i]! + word.slice(i + 2); // transposition
}

export interface GeneratedCase {
  seed: number;
  caseId: string;
  request: string;
  subject: SubjectCorpus;
  requestedCount: number;
  mediaType: 'movie' | 'tv' | 'any';
  allowSubstantial: boolean;
  personalization: boolean;
  /** The candidate pool, with ground-truth labels. */
  pool: Candidate[];
  /** Ground-truth eligible titles (independent of the evaluator). */
  eligibleTruth: Set<string>;
}

export function generateCase(seed: number, index: number): GeneratedCase {
  const r = rng(seed + index * 2654435761);
  const useSynthetic = r() < 0.5;
  let subject: SubjectCorpus;
  if (useSynthetic) {
    // Arbitrary synthetic subject → proves generalization beyond curated.
    const base = pick(r, CURATED);
    subject = {
      canonical: base.canonical,
      label: base.label,
      lexemes: base.lexemes,
      central: syntheticCentral(base.canonical, base.label, base.lexemes),
      decoys: syntheticDecoys(base.canonical, base.label, base.lexemes),
    };
  } else {
    subject = pick(r, CURATED);
  }

  const requestedCount = 1 + Math.floor(r() * 8);
  const mediaType: GeneratedCase['mediaType'] = r() < 0.7 ? 'movie' : r() < 0.85 ? 'tv' : 'any';
  // The audit exercises STRICT subject requests only: the zero-tolerance decoy
  // invariant is "no incidental/absent trap is ever eligible for a hard
  // subject". The about-vs-involving (substantial) distinction is a separate
  // concern with dedicated deterministic unit tests in
  // semanticEligibility.test.ts, so we hold it fixed here rather than letting
  // it blur the meaning of a decoy leak.
  const allowSubstantial = false;
  const personalization = r() < 0.75;

  // Phrasing.
  const countTok = r() < 0.5 ? String(requestedCount) : NUM_WORD[requestedCount - 1]!;
  const mediaNoun = mediaType === 'tv' ? 'shows' : mediaType === 'any' ? 'titles' : 'movies';
  const subjWord = maybeTypo(r, subject.label.toLowerCase());
  const centralPhrase = allowSubstantial ? 'involving' : pick(r, ['about', 'centered on', 'really about', '']);
  const personal = personalization ? pick(r, [' that I would like', " I'd enjoy", ' for me', ' I might like']) : '';
  const verb = pick(r, ['Give me', 'Show me', 'Find me', 'I want', 'Need']);
  const request = `${verb} ${countTok} ${centralPhrase} ${subjWord} ${mediaNoun}${personal}`.replace(/\s+/g, ' ').trim();

  // Candidate pool: all central + all decoys + synthetic filler, shuffled.
  const pool = shuffle(r, [...subject.central, ...subject.decoys]);
  const eligibleTruth = new Set(
    pool.filter((p) => (allowSubstantial ? p.truth === 'central' || p.truth === 'substantial' : p.truth === 'central')).map((p) => p.title),
  );

  return {
    seed,
    caseId: `${seed}:${index}`,
    request,
    subject,
    requestedCount,
    mediaType,
    allowSubstantial,
    personalization,
    pool,
    eligibleTruth,
  };
}
