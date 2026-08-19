/**
 * LANGUAGE → STRUCTURED REQUEST. The front of the critic pipeline.
 *
 * ── THE DEFECT THIS CLOSES ────────────────────────────────────────────────
 * Traced on this branch, `Better than Furious or Widows Bay` reaches production
 * as follows:
 *
 *   extractReference(text)          -> null      (REF_CUE has no "better than")
 *   classifySearch(text).mode       -> exact_title
 *                       requestedTitle -> "Better than Furious or Widows Bay"
 *   applyTurn(...).referenceTitles  -> []        (regex is /like|similar to/)
 *
 * So the anchors are not flattened — they are ABSENT, and the whole sentence is
 * looked up as if it were the name of a film. When that lookup finds nothing the
 * request degrades to generic discovery with no anchors at all, which is exactly
 * how "better than two specific films" answered with Cool Hand Luke: Taste DNA
 * alone picked a drama, and nothing in the pipeline ever knew a comparison had
 * been made.
 *
 * ── WHAT THIS MODULE IS, AND IS NOT ───────────────────────────────────────
 * It identifies WHAT THE USER SAID. It does not decide which real title they
 * meant — that is GC2, deliberately, because a parser that resolves identity
 * makes popularity order into truth. So no TMDB id ever appears here, and the
 * anchors leave as the strings the user typed.
 *
 *   language -> THIS -> GC2 identity -> GC3 hydration -> GC4 plan -> GC5 hints
 *
 * ── ONE CONTRACT FOR EVERY PARSER ─────────────────────────────────────────
 * Deliberately pure regex, no LLM. The conversational path, the AI parse and
 * the deterministic fallback all call this same function, so a comparison
 * cannot survive on one route and silently degrade to a keyword union on
 * another. It also means the relation still parses with no OpenAI key.
 *
 * PURE. No I/O.
 */

import { DIMENSION_KEYS } from '@/lib/scoring/dimensions';
import { ADVERB_LED_LIKE, isVerbLike } from '@/lib/nlu/likeGrammar';
import type { CriticRelation } from './objective';
import type { Modifiers } from './plan';

export interface CriticRequest {
  relation: CriticRelation;
  /** Exactly what the user typed, in order, never resolved. */
  referenceTitles: string[];
  /** Directional shifts grounded in the canonical fingerprint vocabulary. */
  modifiers: Modifiers;
  /**
   * Comparatives we RECOGNISED as directional but could not ground in an axis
   * ("better acted", "prettier"). Kept as interpretation evidence rather than
   * being forced onto the nearest-looking axis, because inventing a mapping is
   * how a system starts ranking on something the user never said.
   */
  unresolvedModifiers: string[];
  /** The raw cue that established the relation — for attribution/read-back. */
  cue: string;
}

/** At most two anchors, matching what production already carries end to end. */
const MAX_ANCHORS = 2;

/* ── RELATION CUES ─────────────────────────────────────────────────────────
   Ordered most-specific first. A phrase, never a title: the brief forbids
   special-casing `Furious` or `Widows Bay`, and nothing here mentions a title.

   `better_than` is listed ahead of `like` because "something better than X"
   contains neither cue exclusively and the comparative is the stronger claim. */
const BLEND_CUE = /\b(?:meets|crossed with|cross between|mixed with|mashed up with)\b/i;
const BETTER_CUE =
  /\b(?:better than|(?:something|anything|a movie|a show|shows?|movies?|stuff)\s+better than|improve on|improves on|an improvement on|a step up from|beats?)\b/i;
const LIKE_CUE =
  /\b(?:in the vein of|in the style of|along the lines of|reminiscent of|reminds me of|same (?:feel|vibe|energy|tone|feeling|mood) as|similar to|(?:something|stuff|shows?|movies?|a show|a movie|more|kinda|kind of|sort of|just|a lot) like|like)\b/i;

/** Clause breaks that end an anchor span — the same discipline the shipped
 *  conversational extractor uses, kept in step with it deliberately. */
const ANCHOR_STOP =
  /[,.;!?]|\s+\b(?:but|no|not|without|under|over|only|on|from|released|filmed|after|before|newer|older|that|which|with)\b/i;

