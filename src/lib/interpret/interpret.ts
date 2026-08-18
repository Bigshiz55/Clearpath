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
import { SUBJECT_TERMS } from '@/lib/finderParse';
import { detectOrigin, detectAudio, detectRuntimeMaxMinutes } from '@/lib/nlu/detectors';
import {
  EMPTY_INTENT,
  type CanonicalIntent,
  type CreditRole,
  type GenreConstraint,
  type LookbackUnit,
  type MediaIntent,
  type PersonReference,
  type SubjectConstraint,
  type TitleReference,
  type ToneConstraint,
} from './types';
import { stripRequestFrame } from '@/lib/nlu/requestFrame';

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
    /\b(\d{1,2}|one|two|three|four|five|six|seven|eight|nine|ten|an?)\s+(?:[\w-]+\s+){0,3}?(?:movies?|films?|shows?|series|documentar(?:y|ies)|comed(?:y|ies)|thrillers?|dramas?|myster(?:y|ies)|flicks?|picks?|titles?|options?)\b/i,
  );
  /* THE NUMBER IS THE OBJECT OF THE REQUEST VERB: "only show me one".
     A self-correction states its count without repeating the noun, and the
     bridge above requires one, so the corrected request came back with NO count
     at all — neither the five it superseded nor the one it asked for. Anchored
     to the end of the clause and to a request verb, because a bare number
     anywhere else is a year, a runtime or part of a title. */
  const bare = m ? null : clause.match(
    /\b(?:show|give|find|get|pull up)\s+(?:me|us)\s+(\d{1,2}|one|two|three|four|five|six|seven|eight|nine|ten)\b\s*[.!?]?\s*$/i,
  );
  const token = m?.[1] ?? bare?.[1] ?? null;
  if (token == null) return null;
  const raw = token.toLowerCase();
  const n = /^\d+$/.test(raw) ? Number(raw) : (WORD_NUMBERS[raw] ?? null);
  if (n == null || n < 1 || n > 50) return null;
  return n;
}

const TV_WORDS = /\b(?:shows?|series|tv|episodes?|seasons?|sitcoms?)\b/i;
const MOVIE_WORDS = /\b(?:movies?|films?|flicks?)\b/i;

/** A negator within a short window behind the token, stopping at clause
 *  punctuation — the same idiom the subject layer's `isNegated` uses. */
const MEDIA_NEGATOR_BEHIND = /\b(?:not|no|without|except|excluding|avoid|nothing|none|but not|anything but)\b[^,.;]{0,24}$/i;

/**
 * MEDIA HAS POLARITY — presence is not preference.
 *
 * Presence-only reading turned "movies but no TV shows" into `either`: the
 * vetoed noun counted as a positive signal. Each occurrence is now classified
 * by whether a negator governs it. With nothing stated positively, ruling one
 * medium out means the other — `mediaType` is this product's exhaustive
 * movie/tv universe — and ruling BOTH out is a contradiction the caller must
 * turn into a question, never a guess.
 */
