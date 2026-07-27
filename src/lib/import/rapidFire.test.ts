import { describe, it, expect } from 'vitest';
import {
  BATCH_SIZE,
  PRIORITY,
  RECENCY_BONUS_MAX,
  answersFor,
  buildQueue,
  kindFor,
  normaliseKey,
  priorityFor,
  questionFor,
  recencyBonus,
  resolveAnswer,
  summarise,
  type AnswerKey,
  type Observation,
} from './rapidFire';
import { signalForVerdict } from './signalModel';

const NOW = Date.parse('2026-07-27T12:00:00.000Z');
const DAY = 86_400_000;
const ago = (days: number) => new Date(NOW - days * DAY).toISOString();

function obs(over: Partial<Observation> = {}): Observation {
  return {
    title: 'A Show',
    mediaType: 'tv',
    context: 'viewing_history',
    evidence: 'You watched 4 episodes.',
    lastWatched: ago(100),
    ...over,
  };
}

describe('the two escape hatches — the whole point of the module', () => {
  it('"don’t remember" records NOTHING, in either direction', () => {
    // This app already shipped a Skip that recorded `not_interested` and turned
    // "never heard of it" into a fabricated dislike. Never again.
    const r = resolveAnswer('dont_remember');
    expect(r.verdict).toBeNull();
    expect(r.signal).toBeNull();
    expect(r.dropsObservation).toBe(false);
  });

  it('"don’t remember" still leaves the title marked as seen', () => {
    // They did watch it — that is a fact even when the opinion is missing, and
    // we should not start recommending it back to them.
    expect(resolveAnswer('dont_remember').marksSeen).toBe(true);
  });

  it('"wasn’t me" DELETES the observation rather than counting against it', () => {
    const r = resolveAnswer('not_me');
    expect(r.dropsObservation).toBe(true);
    expect(r.signal).toBeNull();
  });

  it('"wasn’t me" does NOT mark the title seen — they still have not seen it', () => {
    expect(resolveAnswer('not_me').marksSeen).toBe(false);
  });

  it('every question offers both escape hatches', () => {
    for (const kind of ['watched', 'abandoned', 'rewatched'] as const) {
      const keys = answersFor(kind).map((a) => a.key);
      expect(keys, kind).toContain('not_me');
      expect(keys, kind).toContain('dont_remember');
    }
  });
});

describe('abandonment — the signal nobody else can collect', () => {
  it('asks a different question about something they stopped watching', () => {
    const q = questionFor(buildQueue([obs({ abandoned: true })], { now: NOW })[0]!);
    expect(q).toMatch(/started this and stopped/i);
  });

  it('separates giving up from being interrupted', () => {
    const keys = answersFor('abandoned').map((a) => a.key);
    expect(keys).toContain('bailed');
    expect(keys).toContain('interrupted');
  });

  it('weighs giving up more heavily than a thumbs-up', () => {
    // Quitting is a clearer verdict than finishing, which can be inertia.
    const bailed = resolveAnswer('bailed').signal!;
    expect(bailed.polarity).toBe(-1);
    expect(bailed.weight).toBeGreaterThan(signalForVerdict('liked')!.weight);
  });

  it('treats "life got in the way" as a mood, not a verdict on the title', () => {
    const r = resolveAnswer('interrupted').signal!;
    expect(r.decay).toBe('mood');
    // It must not be as damning as actually giving up.
    expect(r.weight).toBeLessThan(resolveAnswer('bailed').signal!.weight);
  });

  it('puts the abandoned ones at the front of the queue', () => {
    const q = buildQueue(
      [
        obs({ title: 'Just Watched', lastWatched: ago(10) }),
        obs({ title: 'Bailed On', abandoned: true, lastWatched: ago(400) }),
      ],
      { now: NOW },
    );
    expect(q[0]!.title).toBe('Bailed On');
  });
});

describe('every answer is an upgrade on what the import alone knew', () => {
  it('turns a 0.2 "you pressed play" into an explicit statement', () => {
    for (const a of ['loved', 'liked', 'disliked', 'bailed'] as AnswerKey[]) {
      const s = resolveAnswer(a).signal!;
      expect(s.explicit, a).toBe(true);
      expect(s.weight, a).toBeGreaterThan(0.2);
    }
  });

  it('does not pretend "it was fine" is enthusiasm', () => {
    const fine = resolveAnswer('fine').signal!;
    const liked = resolveAnswer('liked').signal!;
    expect(fine.weight).toBeLessThan(liked.weight);
    expect(fine.polarity).toBe(1);
  });

  it('never creates a permanent exclusion from any rapid-fire answer', () => {
    // Only an explicit "never recommend this" may do that, and it is not on
    // offer here — a fast tap must not be able to ban a title forever.
    const all: AnswerKey[] = ['loved', 'liked', 'fine', 'disliked', 'bailed', 'interrupted', 'not_me', 'dont_remember'];
    for (const a of all) expect(resolveAnswer(a).verdict, a).not.toBe('never_recommend');
  });
});

