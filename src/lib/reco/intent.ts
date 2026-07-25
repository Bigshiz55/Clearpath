/**
 * STRUCTURED INTENT (pure, no I/O) — the contract between "what a person said"
 * and "what the database is allowed to do".
 *
 * SECURITY POSTURE. Nothing here is ever interpolated into SQL. The parser (LLM
 * or rules) may only emit values drawn from the closed vocabularies below; a
 * value outside them is dropped, not passed through. The retrieval layer maps
 * this object onto parameterised, allowlisted queries. That means a model
 * cannot name a table, a column, an operator, or a value we did not define —
 * even if it is prompted to.
 */

import { z } from 'zod';
import { PARSER_VERSION } from './config';

// ------------------------------------------------- closed vocabularies ------

export const CONTENT_TYPES = ['movie', 'tv', 'any'] as const;

/** Canonical genres. The parser maps synonyms onto these; nothing else exists. */
export const GENRES = [
  'action', 'adventure', 'animation', 'comedy', 'crime', 'documentary', 'drama',
  'family', 'fantasy', 'history', 'horror', 'music', 'mystery', 'romance',
  'science_fiction', 'thriller', 'war', 'western',
] as const;

/** Experience/mood axes. Each maps to a stored, measurable title feature. */
export const MOODS = [
  'gritty', 'atmospheric', 'comforting', 'bleak', 'uplifting', 'tense',
  'funny', 'romantic', 'cerebral', 'visually_impressive', 'unusual',
  'mainstream', 'nostalgic', 'melancholy',
] as const;

export const NARRATIVE_TRAITS = [
  'dialogue_forward', 'fast_paced', 'slow_burn', 'character_driven',
  'plot_driven', 'action_driven', 'mystery_structure', 'survival',
  'coming_of_age', 'ensemble', 'antihero', 'satisfying_ending',
  'twist_ending', 'ambiguous_ending', 'predictable',
] as const;

export const CHARACTER_TRAITS = [
  'strong_female_lead', 'family_centered', 'relationship_centered',
  'workplace_centered', 'child_protagonist',
] as const;

/** Content traits that may be EXCLUDED. Deliberately the safety vocabulary. */
export const CONTENT_TRAITS = [
  'graphic_gore', 'graphic_violence', 'sexual_content', 'nudity',
  'strong_language', 'horror', 'jump_scares', 'animal_harm',
  'child_endangerment', 'suicide_self_harm', 'sexual_violence',
  'drug_use', 'depressing', 'childish', 'superhero',
] as const;

/**
 * Exclusions that must NEVER be relaxed automatically to widen a pool. These
 * are safety and trauma boundaries, not preferences to be negotiated away.
 */
export const NEVER_AUTO_RELAX: readonly string[] = [
  'sexual_violence', 'animal_harm', 'child_endangerment', 'suicide_self_harm',
  'graphic_gore', 'graphic_violence', 'sexual_content', 'nudity',
];

export const MONETIZATION = ['flatrate', 'free', 'ads', 'rent', 'buy'] as const;

export type Genre = (typeof GENRES)[number];
export type Mood = (typeof MOODS)[number];
export type NarrativeTrait = (typeof NARRATIVE_TRAITS)[number];
export type CharacterTrait = (typeof CHARACTER_TRAITS)[number];
export type ContentTrait = (typeof CONTENT_TRAITS)[number];

// ------------------------------------------------------------- schema -------

const weighted = <T extends readonly [string, ...string[]]>(values: T) =>
  z.object({ value: z.enum(values), weight: z.number().min(0).max(1) });

export const hardFiltersSchema = z.object({
  content_type: z.enum(CONTENT_TYPES).default('any'),
  max_runtime_minutes: z.number().int().min(1).max(600).nullable().default(null),
  min_runtime_minutes: z.number().int().min(1).max(600).nullable().default(null),
  min_release_year: z.number().int().min(1880).max(2100).nullable().default(null),
  max_release_year: z.number().int().min(1880).max(2100).nullable().default(null),
  allowed_streaming_services: z.array(z.string().min(1).max(40)).max(30).default([]),
  allowed_monetization: z.array(z.enum(MONETIZATION)).max(5).default([]),
  allowed_languages: z.array(z.string().length(2)).max(20).default([]),
  /** Original audio only — no dubs. */
  original_audio_only: z.boolean().default(false),
  require_no_subtitles: z.boolean().default(false),
  max_content_rating: z.string().max(10).nullable().default(null),
  excluded_content_traits: z.array(z.enum(CONTENT_TRAITS)).max(20).default([]),
  exclude_watched: z.boolean().default(false),
  /** Canonical title ids vetoed by a court member. */
  vetoed_title_ids: z.array(z.string().max(64)).max(200).default([]),
  region: z.string().length(2).default('US'),
});

export const softPreferencesSchema = z.object({
  genres: z.array(weighted(GENRES)).max(20).default([]),
  moods: z.array(weighted(MOODS)).max(20).default([]),
  narrative_traits: z.array(weighted(NARRATIVE_TRAITS)).max(20).default([]),
  character_traits: z.array(weighted(CHARACTER_TRAITS)).max(20).default([]),
  reference_titles: z.array(z.object({
    title: z.string().min(1).max(120),
    /** How the reference is meant: more like it, or like it BUT different. */
    relationship: z.enum(['similar', 'similar_but_less_graphic', 'similar_but_more_dialogue',
      'similar_but_lighter', 'similar_but_faster', 'contrast']).default('similar'),
    weight: z.number().min(0).max(1),
    /** Resolved catalog id, filled in by entity resolution — never by the model. */
    resolved_title_id: z.string().max(64).nullable().default(null),
  })).max(10).default([]),
  people: z.array(z.object({
    name: z.string().min(1).max(120),
    role: z.enum(['actor', 'director', 'writer', 'creator', 'any']).default('any'),
    weight: z.number().min(0).max(1),
    resolved_person_id: z.string().max(64).nullable().default(null),
  })).max(10).default([]),
  decades: z.array(z.number().int().min(1880).max(2100)).max(15).default([]),
  countries: z.array(z.string().length(2)).max(20).default([]),
});

