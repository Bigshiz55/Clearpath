/**
 * RAW LANGUAGE → CANONICAL INTENT.
 *
 * Sits ABOVE the serving-mode choice on purpose. `legacy`, `shadow` and
 * `anthropic` decide who EXECUTES a request; they must never decide what the
 * request MEANS, or the same sentence answers differently depending on a
 * deployment variable — which is indistinguishable from a bug to the person
 * typing it.
 *
 * Field extraction only ever reads clauses whose ROLE admits that field:
 *
 *   count, media, subject, genre, tone, provider, date, runtime  ← request +
 *                                                                  constraint
 *   liked / disliked / seen references                           ← taste
 *   companion vetoes                                             ← companion
 *   nothing at all                                               ← background
 *
 * That scoping is what makes the count in "I watched 3 movies yesterday, give
 * me a Stallone movie" stay out of `requestedCount`: the 3 is in a taste clause,
 * and taste clauses are not asked for counts.
 *
 * PURE. No I/O, no clock, no randomness, no entity resolution.
 */

import { parseClauses, requestClause, type Clause } from './clauses';
import {
  EMPTY_INTENT,
  type CanonicalIntent,
  type CreditRole,
  type GenreConstraint,
  type MediaIntent,
  type PersonReference,
  type SubjectConstraint,
  type TitleReference,
  type ToneConstraint,
} from './types';

const WORD_NUMBERS: Record<string, number> = {
  one: 1, a: 1, an: 1, two: 2, three: 3, four: 4, five: 5,
  six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
};

/** "a couple" is two; "a few" is three. Both are real ways people ask. */
const LOOSE_COUNTS: Array<[RegExp, number]> = [
  [/\ba couple of\b|\ba couple\b/i, 2],
  [/\ba few\b/i, 3],
];

/**
 * How many results were asked for — read ONLY from the request clause.
 *
 * `null` when unsaid. A default here would be a number the user never gave,
 * and the whole point of the field is to carry what they did.
 */
export function parseCount(clause: string): number | null {
  for (const [re, n] of LOOSE_COUNTS) if (re.test(clause)) return n;
  // A digit or number-word standing in front of what is being asked for.
  // `a`/`an` counts as one: "give me a boxing movie" asks for one film, and
  // returning three to that is the same species of not-listening as returning
  // one to a request for three.
  const m = clause.match(
    /\b(\d{1,2}|one|two|three|four|five|six|seven|eight|nine|ten|an?)\s+(?:\w+\s+){0,3}?(?:movies?|films?|shows?|series|documentar(?:y|ies)|comed(?:y|ies)|thrillers?|dramas?|myster(?:y|ies)|flicks?|picks?|titles?|options?)\b/i,
  );
  if (!m) return null;
  const raw = m[1]!.toLowerCase();
  const n = /^\d+$/.test(raw) ? Number(raw) : (WORD_NUMBERS[raw] ?? null);
  if (n == null || n < 1 || n > 50) return null;
  return n;
}

const TV_WORDS = /\b(?:shows?|series|tv|episodes?|seasons?|sitcoms?)\b/i;
const MOVIE_WORDS = /\b(?:movies?|films?|flicks?)\b/i;

export function parseMedia(clause: string): MediaIntent {
  const tv = TV_WORDS.test(clause);
  const movie = MOVIE_WORDS.test(clause);
  if (tv && !movie) return 'tv';
  if (movie && !tv) return 'movie';
  return 'either';
}

/**
 * NEGATION SCOPE.
 *
 * A negated term must never reach a positive field. The commonest way this
 * breaks is stripping the negator as a stop word and keeping the noun, which
 * turns "no horror" into a horror search — the exact inversion of what was
 * asked. So negation is detected FIRST and carries the term into an exclusion.
 */
const NEGATORS =
  /\b(?:not|no|without|except|excluding|avoid|nothing|none|don'?t want|do not want|hate[sd]?|can'?t stand|but not|other than|anything but)\b/i;

/** The span a negator governs: from the negator to the next boundary. */
function negatedSpans(clause: string): string[] {
  const out: string[] = [];
  const re =
    /\b(?:not|no|without|except|excluding|avoid|nothing|none|don'?t want|do not want|hates?|hated|can'?t stand|but not|other than|anything but)\b\s+((?:too\s+|any\s+|another\s+|more\s+)?[a-z][\w'-]*(?:\s+[a-z][\w'-]*){0,3})/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(clause)) !== null) {
    const span = m[1]!
      .replace(/\b(?:too|any|another|more|stuff|things?|movies?|films?|shows?|series)\b/gi, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (span) out.push(span);
  }
  return out;
}

