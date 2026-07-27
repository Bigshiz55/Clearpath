import { describe, it, expect } from 'vitest';
import {
  REWATCH_BANK,
  REWATCH_BANK_VERSION,
  REWATCH_SECTIONS,
  REWATCH_SESSION_LENGTH,
  answersToRewatchProfile,
  describeRewatchProfile,
  selectRewatchQuestions,
  type RewatchAnswer,
} from './rewatchQuiz';
import { RESPONSE_ORDER, RESPONSE_VALUES } from '@/lib/taste/quickQuiz';
import { NEUTRAL_REWATCH_PROFILE, profileNudge, type RewatchCandidate } from './rewatch';

const NOW = Date.parse('2026-07-27T12:00:00.000Z');
const answer = (questionId: string, response: RewatchAnswer['response']): RewatchAnswer => ({
  questionId,
  response,
  at: NOW,
});

describe('the bank', () => {
  it('is versioned, so a changed bank never silently reinterprets old answers', () => {
    expect(REWATCH_BANK_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it('has unique ids and covers every section', () => {
    const ids = REWATCH_BANK.map((q) => q.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const s of REWATCH_SECTIONS) {
      expect(REWATCH_BANK.some((q) => q.section === s.id), s.id).toBe(true);
    }
  });

  it('holds both directions on every axis — a bank that only agrees learns nothing', () => {
    for (const axis of ['comfort', 'cooling'] as const) {
      const on = REWATCH_BANK.filter((q) => q.axis === axis);
      expect(on.some((q) => q.polarity === 1), `${axis} +`).toBe(true);
      expect(on.some((q) => q.polarity === -1), `${axis} −`).toBe(true);
    }
  });

  it('shares the taste quiz’s response values rather than restating them', () => {
    // If these ever diverge, "Mostly" means two different numbers in one app.
    expect(RESPONSE_ORDER.length).toBe(4);
    expect(RESPONSE_VALUES.exactly.value).toBeGreaterThan(RESPONSE_VALUES.mostly.value);
    expect(RESPONSE_VALUES.not_me.value).toBeLessThan(0);
  });
});

describe('selecting a session', () => {
  it('returns a full session that spreads across the sections', () => {
    const qs = selectRewatchQuestions();
    expect(qs).toHaveLength(REWATCH_SESSION_LENGTH);
    expect(new Set(qs.map((q) => q.section)).size).toBeGreaterThanOrEqual(3);
  });

  it('never repeats a question inside a session', () => {
    const ids = selectRewatchQuestions().map((q) => q.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('never re-asks something already answered', () => {
    const first = selectRewatchQuestions();
    const second = selectRewatchQuestions({ asked: first.map((q) => q.id) });
    for (const q of second) expect(first.map((x) => x.id)).not.toContain(q.id);
  });

  it('is deterministic — it does not reshuffle under the user’s hands', () => {
    expect(selectRewatchQuestions().map((q) => q.id)).toEqual(selectRewatchQuestions().map((q) => q.id));
  });

  it('runs out gracefully rather than looping forever', () => {
    const all = REWATCH_BANK.map((q) => q.id);
    expect(selectRewatchQuestions({ asked: all })).toHaveLength(0);
    expect(selectRewatchQuestions({ count: 999 }).length).toBe(REWATCH_BANK.length);
  });
});

describe('answers → profile', () => {
  it('an untaken quiz changes nothing at all', () => {
    const p = answersToRewatchProfile([]);
    expect(p.samples).toBe(0);
    expect(p).toEqual(NEUTRAL_REWATCH_PROFILE);

    const c: RewatchCandidate = {
      key: 'movie:1',
      title: 'x',
      lastWatchedAt: NOW - 400 * 86_400_000,
      timesWatched: 5,
      userRating: 90,
      finished: true,
      runtimeMinutes: 100,
      availableOn: [],
      watchability: 80,
    };
    expect(profileNudge(c, p, NOW)).toBe(0);
  });

  it('reads a comfort watcher as comfort and a rediscoverer as rediscovery', () => {
    const comfort = answersToRewatchProfile([
      answer('rw-why-comfort', 'exactly'),
      answer('rw-why-background', 'exactly'),
      answer('rw-earn-repeat', 'exactly'),
      answer('rw-why-waste', 'not_me'),
    ]);
    expect(comfort.comfort).toBeGreaterThan(0.5);

    const rediscover = answersToRewatchProfile([
      answer('rw-why-comfort', 'not_me'),
      answer('rw-why-background', 'not_me'),
      answer('rw-earn-repeat', 'not_me'),
      answer('rw-why-waste', 'exactly'),
    ]);
    expect(rediscover.comfort).toBeLessThan(-0.5);
  });

  it('reads how long someone needs between goes', () => {
    const patient = answersToRewatchProfile([
      answer('rw-time-forget', 'exactly'),
      answer('rw-time-decade', 'exactly'),
      answer('rw-time-soon', 'not_me'),
    ]);
    expect(patient.cooling).toBeGreaterThan(0.7);

    const impatient = answersToRewatchProfile([
      answer('rw-time-forget', 'not_me'),
      answer('rw-time-decade', 'not_me'),
      answer('rw-time-soon', 'exactly'),
      answer('rw-time-annual', 'exactly'),
    ]);
    expect(impatient.cooling).toBeLessThan(0.3);
  });

  it('keeps every axis inside its own range whatever the answers', () => {
    for (const response of RESPONSE_ORDER) {
      const p = answersToRewatchProfile(REWATCH_BANK.map((q) => answer(q.id, response)));
      expect(p.comfort).toBeGreaterThanOrEqual(-1);
      expect(p.comfort).toBeLessThanOrEqual(1);
      expect(p.cooling).toBeGreaterThanOrEqual(0);
      expect(p.cooling).toBeLessThanOrEqual(1);
    }
  });

  it('does not let one loud axis drown the other', () => {
    // Five comfort answers and one timing answer: the timing axis must still
    // reflect that one answer rather than being diluted by the comfort ones.
    const p = answersToRewatchProfile([
      answer('rw-why-comfort', 'exactly'),
      answer('rw-why-background', 'exactly'),
      answer('rw-earn-loved', 'exactly'),
      answer('rw-earn-repeat', 'exactly'),
      answer('rw-limit-long', 'exactly'),
      answer('rw-time-forget', 'exactly'),
    ]);
    expect(p.cooling).toBeGreaterThan(0.7);
    expect(p.comfort).toBeGreaterThan(0.5);
  });

  it('counts "Depends" as answered but not as a direction', () => {
    const dep = answersToRewatchProfile([
      answer('rw-why-comfort', 'depends'),
      answer('rw-why-discover', 'depends'),
    ]);
    expect(dep.samples).toBe(2);
    expect(dep.comfort).toBe(0);
  });

  it('ignores an id that is not in the bank rather than throwing', () => {
    const p = answersToRewatchProfile([answer('nope-not-real', 'exactly')]);
    expect(p.comfort).toBe(0);
    expect(p.samples).toBe(0);
  });
});

describe('the read-back', () => {
  it('says nothing has been learned when nothing has', () => {
    expect(describeRewatchProfile(NEUTRAL_REWATCH_PROFILE)).toMatch(/nothing learned yet/i);
  });

  it('describes both axes once there are answers', () => {
    const p = answersToRewatchProfile([
      answer('rw-why-comfort', 'exactly'),
      answer('rw-time-forget', 'exactly'),
    ]);
    const line = describeRewatchProfile(p);
    expect(line).toMatch(/comfort/i);
    expect(line).toMatch(/gap/i);
  });
});