export const negativePreferenceSchema = z.object({
  value: z.enum(CONTENT_TRAITS),
  weight: z.number().min(0).max(1),
});

export const ambiguitySchema = z.object({
  field: z.string().max(60),
  question: z.string().max(200),
  options: z.array(z.string().max(60)).max(6).default([]),
});

export const parsedRequestSchema = z.object({
  request_version: z.literal('1.0'),
  content_type: z.enum(CONTENT_TYPES),
  hard_filters: hardFiltersSchema,
  soft_preferences: softPreferencesSchema,
  negative_preferences: z.array(negativePreferenceSchema).max(20).default([]),
  ambiguities: z.array(ambiguitySchema).max(6).default([]),
  parser_confidence: z.number().min(0).max(1),
});

export type ParsedRequest = z.infer<typeof parsedRequestSchema>;
export type HardFilters = z.infer<typeof hardFiltersSchema>;
export type SoftPreferences = z.infer<typeof softPreferencesSchema>;

// ------------------------------------------------------------ validation ----

export interface ValidationOutcome {
  ok: boolean;
  request: ParsedRequest;
  /** Fields the model produced that we refused. Recorded, never executed. */
  rejected: string[];
  /** True when we fell back to the deterministic parse. */
  usedFallback: boolean;
  parserVersion: string;
  modelVersion: string | null;
}

/** An empty, valid request — the floor every failure path lands on. */
export function emptyRequest(region = 'US'): ParsedRequest {
  return parsedRequestSchema.parse({
    request_version: '1.0',
    content_type: 'any',
    hard_filters: { region },
    soft_preferences: {},
    negative_preferences: [],
    ambiguities: [],
    parser_confidence: 0,
  });
}

/**
 * Validate untrusted parser output. Unknown keys are STRIPPED (zod's default),
 * out-of-vocabulary values are dropped with a record of what was refused, and
 * a structurally broken payload falls back to `fallback` rather than throwing
 * into the request path.
 */
export function validateParsed(
  raw: unknown,
  fallback: ParsedRequest,
  modelVersion: string | null = null,
): ValidationOutcome {
  const rejected: string[] = [];
  const result = parsedRequestSchema.safeParse(raw);
  if (result.success) {
    return { ok: true, request: result.data, rejected, usedFallback: false, parserVersion: PARSER_VERSION, modelVersion };
  }
  // Salvage what is individually valid rather than discarding a mostly-good
  // parse: each rejected path is recorded so the failure is auditable.
  for (const issue of result.error.issues) rejected.push(issue.path.join('.') || '(root)');

  const salvaged = salvage(raw, fallback);
  return { ok: false, request: salvaged, rejected, usedFallback: true, parserVersion: PARSER_VERSION, modelVersion };
}

/** Keep every branch that validates on its own; drop the rest. */
function salvage(raw: unknown, fallback: ParsedRequest): ParsedRequest {
  if (!raw || typeof raw !== 'object') return fallback;
  const r = raw as Record<string, unknown>;
  const out = emptyRequest(fallback.hard_filters.region);

  const ct = z.enum(CONTENT_TYPES).safeParse(r.content_type);
  if (ct.success) { out.content_type = ct.data; out.hard_filters.content_type = ct.data; }

  const hf = hardFiltersSchema.safeParse(r.hard_filters);
  if (hf.success) out.hard_filters = hf.data;

  const sp = softPreferencesSchema.safeParse(r.soft_preferences);
  if (sp.success) out.soft_preferences = sp.data;

  const np = z.array(negativePreferenceSchema).safeParse(r.negative_preferences);
  if (np.success) out.negative_preferences = np.data;

  const conf = z.number().min(0).max(1).safeParse(r.parser_confidence);
  out.parser_confidence = conf.success ? Math.min(conf.data, 0.6) : 0.3; // salvaged ⇒ never high confidence
  return out;
}

/**
 * A stable fingerprint of everything that affects the RESULT. Used as the cache
 * key, so any change to a constraint, a service list or a member set produces a
 * different key rather than a stale hit.
 */
export function requestFingerprint(req: ParsedRequest, extra: Record<string, unknown> = {}): string {
  const canonical = {
    v: req.request_version,
    ct: req.content_type,
    hf: sortDeep(req.hard_filters),
    sp: sortDeep(req.soft_preferences),
    np: [...req.negative_preferences].sort((a, b) => a.value.localeCompare(b.value)),
    x: sortDeep(extra),
  };
  return hash(JSON.stringify(canonical));
}

function sortDeep(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(sortDeep).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
  if (v && typeof v === 'object') {
    return Object.fromEntries(Object.entries(v as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([k, x]) => [k, sortDeep(x)]));
  }
  return v;
}

function hash(s: string): string {
  let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
  for (let i = 0; i < s.length; i++) {
    const ch = s.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (h2 >>> 0).toString(16).padStart(8, '0') + (h1 >>> 0).toString(16).padStart(8, '0');
}