export function parseMedia(clause: string): MediaIntent {
  let tvPos = false;
  let tvNeg = false;
  let moviePos = false;
  let movieNeg = false;
  for (const m of clause.matchAll(new RegExp(TV_WORDS.source, 'gi'))) {
    if (MEDIA_NEGATOR_BEHIND.test(clause.slice(0, m.index!))) tvNeg = true;
    else tvPos = true;
  }
  for (const m of clause.matchAll(new RegExp(MOVIE_WORDS.source, 'gi'))) {
    if (MEDIA_NEGATOR_BEHIND.test(clause.slice(0, m.index!))) movieNeg = true;
    else moviePos = true;
  }
  if (moviePos && tvPos) return 'either';
  if (moviePos) return 'movie';
  if (tvPos) return 'tv';
  if (tvNeg && movieNeg) return 'none';
  if (tvNeg) return 'movie';
  if (movieNeg) return 'tv';
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

/**
 * A sentence-initial request verb with no object: "Find Morgan Freeman movies".
 *
 * `stripRequestFrame` deliberately will NOT strip these — a bare leading verb
 * is how "Get Out" begins, and treating it as scaffolding would eat the film.
 * The guard is right; it just cannot be the whole answer. By the time this runs
 * the CLAUSE has already been classified `request`, so the sentence's role is
 * settled and the leading verb is framing by construction. `me`/`us` forms are
 * excluded because `stripRequestFrame` already owns those.
 */
const LEADING_BARE_VERB = /^\s*(?:please\s+|just\s+)*(?:find|show|give|get|list|display)\s+(?!me\b|us\b)/i;

/**
 * Blank out provider names before reading media from a clause.
 *
 * OWNERSHIP, NOT DELETION. "Apple TV+ movies" is a MOVIE request, but the media
 * vocabulary legitimately contains "tv", so the provider's own name voted for
 * television and the request came back `either`. The provider occurrence
 * belongs to the provider entity — it is still extracted into
 * `intent.providers` from the unmasked text — and only what REMAINS votes on
 * media. Replacing with spaces rather than removing keeps every other offset in
 * the clause where it was.
 */
function maskProviders(text: string): string {
  return text.replace(new RegExp(PROVIDER_WORDS.source, 'gi'), (m) => ' '.repeat(m.length));
}

/**
 * "what's on tv", "on television" — WHERE to watch, not WHICH MEDIUM.
 *
 * "Pull up five TNT movies … what's on tv that I would like" is a request for
 * MOVIES; the "tv" belongs to a broadcast-availability phrase and voted for
 * television anyway, colliding with "movies" and yielding `either`. A leading
 * bare "show" is the same story one word earlier.
 *
 * THE FALLBACK IS THE SAFETY. If masking leaves no media vocabulary at all —
 * "what's on TV tonight", where the phrase really is the only medium stated —
 * the unmasked text is used, so nothing is lost by owning it.
 */
const AVAILABILITY_TV = /\b(?:what(?:'|’)?s\s+on\s+)?on\s+(?:tv|television)\b|\bwhat(?:'|’)?s\s+on\s+(?:tv|television)\b/gi;
const LEADING_SHOW_VERB = /^\s*(?:show\s+)+(?=\w)/i;

function maskFraming(text: string): string {
  const masked = text
    .replace(LEADING_SHOW_VERB, (m) => ' '.repeat(m.length))
    .replace(AVAILABILITY_TV, (m) => ' '.repeat(m.length));
  const stillStates = /\b(?:movies?|films?|flicks?|shows?|series|tv|episodes?|seasons?|sitcoms?)\b/i.test(masked);
  return stillStates ? masked : text;
}

/**
 * The SUBSTANCE of a request clause — scaffolding removed, content intact.
 *
 * The interpreter used to read counts, media and person spans off the raw
 * clause, so "show me movies" voted for television with its verb and
 * "Find Morgan Freeman movies" lost the person to a capitalised verb. There is
 * one owner of the question "what here is framing" and this is how the semantic
 * layer consumes it instead of growing a second copy.
 */
function requestSubstance(text: string): string {
  const stripped = stripRequestFrame(text).text.replace(LEADING_BARE_VERB, '').trim();
  return stripped.length > 0 ? stripped : text;
}

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

/**
 * ── ONE OCCURRENCE, ONE ROLE ────────────────────────────────────────────────
 * Role decisions are made on the actual matched OCCURRENCE, not on strings.
 * String equality cannot tell "Stallone" the person from "stallone" the
 * subject when both come from the same three syllables of the same sentence —
 * which is exactly how one occurrence was spent twice. Coordinates are an
 * interpreter implementation detail and never reach `CanonicalIntent`.
 */
interface SpanMatch { text: string; start: number; end: number }

/** `titleSpans`, but retaining where the capture actually sat. */
function spanMatches(text: string, re: RegExp): SpanMatch[] {
  const out: SpanMatch[] = [];
  for (const m of text.matchAll(re)) {
    const raw = m[1]!;
    const rel = m[0]!.indexOf(raw);
    const span = raw.trim().replace(/[.,;:!?]+$/, '');
    if (span.length < 2) continue;
    const start = m.index! + rel;
    out.push({ text: span, start, end: start + span.length });
  }
  return out;
}

const overlaps = (a: SpanMatch, b: SpanMatch) => a.start < b.end && b.start < a.end;

/**
 * ── A REQUESTED TITLE OCCURRENCE OWNS ITS SOURCE RANGE ─────────────────────
 *
 * "Show me The Lego movie" was measured emitting person ["Lego"], and
 * "Show me The Lego Movie" / "Show me A Goofy Movie" emitting the subjects
 * ["lego"] / ["goofy"] — a title's own words spent as if the user had
 * described a theme or named a person. No list of titles can close that
 * (the catalog is unbounded), and no stop word can either (the words are
 * ordinary). The occurrence idiom the person/subject boundary already uses
 * closes it structurally: locate WHERE a work was named, and nothing else may
 * spend that range.
 *
 * The offline evidence that an article-led phrase names a work is the
 * CAPITALISED ARTICLE: "The Lego movie" mid-request wears title
 * capitalisation, while "a Stallone movie" and "a boxing movie" (lowercase
 * article) are ordinary description and keep their person/subject readings —
 * the same capitalisation evidence `titleSpans` already accepts as the only
 * offline signal that a phrase names something. A miss costs a lost lookup,
 * never a wrong claim.
 *
 * The span deliberately includes the media noun ("The Lego movie", not
 * "The Lego"): the user's own words are the lookup key, and entity resolution
 * downstream is what decides what they name.
 */
const REQUESTED_TITLE =
  /\b((?:The|A|An)\s+(?:[A-Z][\w'’-]*\s+)*[A-Z][\w'’-]*\s+(?:[Mm]ovies?|[Ff]ilms?))\b/g;

/**
 * CAPITALISATION IS EVIDENCE, NOT A VERDICT — DESCRIPTION WINS.
 *
 * "Show me A Horror Movie" fits the requested-title shape, and reading it as
 * a lookup would trade the user's horror constraint for a search for a film
 * called "A Horror Movie". The tiebreaker is not a title dictionary but the
 * DESCRIPTIVE vocabularies the product already owns: when every word between
 * the article and the media noun independently earns an executable
 * descriptive role — a genre (`GENRE_WORDS`), a tone (`TONE_WORDS`), a known
 * subject (`SUBJECT_TERMS`, the shared trope lexicon `parseTopicTerms`
 * already reads), or structural filler ("good", "new") — the phrase is a
 * capitalised description and keeps that meaning. "Lego" and "Goofy" earn no
 * descriptive role anywhere, so the genuine titles stand. Nothing here names
 * a title, and no vocabulary is duplicated — the three lexicons are the same
 * objects the rest of the pipeline consumes.
 */
const STRUCTURAL_FILLER =
  /^(?:good|great|best|new|newer|old|older|other|another|more|some|any|really|very|nice|decent|solid|different|similar|classic|little)$/i;

/* The SAME regex sources the extraction below uses, anchored for a
   single-token test — derived, never re-listed, so the vocabularies cannot
   drift apart. */
const GENRE_TOKEN = new RegExp(`^(?:${GENRE_WORDS.source.replace(/\\b/g, '')})$`, 'i');
const TONE_TOKEN = new RegExp(`^(?:${TONE_WORDS.source.replace(/\\b/g, '')})$`, 'i');

function isDescriptiveInterior(interior: string): boolean {
  const tokens = interior.toLowerCase().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return false;
  let i = 0;
  outer: while (i < tokens.length) {
    // Longest shared-lexicon phrase first, so "martial arts" and "time
    // travel" consume as one term.
    for (let len = Math.min(3, tokens.length - i); len >= 1; len--) {
      const phrase = tokens.slice(i, i + len).join(' ');
      if (SUBJECT_TERMS.includes(phrase)) {
        i += len;
        continue outer;
      }
    }
    const t = tokens[i]!;
    if (GENRE_TOKEN.test(t) || TONE_TOKEN.test(t) || STRUCTURAL_FILLER.test(t)) {
      i += 1;
      continue;
    }
    return false;
  }
  return true;
}

/** Requested-title occurrences in a clause, ranges retained. A candidate
 *  whose interior is pure description is not a title and never claims one. */
function findRequestedTitles(clause: string): SpanMatch[] {
  return spanMatches(clause, REQUESTED_TITLE).filter((m) => {
    const interior = m.text
      .replace(/^(?:The|A|An)\s+/i, '')
      .replace(/\s+(?:[Mm]ovies?|[Ff]ilms?)$/i, '');
    return !isDescriptiveInterior(interior);
  });
}

/**
 * AN ARTICLE-LED CAPITALISED PHRASE IS TITLE-SHAPED, NOT A NAME.
 * "The Lego Movie" offers `The Lego` to a person matcher that only knows
 * "capitals before a media noun". No real name begins with an article, so this
 * costs nothing and removes the whole class — structurally, with no title list.
 */
const ARTICLE_LED = /^(?:the|a|an)\s/i;

/** "a Tom Hanks courtroom movie" — a name, then descriptive modifiers, then the
 *  noun. Only the NAME is captured; the modifiers belong to the subject. */
const PERSON_WITH_MODIFIER =
  /\b((?:[A-Z][\w'’-]*)(?:\s+[A-Z][\w'’-]*){1,3})\s+(?:[a-z][\w-]{2,}\s+){1,2}(?:movies?|films?|flicks?)\b/g;

/**
 * A LONE CAPITALISED WORD IN THE SAME POSITION — "a Stallone movie".
 *
 * The patterns above require two or more capitalised tokens, so a surname on
 * its own was not a person at all and fell through to `subjectSpans`, which
 * takes whatever qualifies the media noun. That is the live production failure
 * in miniature: "stallone" left as a strict SUBJECT, and no film is about an
 * actor, so the request returned zero titles.
 *
 * A surname is weaker evidence than a full name, and it is deliberately NOT
 * resolved here — this layer emits the span and the identity contract is
 * settled downstream against the real people catalog, which may answer with a
 * person or with a clarification. What matters is that it leaves as a PERSON
 * and can no longer be mistaken for a theme.
 *
 * Genre, tone and structural words are excluded by the caller, so a user who
 * capitalises "a Horror movie" still gets a genre.
 */
const MONONYM_BEFORE_MEDIA =
  /\b([A-Z][\w'’-]{2,})(?:'s)?\s+(?:[a-z][\w-]{2,}\s+){0,2}(?:movies?|films?|flicks?)\b/g;

/** Words that are never a person, however they are capitalised. */
const NEVER_A_PERSON =
  /^(?:horror|comedy|comedies|drama|thriller|mystery|romance|documentary|documentaries|animation|animated|western|war|crime|fantasy|sci-?fi|musical|biography|history|sport|family|adventure|action|supernatural|funny|dark|scary|good|great|best|new|old|other|another|more|some|any|the|classic|foreign|indie|short|long|recent|popular)$/i;

/** Every token of this phrase belongs to the shared ORIGIN vocabulary —
 *  "Korean", "French Canadian". Origin language names a place a film comes
 *  from, never a person, however it is capitalised. The check consumes the
 *  same detector the execution layer uses, so the vocabularies cannot drift. */
function isOriginPhrase(text: string): boolean {
  const tokens = text.split(/\s+/).filter(Boolean);
  return tokens.length > 0 && tokens.every((w) => detectOrigin(w).countries.length > 0);
}

/** Every person occurrence in one clause, computed once, ranges retained.
 *  A requested-title occurrence owns its range first: any person candidate
 *  overlapping one is the title's own words reaching a matcher, not a name. */
function findPersonMatches(clause: string): SpanMatch[] {
  const titleRanges = findRequestedTitles(clause);
  const freeOfTitles = (m: SpanMatch) => !titleRanges.some((t) => overlaps(t, m));

  const named = [
    ...spanMatches(clause, AFTER_PERSON_CUE),
    ...spanMatches(clause, PERSON_BEFORE_MEDIA),
    ...spanMatches(clause, PERSON_WITH_MODIFIER),
  ].filter((m) => !ARTICLE_LED.test(m.text) && freeOfTitles(m) && !isOriginPhrase(m.text));

  /* Runs last and only where a fuller name did not already claim the ground, so
     "Stallone" inside "Sylvester Stallone" is the same person rather than a
     second one. Ranges make that check exact instead of a substring guess. */
  const mononyms = spanMatches(clause, MONONYM_BEFORE_MEDIA).filter(
    (m) =>
      !NEVER_A_PERSON.test(m.text) &&
      !ARTICLE_LED.test(m.text) &&
      freeOfTitles(m) &&
      !isOriginPhrase(m.text) &&
      !named.some((n) => m.start >= n.start && m.end <= n.end),
  );

  return [...named, ...mononyms];
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
    origin: { countries: [], languages: [], englishDubOnly: false, englishAudioOnly: false },
    background: [],
    requestClause: req?.text ?? '',
  };

  intent.background = clauses
    .filter((c) => c.role === 'background')
    .map((c) => ({ text: c.text, reason: 'no-request-signal' as const }));

  // Clauses that may contribute EXECUTABLE constraints.
  const executableClauses = clauses.filter((c) => c.role === 'request' || c.role === 'constraint');

  if (req) {
    /* A request that NAMES the answer is a LOOKUP, not a recommendation.
       "Show me The Lego movie" asks for that film — executing it as a search
       for the theme "lego" (or the person "Lego") is the measured live
       failure. The requested occurrence is recorded with its own relation so
       downstream entity resolution can put THAT title on trial. */
    /* THE FRAME IS CONSUMED ONCE, HERE, and every extractor below reads what
       it leaves behind. `frame.count` is the count the lexical owner already
       found — reusing it is what fixes "give me 4 sci-fi movies", where
       `parseCount`'s own number→noun bridge is `(?:\w+\s+){0,3}?` and `\w`
       cannot cross the hyphen in "sci-fi". A second regex here would be a
       second owner; asking the first one is the repair. */
    const frame = stripRequestFrame(req.text);
    const substance = requestSubstance(req.text);

    const requestedTitles = findRequestedTitles(substance);
    for (const t of requestedTitles) {
      pushUnique<TitleReference>(intent.titles, { span: t.text, relation: 'requested' });
    }
    intent.kind = requestedTitles.length > 0 ? 'lookup' : 'recommendation';
    intent.requestedCount = frame.count ?? parseCount(substance);
    intent.media = parseMedia(maskFraming(maskProviders(substance)));
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
    /* A REQUEST VERB IS NOT PART OF A NAME. Person spans lean on
       capitalisation, so a capitalised verb at the head of the sentence joined
       the evidence and "Find Morgan Freeman movies" returned NO person at all.
       Only request clauses are peeled — a background clause keeps its text, so
       a title that happens to open with a verb is untouched. */
    const personText = c.role === 'request' ? requestSubstance(c.text) : c.text;
    for (const m of findPersonMatches(personText)) {
      pushUnique<PersonReference>(intent.people, {
        span: m.text,
        relation: isNegated(m.text.toLowerCase()) ? 'excluded' : 'required',
        role: roleFor(personText, m.text),
      });
    }

    if (/\b(?:already (?:seen|watched)|haven'?t (?:seen|watched)|i have not seen|not seen)\b/i.test(c.text)) {
      intent.excludeSeen = true;
    }
    // "another boxing movie" asks for one that is NOT the one just named.
    if (/\banother\b/i.test(c.text)) intent.excludeSeen = true;
  }

  /*
   * ORIGIN AND AUDIO — read from the EXECUTABLE CLAUSES ONLY, through the
   * same shared detectors the legacy augmentation used on the whole
   * utterance. Clause scoping is the entire fix: "I watched a French movie
   * yesterday" is a taste clause and contributes nothing, while "a French
   * thriller" is the request and does. The runtime ceiling detector also
   * runs here (min-wins), because it knows wordings the local parser does
   * not, and losing "no more than two hours" would be a behavior regression.
   */
  const executableText = executableClauses.map((c) => c.text).join('. ');
  if (executableText) {
    const origin = detectOrigin(executableText);
    const audio = detectAudio(executableText);
    intent.origin.countries = origin.countries;
    intent.origin.languages = origin.languages;
    intent.origin.englishDubOnly = audio.englishDubRequired;
    intent.origin.englishAudioOnly = audio.englishAudioRequired && !audio.englishDubRequired;
    const ceiling = detectRuntimeMaxMinutes(executableText);
    if (ceiling != null && (intent.runtime.maxMinutes == null || ceiling < intent.runtime.maxMinutes)) {
      intent.runtime.maxMinutes = ceiling;
    }
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
    // THE OVERLAP RULE. A subject candidate whose source range sits inside
    // language already spent on a person is not a subject — it is the person's
    // own name reaching the extractor a second time. Range-based, so `boxing`
    // in "Sylvester Stallone boxing movie" survives while `stallone` does not,
    // which neither string comparison nor "drop subjects when a person exists"
    // can achieve.
    const personRanges = findPersonMatches(req.text);
    // A requested-title occurrence owns its range the same way a person does:
    // "The Lego Movie" may not donate `lego` to the subject field.
    const titleRanges = findRequestedTitles(req.text);
    for (const sm of findSubjectMatches(req.text)) {
      if (personRanges.some((p) => overlaps(p, sm))) continue;
      if (titleRanges.some((t) => overlaps(t, sm))) continue;
      const span = sm.text;
      const known =
        intent.genres.some((g) => g.span === span) ||
        intent.tones.some((t) => t.term === span) ||
        intent.providers.includes(span) ||
        isOriginPhrase(span);
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
function findSubjectMatches(clause: string): SpanMatch[] {
  const out: SpanMatch[] = [];
  const re =
    /\b([a-z][\w-]{2,})\s+(?:movies?|films?|shows?|series|documentar(?:y|ies)|flicks?)\b/gi;
  const STRUCTURAL =
    /^(?:good|great|best|new|newer|old|older|other|another|more|some|any|the|a|an|three|two|four|five|six|seven|eight|nine|ten|one|few|couple|nice|decent|solid|different|similar|watch|see|want|like|find|show|give)$/i;
  for (const m of clause.matchAll(re)) {
    const w = m[1]!.toLowerCase();
    if (STRUCTURAL.test(w)) continue;
    const start = m.index! + m[0]!.indexOf(m[1]!);
    out.push({ text: w, start, end: start + m[1]!.length });
  }
  return out;
}

/** Plural or singular, mapped to the unit the type names. */
const LOOKBACK_UNITS: Record<string, LookbackUnit> = {
  year: 'year', years: 'year',
  decade: 'decade', decades: 'decade',
  month: 'month', months: 'month',
  week: 'week', weeks: 'week',
  day: 'day', days: 'day',
};

/** "the last 5 years", "past three decades". */
const LOOKBACK_N =
  /\b(?:the\s+)?(?:last|past|previous)\s+(\d{1,3}|one|two|three|four|five|six|seven|eight|nine|ten|few|couple\s+of)\s+(years?|decades?|months?|weeks?|days?)\b/i;

/** "the past decade", "the last year" — one, implied. */
const LOOKBACK_BARE = /\b(?:the\s+)?(?:last|past|previous)\s+(year|decade|month|week|day)\b/i;

/** "recent", "lately" — vague, but a real and very common request. */
const RECENCY = /\brecent(?:ly)?\b|\blately\b/i;

/**
 * WHAT "RECENT" MEANS, stated once and on purpose.
 *
 * The word carries no number, so the product has to choose one; choosing it
 * here — named, in the semantic layer — is what stops each downstream surface
 * from inventing a different answer to the same word.
 */
const RECENT_YEARS = 5;

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

  /* RELATIVE WINDOWS ARE RECORDED, NOT RESOLVED. "movies from the last 5 years"
     produced an EMPTY DateConstraint before this: understood by any reader,
     unrepresentable by the type. The amount and unit are captured; turning them
     into a year is `canonicalExecution`'s job, because doing it here would put
     a clock inside a pure function and make one sentence mean different things
     on different days. An explicit year already found wins — it is the more
     specific statement. */
  if (intent.date.minYear != null || intent.date.lookback != null) return;
  const n = clause.match(LOOKBACK_N);
  if (n) {
    const raw = n[1]!.toLowerCase().replace(/\s+/g, ' ');
    const amount = /^\d+$/.test(raw) ? Number(raw) : (raw === 'few' ? 3 : raw === 'couple of' ? 2 : WORD_NUMBERS[raw] ?? null);
    const unit = LOOKBACK_UNITS[n[2]!.toLowerCase()];
    if (amount != null && amount > 0 && unit) {
      intent.date.lookback = { amount, unit, direction: 'past' };
      return;
    }
  }
  const bare = clause.match(LOOKBACK_BARE);
  if (bare) {
    const unit = LOOKBACK_UNITS[bare[1]!.toLowerCase()];
    if (unit) {
      intent.date.lookback = { amount: 1, unit, direction: 'past' };
      return;
    }
  }
  if (RECENCY.test(clause)) {
    intent.date.lookback = { amount: RECENT_YEARS, unit: 'year', direction: 'past' };
  }
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