/** Tone words a person actually reaches for. Matched, never invented. */
const TONE_WORDS =
  /\b(funny|hilarious|light|lighthearted|dark|bleak|depressing|weird|strange|uplifting|feel-?good|tense|scary|frightening|gory|violent|easy|challenging|cerebral|slow|fast-?paced|romantic|sad|cosy|cozy|gritty|wholesome)\b/gi;

/** Genre names, as said. Ids are resolved downstream, never here. */
const GENRE_WORDS =
  /\b(horror|comedy|comedies|drama|thriller|mystery|romance|documentary|documentaries|animation|animated|western|war|crime|fantasy|sci-?fi|science fiction|musical|biography|history|sport|family|adventure|action|supernatural)\b/gi;

/** Provider/network names, as said. */
const PROVIDER_WORDS =
  /\b(netflix|hulu|max|hbo(?:\s+max)?|disney\+?|disney plus|prime(?:\s+video)?|amazon(?:\s+prime)?|paramount\+?|paramount plus|peacock|apple\s?tv\+?|starz|showtime|criterion|britbox|acorn)\b/gi;

function uniqueMatches(text: string, re: RegExp): string[] {
  const out = new Set<string>();
  for (const m of text.matchAll(re)) out.add(m[1]!.toLowerCase());
  return [...out];
}

/**
 * A named work, and how it relates to the request.
 *
 * The SPAN only. Resolving "Rocky" to a tmdb id is a claim about the world and
 * belongs to entity resolution; guessing it here is exactly the invention this
 * architecture forbids. Capitalisation and quotation are the only evidence
 * available offline that a phrase names something, so those are what is used —
 * and a miss costs a lost reference, never a wrong one.
 */
const QUOTED = /["“']([^"”']{2,60})["”']/g;
const AFTER_REACTION =
  /\b(?:loved|liked|enjoyed|hated|disliked|watched|saw|seen|finished|binged|rewatched)\s+((?:[A-Z][\w''-]*)(?:\s+(?:of|the|and|a|de|la)?\s*[A-Z0-9][\w''-]*){0,4})/g;
const AFTER_SIMILARITY =
  /\b(?:like|similar to|in the vein of|in the style of|reminds me of|same (?:feel|vibe) as|better than|newer than|older than)\s+((?:[A-Z][\w''-]*)(?:\s+(?:of|the|and|a)?\s*[A-Z0-9][\w''-]*){0,4})/g;

function titleSpans(text: string, re: RegExp): string[] {
  const out: string[] = [];
  for (const m of text.matchAll(re)) {
    const span = m[1]!.trim().replace(/[.,;:!?]+$/, '');
    if (span.length >= 2) out.push(span);
  }
  return out;
}

/** People are named spans too — never ids, never credits. */
const AFTER_PERSON_CUE =
  /\b(?:with|starring|featuring|directed by|written by|created by|from)\s+((?:[A-Z][\w''-]*)(?:\s+[A-Z][\w''-]*){0,3})/g;
