import { describe, it, expect } from 'vitest';
import {
  AFFECTION_WEIGHT,
  FULLY_READY_DAYS,
  NEUTRAL_REWATCH_PROFILE,
  PROFILE_NUDGE_MAX,
  TOO_SOON_DAYS,
  affection,
  baseRewatchScore,
  daysSince,
  deliverReVerdict,
  gapLabel,
  profileNudge,
  readiness,
  rewatchScore,
  type RewatchCandidate,
  type RewatchProfile,
} from './rewatch';

const DAY = 86_400_000;
const NOW = Date.parse('2026-07-27T12:00:00.000Z');
const ago = (days: number) => NOW - days * DAY;

function candidate(over: Partial<RewatchCandidate> = {}): RewatchCandidate {
  return {
    key: 'movie:1',
    title: 'A Film',
    lastWatchedAt: ago(400),
    timesWatched: 1,
    userRating: 80,
    finished: true,
    runtimeMinutes: 110,
    availableOn: ['Netflix'],
    watchability: 70,
    ...over,
  };
}

describe('readiness — time is the axis', () => {
  it('is zero inside the too-soon window', () => {
    expect(readiness(0)).toBe(0);
    expect(readiness(TOO_SOON_DAYS)).toBe(0);
  });

  it('climbs with the gap and plateaus once it is fully ready', () => {
    const early = readiness(TOO_SOON_DAYS + 100);
    const later = readiness(TOO_SOON_DAYS + 400);
    expect(later).toBeGreaterThan(early);
    expect(readiness(FULLY_READY_DAYS)).toBe(1);
    expect(readiness(FULLY_READY_DAYS * 5)).toBe(1);
  });

  it('treats an unknown date as genuinely neutral, not as "long ago"', () => {
    // Guessing would promote every title with a missing date — a data gap
    // dressed up as a recommendation.
    expect(readiness(null)).toBe(0.5);
    expect(daysSince(null, NOW)).toBeNull();
  });
});

describe('affection — their rating outranks the critics', () => {
  it('uses the user rating when there is one, and says it is theirs', () => {
    expect(affection(candidate({ userRating: 90, watchability: 20 }))).toEqual({ value: 90, isOwn: true });
  });

  it('falls back to the general verdict, and marks it as NOT theirs', () => {
    expect(affection(candidate({ userRating: null, watchability: 64 }))).toEqual({ value: 64, isOwn: false });
  });

  it('lands on the midpoint when there is nothing at all', () => {
    expect(affection(candidate({ userRating: null, watchability: null }))).toEqual({ value: 50, isOwn: false });
  });
});

describe('the base score is deterministic', () => {
  it('rewards a title they loved and have not seen in years', () => {
    const loved = baseRewatchScore(candidate({ userRating: 95, lastWatchedAt: ago(FULLY_READY_DAYS) }), NOW);
    const liked = baseRewatchScore(candidate({ userRating: 55, lastWatchedAt: ago(FULLY_READY_DAYS) }), NOW);
    expect(loved).toBeGreaterThan(liked);
  });

  it('weights their rating more heavily than the gap', () => {
    expect(AFFECTION_WEIGHT).toBeGreaterThan(0.5);
    // Loved but recent still beats indifferent but ancient.
    const lovedRecent = baseRewatchScore(candidate({ userRating: 100, lastWatchedAt: ago(TOO_SOON_DAYS + 1) }), NOW);
    const mehAncient = baseRewatchScore(candidate({ userRating: 30, lastWatchedAt: ago(FULLY_READY_DAYS) }), NOW);
    expect(lovedRecent).toBeGreaterThan(mehAncient);
  });

  it('charges the same availability friction the first-watch verdict does', () => {
    const on = baseRewatchScore(candidate({ availableOn: ['Netflix'] }), NOW);
    const off = baseRewatchScore(candidate({ availableOn: [] }), NOW);
    expect(on - off).toBeCloseTo(12, 5);
  });
});

describe('the learned profile is bounded and starts as a no-op', () => {
  it('changes NOTHING until there are answers behind it', () => {
    const c = candidate({ timesWatched: 4 });
    expect(profileNudge(c, NEUTRAL_REWATCH_PROFILE, NOW)).toBe(0);
    expect(rewatchScore(c, NEUTRAL_REWATCH_PROFILE, NOW)).toBe(baseRewatchScore(c, NOW));
  });

  it('never moves the score by more than the cap, at any extreme', () => {
    const extremes: RewatchProfile[] = [
      { comfort: 1, cooling: 1, samples: 50 },
      { comfort: -1, cooling: 0, samples: 50 },
      { comfort: 1, cooling: 0, samples: 50 },
      { comfort: -1, cooling: 1, samples: 50 },
    ];
    for (const p of extremes) {
      for (const days of [22, 100, 400, 2000]) {
        for (const times of [1, 3, 9]) {
          const n = profileNudge(candidate({ lastWatchedAt: ago(days), timesWatched: times }), p, NOW);
          expect(Math.abs(n)).toBeLessThanOrEqual(PROFILE_NUDGE_MAX + 1e-9);
        }
      }
    }
  });

  it('a comfort watcher is pushed toward what they have seen many times, and a rediscoverer away', () => {
    const much = candidate({ timesWatched: 6 });
    const comfort = profileNudge(much, { comfort: 1, cooling: 0.5, samples: 20 }, NOW);
    const rediscover = profileNudge(much, { comfort: -1, cooling: 0.5, samples: 20 }, NOW);
    expect(comfort).toBeGreaterThan(0);
    expect(rediscover).toBeLessThan(0);
  });
});

