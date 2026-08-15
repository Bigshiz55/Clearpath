import { describe, expect, it, vi } from 'vitest';

/**
 * ══════════════════════════════════════════════════════════════════════════
 * "LIKE" THE VERB IS A PREFERENCE, NEVER A TITLE ANCHOR.
 * ══════════════════════════════════════════════════════════════════════════
 *
 * THE PRODUCTION INCIDENT. A signed-in user asked, verbatim:
 *
 *   "I like Sylvester Stallone movies, what else do you think I'll like?"
 *
 * and was answered with "Which title did you mean?" — title clarification for
 * a sentence that never named a title. The first wrong boundary was the
 * comparison parser's like-cue: it accepted the BARE token "like" wherever it
 * appeared, so the VERB in "I like …" was read as the PREPOSITION in "movies
 * like Rocky", and the words after it — "Sylvester Stallone movies" — were
 * extracted as a reference TITLE. That fake anchor went to identity
 * resolution, could not resolve (no such film exists), and the clarification
 * machinery did exactly what it is told to do with an unresolvable anchor:
 * it asked. Every layer downstream behaved correctly on a premise that was
 * wrong at the first split.
 *
 * The same mechanism turned "I would like 3 boxing movies" into a comparison
 * against a film called "3 boxing movies".
 *
 * THE FIX IS GRAMMATICAL, NOT LEXICAL. `likeGrammar.ts` decides verb vs
 * preposition from the closed class of words that can sit between a subject
 * and its verb — no title, person, or genre appears in any pattern, so there
 * is nothing Stallone-specific that a different actor's name would miss.
 * Both doors that read similarity cues consult the SAME test:
 *
 *   - the critic's comparison parser  (`parseCriticRequest`, via
 *     `findPrepositionalLike`)
 *   - the legacy similarity extractor (`extractReference` in askJudge)
 *
 * so the verb reading cannot regress in one and stay fixed in the other.
 *
 * WHY THESE EXACT SENTENCES. Each `it` below pins either a sentence from the
 * incident report or the nearest sentence that must KEEP parsing as a
 * comparison. If a change makes one of the preference sentences comparative
 * again — or makes "movies like Rocky" stop being one — this file is the
 * alarm, and weakening it is how the incident recurs.
 */

vi.mock('server-only', () => ({}));
vi.mock('@/lib/tmdb/client', () => ({
  searchTitles: vi.fn(async () => []),
  getSimilar: vi.fn(async () => []),
  getCredits: vi.fn(async () => null),
}));

import { ADVERB_LED_LIKE, isVerbLike } from './likeGrammar';
import { parseCriticRequest } from '@/lib/critic/request';
import { routeAsk, type ServingMode } from '@/lib/critic/gate';
import { interpret } from '@/lib/interpret/interpret';
import { extractReference } from '@/lib/askJudge';
import { referenceCandidates } from '@/lib/nlu/titleReference';

/** Index of the FIRST bare "like" token, for driving isVerbLike directly. */
const likeAt = (text: string): number => {
  const m = /\blike\b/i.exec(text);
  if (!m) throw new Error(`no "like" in ${text}`);
  return m.index;
};

// ═══ A · THE GRAMMATICAL TEST ITSELF ══════════════════════════════════════

describe('isVerbLike · subject before the token means the verb "to like"', () => {
  it.each([
    'I like Sylvester Stallone movies',
    "I'd like a good thriller",
    "you think I'll like this",
    'we would really like something new',
    'they never like the remake',
    "he doesn't like horror",
    'I am going to like this one',
    'I would like 3 boxing movies',
  ])('verb: %s', (text) => {
    expect(isVerbLike(text, likeAt(text))).toBe(true);
  });

  it.each([
    'movies like Rocky',
    'thrillers like Se7en',
    'something like Heat',
    'shows like Mindhunter',
    'Like Heat but funnier', // sentence-initial: nothing before it, prepositional
    'a movie like The Departed',
  ])('preposition: %s', (text) => {
    expect(isVerbLike(text, likeAt(text))).toBe(false);
  });

  it('the adverb-led cues are recognised as such (they can modify the verb)', () => {
    expect(ADVERB_LED_LIKE.test('just like')).toBe(true);
    expect(ADVERB_LED_LIKE.test('kinda like')).toBe(true);
    expect(ADVERB_LED_LIKE.test('movies like')).toBe(false); // noun-led: always prepositional
    expect(ADVERB_LED_LIKE.test('something like')).toBe(false);
  });

  it('names no actor, film, or genre — the test is closed-class grammar only', () => {
    // The fix must generalise: the incident sentence with ANY name in it.
    for (const name of ['Sylvester Stallone', 'Meryl Streep', 'Bong Joon-ho', 'Zendaya']) {
      const q = `I like ${name} movies, what else do you think I'll like?`;
      expect(parseCriticRequest(q), q).toBeNull();
    }
  });
});

// ═══ B · THE REQUIRED EXACT QUERIES, THROUGH THE REAL COMPARISON PARSER ═══