/** "3 Sylvester Stallone movies" — a capitalised name sitting before the noun. */
const PERSON_BEFORE_MEDIA =
  /\b((?:[A-Z][\w''-]*)(?:\s+[A-Z][\w''-]*){1,3})(?:'s)?\s+(?:movies?|films?|shows?|series)\b/g;

function roleFor(clause: string, span: string): CreditRole {
  const before = clause.slice(0, clause.indexOf(span)).toLowerCase();
  if (/\bdirected by\s*$|\bdirector\b[^.]*$/.test(before)) return 'director';
  if (/\bcreated by\s*$|\bcreator\b[^.]*$/.test(before)) return 'creator';
  if (/\b(?:with|starring|featuring)\s*$/.test(before)) return 'actor';
  return 'any';
}

function pushUnique<T extends { span: string }>(list: T[], item: T): void {
  if (!list.some((x) => x.span.toLowerCase() === item.span.toLowerCase())) list.push(item);
}

/**
 * The whole interpretation.
 *
 * Every field is filled from clauses whose role admits it, and background
 * clauses are recorded but never read for content.
 */
export function interpret(raw: string): CanonicalIntent {
  const clauses: Clause[] = parseClauses(raw ?? '');
  const req = requestClause(clauses);
  const intent: CanonicalIntent = {
    ...EMPTY_INTENT,
    subjects: [],
    genres: [],
    tones: [],
    people: [],
    titles: [],
    providers: [],
    date: {},
    runtime: {},
    background: [],
    requestClause: req?.text ?? '',
  };

  intent.background = clauses
    .filter((c) => c.role === 'background')
    .map((c) => ({ text: c.text, reason: 'no-request-signal' as const }));

  // Clauses that may contribute EXECUTABLE constraints.
  const executableClauses = clauses.filter((c) => c.role === 'request' || c.role === 'constraint');

  if (req) {
    intent.kind = 'recommendation';
    intent.requestedCount = parseCount(req.text);
    intent.media = parseMedia(req.text);
  } else if (clauses.some((c) => c.role === 'taste' || c.role === 'companion')) {
    intent.kind = 'statement';
  }

  for (const c of executableClauses) {
    const negated = negatedSpans(c.text).map((s) => s.toLowerCase());
    const isNegated = (term: string) => negated.some((n) => n.includes(term) || term.includes(n));

    for (const g of uniqueMatches(c.text, GENRE_WORDS)) {
      const wanted = !isNegated(g);
      pushUnique<GenreConstraint>(intent.genres, { span: g, wanted, holder: 'user' });
    }
    for (const t of uniqueMatches(c.text, TONE_WORDS)) {
      const wanted = !isNegated(t);
      if (!intent.tones.some((x) => x.term === t)) {
        intent.tones.push({ term: t, wanted, holder: 'user' } satisfies ToneConstraint);
      }
    }
    for (const p of uniqueMatches(c.text, PROVIDER_WORDS)) {
      if (!intent.providers.includes(p)) intent.providers.push(p);
    }

    // Anything negated that is not a known genre or tone is a SUBJECT to avoid
    // — "no serial killers", "without supernatural stuff". Keeping it rather
    // than dropping it is the difference between honouring a veto and ignoring
    // one, and it must never land in a positive field.
    for (const n of negated) {
      const known =
        intent.genres.some((g) => n.includes(g.span)) || intent.tones.some((t) => n.includes(t.term));
      if (!known && n.length > 2) {
        pushUnique<SubjectConstraint>(intent.subjects, { span: n, wanted: false });
      }
    }

    parseDateInto(intent, c.text);
    parseRuntimeInto(intent, c.text);

    for (const span of titleSpans(c.text, QUOTED)) {
      pushUnique<TitleReference>(intent.titles, { span, relation: 'similar' });
    }
    for (const span of titleSpans(c.text, AFTER_SIMILARITY)) {
      const rel: TitleReference['relation'] = /better than/i.test(c.text) ? 'betterThan' : 'similar';
      pushUnique<TitleReference>(intent.titles, { span, relation: rel });
    }
    for (const span of titleSpans(c.text, AFTER_PERSON_CUE)) {
      pushUnique<PersonReference>(intent.people, {
        span,
        relation: isNegated(span.toLowerCase()) ? 'excluded' : 'required',
        role: roleFor(c.text, span),
      });
    }
    for (const span of titleSpans(c.text, PERSON_BEFORE_MEDIA)) {
      pushUnique<PersonReference>(intent.people, {
        span,
        relation: isNegated(span.toLowerCase()) ? 'excluded' : 'required',
        role: 'any',
      });
    }

    if (/\b(?:already (?:seen|watched)|haven'?t (?:seen|watched)|i have not seen|not seen)\b/i.test(c.text)) {
      intent.excludeSeen = true;
    }
    // "another boxing movie" asks for one that is NOT the one just named.
    if (/\banother\b/i.test(c.text)) intent.excludeSeen = true;
  }

  /*
   * A REACTION REFERENCE IS RECOGNISED WHEREVER IT APPEARS.
   *
   * "I watched Rocky three weeks ago but tonight I want a baseball movie" is a
   * single clause that is BOTH a past watch and an order. Forcing one role on
   * it loses whichever half loses the tie — and the half that was being lost was
   * the reference, so the sentence read as a bare baseball request with no
   * memory of Rocky.
   *
   * Roles still gate which fields a clause may fill: only a request clause
   * supplies counts, media and subjects. But a reaction verb pointed at a named
   * work is unambiguous on its own, so the reference is taken from any clause
   * that contains one, with its relation read from the local verb.
   */
  for (const c of clauses) {
    const positive = /\b(?:loved|liked|enjoyed|obsessed)\b/i.test(c.text);
    const negative = /\b(?:hated|disliked|couldn'?t stand|didn'?t (?:like|enjoy))\b/i.test(c.text);
    const relation: TitleReference['relation'] = negative ? 'disliked' : positive ? 'liked' : 'seen';
    for (const span of titleSpans(c.text, AFTER_REACTION)) {
      pushUnique<TitleReference>(intent.titles, { span, relation });
    }
    if (c.role === 'taste') {
      for (const span of titleSpans(c.text, QUOTED)) {
        pushUnique<TitleReference>(intent.titles, { span, relation });
      }
    }
    if (/\balready (?:seen|watched)\b/i.test(c.text)) intent.excludeSeen = true;
  }

  // COMPANION clauses: a veto belonging to someone else. It constrains tonight
  // and is attributed to them, so it can never be folded into the user's taste.
  for (const c of clauses.filter((x) => x.role === 'companion')) {
    const negated = negatedSpans(c.text).map((s) => s.toLowerCase());
    for (const g of uniqueMatches(c.text, GENRE_WORDS)) {
      const vetoed = negated.some((n) => n.includes(g)) || /\bhates?\b|\bwon'?t watch\b/i.test(c.text);
      pushUnique<GenreConstraint>(intent.genres, { span: g, wanted: !vetoed, holder: 'companion' });
    }
    for (const t of uniqueMatches(c.text, TONE_WORDS)) {
      const vetoed = negated.some((n) => n.includes(t)) || /\bhates?\b|\bwon'?t watch\b/i.test(c.text);
      if (!intent.tones.some((x) => x.term === t)) {
        intent.tones.push({ term: t, wanted: !vetoed, holder: 'companion' });
      }
    }
  }

  // A named subject in the request that is not a genre, tone or provider —
  // "boxing", "heist", "time travel". Taken from the request clause only.
  if (req) {
    for (const span of subjectSpans(req.text)) {
      const known =
        intent.genres.some((g) => g.span === span) ||
        intent.tones.some((t) => t.term === span) ||
        intent.providers.includes(span);
      if (!known) pushUnique<SubjectConstraint>(intent.subjects, { span, wanted: true });
    }
  }

  return intent;
}

/**
 * The topic a request is about, when it is stated as a modifier of the media
 * noun: "another BOXING movie", "three good HEIST movies".
 *
 * Structural rather than a vocabulary list: whatever adjective-ish word sits
 * immediately before the media noun is the subject, so a topic nobody
 * anticipated still lands in the right field.
 */
function subjectSpans(clause: string): string[] {
  const out: string[] = [];
  const re =
    /\b([a-z][\w-]{2,})\s+(?:movies?|films?|shows?|series|documentar(?:y|ies)|flicks?)\b/gi;
  const STRUCTURAL =
    /^(?:good|great|best|new|newer|old|older|other|another|more|some|any|the|a|an|three|two|four|five|six|seven|eight|nine|ten|one|few|couple|nice|decent|solid|different|similar|watch|see|want|like|find|show|give)$/i;
  for (const m of clause.matchAll(re)) {
    const w = m[1]!.toLowerCase();
    if (STRUCTURAL.test(w)) continue;
    out.push(w);
  }
  return out;
}

function parseDateInto(intent: CanonicalIntent, clause: string): void {
  const after = clause.match(/\b(?:after|since|newer than|from)\s+(\d{4})\b/i);
  if (after) intent.date.minYear = Number(after[1]);
  const before = clause.match(/\b(?:before|older than|up to)\s+(\d{4})\b/i);
  if (before) intent.date.maxYear = Number(before[1]);
  const decade = clause.match(/\b(?:from |in )?the\s+(\d{4})s\b/i);
  if (decade) {
    intent.date.minYear = Number(decade[1]);
    intent.date.maxYear = Number(decade[1]) + 9;
  }
  if (/\bnewer\b/i.test(clause) && !after) intent.date.relative = 'newer';
  if (/\bolder\b/i.test(clause) && !before) intent.date.relative = 'older';
}

function parseRuntimeInto(intent: CanonicalIntent, clause: string): void {
  const hours = clause.match(/\b(?:under|less than|no longer than|shorter than)\s+(?:(\d+)|an?|one|two|three)\s*(?:hours?|hrs?)\b/i);
  if (hours) {
    const raw = hours[1];
    const n = raw ? Number(raw) : /\btwo\b/i.test(hours[0]) ? 2 : /\bthree\b/i.test(hours[0]) ? 3 : 1;
    intent.runtime.maxMinutes = n * 60;
  }
  const mins = clause.match(/\b(?:under|less than|no longer than|shorter than)\s+(\d+)\s*(?:minutes?|mins?)\b/i);
  if (mins) intent.runtime.maxMinutes = Number(mins[1]);
  const atLeast = clause.match(/\b(?:over|more than|at least)\s+(\d+)\s*(?:minutes?|mins?)\b/i);
  if (atLeast) intent.runtime.minMinutes = Number(atLeast[1]);
}

export { NEGATORS };
