/**
 * THE ORACLE.
 *
 * Written BEFORE execution, against the frozen corpus, so no result can be
 * rationalised into a pass afterwards. Every layer (live API, shipped modules,
 * browser) normalises what it saw into one `Observation` and is judged by the
 * same rules here.
 *
 * The governing principle: something appearing is not success. A result passes
 * only when it reflects what the person MEANT.
 */
import type { FrozenTest } from './corpus';

// ── What a layer must report ──────────────────────────────────────────────
export interface ResultItem {
  title?: string | null;
  name?: string | null;
  media_type?: 'movie' | 'tv' | 'person' | string | null;
  id?: number | string | null;
  year?: number | null;
}

export interface AvailabilityClaim {
  title?: string | null;
  service?: string | null;
  /** included | rent | buy | premium_addon | free | unknown */
  kind?: string | null;
  /** Where the claim came from, and when. An unlabelled claim is not evidence. */
  source?: string | null;
  checked_at?: string | null;
}

export interface Observation {
  layer: 'A_live_api' | 'B_module' | 'C_browser';
  test_id: number;
  /** Transport succeeded (any 2xx/3xx/4xx). False means network failure. */
  ok: boolean;
  http_status?: number | null;
  latency_ms: number;
  error?: string | null;
  /** Ranked results, best first. */
  results: ResultItem[];
  /** Where the app decided to send the user, when the layer can see it. */
  destination?: string | null;
  /** The system's own intent classification, when the layer can see it. */
  intent?: string | null;
  /** A question back to the user, if one was asked. */
  clarifying_question?: string | null;
  /** The interpretation the system stated back ("showing films after 2020"). */
  disclosed_interpretation?: string | null;
  /** Constraints the system reports it is applying, for multi-turn retention. */
  retained_constraints?: Record<string, unknown> | null;
  availability_claims?: AvailabilityClaim[];
  /** Everything the surface rendered or returned, for leak detection. */
  raw_text?: string | null;
  /** Set when a layer could not run this test at all. */
  not_verified?: string | null;
}

export type Severity = 'P0' | 'P1' | 'P2' | 'P3';

export interface Judgement {
  test_id: number;
  layer: Observation['layer'];
  rule: string;
  pass: boolean;
  severity: Severity | null;
  reason: string;
  /** True when the layer could not exercise this test — neither pass nor fail. */
  not_verified: boolean;
}

/**
 * SEVERITY, defined once so it is applied consistently.
 *
 * P0  the answer is wrong or absent for a request that was not ambiguous; a
 *     secret, stack trace or file path leaks; ordinary input crashes the
 *     surface; a fact is fabricated and presented as verified.
 * P1  the right answer exists but is unreachable (buried, wrong rank); a
 *     stated constraint is silently dropped; conversation state is lost; an
 *     availability claim carries no source; hostile input returns 5xx.
 * P2  the answer is right but the handling is not: undisclosed normalisation,
 *     the correct title in the wrong medium, poor ordering within the top set.
 * P3  cosmetic — a needless clarifying question on an already-clear request,
 *     wording, presentation.
 */
export const SEVERITY_DEFINITIONS: Record<Severity, string> = {
  P0: 'wrong or missing answer to an unambiguous request; secret/stack-trace/path leak; crash on ordinary input; fabricated fact',
  P1: 'right answer unreachable; stated constraint silently dropped; conversation state lost; unlabelled availability claim; 5xx on hostile input',
  P2: 'correct but mishandled: undisclosed normalisation, right title wrong medium, poor ordering',
  P3: 'cosmetic: needless clarification on a clear request, wording, presentation',
};

/**
 * CONSTRAINTS THE PRODUCT IS EXPECTED TO CARRY.
 *
 * The corpus records everything a request implies, including soft colour
 * ("mood", "occasion") that no filter is meant to encode. Judging a system for
 * failing to persist "Sunday afternoon" as a hard constraint would be scoring
 * it against a requirement nobody made. Only these keys are treated as
 * constraints whose loss is a defect; the rest are reported as context.
 */
