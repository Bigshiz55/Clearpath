// zod/v4 (shipped as a subpath of the project's zod 3.25) — required so the
// schema is compatible with the Anthropic SDK's zodOutputFormat helper, which
// consumes a v4 schema. This is the AI layer's own contract; the rest of the
// app continues to use the v3 `zod` import.
import { z } from 'zod/v4';

/**
 * THE CANONICAL DISCOVERY REQUEST — the one validated contract the AI orchestrator
 * is allowed to emit, and the server's trust boundary for anything a model says.
 *
 * Claude UNDERSTANDS the request and returns THIS shape. WatchVerd1ct VERIFIES it.
 * The model never returns invented catalog data — no TMDB ids, no fabricated
 * titles-as-facts. It returns *intent* (subjects, references, constraints as
 * text), and the app resolves real entities through its own typed tools after
 * validation. That is why this schema has NO id fields: an id from the model is
 * an unexpected field and `.strict()` rejects the whole object.
 *
 * Everything here is bounded (array sizes, string lengths, runtime range, date
 * format) and every object is closed (`additionalProperties:false` via
 * `.strict()`), so a malformed, oversized, or prompt-injected response is a hard
 * validation failure — never a silently-accepted instruction. The AI is an
 * interpreter, not a security principal: it cannot widen this contract.
 */

// ---- Controlled vocabularies -------------------------------------------------

/** The only media types the catalog understands. Anything else is rejected. */
export const MEDIA_TYPES = ['movie', 'tv'] as const;

/** What a discovery request is fundamentally asking for. Bounded on purpose. */
export const DISCOVERY_INTENTS = [
  'discover', // open-ended "find me something…"
  'similar', // "other shows like X"
  'exact_title', // "is <title> any good", a named-title lookup
  'person', // "movies with / by <person>"
  'live_tv', // "what's on now"
  'clarify', // the model needs one disambiguating answer first
] as const;

/** How a named reference title relates to the request. */
export const REFERENCE_RELATIONSHIPS = ['similar_to', 'not_like', 'exact', 'sequel_to'] as const;

/**
 * The genre names the app can actually filter on (mirrors the legacy AI parser's
 * vocabulary so both brains mean the same thing). The model may only exclude a
 * genre by one of these names; an unknown genre name is rejected.
 */
export const GENRE_VOCAB = [
  'action',
  'adventure',
  'animation',
  'comedy',
  'crime',
  'documentary',
  'drama',
  'family',
  'fantasy',
  'history',
  'horror',
  'music',
  'mystery',
  'reality',
  'romance',
  'science fiction',
  'thriller',
  'war',
  'western',
] as const;

/** Monetization asks the app enforces as hard constraints. */
export const MONETIZATION_KINDS = ['flatrate', 'free', 'ads', 'rent', 'buy'] as const;

// ---- Bounds (single source of truth, also asserted by tests) -----------------

export const LIMITS = {
  /** No free-text field a model emits may exceed this — caps token abuse and
   *  gives the injection scanner a bounded surface. */
  maxStringLen: 200,
  maxReferenceTitles: 5,
  maxSubjects: 12,
  maxPeople: 10,
  maxProviders: 12,
  maxGenres: GENRE_VOCAB.length,
  maxTones: 12,
  maxThemes: 12,
  maxAmbiguities: 4,
  maxOptions: 6,
  maxAssumptions: 8,
  /** A runtime cap outside this band is absurd (a 3-second or 40-hour movie). */
  minRuntime: 1,
  maxRuntime: 1000,
} as const;

// ---- Primitive builders ------------------------------------------------------

const boundedText = z.string().min(1).max(LIMITS.maxStringLen);

/** yyyy-mm-dd AND a real calendar date (rejects 2020-13-40). */
const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'date must be yyyy-mm-dd')
  .refine((s) => {
    const parts = s.split('-');
    const y = Number(parts[0]);
    const m = Number(parts[1]);
    const d = Number(parts[2]);
    if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) return false;
    if (m < 1 || m > 12 || d < 1 || d > 31) return false;
    const dt = new Date(Date.UTC(y, m - 1, d));
    return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
  }, 'date is not a real calendar date');

const referenceTitle = z.strictObject({
  text: boundedText,
  relationship: z.enum(REFERENCE_RELATIONSHIPS),
});

const ambiguity = z.strictObject({
  field: boundedText,
  question: boundedText,
  options: z.array(boundedText).max(LIMITS.maxOptions).default([]),
});

const hardConstraints = z.strictObject({
    requiredSubjects: z.array(boundedText).max(LIMITS.maxSubjects).default([]),
    excludedSubjects: z.array(boundedText).max(LIMITS.maxSubjects).default([]),
    releaseDateMin: isoDate.nullable().default(null),
    releaseDateMax: isoDate.nullable().default(null),
    runtimeMaxMinutes: z
      .number()
      .int()
      .min(LIMITS.minRuntime)
      .max(LIMITS.maxRuntime)
      .nullable()
      .default(null),
    excludedGenres: z.array(z.enum(GENRE_VOCAB)).max(LIMITS.maxGenres).default([]),
    excludedPeople: z.array(boundedText).max(LIMITS.maxPeople).default([]),
    requiredPeople: z.array(boundedText).max(LIMITS.maxPeople).default([]),
    requiredProviders: z.array(boundedText).max(LIMITS.maxProviders).default([]),
    requiredMonetization: z.array(z.enum(MONETIZATION_KINDS)).max(MONETIZATION_KINDS.length).default([]),
  });

