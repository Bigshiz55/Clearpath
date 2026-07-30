/**
 * DETERMINISTIC INTENT PARSER (pure, no I/O).
 *
 * This is the FALLBACK, and it is deliberately the default: the engine must
 * produce a useful result with no LLM available at all. An LLM may later refine
 * the same structure, but it can only ever emit values from the closed
 * vocabularies in `intent.ts`, and its output is validated before use.
 *
 * The hard part of a request like
 *   "a dark thriller, but nothing depressing, slow, dubbed, or overly violent"
 * is not spotting the words — it is working out that "nothing" scopes over all
 * four items in the list, and that "dubbed" is a HARD audio constraint while
 * "depressing" is a soft negative. Scope handling is what this file is for.
 */

import {
  emptyRequest, parsedRequestSchema, type ParsedRequest,
  type Genre, type Mood, type NarrativeTrait, type CharacterTrait, type ContentTrait,
} from './intent';

// ---------------------------------------------------------------- lexicon ---

type Lex<T> = { phrases: string[]; value: T; weight: number };

const GENRE_LEX: Lex<Genre>[] = [
  { phrases: ['science fiction', 'sci-fi', 'scifi', 'sci fi'], value: 'science_fiction', weight: 0.85 },
  { phrases: ['thriller', 'thrillers'], value: 'thriller', weight: 0.85 },
  { phrases: ['mystery', 'mysteries', 'whodunit'], value: 'mystery', weight: 0.85 },
  { phrases: ['comedy', 'comedies', 'funny', 'hilarious'], value: 'comedy', weight: 0.8 },
  { phrases: ['horror', 'scary movie'], value: 'horror', weight: 0.85 },
  { phrases: ['documentary', 'documentaries', 'doc'], value: 'documentary', weight: 0.85 },
  { phrases: ['romance', 'romantic', 'rom-com', 'romcom'], value: 'romance', weight: 0.8 },
  { phrases: ['crime', 'heist', 'gangster'], value: 'crime', weight: 0.8 },
  { phrases: ['drama', 'dramas'], value: 'drama', weight: 0.7 },
  { phrases: ['action'], value: 'action', weight: 0.8 },
  { phrases: ['fantasy'], value: 'fantasy', weight: 0.8 },
  { phrases: ['animation', 'animated', 'anime'], value: 'animation', weight: 0.8 },
  { phrases: ['western'], value: 'western', weight: 0.85 },
  { phrases: ['war movie', 'war film'], value: 'war', weight: 0.85 },
  { phrases: ['historical', 'period piece'], value: 'history', weight: 0.75 },
  { phrases: ['family movie', 'family film'], value: 'family', weight: 0.8 },
  { phrases: ['adventure'], value: 'adventure', weight: 0.75 },
];

const MOOD_LEX: Lex<Mood>[] = [
  { phrases: ['gritty', 'grimy', 'raw'], value: 'gritty', weight: 0.8 },
  { phrases: ['atmospheric', 'moody', 'immersive'], value: 'atmospheric', weight: 0.9 },
  { phrases: ['dark', 'darker'], value: 'bleak', weight: 0.7 },
  { phrases: ['comforting', 'cozy', 'cosy', 'easy watch', 'feel good', 'feel-good'], value: 'comforting', weight: 0.85 },
  { phrases: ['uplifting', 'hopeful'], value: 'uplifting', weight: 0.8 },
  { phrases: ['tense', 'nail-biting', 'edge of your seat'], value: 'tense', weight: 0.8 },
  { phrases: ['cerebral', 'thought-provoking', 'thoughtful', 'smart'], value: 'cerebral', weight: 0.8 },
  { phrases: ['visually impressive', 'beautiful', 'gorgeous', 'stunning', 'cinematic'], value: 'visually_impressive', weight: 0.8 },
  { phrases: ['unusual', 'weird', 'strange', 'offbeat', 'different', 'unconventional'], value: 'unusual', weight: 0.8 },
  { phrases: ['nostalgic', 'classic feel'], value: 'nostalgic', weight: 0.7 },
  { phrases: ['melancholy', 'bittersweet'], value: 'melancholy', weight: 0.7 },
  { phrases: ['romantic'], value: 'romantic', weight: 0.75 },
];