describe('eligibility runs before scoring', () => {
  it('rules out a title they never watched — the R is for things you have seen', () => {
    const v = deliverReVerdict([candidate({ timesWatched: 0 })], NOW);
    expect(v.winner).toBeNull();
    expect(v.ruledOut[0]!.reason).toMatch(/not watched this one/i);
  });

  it('rules out an abandoned title as a DIFFERENT question, not a low score', () => {
    // Scoring it low would still let a beloved-looking rating float it up.
    const v = deliverReVerdict([candidate({ finished: false, userRating: 95 })], NOW);
    expect(v.winner).toBeNull();
    expect(v.ruledOut[0]!.reason).toMatch(/gave up on this one/i);
  });

  it('rules out something watched a fortnight ago as a repeat, not a decision', () => {
    const v = deliverReVerdict([candidate({ lastWatchedAt: ago(5) })], NOW);
    expect(v.ruledOut[0]!.reason).toMatch(/repeat, not a decision/i);
  });

  it('lets someone override the too-soon floor deliberately', () => {
    const v = deliverReVerdict([candidate({ lastWatchedAt: ago(5) })], NOW, NEUTRAL_REWATCH_PROFILE, {
      allowRecent: true,
    });
    expect(v.ruledOut).toHaveLength(0);
    expect(v.winner).not.toBeNull();
  });

  it('honours a runtime limit and an availability requirement', () => {
    const long = deliverReVerdict([candidate({ runtimeMinutes: 200 })], NOW, NEUTRAL_REWATCH_PROFILE, {
      maxRuntimeMinutes: 90,
    });
    expect(long.ruledOut[0]!.reason).toMatch(/longer than the 90/);

    const gone = deliverReVerdict([candidate({ availableOn: [] })], NOW, NEUTRAL_REWATCH_PROFILE, {
      requireAvailable: true,
    });
    expect(gone.ruledOut[0]!.reason).toMatch(/not on any service/i);
  });
});

describe('the ruling', () => {
  const a = candidate({ key: 'movie:1', title: 'Heat', userRating: 95, lastWatchedAt: ago(1200) });
  const b = candidate({ key: 'movie:2', title: 'Ronin', userRating: 60, lastWatchedAt: ago(300) });
  const c = candidate({ key: 'movie:3', title: 'Collateral', userRating: 70, lastWatchedAt: ago(500) });

  it('names a winner, a backup, and everything else in order', () => {
    const v = deliverReVerdict([b, a, c], NOW);
    expect(v.winner!.candidate.title).toBe('Heat');
    expect(v.backup).not.toBeNull();
    expect(v.alsoRan).toHaveLength(1);
    expect(v.winner!.score).toBeGreaterThanOrEqual(v.backup!.score);
  });

  it('reports a 9.5 as 9.5, never rounded up into a perfect score', () => {
    const v = deliverReVerdict([a, b], NOW);
    expect(v.margin).toMatch(/9\.5\/10 against 6\/10/);
  });

  it('never claims "you rated it" about a title the user never rated, and says so in the confidence line', () => {
    const unrated = candidate({ key: 'movie:9', title: 'Unrated', userRating: null, watchability: 99 });
    const other = candidate({ key: 'movie:8', title: 'Other', userRating: 40 });
    const v = deliverReVerdict([unrated, other], NOW);
    expect(v.winner!.strengths.join(' ')).not.toMatch(/you rated/);
    expect(v.winner!.strengths.join(' ')).toMatch(/never rated it/);
    expect(v.confidence).toMatch(/never said what you thought/);
  });

  it('cites availability only when availability actually differed', () => {
    const here = candidate({ key: 'movie:1', title: 'Here', availableOn: ['Max'] });
    const gone = candidate({ key: 'movie:2', title: 'Gone', availableOn: [] });
    expect(deliverReVerdict([here, gone], NOW).margin).toMatch(/is on a service you have/);

    const bothOn = deliverReVerdict([here, candidate({ key: 'movie:3', title: 'Also', availableOn: ['Max'] })], NOW);
    expect(bothOn.margin ?? '').not.toMatch(/service you have/);
  });

  it('says two level titles are level instead of inventing a separator', () => {
    const twin = (key: string, title: string) => candidate({ key, title, userRating: 80, lastWatchedAt: ago(400) });
    const v = deliverReVerdict([twin('movie:1', 'One'), twin('movie:2', 'Two')], NOW);
    expect(v.margin).toBeNull();
    expect(v.confidence).toMatch(/level/i);
  });

  it('returns nothing rather than a bad call when everything is ruled out', () => {
    const v = deliverReVerdict([candidate({ timesWatched: 0 }), candidate({ key: 'movie:2', finished: false })], NOW);
    expect(v.winner).toBeNull();
    expect(v.backup).toBeNull();
    expect(v.ruledOut).toHaveLength(2);
    expect(v.confidence).toMatch(/nothing on the docket/i);
  });

  it('is deterministic — the same docket rules the same way every time', () => {
    const once = deliverReVerdict([a, b, c], NOW);
    const twice = deliverReVerdict([c, b, a], NOW);
    expect(twice.winner!.candidate.key).toBe(once.winner!.candidate.key);
    expect(twice.backup!.candidate.key).toBe(once.backup!.candidate.key);
  });
});

describe('gapLabel', () => {
  it('reads the way a person would say it', () => {
    expect(gapLabel(21)).toBe('3 weeks');
    expect(gapLabel(90)).toBe('3 months');
    expect(gapLabel(730)).toBe('2 years');
    expect(gapLabel(null)).toBeNull();
  });
});