const softPreferences = z.strictObject({
  tones: z.array(boundedText).max(LIMITS.maxTones).default([]),
  themes: z.array(boundedText).max(LIMITS.maxThemes).default([]),
  /** Whether the user's Verd1ct DNA should rank the QUALIFIED candidates.
   *  Ranking never qualifies — it only orders titles that already passed. */
  personalize: z.boolean().default(true),
});

// ---- The canonical request ---------------------------------------------------

export const CanonicalDiscoveryRequestSchema = z
  .object({
    intent: z.enum(DISCOVERY_INTENTS),
    mediaTypes: z.array(z.enum(MEDIA_TYPES)).max(MEDIA_TYPES.length).default([]),
    referenceTitles: z.array(referenceTitle).max(LIMITS.maxReferenceTitles).default([]),
    hardConstraints: hardConstraints.default(() => hardConstraints.parse({})),
    softPreferences: softPreferences.default(() => softPreferences.parse({})),
    ambiguities: z.array(ambiguity).max(LIMITS.maxAmbiguities).default([]),
    clarificationRequired: z.boolean().default(false),
    interpretationSummary: boundedText,
    interpretationAssumptions: z.array(boundedText).max(LIMITS.maxAssumptions).default([]),
  })
  .strict();

export type CanonicalDiscoveryRequest = z.infer<typeof CanonicalDiscoveryRequestSchema>;

// ---- Prompt-injection guard --------------------------------------------------

/**
 * A model's structured output is DATA, never instructions. The schema already
 * blocks unexpected fields; this scans the *values* for text that is trying to
 * escape the data role — "ignore previous instructions", a fake system turn, a
 * tool/authze directive, a URL exfil attempt. These strings have no business in
 * a subject, tone, or title reference, so their presence fails validation rather
 * than flowing downstream where the app resolves entities and runs tools.
 */
const INJECTION_PATTERNS: RegExp[] = [
  /\bignore\s+(?:all\s+)?(?:previous|prior|above)\b/i,
  /\bdisregard\s+(?:all\s+)?(?:previous|prior|the\s+above)\b/i,
  /\b(?:system|developer|assistant)\s*(?:prompt|message|role)\s*[:=]/i,
  /<\/?(?:system|assistant|user|tool)\b/i,
  /\byou\s+are\s+now\b/i,
  /\b(?:run|execute|drop|delete|update|insert)\s+(?:this\s+)?(?:sql|query|command|table)\b/i,
  /\b(?:grant|escalate|bypass)\s+(?:access|privileges?|permissions?|rls|auth)\b/i,
  /\bapi[_\s-]?key\b/i,
  /\bhttps?:\/\//i,
];

/** Every string value in the request, flattened (bounded by the schema sizes). */
function collectStrings(req: CanonicalDiscoveryRequest): string[] {
  const out: string[] = [req.interpretationSummary, ...req.interpretationAssumptions];
  req.referenceTitles.forEach((r) => out.push(r.text));
  req.ambiguities.forEach((a) => {
    out.push(a.field, a.question, ...a.options);
  });
  const h = req.hardConstraints;
  out.push(
    ...h.requiredSubjects,
    ...h.excludedSubjects,
    ...h.excludedPeople,
    ...h.requiredPeople,
    ...h.requiredProviders,
  );
  out.push(...req.softPreferences.tones, ...req.softPreferences.themes);
  return out;
}

export function findInjection(req: CanonicalDiscoveryRequest): string | null {
  for (const s of collectStrings(req)) {
    for (const re of INJECTION_PATTERNS) {
      if (re.test(s)) return s;
    }
  }
  return null;
}

// ---- The one validation entry point (the trust boundary) ---------------------

export type ValidationResult =
  | { ok: true; value: CanonicalDiscoveryRequest }
  | { ok: false; error: string };

/**
 * Validate anything claiming to be a CanonicalDiscoveryRequest. This is the ONLY
 * sanctioned way to turn model output into a trusted request: strict schema
 * parse (unknown fields, bad enums/dates, oversized arrays, absurd runtimes all
 * fail here) followed by the injection scan. Product code must call this — never
 * trust a raw model object.
 */
export function validateCanonicalDiscoveryRequest(raw: unknown): ValidationResult {
  const parsed = CanonicalDiscoveryRequestSchema.safeParse(raw);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    return { ok: false, error: first ? `${first.path.join('.') || '(root)'}: ${first.message}` : 'invalid request' };
  }
  const injected = findInjection(parsed.data);
  if (injected) {
    return { ok: false, error: `rejected suspected injected instruction in a request field` };
  }
  return { ok: true, value: parsed.data };
}