const NARRATIVE_LEX: Lex<NarrativeTrait>[] = [
  { phrases: ['dialogue', 'talky', 'conversation', 'dialogue-driven', 'dialogue heavy'], value: 'dialogue_forward', weight: 0.75 },
  { phrases: ['fast paced', 'fast-paced', 'faster', 'quick', 'propulsive'], value: 'fast_paced', weight: 0.8 },
  // Bare "slow" matters: negated lists say "nothing depressing, slow, …",
  // never "nothing slow-burn".
  { phrases: ['slow burn', 'slow-burn', 'slow', 'slow paced', 'slow-paced', 'plodding', 'draggy'], value: 'slow_burn', weight: 0.8 },
  { phrases: ['character driven', 'character-driven', 'character study'], value: 'character_driven', weight: 0.8 },
  { phrases: ['plot driven', 'plot-driven', 'twisty plot'], value: 'plot_driven', weight: 0.75 },
  { phrases: ['satisfying ending', 'good ending', 'strong ending', 'satisfying conclusion'], value: 'satisfying_ending', weight: 0.9 },
  { phrases: ['twist ending', 'twist'], value: 'twist_ending', weight: 0.8 },
  { phrases: ['ambiguous ending', 'open ending'], value: 'ambiguous_ending', weight: 0.8 },
  { phrases: ['survival'], value: 'survival', weight: 0.8 },
  { phrases: ['coming of age', 'coming-of-age'], value: 'coming_of_age', weight: 0.85 },
  { phrases: ['ensemble'], value: 'ensemble', weight: 0.75 },
  { phrases: ['antihero', 'anti-hero'], value: 'antihero', weight: 0.8 },
  { phrases: ['predictable', 'formulaic'], value: 'predictable', weight: 0.7 },
];

const CHARACTER_LEX: Lex<CharacterTrait>[] = [
  { phrases: ['strong female lead', 'female lead', 'female protagonist', 'woman lead', 'led by a woman'], value: 'strong_female_lead', weight: 0.9 },
  { phrases: ['family centered', 'about a family'], value: 'family_centered', weight: 0.8 },
  { phrases: ['relationship', 'couple at the centre', 'couple at the center'], value: 'relationship_centered', weight: 0.7 },
  { phrases: ['workplace', 'office'], value: 'workplace_centered', weight: 0.75 },
];

/** Content traits, used for exclusions and negative preferences. */
const CONTENT_LEX: Lex<ContentTrait>[] = [
  { phrases: ['gore', 'gory', 'gruesome', 'graphic'], value: 'graphic_gore', weight: 0.9 },
  { phrases: ['violent', 'violence', 'brutal'], value: 'graphic_violence', weight: 0.85 },
  { phrases: ['sex', 'sexual content', 'sex scenes'], value: 'sexual_content', weight: 0.9 },
  { phrases: ['nudity', 'nude'], value: 'nudity', weight: 0.9 },
  { phrases: ['swearing', 'strong language', 'profanity'], value: 'strong_language', weight: 0.8 },
  { phrases: ['horror', 'scary'], value: 'horror', weight: 0.85 },
  { phrases: ['jump scares', 'jump-scares'], value: 'jump_scares', weight: 0.85 },
  { phrases: ['animal harm', 'animal death', 'dog dies'], value: 'animal_harm', weight: 0.95 },
  { phrases: ['child endangerment', 'kids in danger'], value: 'child_endangerment', weight: 0.95 },
  { phrases: ['suicide', 'self harm', 'self-harm'], value: 'suicide_self_harm', weight: 0.95 },
  { phrases: ['sexual violence', 'rape', 'assault'], value: 'sexual_violence', weight: 1 },
  { phrases: ['drugs', 'drug use'], value: 'drug_use', weight: 0.8 },
  { phrases: ['depressing', 'bleak', 'sad', 'miserable', 'downer'], value: 'depressing', weight: 0.85 },
  { phrases: ['childish', 'kiddie', 'juvenile', 'for kids'], value: 'childish', weight: 0.85 },
  { phrases: ['superhero', 'super hero', 'comic book movie', 'marvel', 'dc'], value: 'superhero', weight: 0.9 },
];