describe('parseCriticRequest · preference statements are not comparisons', () => {
  it.each([
    'I like Sylvester Stallone movies, what else do you think I’ll like?',
    "I like Sylvester Stallone movies, what else do you think I'll like?",
    'I like Christopher Nolan movies, what else should I watch?',
    'I like Rocky, what else would I like?',
    'I would like 3 boxing movies',
    '3 boxing movies I would like',
    'I would just like 3 boxing movies', // adverb between subject and verb
  ])('no comparison, no anchor: %s', (q) => {
    expect(parseCriticRequest(q)).toBeNull();
  });

  it.each([
    ['movies like Rocky', 'like', ['Rocky']],
    ['movies like The Departed', 'like', ['The Departed']],
    ['thrillers like Se7en', 'like', ['Se7en']],
    ['something like Heat', 'like', ['Heat']],
    ['movies just like Rocky', 'like', ['Rocky']], // adverb-led cue after a NOUN stays a cue
    ['better than Rocky', 'better_than', ['Rocky']],
  ] as const)('still a comparison: %s', (q, relation, refs) => {
    const r = parseCriticRequest(q);
    expect(r).not.toBeNull();
    expect(r!.relation).toBe(relation);
    expect(r!.referenceTitles).toEqual([...refs]);
  });

  it('the stated-shift form survives too', () => {
    const r = parseCriticRequest('Like Heat but funnier');
    expect(r).not.toBeNull();
    expect(r!.relation).toBe('like_but');
    expect(r!.referenceTitles).toEqual(['Heat']);
  });
});

// ═══ C · THE CANONICAL READING: PREFERENCE + RECOMMENDATION REQUEST ═══════

describe('interpret · the preference sentences are recommendation requests', () => {
  it.each([
    "I like Sylvester Stallone movies, what else do you think I'll like?",
    'I like Christopher Nolan movies, what else should I watch?',
    'I like Rocky, what else would I like?',
    'I would like 3 boxing movies',
    '3 boxing movies I would like',
  ])('recommendation, and NO title reference is manufactured: %s', (q) => {
    const intent = interpret(q);
    expect(intent.kind).toBe('recommendation');
    // The fake-anchor impossibility, stated at the canonical layer: nothing in
    // a preference sentence may surface as a NAMED TITLE the route could try
    // to resolve — that resolution failing is exactly what produced "Which
    // title did you mean?".
    expect(intent.titles.map((t) => t.span)).toEqual([]);
    // And the only deterministic clarify the canonical arm can emit besides
    // ambiguity is the media contradiction — which needs media 'none'.
    expect(intent.media).not.toBe('none');
  });

  it('the count-and-media wish executes as stated: 3, movies', () => {
    for (const q of ['I would like 3 boxing movies', '3 boxing movies I would like']) {
      const intent = interpret(q);
      expect(intent.requestedCount, q).toBe(3);
      expect(intent.media, q).toBe('movie');
    }
  });
});

// ═══ D · THE ROUTE BOUNDARY: THE CRITIC NEVER OWNS THESE, IN ANY MODE ═════

describe('routeAsk · no serving mode routes a preference into the critic', () => {
  const MODES: ServingMode[] = ['legacy', 'shadow', 'anthropic'];
  it.each([
    "I like Sylvester Stallone movies, what else do you think I'll like?",
    'I like Christopher Nolan movies, what else should I watch?',
    'I like Rocky, what else would I like?',
    'I would like 3 boxing movies',
    '3 boxing movies I would like',
  ])('%s', (q) => {
    for (const mode of MODES) {
      const d = routeAsk(q, mode);
      expect(d.comparative, `${mode}: comparative`).toBe(false);
      expect(d.request, `${mode}: request`).toBeNull();
      expect(d.consumer, `${mode}: consumer`).not.toBe('critic');
    }
    // clarify.test.ts H3 proves the route emits title clarification only on
    // the critic path; with the critic never owning these sentences and no
    // canonical title reference (section C), "Which title did you mean?" has
    // no producer left for them.
  });

  it('comparisons still route to the critic in every mode', () => {
    for (const mode of MODES) {
      const d = routeAsk('movies like Rocky', mode);
      expect(d.comparative).toBe(true);
      expect(d.consumer).toBe('critic');
      expect(d.request!.referenceTitles).toEqual(['Rocky']);
    }
  });
});

// ═══ E · THE LEGACY SIMILARITY DOOR: TASTE SEEDS, NEVER FAKE ANCHORS ══════

/** What the ask route actually resolves: the extracted span, clause-tidied. */
const seedOf = (text: string): string | null => {
  const raw = extractReference(text);
  return raw ? (referenceCandidates(raw)[0] ?? null) : null;
};

describe('extractReference · a category preference cannot manufacture an anchor', () => {
  it.each([
    "I like Sylvester Stallone movies, what else do you think I'll like?",
    'I like Christopher Nolan movies, what else should I watch?',
    'I like horror movies, what else should I watch?',
    'I loved Christopher Nolan movies', // same quarantine, past tense
    'I would like 3 boxing movies', // a WISH — "would like" is never a preference cue
    '3 boxing movies I would like',
  ])('no reference: %s', (q) => {
    expect(extractReference(q)).toBeNull();
  });

  it('a stated taste that NAMES A WORK survives as the similarity seed', () => {
    // Dropping Rocky here would be the silent constraint loss that
    // constraintPreservation.test.ts exists to forbid: the preference is the
    // best evidence in the sentence, and it seeds similarity — it does not
    // become a lookup, a comparison, or a clarification.
    expect(seedOf('I like Rocky, what else would I like?')).toBe('Rocky');
    expect(seedOf('I like Rocky. What else should I watch?')).toBe('Rocky');
  });

  it('similarity cues still extract their reference', () => {
    expect(extractReference('shows like Mindhunter')).toBe('Mindhunter');
    // This door has always stripped a leading article before search — the
    // reference survives; "The" does not. That is its pre-existing contract,
    // not something the grammar guard changed.
    expect(extractReference('movies like The Departed')).toBe('Departed');
  });

  it('the EXPLICIT preference cues still name their work', () => {
    // "if I liked X" names a work on purpose — that is a reference, not the
    // bare verb, and the grammatical guard must not swallow it.
    expect(extractReference("shows I'd enjoy if I liked Fargo")).toBe('Fargo');
  });
});
