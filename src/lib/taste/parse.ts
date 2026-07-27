/**
 * TRANSCRIPT → CLAIMS.
 *
 * The interview asks open questions, so the answers are sentences, not radio
 * buttons. This module turns a sentence into the claims it actually contains,
 * and — critically — does not flatten the structure on the way:
 *
 *   "I hate science fiction, but I loved Severance"
 *     → a durable dislike of sci-fi
 *     → a positive reaction to Severance
 *     → the two linked, because the user said "but" themselves
 *
 *   "I dislike foreign-language titles unless they have English audio"
 *     → a dislike of foreign-language titles, SUSPENDED when English audio exists
 *
 *   "I tolerate violence when the investigation is strong"
 *     → a mild aversion to violence, SUSPENDED when there is a real investigation
 *       (tolerating is not liking — this must never make us seek out violence)
 *
 * Deliberately rule-based rather than model-based: it must be deterministic,
 * offline-testable, and explainable line by line. Every claim carries the
 * verbatim span it came from, so the review screen can show the user their own
 * words next to what we concluded. When a sentence is beyond these rules we
 * emit nothing and let the review screen ask — we never guess a preference.
 */
import type { Claim, Condition, ConditionMode, Durability, Reaction, TitleRef } from './types';
import { findAttributes } from './lexicon';
import { findAspect } from './reasons';

/** How clauses relate to the one before them. */
type Connective = 'contrast' | 'suspend' | 'require' | 'additive' | 'none';

interface Clause {
  text: string;
  connective: Connective;
}

const CONNECTIVES: Array<[string, Connective]> = [
  ['even though', 'contrast'],
  ['except when', 'suspend'],
  ['except if', 'suspend'],
  ['provided that', 'require'],
  ['so long as', 'require'],
  ['as long as', 'require'],
  ['that said', 'contrast'],
  ['only when', 'require'],
  ['although', 'contrast'],
  ['however', 'contrast'],
  ['only if', 'require'],
  ['unless', 'suspend'],
  ['though', 'contrast'],
  ['but', 'contrast'],
  ['and', 'additive'],
  ['also', 'additive'],
  ['plus', 'additive'],
  ['yet', 'contrast'],
  ['when', 'require'],
  ['if', 'require'],
];

/** Sentiment verbs. `permissive` = accepting, which is NOT the same as liking. */
interface Sentiment {
  polarity: -1 | 1;
  strength: number;
  permissive?: boolean;
  reaction?: Reaction;
}

/**
 * Evaluative adjectives. People rarely say "I disliked The Notebook" — they say
 * "the story was weak in The Notebook", and a parser that only knows verbs
 * hears nothing at all. These carry the verdict.
 */
