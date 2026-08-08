/**
 * CONTRADICTION DETECTION — the interview's memory with teeth.
 *
 * A great interviewer notices when you talk yourself into a corner and, gently,
 * calls it out. Three kinds are caught against the standing memory of claims:
 *
 *  • `category_vs_title` — the flagship. "I hate horror" (a negative on the
 *    `horrorTolerance` axis) then "I loved The Silence of the Lambs" (a title
 *    whose axes include `horrorTolerance`). The general rule and the specific
 *    love collide.
 *  • `attribute_conflict` — a hard presentational dealbreaker undone by a title
 *    that requires it: "subtitles are a no" then "Parasite was a masterpiece".
 *  • `sentiment_flip` — the same subject, opposite feeling: "loved it" then,
 *    later, "actually it was boring".
 *
 * Only NEW conflicts an incoming signal creates are returned, each with a
 * gentle, ready-to-voice explanation. Unrelated claims never trip it.
 *
 * Pure. No clock, no I/O.
 */
import type { Claim, Contradiction, ContradictionKind, Sentiment, TasteSignal, TasteCategory } from './types';
import { ATTRIBUTE_CATEGORIES, normalizeSubject } from './categories';
import { claimFromSignal } from './memory';

/** +1 positive, -1 negative, 0 neutral — the sign of a sentiment. */
function polarity(s: Sentiment): -1 | 0 | 1 {
  switch (s) {
    case 'love':
    case 'like':
      return 1;
    case 'dislike':
    case 'hate':
      return -1;
    default:
      return 0;
  }
}

/** The axes shared by a claim and a signal. */
function sharedCategories(a: readonly TasteCategory[], b: readonly TasteCategory[]): TasteCategory[] {
  const set = new Set(b);
  return a.filter((c) => set.has(c));
}

function verbFor(s: Sentiment): string {
  switch (s) {
    case 'love':
      return 'loved';
    case 'like':
      return 'liked';
    case 'dislike':
      return "aren't keen on";
    case 'hate':
      return "can't stand";
    default:
      return 'felt neutral about';
  }
}

/** The interviewer's line for a contradiction — gentle, curious, never a gotcha. */
export function explanationFor(contradiction: Contradiction): string {
  const { earlier, later, kind } = contradiction;
  const earlierVerb = verbFor(earlier.sentiment);
  const laterVerb = verbFor(later.sentiment);
  switch (kind) {
    case 'category_vs_title':
      return `Hmm — earlier you said you ${earlierVerb} ${earlier.subject}, but you ${laterVerb} ${later.subject}, which is about as ${earlier.subject} as it gets. Help me square that?`;
    case 'attribute_conflict':
      return `You told me ${earlier.subject} was basically a dealbreaker — yet ${later.subject}, which you ${laterVerb}, is all ${earlier.subject}. So maybe it's not the dealbreaker it sounded like?`;
    case 'sentiment_flip':
      return `Let's test a theory… you ${earlierVerb} ${earlier.subject} before, and now you ${laterVerb} it. What changed?`;
    default:
      return `There's a little tension between what you said about ${earlier.subject} and ${later.subject} — talk me through it?`;
  }
}

function makeContradiction(
  kind: ContradictionKind,
  earlier: Claim,
  later: Claim,
): Contradiction {
  const base: Contradiction = {
    id: `contradiction:${kind}:${normalizeSubject(earlier.subject)}:${normalizeSubject(later.subject)}`,
    kind,
    earlier,
    later,
    explanation: '',
    raised: false,
    resolved: false,
  };
  return { ...base, explanation: explanationFor(base) };
}

/**
 * Detect the NEW contradictions an incoming signal creates against the standing
 * claims. Returns one record per conflicting earlier claim. The incoming signal
 * becomes the `later` claim; earlier claims are memory.
 */
export function detectContradictions(claims: Claim[], incoming: TasteSignal): Contradiction[] {
  const later = claimFromSignal(incoming);
  const laterPol = polarity(later.sentiment);
  if (laterPol === 0) return []; // a neutral remark contradicts nothing
  const laterSubject = normalizeSubject(later.subject);
  const out: Contradiction[] = [];
  const seen = new Set<string>();

  for (const earlier of claims) {
    const earlierPol = polarity(earlier.sentiment);
    if (earlierPol === 0) continue;
    const sameSubject = normalizeSubject(earlier.subject) === laterSubject;

    // 1) Same subject, opposite feeling → a sentiment flip.
    if (sameSubject) {
      if (earlierPol !== laterPol) {
        const c = makeContradiction('sentiment_flip', earlier, later);
        if (!seen.has(c.id)) {
          seen.add(c.id);
          out.push(c);
        }
      }
      continue; // a same-subject pair is only ever a flip
    }

    // 2) Different subjects that share an axis, with the earlier a general
    //    negative and the incoming a specific positive (the "hate X, love a
    //    thing that is X" shape). Attribute axes route to attribute_conflict.
    if (earlierPol === -1 && laterPol === 1) {
      const shared = sharedCategories(earlier.categories, later.categories);
      if (shared.length === 0) continue;
      const isAttribute = shared.some((c) => ATTRIBUTE_CATEGORIES.includes(c));
      const kind: ContradictionKind = isAttribute ? 'attribute_conflict' : 'category_vs_title';
      const c = makeContradiction(kind, earlier, later);
      if (!seen.has(c.id)) {
        seen.add(c.id);
        out.push(c);
      }
    }
  }

  return out;
}