/** Streaming services we recognise. Free text is never sent to the database. */
const SERVICE_LEX: { phrases: string[]; value: string }[] = [
  { phrases: ['netflix'], value: 'netflix' },
  { phrases: ['hulu'], value: 'hulu' },
  { phrases: ['disney+', 'disney plus', 'disney'], value: 'disney_plus' },
  { phrases: ['prime video', 'amazon prime', 'prime'], value: 'prime_video' },
  { phrases: ['max', 'hbo max', 'hbo'], value: 'max' },
  { phrases: ['apple tv+', 'apple tv', 'appletv'], value: 'apple_tv_plus' },
  { phrases: ['peacock'], value: 'peacock' },
  { phrases: ['paramount+', 'paramount plus'], value: 'paramount_plus' },
];

// ------------------------------------------------------ negation scoping ----

/**
 * Words that open a negative scope. The scope runs to the next hard boundary
 * (a clause separator that is not a list comma/or), which is what makes
 * "nothing depressing, slow, dubbed, or overly violent" negate all four.
 */
const NEGATORS = [
  'not another', 'nothing too', 'nothing', 'no more', 'without', 'avoid',
  'not too', 'not so', 'not', 'less ', 'minimal ', 'none of', 'never',
  'excluding', 'except', 'but no', 'no ',
];

/** Openers that RESET to positive after a negative scope. */
const POSITIVE_RESET = [' but with ', ' with ', ' and with ', ' plus '];

/**
 * Cues that END a negative scope. Without these, "not childish, under two
 * hours, and available on Netflix" negates the runtime and the service too —
 * the list comma reads as continuation, but these clauses are not more items
 * in the negated list, they are separate constraints.
 */
const SCOPE_END = /(?:,|\band\b)\s*(?=(?:available|streaming|on\s+(?:netflix|hulu|disney|prime|max|hbo|apple|peacock|paramount)|under\s|over\s|less than \d|more than \d|at least|no more than|shorter than|longer than|that (?:we|i|neither)|neither|nothing we))/i;

interface Scope { text: string; negated: boolean }

/**
 * Split the request into scopes carrying polarity. Commas and "or" continue a
 * scope (list continuation); "but"/";"/"." end it unless "but" introduces an
 * explicit negation of its own.
 */
export function scopes(input: string): Scope[] {
  const text = ` ${input.toLowerCase().replace(/\s+/g, ' ').trim()} `;
  const parts: Scope[] = [];
  // Break on clause boundaries, keeping the delimiter's meaning.
  const chunks = text.split(/(?:\.|;|\bbut\b|\bthough\b|\bhowever\b)/g).filter((c) => c.trim());
  for (const chunk of chunks) {
    let negated = false;
    let body = chunk;
    for (const neg of NEGATORS) {
      const at = body.indexOf(neg);
      if (at !== -1) {
        // Everything before the negator keeps positive polarity.
        const before = body.slice(0, at).trim();
        if (before) parts.push({ text: before, negated: false });
        body = body.slice(at + neg.length);
        negated = true;
        break;
      }
    }
    // A positive re-opener inside a negated scope flips polarity back.
    if (negated) {
      for (const reset of POSITIVE_RESET) {
        const at = body.indexOf(reset);
        if (at !== -1) {
          parts.push({ text: body.slice(0, at), negated: true });
          parts.push({ text: body.slice(at + reset.length), negated: false });
          body = '';
          break;
        }
      }
    }
    if (body.trim()) {
      if (negated) {
        // Split the negative scope at the first non-list cue; everything after
        // it is a separate, positively-stated constraint.
        const cut = body.search(SCOPE_END);
        if (cut > 0) {
          parts.push({ text: body.slice(0, cut).trim(), negated: true });
          const rest = body.slice(cut).replace(/^[,\s]*(?:and\b)?/i, '').trim();
          if (rest) parts.push({ text: rest, negated: false });
          continue;
        }
      }
      parts.push({ text: body.trim(), negated });
    }
  }
  return parts.length > 0 ? parts : [{ text: text.trim(), negated: false }];
}