const SENTIMENTS: Array<[string, Sentiment]> = [
  // Negative verdicts
  ['was weak', { polarity: -1, strength: 0.7 }],
  ['were weak', { polarity: -1, strength: 0.7 }],
  ['was terrible', { polarity: -1, strength: 0.9 }],
  ['was awful', { polarity: -1, strength: 0.9 }],
  ['was boring', { polarity: -1, strength: 0.8 }],
  ['was dull', { polarity: -1, strength: 0.75 }],
  ['was predictable', { polarity: -1, strength: 0.7 }],
  ['was confusing', { polarity: -1, strength: 0.7 }],
  ['was disappointing', { polarity: -1, strength: 0.75 }],
  ['were terrible', { polarity: -1, strength: 0.9 }],
  ['were awful', { polarity: -1, strength: 0.9 }],
  ['were weak', { polarity: -1, strength: 0.7 }],
  ['is overrated', { polarity: -1, strength: 0.75 }],
  ['was overrated', { polarity: -1, strength: 0.75 }],
  // Positive verdicts
  ['was great', { polarity: 1, strength: 0.8 }],
  ['were great', { polarity: 1, strength: 0.8 }],
  ['was brilliant', { polarity: 1, strength: 0.9 }],
  ['was amazing', { polarity: 1, strength: 0.9 }],
  ['was excellent', { polarity: 1, strength: 0.9 }],
  ['was fantastic', { polarity: 1, strength: 0.9 }],
  ['was gripping', { polarity: 1, strength: 0.85 }],
  ['were brilliant', { polarity: 1, strength: 0.9 }],
  ['were amazing', { polarity: 1, strength: 0.9 }],
  ['is underrated', { polarity: 1, strength: 0.75 }],
  // Strong negative
  ["can't stand", { polarity: -1, strength: 0.95 }],
  ['cannot stand', { polarity: -1, strength: 0.95 }],
  ['cant stand', { polarity: -1, strength: 0.95 }],
  ['refuse to watch', { polarity: -1, strength: 0.95, reaction: 'avoided' }],
  ['would never watch', { polarity: -1, strength: 0.95, reaction: 'avoided' }],
  ['never watch', { polarity: -1, strength: 0.9, reaction: 'avoided' }],
  ["won't watch", { polarity: -1, strength: 0.9, reaction: 'avoided' }],
  ['will not watch', { polarity: -1, strength: 0.9, reaction: 'avoided' }],
  ['no interest in', { polarity: -1, strength: 0.85, reaction: 'avoided' }],
  ['despise', { polarity: -1, strength: 0.95 }],
  ['loathe', { polarity: -1, strength: 0.95 }],
  ['hated', { polarity: -1, strength: 0.95, reaction: 'hated' }],
  ['hate', { polarity: -1, strength: 0.95, reaction: 'hated' }],
  // Abandonment — a real negative, and a distinct reaction
  ["couldn't finish", { polarity: -1, strength: 0.7, reaction: 'abandoned' }],
  ['could not finish', { polarity: -1, strength: 0.7, reaction: 'abandoned' }],
  ["didn't finish", { polarity: -1, strength: 0.65, reaction: 'abandoned' }],
  ['gave up on', { polarity: -1, strength: 0.7, reaction: 'abandoned' }],
  ['bailed on', { polarity: -1, strength: 0.7, reaction: 'abandoned' }],
  ['turned it off', { polarity: -1, strength: 0.7, reaction: 'abandoned' }],
  ['stopped watching', { polarity: -1, strength: 0.7, reaction: 'abandoned' }],
  ['quit watching', { polarity: -1, strength: 0.7, reaction: 'abandoned' }],
  // Negative
  ["don't like", { polarity: -1, strength: 0.75 }],
  ['do not like', { polarity: -1, strength: 0.75 }],
  ['dont like', { polarity: -1, strength: 0.75 }],
  ["didn't like", { polarity: -1, strength: 0.75 }],
  ['did not like', { polarity: -1, strength: 0.75 }],
  ["don't enjoy", { polarity: -1, strength: 0.75 }],
  ['do not enjoy', { polarity: -1, strength: 0.75 }],
  ['not a fan of', { polarity: -1, strength: 0.7 }],
  ['not into', { polarity: -1, strength: 0.7 }],
  ['not for me', { polarity: -1, strength: 0.7 }],
  ["can't get into", { polarity: -1, strength: 0.7 }],
  ['turned off by', { polarity: -1, strength: 0.75 }],
  ['put off by', { polarity: -1, strength: 0.75 }],
  ['sick of', { polarity: -1, strength: 0.7 }],
  ['tired of', { polarity: -1, strength: 0.7 }],
  ['bored by', { polarity: -1, strength: 0.7 }],
  ['dislike', { polarity: -1, strength: 0.75 }],
  ['avoid', { polarity: -1, strength: 0.75, reaction: 'avoided' }],
  // Mild negative
  ["don't love", { polarity: -1, strength: 0.45 }],
  ['not big on', { polarity: -1, strength: 0.45 }],
  ['not crazy about', { polarity: -1, strength: 0.45 }],
  ['could do without', { polarity: -1, strength: 0.5 }],
  ['not my favorite', { polarity: -1, strength: 0.4 }],
  ['not my favourite', { polarity: -1, strength: 0.4 }],
  // Permissive — accepting, not seeking. Strength stays low on purpose.
  ['can tolerate', { polarity: -1, strength: 0.3, permissive: true }],
  ['tolerate', { polarity: -1, strength: 0.3, permissive: true }],
  ["don't mind", { polarity: -1, strength: 0.2, permissive: true }],
  ['do not mind', { polarity: -1, strength: 0.2, permissive: true }],
  ['dont mind', { polarity: -1, strength: 0.2, permissive: true }],
  ['can handle', { polarity: -1, strength: 0.25, permissive: true }],
  ['can deal with', { polarity: -1, strength: 0.25, permissive: true }],
  ['put up with', { polarity: -1, strength: 0.3, permissive: true }],
  ['will sit through', { polarity: -1, strength: 0.3, permissive: true }],
  ['okay with', { polarity: -1, strength: 0.2, permissive: true }],
  ['fine with', { polarity: -1, strength: 0.2, permissive: true }],
  // Mild positive
  ['kind of like', { polarity: 1, strength: 0.45 }],
  ['sort of like', { polarity: 1, strength: 0.45 }],
  ["don't hate", { polarity: 1, strength: 0.3 }],
  ['quite like', { polarity: 1, strength: 0.6 }],
  // Positive
  // Requests. Positive, but `readModifiers` marks them temporary — asking for
  // something tonight is not the same as being that kind of person.
  ['not in the mood for', { polarity: -1, strength: 0.7 }],
  ["don't want", { polarity: -1, strength: 0.7 }],
  ['do not want', { polarity: -1, strength: 0.7 }],
  ['in the mood for', { polarity: 1, strength: 0.6 }],
  ["i'm looking for", { polarity: 1, strength: 0.6 }],
  ['looking for', { polarity: 1, strength: 0.6 }],
  ['i feel like', { polarity: 1, strength: 0.6 }],
  ['show me', { polarity: 1, strength: 0.6 }],
  ['i want', { polarity: 1, strength: 0.65 }],
  ['i need', { polarity: 1, strength: 0.65 }],
  ['always up for', { polarity: 1, strength: 0.8 }],
  ['a fan of', { polarity: 1, strength: 0.75 }],
  ['fan of', { polarity: 1, strength: 0.75 }],
  ['appreciate', { polarity: 1, strength: 0.6 }],
  ['want more', { polarity: 1, strength: 0.8 }],
  ['prefer', { polarity: 1, strength: 0.7 }],
  ['enjoyed', { polarity: 1, strength: 0.75, reaction: 'liked' }],
  ['enjoy', { polarity: 1, strength: 0.75 }],
  ["i'm into", { polarity: 1, strength: 0.75 }],
  ['im into', { polarity: 1, strength: 0.75 }],
  ['i am into', { polarity: 1, strength: 0.75 }],
  ['liked', { polarity: 1, strength: 0.75, reaction: 'liked' }],
  ['like', { polarity: 1, strength: 0.75 }],
  // Strong positive
  ["can't get enough", { polarity: 1, strength: 0.95 }],
  ['obsessed with', { polarity: 1, strength: 0.95, reaction: 'loved' }],
  ['all time favorite', { polarity: 1, strength: 0.95, reaction: 'loved' }],
  ['all-time favourite', { polarity: 1, strength: 0.95, reaction: 'loved' }],
  ['my favorite', { polarity: 1, strength: 0.9, reaction: 'loved' }],
  ['my favourite', { polarity: 1, strength: 0.9, reaction: 'loved' }],
  ['live for', { polarity: 1, strength: 0.9 }],
  ['adored', { polarity: 1, strength: 0.95, reaction: 'loved' }],
  ['adore', { polarity: 1, strength: 0.95, reaction: 'loved' }],
  ['loved', { polarity: 1, strength: 0.95, reaction: 'loved' }],
  ['love', { polarity: 1, strength: 0.95, reaction: 'loved' }],
];