export const HARD_CONSTRAINT_KEYS = new Set([
  'media_type', 'service', 'max_runtime_minutes', 'max_seasons', 'released_after',
  'reference', 'references', 'genre', 'exclude_titles', 'exclude_genre', 'certification',
  'decade', 'negative', 'available_now', 'exclude_seen', 'exclude_watched', 'country',
  'topic', 'boxing', 'person', 'disambiguate', 'included_only', 'uses_history',
]);

export const hardKeys = (c: Record<string, unknown>): string[] =>
  Object.keys(c).filter((k) => HARD_CONSTRAINT_KEYS.has(k));

// ── Text normalisation ────────────────────────────────────────────────────
const STRIP_DIACRITICS = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '');

/** Compare titles the way a person would: ignoring case, accents, punctuation. */
export function normTitle(s: string): string {
  return STRIP_DIACRITICS(String(s ?? ''))
    .toLowerCase()
    .replace(/[’'`]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/** …and also ignoring a leading article, which people drop constantly. */
export function normLoose(s: string): string {
  return normTitle(s).replace(/^(the|a|an) /, '');
}

const label = (r: ResultItem) => String(r.title ?? r.name ?? '');
const titleEq = (a: string, b: string) => normLoose(a) === normLoose(b);
const rankOf = (results: ResultItem[], want: string) =>
  results.findIndex((r) => titleEq(label(r), want)) + 1; // 1-based, 0 = absent

const mediaOf = (r: ResultItem) => (r.media_type === 'tv' || r.media_type === 'movie' ? r.media_type : null);

// ── Leak detection ────────────────────────────────────────────────────────
/**
 * Patterns that must never appear in anything a user can see. Kept narrow so a
 * legitimate result containing the word "error" does not trip it.
 */
const LEAK_PATTERNS: [RegExp, string][] = [
  [/\bsb_secret_[A-Za-z0-9_-]{8,}/, 'Supabase secret key'],
  [/\beyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}\./, 'JWT'],
  [/\bsk-[A-Za-z0-9]{20,}/, 'OpenAI-style key'],
  [/SUPABASE_SERVICE_ROLE_KEY\s*[:=]\s*\S+/, 'service-role key value'],
  [/TMDB_API_KEY\s*[:=]\s*\S+/, 'TMDB key value'],
  [/OPENAI_API_KEY\s*[:=]\s*\S+/, 'OpenAI key value'],
  [/\/(?:var|home|root|usr)\/[A-Za-z0-9_./-]+\.(?:ts|js|tsx|json)\b/, 'server file path'],
  [/\bat\s+\w+\s+\(\/[^)]+:\d+:\d+\)/, 'stack frame'],
  [/\b(?:PostgresError|PGRST\d{3}|syntax error at or near|relation "[a-z_]+" does not exist)/, 'database error'],
  [/\.next\/server\//, 'build path'],
];

/** An unescaped executable echo, as opposed to the payload shown as text. */
const EXECUTABLE_ECHO: [RegExp, string][] = [
  [/<script\b[^>]*>[^<]*<\/script>/i, 'unescaped <script> element'],
  [/<img[^>]+onerror\s*=/i, 'unescaped event handler'],
  [/\bjavascript:\s*alert\(/i, 'javascript: URL rendered as a link'],
];

export function detectLeaks(text: string | null | undefined): string[] {
  if (!text) return [];
  const found: string[] = [];
  for (const [re, what] of LEAK_PATTERNS) if (re.test(text)) found.push(what);
  for (const [re, what] of EXECUTABLE_ECHO) if (re.test(text)) found.push(what);
  return found;
}

// ── Small helpers used by several rules ───────────────────────────────────
const asked = (o: Observation) => Boolean(o.clarifying_question && o.clarifying_question.trim());
const disclosed = (o: Observation) => Boolean(o.disclosed_interpretation && o.disclosed_interpretation.trim());
const hasResults = (o: Observation) => o.results.length > 0;
const serverError = (o: Observation) => typeof o.http_status === 'number' && o.http_status >= 500;

const verdict = (
  t: FrozenTest, o: Observation, rule: string,
  pass: boolean, severity: Severity | null, reason: string,
): Judgement => ({ test_id: t.id, layer: o.layer, rule, pass, severity: pass ? null : severity, reason, not_verified: false });

// ── The rules ─────────────────────────────────────────────────────────────

/** An exact title typed correctly must resolve to that title, first. */
function judgeExactTitle(t: FrozenTest, o: Observation): Judgement {
  const want = t.expected_title!;
  if (!hasResults(o)) return verdict(t, o, 'exact_title', false, 'P0', `no results for the exact title "${want}"`);
  const rank = rankOf(o.results, want);
  if (rank === 0) return verdict(t, o, 'exact_title', false, 'P0', `"${want}" absent from ${o.results.length} results; top was "${label(o.results[0]!)}"`);
  const hit = o.results[rank - 1]!;
  const wantMedia = t.expected_media_type ?? null;
  const gotMedia = mediaOf(hit);
  if (rank > 1) {
    const sev: Severity = rank <= (t.top_n ?? 3) ? 'P1' : 'P0';
    return verdict(t, o, 'exact_title', false, sev, `"${want}" found at rank ${rank}, not first; top was "${label(o.results[0]!)}"`);
  }
  if (wantMedia && gotMedia && gotMedia !== wantMedia) {
    return verdict(t, o, 'exact_title', false, 'P2', `resolved "${want}" as ${gotMedia}, expected ${wantMedia}`);
  }
  return verdict(t, o, 'exact_title', true, null, `"${want}" first`);
}

/** A person's name must find the person, not a title that shares a word. */
function judgePerson(t: FrozenTest, o: Observation): Judgement {
  const want = t.expected_person!;
  if (!hasResults(o)) return verdict(t, o, 'person', false, 'P0', `no results for "${want}"`);
  const rank = rankOf(o.results, want);
  const within = t.top_n ?? 3;
  if (rank === 0) return verdict(t, o, 'person', false, 'P0', `"${want}" absent; top was "${label(o.results[0]!)}"`);
  if (rank > within) return verdict(t, o, 'person', false, 'P1', `"${want}" at rank ${rank}, outside the top ${within}`);
  return verdict(t, o, 'person', true, null, `"${want}" at rank ${rank}`);
}

/**
 * Input in another script or alphabet must survive the round trip.
 *
 * Some of these queries name no specific work — "películas de boxeo",
 * "🥊 movies", "krimi serien deutsch" — so the corpus records no expected
 * title, and the only honest assertion is the one it does make: handle the
 * characters without mangling them, and either find something or say so.
 * Judging them against an absent expectation compared every result to
 * `undefined` and failed 44 answers that were correct.
 */
function judgeUnicodeSafety(t: FrozenTest, o: Observation): Judgement {
  if (serverError(o)) return verdict(t, o, 'unicode_safety', false, 'P0', `HTTP ${o.http_status} on non-ASCII input`);
  if (!o.ok) return verdict(t, o, 'unicode_safety', false, 'P1', `no response: ${o.error}`);
  const leaks = detectLeaks(o.raw_text);
  if (leaks.length) return verdict(t, o, 'unicode_safety', false, 'P0', `leaked: ${leaks.join(', ')}`);
  if (!hasResults(o) && !asked(o)) {
    return verdict(t, o, 'unicode_safety', false, 'P1', 'no results and no explanation for a well-formed non-English query');
  }
  return verdict(t, o, 'unicode_safety', true, null,
    hasResults(o) ? `${o.results.length} results, characters intact (top "${label(o.results[0]!)}")` : 'asked rather than guessed');
}

/** A misspelling, fragment or punctuation variant must still recover the title. */
function judgeFuzzyTitle(t: FrozenTest, o: Observation): Judgement {
  if (!t.expected_title) return judgeUnicodeSafety(t, o);
  const want = t.expected_title;
  const within = t.top_n ?? 5;
  if (!hasResults(o)) return verdict(t, o, 'fuzzy_title', false, 'P0', `no results; "${want}" was recoverable`);
  const rank = rankOf(o.results, want);
  if (rank === 0) return verdict(t, o, 'fuzzy_title', false, 'P1', `"${want}" not recovered; top was "${label(o.results[0]!)}"`);
  if (rank > within) return verdict(t, o, 'fuzzy_title', false, 'P1', `"${want}" at rank ${rank}, outside the top ${within}`);
  return verdict(t, o, 'fuzzy_title', true, null, `"${want}" recovered at rank ${rank}`);
}

/**
 * A recommendation request must be answered as a recommendation.
 *
 * The commonest failure this catches: a request that NAMES a title being
 * treated as a request FOR that title. "Something like Rocky" resolving to the
 * Rocky title page is the exact failure the brief calls out.
 */
function judgeRecommendation(t: FrozenTest, o: Observation): Judgement {
  const refs = t.reference_titles;
  const excl = (t.required_constraints.exclude_titles as string[] | undefined) ?? refs;

  if (o.destination && refs.length) {
    const dest = o.destination.toLowerCase();
    if (/^\/(title|movie|tv|person)\//.test(dest)) {
      return verdict(t, o, 'recommendation', false, 'P1', `routed to an exact-title destination (${o.destination}) for a recommendation request`);
    }
  }
  if (!hasResults(o) && !asked(o) && !disclosed(o)) {
    return verdict(t, o, 'recommendation', false, 'P0', 'empty result with no clarification and no explanation');
  }
  // The reference itself must not be the recommendation.
  for (const bad of excl) {
    const r = rankOf(o.results, bad);
    if (r === 1) return verdict(t, o, 'recommendation', false, 'P1', `returned the reference title "${bad}" as the top recommendation`);
  }
  // Checkable hard constraints.
  const after = t.required_constraints.released_after;
  if (typeof after === 'number') {
    const dated = o.results.filter((r) => typeof r.year === 'number');
    const violating = dated.filter((r) => (r.year as number) < after);
    if (dated.length && violating.length > dated.length / 2) {
      return verdict(t, o, 'recommendation', false, 'P1', `${violating.length}/${dated.length} dated results predate ${after}`);
    }
  }
  const mt = t.required_constraints.media_type;
  if (mt === 'movie' || mt === 'tv') {
    const typed = o.results.filter((r) => mediaOf(r));
    const wrong = typed.filter((r) => mediaOf(r) !== mt);
    if (typed.length && wrong.length > typed.length / 2) {
      return verdict(t, o, 'recommendation', false, 'P1', `${wrong.length}/${typed.length} typed results are not ${mt}`);
    }
  }
  if (!hasResults(o) && asked(o)) return verdict(t, o, 'recommendation', true, null, 'asked rather than guessed');
  return verdict(t, o, 'recommendation', true, null, `${o.results.length} recommendations, reference excluded`);
}

/**
 * Later turns REFINE. A short follow-up is not a new search, and an earlier
 * constraint that quietly disappears is the failure worth naming.
 */
function judgeMultiTurn(t: FrozenTest, o: Observation): Judgement {
  const want = hardKeys(t.required_constraints);
  const got = o.retained_constraints ?? {};
  const gotKeys = new Set(Object.keys(got));
  const lost = want.filter((k) => !gotKeys.has(k));
  if (!o.retained_constraints) {
    // The layer saw no state at all — either a reset or an unobservable one.
    if (!hasResults(o) && !asked(o)) return verdict(t, o, 'multi_turn', false, 'P0', 'nothing survived the conversation: no state, no results, no question');
    return verdict(t, o, 'multi_turn', false, 'P1', 'no conversation state observable after the final turn');
  }
  if (lost.length === want.length && want.length > 0) {
    return verdict(t, o, 'multi_turn', false, 'P0', `every earlier constraint was lost (${want.join(', ')})`);
  }
  if (lost.length) {
    return verdict(t, o, 'multi_turn', false, 'P1', `dropped ${lost.length}/${want.length} constraints: ${lost.join(', ')}`);
  }
  return verdict(t, o, 'multi_turn', true, null, `retained all ${want.length} constraints`);
}

/** Unclear language: the four classifications, judged as stated. */
function judgeAmbiguity(t: FrozenTest, o: Observation): Judgement {
  switch (t.expected_handling) {
    case 'clarification_required':
      if (asked(o)) return verdict(t, o, 'ambiguity/clarification_required', true, null, 'asked a clarifying question');
      if (hasResults(o) && disclosed(o)) return verdict(t, o, 'ambiguity/clarification_required', true, null, 'answered with the interpretation disclosed');
      if (hasResults(o)) return verdict(t, o, 'ambiguity/clarification_required', false, 'P1', 'answered confidently without asking or disclosing an interpretation');
      return verdict(t, o, 'ambiguity/clarification_required', false, 'P0', 'empty, with neither a question nor an explanation');

    case 'safe_normalization':
      if (!hasResults(o) && !asked(o)) return verdict(t, o, 'ambiguity/safe_normalization', false, 'P0', 'nothing returned for a request that could safely be normalised');
      if (asked(o) && !hasResults(o)) return verdict(t, o, 'ambiguity/safe_normalization', false, 'P3', 'asked a question where a stated assumption would have done');
      if (!disclosed(o)) return verdict(t, o, 'ambiguity/safe_normalization', false, 'P2', 'normalised the request silently — the assumption was never stated');
      return verdict(t, o, 'ambiguity/safe_normalization', true, null, 'normalised and disclosed');

    case 'enough_information':
      if (!hasResults(o) && asked(o)) return verdict(t, o, 'ambiguity/enough_information', false, 'P2', 'asked for clarification although the request was already answerable');
      if (!hasResults(o)) return verdict(t, o, 'ambiguity/enough_information', false, 'P0', 'no answer to an answerable request');
      return verdict(t, o, 'ambiguity/enough_information', true, null, 'answered directly');

    case 'impossible_or_contradictory': {
      const named = asked(o) || disclosed(o) || /conflict|contradict|cannot both|mutually|incompatible/i.test(o.raw_text ?? '');
      if (named) return verdict(t, o, 'ambiguity/impossible', true, null, 'named the conflict');
      if (hasResults(o)) return verdict(t, o, 'ambiguity/impossible', false, 'P1', 'answered confidently despite contradictory constraints');
      return verdict(t, o, 'ambiguity/impossible', false, 'P1', 'returned nothing without explaining the contradiction');
    }
    default:
      return verdict(t, o, 'ambiguity', true, null, 'no ambiguity classification applies');
  }
}

/** Availability may never be guessed, and included is not the same as rent. */
function judgeAvailability(t: FrozenTest, o: Observation): Judgement {
  const claims = o.availability_claims ?? [];
  if (!claims.length) {
    // Saying nothing about availability is honest. Saying nothing while
    // implying it is not, but that is a UI judgement the browser layer makes.
    if (!hasResults(o) && !asked(o)) return verdict(t, o, 'availability', false, 'P0', 'no answer and no explanation for an availability question');
    return verdict(t, o, 'availability', true, null, 'made no availability claim');
  }
  const unlabelled = claims.filter((c) => !c.source);
  if (unlabelled.length) {
    return verdict(t, o, 'availability', false, 'P1', `${unlabelled.length}/${claims.length} availability claims carry no source`);
  }
  const untyped = claims.filter((c) => !c.kind || c.kind === 'unknown');
  if (untyped.length === claims.length) {
    return verdict(t, o, 'availability', false, 'P1', 'availability stated without distinguishing included from rent or buy');
  }
  return verdict(t, o, 'availability', true, null, `${claims.length} sourced availability claims`);
}

/** Hostile input is text. It is never instruction, and it never leaks. */
function judgeSecurity(t: FrozenTest, o: Observation): Judgement {
  const leaks = detectLeaks(o.raw_text);
  if (leaks.length) return verdict(t, o, 'security', false, 'P0', `leaked: ${leaks.join(', ')}`);
  if (!o.ok && /timeout|abort/i.test(o.error ?? '')) return verdict(t, o, 'security', false, 'P1', `no response: ${o.error}`);
  if (serverError(o)) return verdict(t, o, 'security', false, 'P1', `HTTP ${o.http_status} on hostile input`);
  // A prompt-injection instruction that changed behaviour shows up as the
  // system talking about itself rather than about films.
  if (/system prompt|you are an ai|developer mode enabled|my instructions are/i.test(o.raw_text ?? '')) {
    return verdict(t, o, 'security', false, 'P0', 'responded to injected instructions about itself');
  }
  return verdict(t, o, 'security', true, null, 'treated as literal text, no leak');
}

/** Empty, nonsense and extreme input must be survived, not celebrated. */
function judgeMalformed(t: FrozenTest, o: Observation): Judgement {
  const leaks = detectLeaks(o.raw_text);
  if (leaks.length) return verdict(t, o, 'malformed', false, 'P0', `leaked: ${leaks.join(', ')}`);
  if (!o.ok) return verdict(t, o, 'malformed', false, 'P1', `no response: ${o.error ?? 'unknown'}`);
  if (serverError(o)) return verdict(t, o, 'malformed', false, 'P1', `HTTP ${o.http_status} on malformed input`);
  return verdict(t, o, 'malformed', true, null, `handled gracefully (HTTP ${o.http_status ?? 'n/a'})`);
}

/**
 * LAYER B: what the shipped interpretation modules understood.
 *
 * SCOPE, and why it is narrower than it first looks.
 *
 * The obvious thing to measure here is routing — did "something like Rocky"
 * get sent to the Judge or to the Rocky title page. But the shipped decision
 * (`resolveSearchDestination`) is made WITH the catalog results in hand: an
 * exact title match wins outright, and when nothing comes back the query falls
 * through to the Judge regardless of how it was classified. A layer with no
 * retrieval therefore cannot know where a query actually lands, and a routing
 * verdict issued here would be a guess wearing a number. Routing is judged in
 * Layer A, where the real results exist and the same shipped resolver runs
 * against them.
 *
 * What this layer CAN prove, and does:
 *   1. Constraint capture — for requests that state constraints in prose, did
 *      the shipped parser and planner represent them at all?
 *   2. Crash-safety — no input throws.
 * The intent classification is recorded as evidence for Layer A, not scored.
 */
export function judgeInterpretation(t: FrozenTest, o: Observation): Judgement {
  if (o.not_verified) {
    return { test_id: t.id, layer: o.layer, rule: 'not_verified', pass: false, severity: null, reason: o.not_verified, not_verified: true };
  }
  if (!o.ok) return verdict(t, o, 'interpretation/crash', false, 'P0', `interpretation threw: ${o.error}`);

  // A bare title, a name or a fragment states no constraints; there is nothing
  // for this layer to check and the answer depends entirely on retrieval.
  const statesConstraints = t.intended_intent === 'recommendation'
    || t.intended_intent === 'availability'
    || t.multi_turn;
  if (!statesConstraints) {
    return {
      test_id: t.id, layer: o.layer, rule: 'interpretation/deferred', pass: false, severity: null,
      reason: 'a lookup states no constraints — resolution and ranking are verified in Layer A',
      not_verified: true,
    };
  }

  const want = hardKeys(t.required_constraints);
  if (!want.length) {
    return verdict(t, o, 'interpretation/constraints', true, null, 'no hard constraints to carry');
  }
  const got = new Set(Object.keys(o.retained_constraints ?? {}));
  const lost = want.filter((k) => !got.has(k));
  if (lost.length === want.length) {
    return verdict(t, o, 'interpretation/constraints', false, t.multi_turn ? 'P0' : 'P1',
      `captured none of the ${want.length} hard constraints (${want.join(', ')})`);
  }
  if (lost.length) {
    return verdict(t, o, 'interpretation/constraints', false, 'P1', `dropped ${lost.length}/${want.length}: ${lost.join(', ')}`);
  }
  return verdict(t, o, 'interpretation/constraints', true, null, `retained all ${want.length} constraints`);
}

/**
 * LAYER A: where a typed query actually LANDS.
 *
 * The recommendation engine (`/api/ask`) requires a signed-in session, so this
 * audit cannot read the Judge's answers. What it CAN read is the decision made
 * before them, and that decision is the one that most often goes wrong: the
 * shipped `resolveSearchDestination` is run against the real catalog results,
 * so a request that ends on a title page ends there for a user too.
 *
 * Landing at the Judge is a PASS here. It is not a claim that the Judge
 * answered well — that is recorded as not-verified and must never be reported
 * as if it had been checked.
 */
export function judgeRouting(t: FrozenTest, o: Observation): Judgement {
  const reason = o.intent ?? '';
  if (serverError(o)) return verdict(t, o, 'routing', false, 'P0', `HTTP ${o.http_status} while resolving the destination`);
  if (reason === 'ask' || reason === 'no-results') {
    return verdict(t, o, 'routing', true, null, `sent to the Judge (${reason})`);
  }
  if (reason === 'exact-title' || reason === 'top-result') {
    const top = o.results[0];
    return verdict(t, o, 'routing', false, 'P1',
      `a request for a recommendation opened a title page instead (${o.destination}, ${reason}` +
      (top ? `, "${String(top.title ?? top.name)}"` : '') + ')');
  }
  return verdict(t, o, 'routing', false, 'P1', `no destination resolved (reason: ${reason || 'none'})`);
}

// ── Entry point ───────────────────────────────────────────────────────────
/**
 * One test, one observation, one judgement.
 *
 * Order matters: security and malformed inputs are judged as such regardless
 * of what else they resemble, multi-turn retention is judged before intent,
 * and the ambiguity classification governs anything conversational.
 */
export function judge(t: FrozenTest, o: Observation): Judgement {
  if (o.not_verified) {
    return { test_id: t.id, layer: o.layer, rule: 'not_verified', pass: false, severity: null, reason: o.not_verified, not_verified: true };
  }
  if (!o.ok && t.intended_intent !== 'security' && t.intended_intent !== 'malformed') {
    return verdict(t, o, 'transport', false, 'P1', `no response: ${o.error ?? 'unknown'}`);
  }
  if (t.intended_intent === 'security') return judgeSecurity(t, o);
  if (t.intended_intent === 'malformed') return judgeMalformed(t, o);

  const leaks = detectLeaks(o.raw_text);
  if (leaks.length) return verdict(t, o, 'leak', false, 'P0', `leaked: ${leaks.join(', ')}`);
  if (serverError(o)) return verdict(t, o, 'server_error', false, 'P0', `HTTP ${o.http_status} on ordinary input`);

  if (t.multi_turn) return judgeMultiTurn(t, o);
  if (t.intended_intent === 'exact_title' && t.strictness === 'exact') {
    return t.expected_title ? judgeExactTitle(t, o) : judgeUnicodeSafety(t, o);
  }
  if (t.intended_intent === 'exact_title') return judgeFuzzyTitle(t, o);
  if (t.intended_intent === 'person') return judgePerson(t, o);
  if (t.intended_intent === 'fuzzy_title') return judgeFuzzyTitle(t, o);
  if (t.intended_intent === 'availability') return judgeAvailability(t, o);

  // Recommendations are judged twice: as recommendations, and as handling of
  // whatever was unclear about them. The stricter verdict wins, because a
  // correct list that hid a silent assumption is still a reporting failure.
  const rec = judgeRecommendation(t, o);
  if (!rec.pass) return rec;
  return judgeAmbiguity(t, o);
}
