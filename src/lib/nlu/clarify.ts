/**
 * CONFIDENCE-AWARE CLARIFICATION (§7).
 *
 * Search asks a question ONLY when a MATERIAL ambiguity could completely change
 * the result set — never turns every search into an interview. Pure and
 * deterministic: given the raw query (and which fields the conversation state has
 * already resolved) it returns a confidence score, the material ambiguities it
 * found, and 2–4 selectable answers per ambiguity. High-confidence queries
 * return `clarificationRequired: false` and proceed untouched.
 *
 * DEFINITION-DRIVEN, not example-driven: each ambiguity is a class (a term that
 * maps to two genuinely different structured constraints) plus the
 * disambiguators that resolve it. The selectable answers are APPENDABLE phrases —
 * each contains a resolver token, so when the client re-submits `query + answer`
 * the same detector no longer fires (no clarification loop) AND the real parser
 * (augmentInternational / naiveParseQuery) picks up the now-explicit constraint.
 * Adding a class is data, not a new code path; this is the deterministic-path
 * counterpart to the `ambiguities` field the AI canonical schema exposes.
 */

export type AmbiguityKey = 'origin' | 'era';

export interface Ambiguity {
  key: AmbiguityKey;
  /** Which structured field the answer would pin down. */
  field: string;
  question: string;
  /** Appendable answer phrases (2–4), each carrying a resolver token. */
  options: string[];
}

export interface ClarificationResult {
  /** 0..1 — how confident we are we understood the query as-is. */
  confidence: number;
  ambiguities: Ambiguity[];
  /** True only when a material ambiguity should be asked before searching. */
  clarificationRequired: boolean;
}

const norm = (s: string) => ` ${(s ?? '').toLowerCase().replace(/[^a-z0-9']+/g, ' ').replace(/\s+/g, ' ').trim()} `;
const has = (t: string, ...words: string[]) => words.some((w) => t.includes(` ${w} `));

interface AmbiguityClass {
  key: AmbiguityKey;
  field: string;
  /** The ambiguous trigger terms. */
  triggers: string[];
  /** If ANY resolver term is present in the text, the query is already disambiguated. */
  resolvers: string[];
  question: string;
  options: string[];
}

const CLASSES: AmbiguityClass[] = [
  {
    key: 'origin',
    field: 'originalLanguageClass|originCountry',
    // "foreign" can mean non-US PRODUCTION or non-ENGLISH original language.
    triggers: ['foreign', 'international'],
    resolvers: ['english', 'non english', 'subtitled', 'dubbed', 'dubbing', 'language', 'either', 'korean', 'french', 'spanish', 'japanese', 'german', 'italian', 'british', 'swedish', 'danish', 'hindi', 'mandarin', 'cantonese'],
    question: 'By “foreign”, do you mean in a non-English language, or made outside the US?',
    // Each answer contains a resolver token ('non english' / 'english' / 'either').
    options: ['in a non-English language', 'made outside the US, English is fine', 'either is fine'],
  },
  {
    key: 'era',
    field: 'maxYear|minYear',
    // "old" / "classic" is era-relative with no anchor.
    triggers: ['old', 'classic', 'older'],
    resolvers: ['before', 'after', 'since', '19', '20', 'decade', '90s', '80s', '70s', '60s', '50s', 'recent', 'new', 'latest', 'between'],
    question: 'How old is “old” for you?',
    // Each answer contains 'before' → resolves the era on re-submit.
    options: ['before 1970', 'before 2000', 'before 2015'],
  },
];

/**
 * Inspect a raw query for material ambiguities. `resolved` lists ambiguity keys
 * the conversation state has ALREADY pinned down (so a follow-up that answered it
 * earlier is not re-asked). Bounded: each class fires only when its trigger is
 * present, no resolver token is in the text, and its key is not already resolved.
 */
export function detectAmbiguities(raw: string, resolved?: Iterable<AmbiguityKey>): ClarificationResult {
  const t = norm(raw);
  const done = new Set(resolved ?? []);
  const ambiguities: Ambiguity[] = [];
  for (const c of CLASSES) {
    if (done.has(c.key)) continue;
    if (has(t, ...c.triggers) && !has(t, ...c.resolvers)) {
      ambiguities.push({ key: c.key, field: c.field, question: c.question, options: c.options });
    }
  }
  const confidence = Math.max(0, 1 - 0.35 * ambiguities.length);
  return {
    confidence: Number(confidence.toFixed(2)),
    ambiguities,
    clarificationRequired: ambiguities.length > 0,
  };
}

/** The single most valuable question to ask, or null to proceed. */
export function firstClarification(raw: string, resolved?: Iterable<AmbiguityKey>): Ambiguity | null {
  const r = detectAmbiguities(raw, resolved);
  return r.clarificationRequired ? r.ambiguities[0]! : null;
}