/** Words that change how forcefully a claim was made. */
const INTENSIFIERS = ['really', 'absolutely', 'totally', 'genuinely', 'completely', 'utterly', 'truly', 'very', 'super', 'seriously'];
const DOWNTONERS = ['kind of', 'sort of', 'kinda', 'sorta', 'a bit', 'a little', 'slightly', 'somewhat', 'mildly'];
const OFTEN_HEDGES = ['usually', 'generally', 'normally', 'mostly', 'typically', 'for the most part', 'tend to', 'tends to', 'in general', 'as a rule'];
const RARE_HEDGES = ['sometimes', 'occasionally', 'once in a while', 'every now and then', 'now and then'];
const ABSOLUTES = ['always', 'never', 'every time', 'without fail', 'my whole life', 'ever since'];

/** Markers that say "this is about right now", not "this is about me". */
const MOOD_MARKERS = [
  'lately', 'recently', 'these days', 'right now', 'at the moment', 'currently',
  'this week', 'this month', 'tonight', 'today', 'in the mood', 'not in the mood',
  'for now', 'going through a phase', 'on a kick', 'at the minute',
];

/** Phrasing that describes tonight's request rather than a standing taste. */
const REQUEST_MARKERS = ['i want', 'i need', 'looking for', 'i feel like', 'i fancy', 'show me'];

