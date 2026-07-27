import { describe, it, expect } from 'vitest';
import {
  QUESTION_BANK,
  SECTIONS,
  RESPONSE_VALUES,
  RESPONSE_ORDER,
  SESSION_LENGTH,
  BANK_VERSION,
  splitQuote,
  CALIBRATED_MIN_ANSWERS,
  STRONG_MIN_ANSWERS,
  selectQuestions,
  answersToClaims,
  provenanceFor,
  dnaState,
  dnaLabel,
  hardExclusions,
  questionAttributes,
  missingSections,
  claimId,
  type QuizAnswer,
  type QuizQuestion,
} from './quickQuiz';
import { attribute } from './lexicon';
import { buildProfile } from './profile';
import { toPreferenceEvents } from './toPreference';

const NOW = 1_700_000_000_000;
const answer = (questionId: string, response: QuizAnswer['response'], chips?: string[]): QuizAnswer => ({
  questionId,
  response,
  at: NOW,
  ...(chips ? { chips } : {}),
});

describe('the bank', () => {
  it('is versioned', () => {
    expect(BANK_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it('has unique question ids', () => {
    const ids = QUESTION_BANK.map((q) => q.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('covers all seven sections', () => {
    const used = new Set(QUESTION_BANK.map((q) => q.section));
    expect(used.size).toBe(SECTIONS.length);
    for (const s of SECTIONS) expect(used.has(s.key)).toBe(true);
  });

  it('uses all three question types', () => {
    const types = new Set(QUESTION_BANK.map((q) => q.type));
    expect(types).toEqual(new Set(['attribute', 'tradeoff', 'tolerance']));
  });

  it('only targets attributes that exist in the lexicon', () => {
    for (const q of QUESTION_BANK) {
      for (const key of questionAttributes(q)) {
        expect(attribute(key), `${q.id} → ${key}`).toBeTruthy();
      }
    }
  });

  it('gives every tradeoff a real opposite pole rather than an absence', () => {
    for (const q of QUESTION_BANK.filter((x) => x.type === 'tradeoff')) {
      expect(q.no, q.id).toBeTruthy();
      expect(q.no!.length, q.id).toBeGreaterThan(0);
    }
  });

  it('offers hard-exclusion chips only on tolerance questions', () => {
    for (const q of QUESTION_BANK) {
      const hard = (q.chips ?? []).filter((c) => c.hardExclusion);
      if (hard.length > 0) expect(q.type, q.id).toBe('tolerance');
    }
  });

  it('has enough questions to fill more than one session', () => {
    expect(QUESTION_BANK.length).toBeGreaterThan(SESSION_LENGTH * 2);
  });

  it('has unique chip ids within a question', () => {
    for (const q of QUESTION_BANK) {
      const ids = (q.chips ?? []).map((c) => c.id);
      expect(new Set(ids).size, q.id).toBe(ids.length);
    }
  });
});

describe('response values', () => {
  it('prices the four answers as specified', () => {
    expect(RESPONSE_VALUES.exactly.value).toBe(1.0);
    expect(RESPONSE_VALUES.mostly.value).toBe(0.6);
    expect(RESPONSE_VALUES.not_me.value).toBe(-0.75);
  });

  it('treats Depends as conditional rather than as a weaker yes', () => {
    expect(RESPONSE_VALUES.depends.scope).toBe('conditional');
    expect(RESPONSE_VALUES.exactly.scope).toBe('general');
    expect(RESPONSE_VALUES.mostly.scope).toBe('general');
  });

  it('exposes exactly four responses in keyboard order', () => {
    expect(RESPONSE_ORDER).toHaveLength(4);
    expect(new Set(RESPONSE_ORDER).size).toBe(4);
  });
});

describe('selection', () => {
  it('returns the session length by default', () => {
    expect(selectQuestions()).toHaveLength(SESSION_LENGTH);
  });

  it('is deterministic', () => {
    const a = selectQuestions().map((q) => q.id);
    const b = selectQuestions().map((q) => q.id);
    expect(a).toEqual(b);
  });

  it('never repeats a question', () => {
    const ids = selectQuestions({ count: 20 }).map((q) => q.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('spreads across every section before doubling up anywhere', () => {
    const picked = selectQuestions();
    expect(new Set(picked.map((q) => q.section)).size).toBe(SECTIONS.length);
  });

  it('skips questions already asked', () => {
    const first = selectQuestions();
    const second = selectQuestions({ asked: first.map((q) => q.id) });
    const overlap = second.filter((q) => first.some((f) => f.id === q.id));
    expect(overlap).toHaveLength(0);
  });

  it('does not re-ask ground that existing DNA already covers', () => {
    const cold = selectQuestions().map((q) => q.id);
    expect(cold).toContain('q-subtitles');

    const warm = selectQuestions({ known: { subtitles: 3, foreign_language: 3, english_audio: 3 } });
    expect(warm.map((q) => q.id)).not.toContain('q-subtitles');
    // The slot is spent elsewhere rather than lost.
    expect(warm).toHaveLength(SESSION_LENGTH);
  });

  it('still covers every section when part of the profile is already known', () => {
    const warm = selectQuestions({ known: { gore: 3, violence: 3, child_harm: 3, sex_content: 3, subtitles: 3 } });
    expect(new Set(warm.map((q) => q.section)).size).toBe(SECTIONS.length);
  });

  it('stops when the bank runs out rather than padding', () => {
    const tiny: QuizQuestion[] = [
      { id: 't1', section: 'tone', type: 'attribute', prompt: 'a', yes: [{ key: 'dark_tone', polarity: 1 }] },
    ];
    expect(selectQuestions({ bank: tiny, count: 12 })).toHaveLength(1);
  });
});

describe('answers → claims', () => {
  it('turns Exactly into a strong general claim', () => {
    const [claim] = answersToClaims([answer('q-horror', 'exactly')]);
    expect(claim).toBeTruthy();
    expect(claim!.attribute).toBe('horror');
    expect(claim!.polarity).toBe(1);
    expect(claim!.strength).toBe(1);
    expect(claim!.scope).toBe('general');
    expect(claim!.durability).toBe('durable');
  });

  it('prices Mostly below Exactly', () => {
    const strong = answersToClaims([answer('q-horror', 'exactly')])[0]!;
    const mild = answersToClaims([answer('q-horror', 'mostly')])[0]!;
    expect(mild.strength).toBeLessThan(strong.strength);
  });

  it('flips polarity on Not me', () => {
    const [claim] = answersToClaims([answer('q-horror', 'not_me')]);
    expect(claim!.attribute).toBe('horror');
    expect(claim!.polarity).toBe(-1);
  });

  it('credits the opposite pole on a tradeoff rather than just negating', () => {
    const claims = answersToClaims([answer('q-pace-tradeoff', 'not_me')]);
    const keys = claims.map((c) => c.attribute);
    expect(keys).toContain('slow_pace');
    expect(claims.find((c) => c.attribute === 'slow_pace')!.polarity).toBe(1);
    expect(keys).not.toContain('fast_pace');
  });

  it('records Depends as conditional with the chip text as the condition', () => {
    const claims = answersToClaims([answer('q-horror', 'depends', ['chip-horror-nogore'])]);
    const horror = claims.find((c) => c.attribute === 'horror')!;
    expect(horror.scope).toBe('conditional');
    expect(horror.condition?.text).toBe('it is tense rather than gory');
  });

  it('lets a chip pin extra attributes the question alone would not', () => {
    const claims = answersToClaims([answer('q-horror', 'depends', ['chip-horror-nogore'])]);
    const gore = claims.find((c) => c.attribute === 'gore');
    expect(gore).toBeTruthy();
    expect(gore!.polarity).toBe(-1);
  });

  it('never sets a hard exclusion unless the user picked the chip that says so', () => {
    const plain = answersToClaims([answer('q-gore', 'not_me')]);
    expect(plain.every((c) => !c.hardExclusion)).toBe(true);

    const hard = answersToClaims([answer('q-gore', 'depends', ['chip-gore-never'])]);
    expect(hard.some((c) => c.hardExclusion)).toBe(true);
    expect(hardExclusions(hard)).toContain('gore');
  });

  it('lands a hard exclusion at full strength regardless of the response price', () => {
    const [claim] = answersToClaims([answer('q-animal-harm', 'depends', ['chip-animal-never'])]);
    expect(claim!.strength).toBe(1);
    expect(claim!.polarity).toBe(-1);
  });

  it('quotes the statement the user actually answered', () => {
    const [claim] = answersToClaims([answer('q-horror', 'exactly')]);
    expect(claim!.quote).toContain('I actively enjoy being scared.');
    expect(claim!.quote).toContain(RESPONSE_VALUES.exactly.label);
  });

  it('replaces rather than stacks when a question is re-answered', () => {
    const claims = answersToClaims([answer('q-horror', 'exactly'), answer('q-horror', 'not_me')]);
    const horror = claims.filter((c) => c.attribute === 'horror');
    expect(horror).toHaveLength(1);
    expect(horror[0]!.polarity).toBe(-1);
    expect(horror[0]!.id).toBe(claimId('q-horror', 'horror'));
  });

  it('ignores chips on responses that are not Depends', () => {
    const claims = answersToClaims([answer('q-gore', 'exactly', ['chip-gore-never'])]);
    expect(claims.some((c) => c.hardExclusion)).toBe(false);
  });

  it('ignores unknown question ids instead of inventing a claim', () => {
    expect(answersToClaims([answer('nope', 'exactly')])).toEqual([]);
  });

  it('produces nothing from an exception prompt with no attributes of its own', () => {
    expect(answersToClaims([answer('q-except-scary', 'exactly')])).toEqual([]);
  });
});

describe('provenance', () => {
  it('records everything needed to explain and revise a belief', () => {
    const [row] = provenanceFor([answer('q-horror', 'depends', ['chip-horror-nogore'])]);
    expect(row).toBeTruthy();
    expect(row!.questionId).toBe('q-horror');
    expect(row!.bankVersion).toBe(BANK_VERSION);
    expect(row!.questionType).toBe('attribute');
    expect(row!.section).toBe('core_loves');
    expect(row!.response).toBe('depends');
    expect(row!.responseWeight).toBe(RESPONSE_VALUES.depends.value);
    expect(row!.chips).toEqual(['chip-horror-nogore']);
    expect(row!.conditions).toEqual(['it is tense rather than gory']);
    expect(row!.source).toBe('quiz');
    expect(row!.at).toBe(NOW);
    expect(row!.durability).toBe('durable');
    expect(row!.claimIds).toContain(claimId('q-horror', 'horror'));
  });

  it('numbers revisions so corrections keep a history', () => {
    const rows = provenanceFor([answer('q-horror', 'exactly'), answer('q-horror', 'not_me')]);
    expect(rows.map((r) => r.revision)).toEqual([0, 1]);
    expect(rows[1]!.response).toBe('not_me');
  });
});

describe('coverage vs confidence', () => {
  it('is empty and honest with no answers', () => {
    const s = dnaState([]);
    expect(s.coverage).toBe(0);
    expect(s.confidence).toBe(0);
    expect(s.label).toBe('Starting');
    expect(s.answered).toBe(0);
  });

  it('does not call a handful of answers a finished profile', () => {
    const answers = selectQuestions({ count: 4 }).map((q) => answer(q.id, 'exactly'));
    const s = dnaState(answers);
    expect(s.label).not.toBe('Highly Calibrated');
    expect(s.label).not.toBe('Strong');
    expect(s.coverage).toBeLessThan(0.7);
  });

  it('never calls a first session Highly Calibrated', () => {
    const answers = selectQuestions().map((q) => answer(q.id, 'exactly'));
    const s = dnaState(answers);
    expect(s.answered).toBe(SESSION_LENGTH);
    expect(s.label).not.toBe('Highly Calibrated');
  });

  it('separates breadth from firmness', () => {
    const picked = selectQuestions();
    const decisive = dnaState(picked.map((q) => answer(q.id, 'exactly')));
    const hedged = dnaState(picked.map((q) => answer(q.id, 'depends')));
    expect(hedged.coverage).toBeCloseTo(decisive.coverage, 6);
    expect(hedged.confidence).toBeLessThan(decisive.confidence);
  });

  it('counts a correction as one answer, not two', () => {
    const s = dnaState([answer('q-horror', 'exactly'), answer('q-horror', 'not_me')]);
    expect(s.answered).toBe(1);
  });

  it('gates the top labels on volume as well as on the numbers', () => {
    expect(dnaLabel(1, 1, STRONG_MIN_ANSWERS - 1)).toBe('Developing');
    expect(dnaLabel(1, 1, STRONG_MIN_ANSWERS)).toBe('Strong');
    expect(dnaLabel(1, 1, CALIBRATED_MIN_ANSWERS)).toBe('Highly Calibrated');
  });

  it('takes the lower of coverage and confidence', () => {
    expect(dnaLabel(0.95, 0.1, 50)).toBe('Starting');
  });

  it('summarises coverage in words that cannot be read as accuracy', () => {
    const s = dnaState(selectQuestions().map((q) => answer(q.id, 'exactly')));
    expect(s.summary).toContain('not how accurate');
  });

  it('reports which areas are still untouched', () => {
    const missing = missingSections([answer('q-horror', 'exactly')]);
    expect(missing.some((s) => s.key === 'core_loves')).toBe(false);
    expect(missing.some((s) => s.key === 'limits')).toBe(true);
  });
});

describe('into the existing taste model', () => {
  it('builds a profile the recommender can act on', () => {
    const answers = [
      answer('q-pace-tradeoff', 'not_me'),
      answer('q-tone-tradeoff', 'exactly'),
      answer('q-crime', 'exactly'),
      answer('q-gore', 'depends', ['chip-gore-never']),
    ];
    const profile = buildProfile({ claims: answersToClaims(answers), now: NOW });
    expect(profile.claimCount).toBeGreaterThan(0);
    expect(profile.attributes.slow_pace!.lean).toBeGreaterThan(0);
    expect(profile.attributes.dark_tone!.lean).toBeGreaterThan(0);
    expect(profile.genres.crime!.lean).toBeGreaterThan(0);
    expect(profile.dims.pacing!.pref).toBeLessThan(50);
  });

  it('writes axis corrections through the one preference log', () => {
    const claims = answersToClaims(selectQuestions().map((q) => answer(q.id, 'exactly')));
    const profile = buildProfile({ claims, now: NOW });
    const events = toPreferenceEvents(profile, claims, { sessionId: 's1', now: NOW });
    expect(events).toHaveLength(1);
    expect(events[0]!.corrections!.length).toBeGreaterThan(0);
    expect(events[0]!.action).toBe('skip');
  });

  it('discounts a conditional answer below an unconditional one', () => {
    const flat = buildProfile({ claims: answersToClaims([answer('q-horror', 'exactly')]), now: NOW });
    const gated = buildProfile({ claims: answersToClaims([answer('q-horror', 'depends', ['chip-horror-nogore'])]), now: NOW });
    expect(gated.attributes.horror!.evidence).toBeLessThan(flat.attributes.horror!.evidence);
  });

  it('carries the condition through onto the belief', () => {
    const profile = buildProfile({
      claims: answersToClaims([answer('q-subtitles', 'depends', ['chip-sub-attention'])]),
      now: NOW,
    });
    expect(profile.attributes.subtitles!.conditions[0]!.text).toBe('I am giving it my full attention');
  });
});

/**
 * The evidence line under a claim used to render as one run of text ending in
 * "— Not me", and on a phone that tail was the first thing truncated away —
 * leaving "You avoid subtitles" quoting "Reading subtitles is no obstacle at
 * all…", which reads as the app contradicting itself.
 */
describe('splitQuote', () => {
  it('separates the statement from the answer', () => {
    expect(splitQuote('Reading subtitles is no obstacle at all. — Not me')).toEqual({
      statement: 'Reading subtitles is no obstacle at all.',
      answer: 'Not me',
    });
  });

  it('splits on the LAST separator, so a statement may contain one', () => {
    expect(splitQuote('I want something — anything — that moves. — Mostly')).toEqual({
      statement: 'I want something — anything — that moves.',
      answer: 'Mostly',
    });
  });

  it('recognises every response label the bank can produce', () => {
    for (const rv of Object.values(RESPONSE_VALUES)) {
      expect(splitQuote(`A statement. — ${rv.label}`).answer).toBe(rv.label);
    }
  });

  it('keeps the whole string when the tail is not an answer — never guesses', () => {
    const q = 'Some quote — with an em dash in it';
    expect(splitQuote(q)).toEqual({ statement: q, answer: null });
    expect(splitQuote('No separator at all')).toEqual({
      statement: 'No separator at all',
      answer: null,
    });
  });

  it('loses no text: statement + answer always reconstitutes the input', () => {
    for (const q of QUESTION_BANK) {
      for (const rv of Object.values(RESPONSE_VALUES)) {
        const quote = `${q.prompt} — ${rv.label}`;
        const { statement, answer } = splitQuote(quote);
        expect(answer == null ? statement : `${statement} — ${answer}`).toBe(quote);
      }
    }
  });
});
