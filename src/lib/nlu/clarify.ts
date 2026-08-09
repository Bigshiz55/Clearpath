/**
 * CONFIDENCE-AWARE CLARIFICATION (§7).
 *
 * Search should ask a question ONLY when a MATERIAL ambiguity could completely
 * change the result set — never turn every search into an interview. This is a
 * pure, deterministic detector: given the raw query it returns a confidence
 * score, the material ambiguities it found, and 2–4 selectable interpretations
 * per ambiguity. High-confidence queries return `clarificationRequired: false`
 * and proceed untouched.
 *
 * It is DEFINITION-DRIVEN, not example-driven: each ambiguity is a class (a term
 * that maps to two genuinely different structured constraints) plus the
 * disambiguators that resolve it. A query that already carries a disambiguator
 * is NOT ambiguous. This generalizes — adding a class is data, not a new code
 * path — and it is the deterministic-path counterpart to the `ambiguities` field
 * the AI canonical schema already exposes.
 */

export interface ClarificationOption {
  /** Stable id the client sends back to resolve the ambiguity. */
  id: string;
  label: string;
}

export interface Ambiguity {
  /** Which structured field the answer would pin down. */
  field: string;
  question: string;
  options: ClarificationOption[];
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
  field: string;
  /** The ambiguous trigger terms. */
  triggers: string[];
  /** If ANY resolver term is present, the query is already disambiguated. */
  resolvers: string[];
  question: string;
  options: ClarificationOption[];
}

// Each class is a term that maps to two materially different constraints, plus
// the terms that already resolve it. Kept small and high-value on purpose.
const CLASSES: AmbiguityClass[] = [
  {
    field: 'originalLanguageClass|originCountry',
    // "foreign" can mean non-US PRODUCTION or non-ENGLISH original language.
    triggers: ['foreign', 'international'],
    resolvers: ['english', 'non english', 'subtitled', 'dubbed', 'language', 'korean', 'french', 'spanish', 'japanese', 'german', 'italian', 'british', 'swedish', 'danish', 'hindi', 'mandarin', 'cantonese'],
    question: 'By “foreign”, do you mean…',
    options: [
      { id: 'non_english_language', label: 'Not in English (original language)' },
      { id: 'non_us_country', label: 'Made outside the US (any language)' },
      { id: 'either', label: 'Either is fine' },
    ],
  },
  {
    field: 'maxYear|minYear',
    // "old" / "classic" is era-relative with no anchor.
    triggers: ['old', 'classic', 'older'],
    resolvers: ['before', 'after', 'since', '19', '20', 's', 'decade', '90s', '80s', '70s', '60s', '50s', 'recent', 'new', 'latest'],
    question: 'How old is “old” for you?',
    options: [
      { id: 'pre_1970', label: 'Classics — before 1970' },
      { id: 'pre_2000', label: 'Last century — before 2000' },
      { id: 'pre_2015', label: 'Just not brand-new — before ~2015' },
    ],
  },
];

/**
 * Inspect a raw query for material ambiguities. Bounded: at most the classes
 * above, and each only fires when its trigger is present AND no resolver is.
 */
export function detectAmbiguities(raw: string): ClarificationResult {
  const t = norm(raw);
  const ambiguities: Ambiguity[] = [];
  for (const c of CLASSES) {
    if (has(t, ...c.triggers) && !has(t, ...c.resolvers)) {
      ambiguities.push({ field: c.field, question: c.question, options: c.options });
    }
  }
  // Confidence degrades with each unresolved material ambiguity; a clean query
  // stays at 1.0 and proceeds immediately.
  const confidence = Math.max(0, 1 - 0.35 * ambiguities.length);
  return {
    confidence: Number(confidence.toFixed(2)),
    ambiguities,
    // Only ask when confidence is genuinely low (>=1 material ambiguity). We ask
    // at most one question at a time to avoid an interview.
    clarificationRequired: ambiguities.length > 0,
  };
}

/** The single most valuable question to ask, or null to proceed. */
export function firstClarification(raw: string): Ambiguity | null {
  const r = detectAmbiguities(raw);
  return r.clarificationRequired ? r.ambiguities[0]! : null;
}