/** Filler that must not be mistaken for a title. */
const TITLE_STOPWORDS = new Set([
  'i', "i'm", 'im', 'my', 'we', 'he', 'she', 'they', 'it', 'you', 'also', 'but', 'and', 'so',
  'then', 'now', 'yes', 'no', 'okay', 'ok', 'actually', 'honestly', 'really', 'something',
  'anything', 'nothing', 'everything', 'movies', 'movie', 'shows', 'show', 'tv', 'netflix',
  'hulu', 'max', 'disney', 'prime', 'peacock', 'paramount', 'apple', 'when', 'if', 'unless',
  'though', 'although', 'however', 'because', 'that', 'this', 'these', 'those', 'the', 'a', 'an',
  // Temporal and discourse openers, which are the commonest false positives —
  // "Tonight I want something light" must not name a show called Tonight.
  'tonight', 'today', 'tomorrow', 'yesterday', 'lately', 'recently', 'currently',
  'sometimes', 'usually', 'generally', 'normally', 'maybe', 'well', 'anyway', 'oh',
  'hmm', 'yeah', 'nope', 'sure', 'basically', 'personally', 'first', 'second', 'lastly',
]);

const JOINERS = new Set(['of', 'the', 'and', 'a', 'in', 'de', 'to', 'la', 'le', '&', 'on', 'for']);

/** A title the interview already knows about, so mentions can be resolved. */
export interface KnownTitle {
  titleId: string;
  title: string;
}

export interface ParseContext {
  source: Claim['source'];
  /** Epoch ms. Supplied — this module never reads the clock. */
  at: number;
  /** Prefix for generated claim ids, so ids are stable and collision-free. */
  idPrefix?: string;
  knownTitles?: KnownTitle[];
}

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));

function normalize(text: string): string {
  return text.toLowerCase().replace(/[‘’]/g, "'").replace(/\s+/g, ' ').trim();
}

const WORDISH = /[a-z0-9]/;

function boundedIndexOf(haystack: string, needle: string, from = 0): number {
  let at = haystack.indexOf(needle, from);
  while (at !== -1) {
    const before = at === 0 || !WORDISH.test(haystack[at - 1] ?? '');
    const afterIdx = at + needle.length;
    const after = afterIdx >= haystack.length || !WORDISH.test(haystack[afterIdx] ?? '');
    if (before && after) return at;
    at = haystack.indexOf(needle, at + 1);
  }
  return -1;
}

function contains(haystack: string, needle: string): boolean {
  return boundedIndexOf(haystack, needle) !== -1;
}

/**
 * Split one sentence into clauses, recording how each attaches to the previous
 * one. The optional comma before a connective is consumed so quotes read
 * naturally ("I hate science fiction" / "I loved Severance").
 */