/** Hyphens and slashes read as spaces, so "science-fiction" matches "science fiction". */
const norm = (s: string) => s.toLowerCase().replace(/[-/_]+/g, ' ').replace(/\s+/g, ' ');
const hit = (text: string, phrase: string) =>
  new RegExp(`(^|[^a-z])${escapeRe(norm(phrase))}([^a-z]|$)`, 'i').test(norm(text));
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// ------------------------------------------------------------- runtime ------

/** "under two hours", "less than 90 minutes", "90 min or less". */
export function parseRuntime(text: string): { max: number | null; min: number | null } {
  const t = text.toLowerCase();
  const words: Record<string, number> = { one: 1, two: 2, three: 3, half: 0.5 };
  let max: number | null = null;
  let min: number | null = null;

  const hourWord = t.match(/(?:under|below|less than|at most|no more than|shorter than)\s+(one|two|three)\s+hours?/);
  if (hourWord) max = (words[hourWord[1]!] ?? 2) * 60;
  const hourNum = t.match(/(?:under|below|less than|at most|no more than|shorter than)\s+(\d+(?:\.\d+)?)\s*(?:hours?|hrs?)/);
  if (hourNum) max = Math.round(parseFloat(hourNum[1]!) * 60);
  const minNum = t.match(/(?:under|below|less than|at most|no more than|shorter than)\s+(\d+)\s*(?:minutes?|mins?)/);
  if (minNum) max = parseInt(minNum[1]!, 10);
  const trailing = t.match(/(\d+)\s*(?:minutes?|mins?)\s*(?:or less|or under|max|maximum)/);
  if (trailing) max = parseInt(trailing[1]!, 10);

  const overNum = t.match(/(?:over|more than|at least|longer than)\s+(\d+)\s*(?:minutes?|mins?)/);
  if (overNum) min = parseInt(overNum[1]!, 10);
  const overHour = t.match(/(?:over|more than|at least|longer than)\s+(one|two|three)\s+hours?/);
  if (overHour) min = (words[overHour[1]!] ?? 2) * 60;

  return { max, min };
}

/** Reference titles: "like Alien", "similar to Heat", "in the vein of Fargo". */
export function referenceTitles(input: string): { title: string; relationship: ParsedRequest['soft_preferences']['reference_titles'][number]['relationship'] }[] {
  const out: { title: string; relationship: ParsedRequest['soft_preferences']['reference_titles'][number]['relationship'] }[] = [];
  const re = /(?:something\s+)?(?:like|similar to|in the vein of|reminds me of|along the lines of)\s+([A-Z][\w''.:-]*(?:\s+[A-Z0-9][\w''.:-]*){0,4})/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(input)) !== null) {
    const title = m[1]!.replace(/[,.]$/, '').trim();
    if (!title || title.length < 2) continue;
    const after = input.slice(m.index + m[0].length).toLowerCase();
    let relationship: (typeof out)[number]['relationship'] = 'similar';
    if (/less\s+(gore|gory|graphic|violent|violence)/.test(after)) relationship = 'similar_but_less_graphic';
    else if (/more\s+dialogue|talkier|more\s+talking/.test(after)) relationship = 'similar_but_more_dialogue';
    else if (/lighter|less\s+dark|funnier/.test(after)) relationship = 'similar_but_lighter';
    else if (/faster|quicker|more\s+action/.test(after)) relationship = 'similar_but_faster';
    out.push({ title, relationship });
  }
  return out;
}

// -------------------------------------------------------------- parser ------

export interface ParseContext {
  region?: string;
  /** Services the room has selected in the UI. Always hard. */
  selectedServices?: string[];
  /** Tonight's controls, already structured. */
  maxRuntimeMinutes?: number | null;
  contentType?: 'movie' | 'tv' | 'any';
  excludeWatched?: boolean;
  vetoedTitleIds?: string[];
  /** Content traits excluded by ANY member — union, never averaged. */
  memberExclusions?: ContentTrait[];
}