describe('the queue', () => {
  it('is deterministic — the same import always produces the same order', () => {
    const items = [obs({ title: 'B' }), obs({ title: 'A' }), obs({ title: 'C', abandoned: true })];
    expect(buildQueue(items, { now: NOW }).map((i) => i.key)).toEqual(
      buildQueue([...items].reverse(), { now: NOW }).map((i) => i.key),
    );
  });

  it('deduplicates the same title', () => {
    expect(buildQueue([obs({ title: 'Dune' }), obs({ title: ' dune ' })], { now: NOW })).toHaveLength(1);
  });

  it('never re-asks something already answered', () => {
    const first = buildQueue([obs({ title: 'A' }), obs({ title: 'B' })], { now: NOW });
    const second = buildQueue([obs({ title: 'A' }), obs({ title: 'B' })], {
      now: NOW,
      answered: [first[0]!.key],
    });
    expect(second.map((i) => i.key)).not.toContain(first[0]!.key);
  });

  it('drops a blank title rather than asking about nothing', () => {
    expect(buildQueue([obs({ title: '   ' })], { now: NOW })).toHaveLength(0);
  });

  it('respects a batch limit', () => {
    const many = Array.from({ length: 50 }, (_, i) => obs({ title: `Show ${i}` }));
    expect(buildQueue(many, { now: NOW, limit: BATCH_SIZE })).toHaveLength(BATCH_SIZE);
  });

  it('prefers something watched recently — a fresher memory is a better answer', () => {
    const q = buildQueue(
      [obs({ title: 'Old', lastWatched: ago(1000) }), obs({ title: 'Recent', lastWatched: ago(5) })],
      { now: NOW },
    );
    expect(q[0]!.title).toBe('Recent');
  });

  it('handles a missing or unusable date without crashing or rewarding it', () => {
    expect(recencyBonus(null, NOW)).toBe(0);
    expect(recencyBonus('not-a-date', NOW)).toBe(0);
    expect(recencyBonus(ago(0), NOW)).toBe(RECENCY_BONUS_MAX);
  });

  it('ranks the classes of observation by what the answer is worth', () => {
    expect(priorityFor('abandoned', 'continue_watching')).toBeGreaterThan(priorityFor('rewatched', 'repeated_viewing'));
    expect(priorityFor('rewatched', 'repeated_viewing')).toBeGreaterThan(priorityFor('watched', 'viewing_history'));
  });

  it('classifies each observation into the right question', () => {
    expect(kindFor(obs({ abandoned: true }))).toBe('abandoned');
    expect(kindFor(obs({ context: 'continue_watching' }))).toBe('abandoned');
    expect(kindFor(obs({ repeated: true }))).toBe('rewatched');
    expect(kindFor(obs({ context: 'repeated_viewing' }))).toBe('rewatched');
    expect(kindFor(obs())).toBe('watched');
  });

  it('keeps movies and series with the same name apart', () => {
    expect(normaliseKey('Dune', 'movie')).not.toBe(normaliseKey('Dune', 'tv'));
  });

  it('carries the evidence line through verbatim — it comes from the real file', () => {
    const q = buildQueue([obs({ evidence: 'You watched 12 episodes across 2 seasons.' })], { now: NOW });
    expect(q[0]!.evidence).toBe('You watched 12 episodes across 2 seasons.');
  });
});

describe('the read-back', () => {
  it('counts what was taught, dropped and left alone, separately', () => {
    const s = summarise(['loved', 'liked', 'not_me', 'dont_remember', 'bailed'], 20);
    expect(s.taught).toBe(3);
    expect(s.dropped).toBe(1);
    expect(s.unremembered).toBe(1);
    expect(s.remaining).toBe(15);
  });

  it('never claims to have learned something from a "don’t remember"', () => {
    const s = summarise(['dont_remember', 'dont_remember'], 10);
    expect(s.taught).toBe(0);
    expect(s.message).not.toMatch(/opinion/);
  });

  it('says plainly when nothing has been recorded', () => {
    expect(summarise([], 10).message).toMatch(/nothing recorded/i);
  });

  it('does not go negative when more answers arrive than were queued', () => {
    expect(summarise(['liked', 'liked', 'liked'], 2).remaining).toBe(0);
  });
});

describe('the priority table is ordered the way the comment claims', () => {
  it('abandoned beats rewatched beats a long series beats a single film', () => {
    expect(PRIORITY.abandoned).toBeGreaterThan(PRIORITY.rewatched);
    expect(PRIORITY.rewatched).toBeGreaterThan(PRIORITY.longSeries);
    expect(PRIORITY.longSeries).toBeGreaterThan(PRIORITY.film);
    expect(PRIORITY.film).toBeGreaterThan(PRIORITY.sampled);
  });
});