export function splitClauses(sentence: string): Clause[] {
  const out: Clause[] = [];
  let rest = sentence.trim();
  let connective: Connective = 'none';

  for (;;) {
    const lower = normalize(rest);
    let bestAt = -1;
    let bestWord = '';
    let bestKind: Connective = 'none';

    for (const [word, kind] of CONNECTIVES) {
      // Never split on a connective that opens the clause — there is nothing
      // before it to attach to.
      const at = boundedIndexOf(lower, word, 1);
      if (at === -1) continue;
      if (bestAt === -1 || at < bestAt || (at === bestAt && word.length > bestWord.length)) {
        bestAt = at;
        bestWord = word;
        bestKind = kind;
      }
    }

    if (bestAt === -1) {
      const text = rest.trim().replace(/^[,;:\s]+/, '');
      if (text) out.push({ text, connective });
      break;
    }

    const head = rest.slice(0, bestAt).replace(/[,;\s]+$/, '').trim();
    if (head) out.push({ text: head, connective });
    connective = bestKind;
    rest = rest.slice(bestAt + bestWord.length).trim();
    if (!rest) break;
  }

  return out.filter((c) => c.text.length > 0);
}

/** Break free text into sentences, keeping newlines as hard boundaries. */
export function splitSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+|\n+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

interface Modifiers {
  strengthFactor: number;
  confidenceFactor: number;
  durability: Durability;
}

function readModifiers(lower: string): Modifiers {
  let strengthFactor = 1;
  let confidenceFactor = 1;
  let durability: Durability = 'unknown';

  for (const w of INTENSIFIERS) if (contains(lower, w)) { strengthFactor *= 1.15; break; }
  for (const w of DOWNTONERS) if (contains(lower, w)) { strengthFactor *= 0.65; break; }
  for (const w of OFTEN_HEDGES) if (contains(lower, w)) { strengthFactor *= 0.85; confidenceFactor *= 0.9; durability = 'durable'; break; }
  for (const w of RARE_HEDGES) if (contains(lower, w)) { strengthFactor *= 0.5; confidenceFactor *= 0.8; break; }
  for (const w of ABSOLUTES) if (contains(lower, w)) { strengthFactor *= 1.1; durability = 'durable'; break; }

  // A mood or request marker always wins: a bad week must not become a rule.
  for (const w of MOOD_MARKERS) if (contains(lower, w)) { durability = 'temporary'; break; }
  if (durability !== 'temporary') {
    for (const w of REQUEST_MARKERS) if (contains(lower, w)) { durability = 'temporary'; break; }
  }

  return { strengthFactor, confidenceFactor, durability };
}

function findSentiment(lower: string): { at: number; s: Sentiment } | null {
  let bestAt = -1;
  let bestLen = 0;
  let best: Sentiment | null = null;
  for (const [phrase, s] of SENTIMENTS) {
    const at = boundedIndexOf(lower, phrase);
    if (at === -1) continue;
    if (best === null || at < bestAt || (at === bestAt && phrase.length > bestLen)) {
      bestAt = at;
      bestLen = phrase.length;
      best = s;
    }
  }
  return best ? { at: bestAt, s: best } : null;
}

/** A clause like "not horror" — no verb, but an explicit polarity flip. */
function opensWithNegation(lower: string): boolean {
  return /^(not|no|never|nothing)\b/.test(lower);
}

function titleKey(s: string): string {
  return normalize(s).replace(/^(the|a|an)\s+/, '').replace(/[^a-z0-9 ]/g, '').trim();
}