/**
 * Parse a free-form request plus structured context into a validated request.
 * Never throws: an unparseable string yields a low-confidence empty request,
 * which the funnel treats as "broad", not as "no results".
 */
export function parseIntent(text: string, ctx: ParseContext = {}): ParsedRequest {
  const req = emptyRequest(ctx.region ?? 'US');
  const raw = (text ?? '').trim();
  const parts = scopes(raw);

  const genres = new Map<Genre, number>();
  const moods = new Map<Mood, number>();
  const narrative = new Map<NarrativeTrait, number>();
  const character = new Map<CharacterTrait, number>();
  const negatives = new Map<ContentTrait, number>();
  const excluded = new Set<ContentTrait>();

  for (const part of parts) {
    const t = ` ${part.text} `;
    const match = <T>(lex: Lex<T>[], sink: (v: T, w: number) => void) => {
      for (const entry of lex) {
        if (entry.phrases.some((p) => hit(t, p))) sink(entry.value, entry.weight);
      }
    };

    if (!part.negated) {
      match(GENRE_LEX, (v, w) => genres.set(v, Math.max(genres.get(v) ?? 0, w)));
      match(MOOD_LEX, (v, w) => moods.set(v, Math.max(moods.get(v) ?? 0, w)));
      match(NARRATIVE_LEX, (v, w) => narrative.set(v, Math.max(narrative.get(v) ?? 0, w)));
      match(CHARACTER_LEX, (v, w) => character.set(v, Math.max(character.get(v) ?? 0, w)));
    } else {
      // A negated GENRE is a strong negative preference, not a hard exclusion:
      // "not another superhero movie" should demote, not erase the category.
      match(CONTENT_LEX, (v, w) => negatives.set(v, Math.max(negatives.get(v) ?? 0, w)));
      match(NARRATIVE_LEX, (v, w) => {
        // "not too slow" ⇒ demote slow_burn by asking for its opposite.
        if (v === 'slow_burn') narrative.set('fast_paced', Math.max(narrative.get('fast_paced') ?? 0, w * 0.7));
        if (v === 'predictable') narrative.set('twist_ending', Math.max(narrative.get('twist_ending') ?? 0, w * 0.5));
      });
      match(GENRE_LEX, (v) => {
        if (v === 'horror') excluded.add('horror');
      });
      // "no dubbing" / "not dubbed" is a HARD audio constraint, not a taste.
      if (/\bdub(bed|bing)?\b/.test(t)) req.hard_filters.original_audio_only = true;
      if (/\bsubtitles?\b/.test(t)) req.hard_filters.require_no_subtitles = true;
    }

    // Availability is hard wherever it appears.
    for (const svc of SERVICE_LEX) {
      if (svc.phrases.some((p) => hit(t, p)) && !part.negated) {
        if (!req.hard_filters.allowed_streaming_services.includes(svc.value)) {
          req.hard_filters.allowed_streaming_services.push(svc.value);
        }
      }
    }
  }

  // Content type from POSITIVE scopes only — "not another superhero movie" is
  // not a request for a movie, so it must not set the type.
  const positive = parts.filter((p) => !p.negated).map((p) => p.text).join(' ');
  if (/\bmovies?\b|\bfilms?\b/.test(positive)) req.content_type = 'movie';
  if (/\b(tv )?shows?\b|\bseries\b|\bseasons?\b/.test(positive)) req.content_type = 'tv';
  if (ctx.contentType && ctx.contentType !== 'any') req.content_type = ctx.contentType;
  req.hard_filters.content_type = req.content_type;

  // Runtime: the request and the control, strictest wins.
  const rt = parseRuntime(raw);
  const caps = [rt.max, ctx.maxRuntimeMinutes ?? null].filter((n): n is number => typeof n === 'number');
  req.hard_filters.max_runtime_minutes = caps.length ? Math.min(...caps) : null;
  req.hard_filters.min_runtime_minutes = rt.min;

  // "neither of us has seen", "nothing we've watched"
  if (/\b(neither|none) of us (has|have) seen\b|\bhaven'?t seen\b|\bnot seen\b|\bnothing we'?ve (seen|watched)\b/.test(raw.toLowerCase())) {
    req.hard_filters.exclude_watched = true;
  }
  if (ctx.excludeWatched) req.hard_filters.exclude_watched = true;

  // "not so obscure that it feels low-budget" — a floor on production scale,
  // expressed as a soft preference rather than a hard cut.
  if (/\bobscure\b|\blow[- ]budget\b|\bcheap\b/.test(raw.toLowerCase())) {
    moods.set('mainstream', Math.max(moods.get('mainstream') ?? 0, 0.45));
  }

  for (const s of ctx.selectedServices ?? []) {
    if (!req.hard_filters.allowed_streaming_services.includes(s)) req.hard_filters.allowed_streaming_services.push(s);
  }
  for (const e of ctx.memberExclusions ?? []) excluded.add(e);
  req.hard_filters.excluded_content_traits = [...excluded];
  req.hard_filters.vetoed_title_ids = ctx.vetoedTitleIds ?? [];

  req.soft_preferences.genres = [...genres].map(([value, weight]) => ({ value, weight }));
  req.soft_preferences.moods = [...moods].map(([value, weight]) => ({ value, weight }));
  req.soft_preferences.narrative_traits = [...narrative].map(([value, weight]) => ({ value, weight }));
  req.soft_preferences.character_traits = [...character].map(([value, weight]) => ({ value, weight }));
  req.negative_preferences = [...negatives].map(([value, weight]) => ({ value, weight }));
  req.soft_preferences.reference_titles = referenceTitles(raw).map((r) => ({
    title: r.title, relationship: r.relationship, weight: 0.95, resolved_title_id: null,
  }));

  req.parser_confidence = confidence(raw, req);
  req.ambiguities = ambiguitiesFor(raw, req);
  // Re-validate our own output: the parser is held to the same contract.
  return parsedRequestSchema.parse(req);
}