/** Preference tails people append: "…that I would like", "…for me". */
const TRAILING_FILLER =
  /\s*,?\s*\b(?:that\s+)?(?:i(?:'d|’d| would| will| might)?\s+(?:would\s+)?(?:like|enjoy|love|dig|go for)|for me|please)\b.*$/i;

/**
 * The first occurrence of the like-cue that is genuinely PREPOSITIONAL.
 *
 * The bare token "like" — and the adverb-led forms that can modify a verb
 * just as well ("just like", "kinda like") — are only similarity cues when
 * grammar says so: "I like Sylvester Stallone movies" is a stated
 * preference, and reading its object as a title anchor is how a sentence
 * that never named a film ended up in title clarification. The subject test
 * lives in one place (`likeGrammar.ts`) and is shared with the legacy
 * similarity extractor, so the verb reading cannot regress in one door and
 * stay fixed in the other. Noun-led cues ("movies like", "something like")
 * are untouched — a noun cannot be the subject of "to like" mid-phrase.
 */
function findPrepositionalLike(t: string): RegExpExecArray | null {
  const re = new RegExp(LIKE_CUE.source, 'gi');
  for (let m = re.exec(t); m !== null; m = re.exec(t)) {
    const cueText = m[0];
    const verbish = /^like$/i.test(cueText) || ADVERB_LED_LIKE.test(cueText);
    if (verbish && isVerbLike(t, m.index)) continue; // the verb "to like" — a preference, not a relation
    return m;
  }
  return null;
}

/* ── MODIFIERS ─────────────────────────────────────────────────────────────
   ONLY mappings that are semantically honest. Every target is a real member of
   `DIMENSION_KEYS`, asserted at module load below, so a renamed axis breaks the
   build instead of silently producing an instruction nothing can act on.

   Deliberately absent: "better", "cooler", "more original", "better acted".
   They are directional but they are not ABOUT an axis, and mapping them to the
   nearest-looking one would be manufacturing meaning from vague prose. They
   surface as `unresolvedModifiers`. */
const MODIFIER_MAP: ReadonlyArray<readonly [RegExp, string, 'higher' | 'lower']> = [
  [/\b(?:funnier|more funny|more comedic|more humou?r|more jokes)\b/i, 'humor', 'higher'],
  [/\b(?:less funny|less comedic|not (?:as )?funny|more serious)\b/i, 'humor', 'lower'],

  [/\b(?:darker|bleaker|grittier|more bleak|grimmer)\b/i, 'darkness', 'higher'],
  [
    /\b(?:lighter|less dark|less depressing|less bleak|less grim|less heavy|not (?:as )?depressing|more upbeat|happier)\b/i,
    'darkness',
    'lower',
  ],

  [/\b(?:faster|faster[- ]paced|more fast[- ]paced|punchier|more action[- ]packed|less slow)\b/i, 'pacing', 'higher'],
  [/\b(?:slower|slower[- ]paced|more of a slow burn|more slow[- ]burn|less frantic)\b/i, 'pacing', 'lower'],

  [/\b(?:tenser|more tense|more suspenseful|scarier|more thrilling|more gripping)\b/i, 'suspense', 'higher'],
  [/\b(?:less tense|less suspenseful|less scary|calmer)\b/i, 'suspense', 'lower'],

  [/\b(?:less sentimental|less sappy|less schmaltzy|less mushy|less cheesy|less corny)\b/i, 'emotion', 'lower'],
  [/\b(?:more emotional|more moving|more heartfelt|sadder)\b/i, 'emotion', 'higher'],

  [/\b(?:warmer|cozier|cosier|more comforting|more wholesome)\b/i, 'warmth', 'higher'],
  [/\b(?:colder|less warm|harsher|more cynical)\b/i, 'warmth', 'lower'],

  [/\b(?:smarter|more complex|more layered|more complicated|more intricate|denser)\b/i, 'complexity', 'higher'],
  [/\b(?:simpler|less complex|less complicated|easier to follow|less confusing)\b/i, 'complexity', 'lower'],

  [/\b(?:more realistic|more grounded|more believable)\b/i, 'realism', 'higher'],
  [/\b(?:less realistic|more stylized|more stylised|more fantastical)\b/i, 'realism', 'lower'],

  [/\b(?:more violent|bloodier|more brutal|gorier)\b/i, 'violence', 'higher'],
  [/\b(?:less violent|less gory|less brutal|less bloody)\b/i, 'violence', 'lower'],

  [/\b(?:more romantic|more romance)\b/i, 'romance', 'higher'],
  [/\b(?:less romantic|less romance)\b/i, 'romance', 'lower'],
];

// A mapping onto an axis the engine does not have is a silent no-op forever.
for (const [, axis] of MODIFIER_MAP) {
  if (!(DIMENSION_KEYS as readonly string[]).includes(axis)) {
    throw new Error(`critic/request: modifier maps to unknown axis "${axis}"`);
  }
}

/**
 * Comparative shapes we can SEE but not ground. Scanned after the grounded
 * table, so anything it catches is genuinely unmapped rather than merely late.
 * The optional participle keeps the phrase readable as evidence — "better
 * acted" rather than a bare "better", which on its own says nothing.
 */
const COMPARATIVE_SHAPE = /\b(?:(?:more|less)\s+[a-z]{3,}|[a-z]{4,}er)(?:\s+[a-z]+(?:ed|ing))?\b/gi;

/**
 * Words ending in -er that are not comparatives — the false-positive guard.
 *
 * `better` is deliberately NOT here. It is a real comparative, and the relation
 * cue that uses it ("better than") never reaches this scan: the modifier region
 * starts after the last anchor, which is already past the cue. Excluding it
 * would silently drop "but better acted", which is exactly the kind of
 * directional claim this list is supposed to preserve.
 */
const NOT_COMPARATIVE = new Set([
  'other', 'another', 'either', 'never', 'ever', 'over', 'under', 'after', 'together',
  'whether', 'rather', 'further', 'thriller', 'thrillers', 'murder', 'summer',
  'winter', 'silver', 'water', 'father', 'mother', 'brother', 'sister', 'daughter',
  'number', 'order', 'power', 'player', 'longer', 'later', 'super', 'their', 'there',
  'where', 'here', 'were', 'character', 'chapter', 'matter', 'quarter', 'sinister',
]);

function splitAnchors(span: string): string[] {
  const cut = span.split(ANCHOR_STOP)[0] ?? '';
  const cleaned = cut.replace(TRAILING_FILLER, '').replace(/[?!.,]+\s*$/, '').trim();
  if (!cleaned) return [];
  return cleaned
    .split(/\s+(?:or|and)\s+|\s*[/&]\s*/i)
    .map((p) => p.trim().replace(/\s+/g, ' '))
    .filter((p) => p.length >= 2 && p.split(' ').length <= 5)
    .slice(0, MAX_ANCHORS);
}

function readModifiers(region: string): { modifiers: Modifiers; unresolved: string[] } {
  const modifiers: Modifiers = {};
  let residual = region;
  for (const [re, axis, dir] of MODIFIER_MAP) {
    const m = residual.match(re);
    if (!m) continue;
    /* FIRST GROUNDED READING WINS per axis. A sentence asking for an axis to go
       both ways is contradicting itself, and picking one at random would be
       worse than honouring the one that was said first. */
    if (!(axis in modifiers)) modifiers[axis] = dir;
    residual = residual.replace(re, ' ');
  }

  const unresolved: string[] = [];
  for (const raw of residual.match(COMPARATIVE_SHAPE) ?? []) {
    const phrase = raw.trim().toLowerCase();
    const bare = phrase.replace(/^(?:more|less)\s+/, '');
    if (NOT_COMPARATIVE.has(phrase) || NOT_COMPARATIVE.has(bare)) continue;
    if (!unresolved.includes(phrase)) unresolved.push(phrase);
  }
  return { modifiers, unresolved: unresolved.slice(0, 4) };
}

/**
 * Remove the anchor titles from a sentence before it is parsed for CONSTRAINTS.
 *
 * ── WHY THIS EXISTS ───────────────────────────────────────────────────────
 * `naiveParseQuery` reads genre words out of free text, and it cannot know that
 * "Supernatural" is a title here rather than a request for fantasy. Feeding it
 * the whole comparative sentence turned an anchor's own NAME into a positive
 * genre filter:
 *
 *   "Better than Supernatural or True Detective"  ->  genreIds [14, 9648]
 *   "Better than Funny Games"                     ->  genreIds [35]
 *
 * Those ids then rode the base query onto EVERY retrieval strand — including
 * the recall floor, whose entire purpose is to be ungated. A guess derived from
 * a title was REMOVING candidates, which is the one thing GC5 promises a critic
 * inference can never do.
 *
 * Stripping the spans rather than discarding `genreIds` wholesale matters: a
 * genre the user genuinely stated ("better than X, but a comedy") is a fact of
 * the sentence and must survive. Only the names we already know to be titles
 * are removed.
 */
export function stripAnchorSpans(text: string, anchors: readonly string[]): string {
  let out = text ?? '';
  /* LONGEST FIRST, so "Blade Runner 2049" is removed as a unit rather than
     leaving "2049" behind after a shorter overlapping match. */
  for (const a of [...anchors].sort((x, y) => y.length - x.length)) {
    const name = a.trim();
    if (name.length < 2) continue;
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    out = out.replace(new RegExp(escaped, 'gi'), ' ');
  }
  return out.replace(/\s+/g, ' ').trim();
}

/**
 * Read a comparison out of a sentence, or return null when there isn't one.
 *
 * Null is the common case and it MATTERS: a request with no comparative
 * objective must continue through the existing finder untouched, with the
 * critic contributing exactly nothing.
 */
export function parseCriticRequest(text: string): CriticRequest | null {
  const t = (text ?? '').trim();
  if (t.length < 3) return null;

  let base: CriticRelation | null = null;
  let anchors: string[] = [];
  let cue = '';
  let modifierRegion = '';

  const blend = BLEND_CUE.exec(t);
  const better = BETTER_CUE.exec(t);
  const like = findPrepositionalLike(t);

  if (blend) {
    /* "X meets Y" — the anchors sit on BOTH sides of the cue, which is why this
       is checked first and never folded into the tail-only extraction below. */
    const head = t.slice(0, blend.index);
    const tail = t.slice(blend.index + blend[0].length);
    const left = splitAnchors(head).slice(-1);
    const right = splitAnchors(tail).slice(0, 1);
    anchors = [...left, ...right];
    if (anchors.length === MAX_ANCHORS) {
      base = 'blend';
      cue = blend[0];
      modifierRegion = tail.replace(right[0] ?? '', ' ');
    }
  }

  if (!base && better) {
    const tail = t.slice(better.index + better[0].length);
    anchors = splitAnchors(tail);
    if (anchors.length > 0) {
      base = 'better_than';
      cue = better[0];
      modifierRegion = tail.slice(tail.indexOf(anchors[anchors.length - 1]!) + (anchors[anchors.length - 1]!.length));
    }
  }

  /* ── AXIS COMPARATIVE: "<shift> than <anchor>" ───────────────────────────
     The most natural comparison in English, and the one cue this parser did
     not have: "darker than Taken" produced null, so `routeAsk` sent it to
     legacy discovery and BOTH the anchor and the axis were lost.

     Nothing new is invented here. `MODIFIER_MAP` already grounds the shift,
     `splitAnchors` already reads the title, and `like_but` already means "this
     title, shifted on that axis". Only the detection was missing.

     Gated on the head carrying a comparative — grounded, or at least
     comparative-SHAPED — for the same reason the bare "X but <shift>" path is:
     without one, the text after `than` is just prose and calling it an anchor
     would invent a comparison nobody made. That gate is what keeps "more than
     three movies" and "no longer than 90 minutes" out.

     Checked AFTER `better` so "better than X" keeps its stronger claim. */
  if (!base) {
    const thanAt = t.search(/\bthan\b/i);
    if (thanAt > 0) {
      const head = t.slice(0, thanAt);
      const tail = t.slice(thanAt + 4);
      const probe = readModifiers(head);
      const headIsComparative =
        Object.keys(probe.modifiers).length > 0 || probe.unresolved.length > 0;
      if (headIsComparative) {
        const found = splitAnchors(tail);
        /* A number or a duration is not a film. `splitAnchors` reads spans, not
           entities, so this is where "90 minutes" is refused. */
        const titles = found.filter((a) => !/^\d/.test(a.trim()));
        if (titles.length > 0) {
          return {
            relation: 'like_but',
            referenceTitles: titles.slice(0, MAX_ANCHORS),
            modifiers: probe.modifiers,
            unresolvedModifiers: probe.unresolved,
            cue: 'than',
          };
        }
      }
    }
  }

  if (!base && like) {
    const tail = t.slice(like.index + like[0].length);
    anchors = splitAnchors(tail);
    if (anchors.length > 0) {
      base = 'like';
      cue = like[0];
      modifierRegion = tail.slice(tail.indexOf(anchors[anchors.length - 1]!) + (anchors[anchors.length - 1]!.length));
    }
  }

  if (!base) {
    /* BARE "X but <shift>" — no relation cue, the title carries the sentence.
       Gated hard on a RECOGNISED modifier in the tail, because without that the
       head is just prose and treating it as an anchor would invent a comparison
       the user never made. "Furious but funnier" qualifies; "action but better"
       does not, and should not. */
    const m = /^(.{2,60}?)\s+but\s+(.{2,60})$/i.exec(t);
    if (m) {
      const tail = m[2]!;
      const probe = readModifiers(tail);
      const head = splitAnchors(m[1]!);
      if (Object.keys(probe.modifiers).length > 0 && head.length > 0) {
        return {
          relation: 'like_but',
          referenceTitles: head,
          modifiers: probe.modifiers,
          unresolvedModifiers: probe.unresolved,
          cue: 'but',
        };
      }
    }
    return null;
  }

  const { modifiers, unresolved } = readModifiers(modifierRegion);

  /* `like_but` IS `like` with a stated shift — not a separate cue to detect.
     A comparative relation keeps its own identity: "better than X but funnier"
     is still a better_than, and demoting it would lose the stronger claim. */
  const relation: CriticRelation =
    base === 'like' && Object.keys(modifiers).length > 0 ? 'like_but' : base;

  return { relation, referenceTitles: anchors, modifiers, unresolvedModifiers: unresolved, cue };
}