/** Resolve a title mention: known catalog first, then quoted, then capitalized runs. */
function findTitle(clause: string, known: KnownTitle[]): TitleRef | null {
  const lower = normalize(clause);

  const sorted = [...known].sort((a, b) => b.title.length - a.title.length);
  for (const k of sorted) {
    if (boundedIndexOf(lower, normalize(k.title)) !== -1) {
      return { titleId: k.titleId, text: k.title, needsConfirmation: false };
    }
  }

  const quoted = clause.match(/["“']([^"”']{2,60})["”']/);
  if (quoted?.[1]) {
    const text = quoted[1].trim();
    const hit = known.find((k) => titleKey(k.title) === titleKey(text));
    return { titleId: hit?.titleId ?? null, text, needsConfirmation: !hit };
  }

  const words = clause
    .split(/\s+/)
    .map((raw) => raw.replace(/^[^A-Za-z0-9'“"]+|[^A-Za-z0-9'”"]+$/g, ''));
  const isCap = (w: string) => /^[A-Z]/.test(w);
  const plain = (w: string) => normalize(w).replace(/[^a-z0-9']/g, '');

  let run: string[] = [];
  let bestRun: string[] = [];
  const flush = () => {
    const trimmed = [...run];
    while (trimmed.length && JOINERS.has(plain(trimmed[trimmed.length - 1] ?? ''))) trimmed.pop();
    const meaningful = trimmed.filter((t) => !TITLE_STOPWORDS.has(plain(t)));
    if (meaningful.length > 0 && trimmed.length > bestRun.length) bestRun = trimmed;
    run = [];
  };
  for (let i = 0; i < words.length; i++) {
    const word = words[i] ?? '';
    if (!word) { flush(); continue; }
    const next = words[i + 1] ?? '';
    // "The" only belongs to a title when a capitalised word follows it —
    // "The Silence of the Lambs" keeps its article, "the pacing" does not.
    const leadingArticle = run.length === 0 && isCap(word) && JOINERS.has(plain(word)) && isCap(next);
    const capitalized = isCap(word) && (!TITLE_STOPWORDS.has(plain(word)) || leadingArticle);
    if (capitalized) run.push(word);
    else if (run.length > 0 && JOINERS.has(plain(word))) run.push(word);
    else flush();
    if (run.length >= 6) flush();
  }
  flush();

  if (bestRun.length === 0) return null;
  const text = bestRun.join(' ');
  const hit = known.find((k) => titleKey(k.title) === titleKey(text));
  return { titleId: hit?.titleId ?? null, text, needsConfirmation: !hit };
}

function reactionFor(polarity: -1 | 1, strength: number, explicit?: Reaction): Reaction {
  if (explicit) return explicit;
  if (polarity === 1) return strength >= 0.85 ? 'loved' : 'liked';
  return strength >= 0.85 ? 'hated' : 'disliked';
}

/**
 * Parse one free-text answer into claims.
 *
 * Returns `[]` rather than a guess when nothing recognisable is said — an empty
 * result is an honest "we did not understand that", which the interview turns
 * into a follow-up question instead of a fabricated preference.
 */
export function parseAnswer(text: string, ctx: ParseContext): Claim[] {
  const known = ctx.knownTitles ?? [];
  const prefix = ctx.idPrefix ?? 'c';
  const claims: Claim[] = [];
  /** Claims made with an accepting verb ("tolerate", "don't mind"). */
  const permissiveIds = new Set<string>();
  let seq = 0;
  const nextId = () => `${prefix}:${seq++}`;

  for (const sentence of splitSentences(text)) {
    const clauses = splitClauses(sentence);
    let prevPolarity: -1 | 1 | null = null;
    let prevStrength = 0.6;
    let prevIds: string[] = [];

    for (let i = 0; i < clauses.length; i++) {
      const clause = clauses[i];
      if (!clause) continue;
      const lower = normalize(clause.text);

      // Condition clauses attach to the claims that came before them; they are
      // not claims of their own.
      if (clause.connective === 'suspend' || clause.connective === 'require') {
        if (prevIds.length === 0) continue;
        const attrs = findAttributes(clause.text).map((h) => h.key);
        const targets = claims.filter((c) => prevIds.includes(c.id));
        // "when/if" on an accepting verb means the aversion lifts, not that it
        // only applies then — "I tolerate violence when the investigation is
        // strong" is permission, not a trigger.
        const mode: ConditionMode =
          clause.connective === 'suspend' || targets.some((c) => permissiveIds.has(c.id))
            ? 'suspends'
            : 'requires';
        const condition: Condition = { text: clause.text, attributes: attrs, mode };
        for (const c of targets) {
          c.scope = 'conditional';
          c.condition = condition;
        }
        continue;
      }

      const mods = readModifiers(lower);
      const found = findSentiment(lower);
      const attrs = findAttributes(clause.text);
      const aspect = findAspect(clause.text);
      const title = findTitle(clause.text, known);

      let polarity: -1 | 1;
      let strength: number;
      let confidence: number;
      let explicitReaction: Reaction | undefined;
      let permissive = false;

      if (found) {
        polarity = found.s.polarity;
        strength = found.s.strength;
        confidence = 0.85;
        explicitReaction = found.s.reaction;
        permissive = found.s.permissive === true;
      } else if (prevPolarity !== null && (clause.connective === 'additive' || clause.connective === 'contrast')) {
        // "I like crime and thrillers" / "I like horror but not gore"
        const flip = clause.connective === 'contrast' || opensWithNegation(lower);
        polarity = (flip ? -prevPolarity : prevPolarity) as -1 | 1;
        strength = prevStrength * 0.9;
        confidence = 0.6;
      } else {
        continue; // nothing stated — say nothing
      }

      if (attrs.length === 0 && !title && !aspect) continue;

      strength = clamp(strength * mods.strengthFactor, 0.05, 1);
      confidence = clamp(confidence * mods.confidenceFactor, 0.1, 0.95);

      let durability: Durability = mods.durability;
      if (durability === 'unknown' && found && attrs.length > 0) {
        // A stated taste about a category is a taste, not a mood.
        durability = 'durable';
      }

      const madeIds: string[] = [];

      for (const hit of attrs) {
        const id = nextId();
        madeIds.push(id);
        const claim: Claim = {
          id,
          attribute: hit.key,
          polarity,
          strength,
          // A claim tied to one title says less about the general rule.
          confidence: title ? clamp(confidence * 0.85, 0.1, 0.95) : confidence,
          durability,
          scope: 'general',
          source: ctx.source,
          quote: clause.text,
          at: ctx.at,
        };
        if (title) claim.title = title;
        if (permissive) permissiveIds.add(id);
        if (clause.connective === 'contrast' && prevIds.length > 0) claim.contrasts = [...prevIds];
        claims.push(claim);
      }

      // "The story was weak" — a verdict on one part of one title. It explains
      // the reaction; it is never promoted to a standing preference.
      if (aspect) {
        const id = nextId();
        madeIds.push(id);
        const claim: Claim = {
          id,
          attribute: null,
          aspect,
          polarity,
          strength,
          confidence,
          durability: 'durable',
          scope: 'general',
          source: ctx.source,
          quote: clause.text,
          at: ctx.at,
        };
        if (title) claim.title = title;
        claims.push(claim);
      }

      if (title) {
        const id = nextId();
        madeIds.push(id);
        const claim: Claim = {
          id,
          attribute: null,
          polarity,
          strength,
          confidence: title.needsConfirmation ? clamp(confidence * 0.6, 0.1, 0.95) : confidence,
          durability: durability === 'temporary' ? 'temporary' : 'durable',
          scope: 'general',
          title,
          reaction: reactionFor(polarity, strength, explicitReaction),
          source: ctx.source,
          quote: clause.text,
          at: ctx.at,
        };
        if (clause.connective === 'contrast' && prevIds.length > 0) claim.contrasts = [...prevIds];
        claims.push(claim);
      }

      prevPolarity = polarity;
      prevStrength = strength;
      if (madeIds.length > 0) prevIds = madeIds;
    }
  }

  return claims;
}


/** A fragment we heard but could not read a direction from. */
export interface Unresolved {
  /** Verbatim span. */
  quote: string;
  /** The part of the title they were talking about, if we could tell. */
  aspect?: string;
  title?: TitleRef;
}

/**
 * Fragments that mention a title or a part of one, with no indication of which
 * way the user meant it — "the performances — F1".
 *
 * These are deliberately NOT claims. Guessing a direction here is how a
 * recommender ends up confidently wrong, so the interview asks instead.
 * Attribute-only fragments are ignored: "horror movies exist" is not something
 * worth interrupting a conversation over.
 */
export function findUnresolved(text: string, ctx: ParseContext): Unresolved[] {
  const known = ctx.knownTitles ?? [];
  const out: Unresolved[] = [];
  for (const sentence of splitSentences(text)) {
    for (const clause of splitClauses(sentence)) {
      if (findSentiment(normalize(clause.text))) continue;
      const aspect = findAspect(clause.text);
      const title = findTitle(clause.text, known);
      if (!aspect && !title) continue;
      out.push({
        quote: clause.text,
        ...(aspect ? { aspect } : {}),
        ...(title ? { title } : {}),
      });
    }
  }
  return out;
}