/** Confidence reflects how much of the request we actually accounted for. */
function confidence(raw: string, req: ParsedRequest): number {
  if (!raw.trim()) return 0;
  const signals =
    req.soft_preferences.genres.length + req.soft_preferences.moods.length +
    req.soft_preferences.narrative_traits.length + req.soft_preferences.character_traits.length +
    req.soft_preferences.reference_titles.length + req.negative_preferences.length +
    (req.hard_filters.max_runtime_minutes ? 1 : 0) +
    (req.hard_filters.allowed_streaming_services.length ? 1 : 0);
  const words = raw.trim().split(/\s+/).length;
  // Many words but few extracted signals means we probably missed something.
  const density = signals / Math.max(1, words / 4);
  return Math.max(0, Math.min(1, 0.35 + 0.5 * Math.min(1, density)));
}

/** Say what is uncertain instead of guessing silently. */
function ambiguitiesFor(raw: string, req: ParsedRequest): ParsedRequest['ambiguities'] {
  const out: ParsedRequest['ambiguities'] = [];
  const t = raw.toLowerCase();
  if (/\bboth\b|\bwife\b|\bhusband\b|\bpartner\b|\bwe\b/.test(t) && req.soft_preferences.genres.length === 0) {
    out.push({ field: 'soft_preferences.genres', question: 'What kind of thing are you both in the mood for?', options: ['comedy', 'thriller', 'drama', 'documentary'] });
  }
  if (req.soft_preferences.reference_titles.length > 0 && !req.soft_preferences.reference_titles[0]!.resolved_title_id) {
    out.push({ field: 'soft_preferences.reference_titles', question: `Which "${req.soft_preferences.reference_titles[0]!.title}" do you mean?`, options: [] });
  }
  if (/\bdark\b/.test(t) && req.negative_preferences.some((n) => n.value === 'depressing')) {
    out.push({ field: 'soft_preferences.moods', question: 'Dark in tone, but not bleak — is a downbeat ending acceptable?', options: ['yes', 'no'] });
  }
  return out;
}
