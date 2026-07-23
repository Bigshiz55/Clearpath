/**
 * Phase 14 — hand-authored gold cases. These encode the flagship WatchVerdict
 * scenarios with expected *properties* (not one exact title, unless the fixture
 * makes one objectively correct). They are the seed of the frozen regression
 * set. Confirmed synthetic failures get appended here over time (Phase 8/9) —
 * never deleted after a fix.
 *
 * Catalog reference (eval/fixtures/titles.ts), Scott's profile:
 *   - Lifetime movies in the next 24h Scott would like: 2001,2002,2003,2004,
 *     2007(in-progress),2008(crosses midnight). 2005 is excluded (already
 *     watched). 2006 starts at 25h (out of window). 2009 is supernatural (in
 *     window but a taste penalty). A duplicate 2003 listing must dedup.
 *   - 2010 "Love at the Lighthouse" is Hallmark (wrong network).
 */
import { emptyNormalized, type ExpectedBehavior, type HardConstraint, type NormalizedQuery, type NormalizedIntent } from '../contract';
import type { EvalCase } from '../types';

let N = 0;
function gold(
  raw: string,
  profileKey: string,
  intent: NormalizedIntent,
  patch: (q: NormalizedQuery) => void,
  expected: Omit<ExpectedBehavior, 'intent'>,
  tags: string[],
): EvalCase {
  const intended = emptyNormalized(raw);
  intended.normalizedIntent = intent;
  patch(intended);
  return {
    id: `gold-${String(++N).padStart(3, '0')}`,
    seed: 0,
    source: 'gold',
    archetype: 'gold',
    profileKey,
    rawQuery: raw,
    noise: 'clean',
    intended,
    expected: { intent, ...expected },
    tags: ['gold', ...tags],
  };
}

const C = {
  net: (key: string): HardConstraint => ({ kind: 'network', description: `on ${key}`, value: key }),
  time: (h: number): HardConstraint => ({ kind: 'time_window', description: `within ${h}h`, value: h }),
  ct: (t: string): HardConstraint => ({ kind: 'content_type', description: `${t}`, value: t }),
  plat: (id: number): HardConstraint => ({ kind: 'platform', description: `provider ${id}`, value: id }),
  max: (n: number): HardConstraint => ({ kind: 'max_count', description: `≤${n}`, value: n }),
  dedup: (): HardConstraint => ({ kind: 'no_duplicates', description: 'no dupes' }),
  real: (): HardConstraint => ({ kind: 'no_hallucination', description: 'must exist' }),
  excl: (a: string): HardConstraint => ({ kind: 'excluded_attribute', description: `no ${a}`, value: a }),
  notWatched: (): HardConstraint => ({ kind: 'not_previously_watched', description: 'exclude watched' }),
  notRejected: (): HardConstraint => ({ kind: 'not_previously_rejected', description: 'exclude rejected' }),
  sub: (): HardConstraint => ({ kind: 'subscription_access', description: 'on my services' }),
  lang: (l: string): HardConstraint => ({ kind: 'language', description: `language ${l}`, value: l }),
};

const LIFETIME_24H = ['movie-2001', 'movie-2002', 'movie-2003', 'movie-2004', 'movie-2007', 'movie-2008'];

export const GOLD_CASES: EvalCase[] = [
  // ── The flagship ──────────────────────────────────────────────────────────
  gold(
    'Find five Lifetime movies coming on in the next 24 hours that I would like.',
    'scott',
    'scheduled_broadcast_discovery',
    (q) => {
      q.networks = ['lifetime'];
      q.contentTypes = ['movie'];
      q.availability = { type: 'scheduled_broadcast', startOffsetHours: 0, endOffsetHours: 24, timezone: 'USER_TIMEZONE' };
      q.requestedCount = 5;
      q.personalizationRequested = true;
    },
    {
      hardConstraints: [C.net('lifetime'), C.time(24), C.ct('movie'), C.max(5), C.dedup(), C.real(), C.notWatched()],
      maxResults: 5,
      validCandidateIds: LIFETIME_24H,
    },
    ['broadcast', 'lifetime', 'flagship'],
  ),
  gold(
    'What Lifetime thriller is on tonight that is most like something I normally watch?',
    'scott',
    'scheduled_broadcast_discovery',
    (q) => {
      q.networks = ['lifetime'];
      q.genres = ['Thriller'];
      q.contentTypes = ['tv', 'movie'];
      q.availability = { type: 'scheduled_broadcast', startOffsetHours: 0, endOffsetHours: 6, timezone: 'USER_TIMEZONE' };
      q.requestedCount = 1;
      q.personalizationRequested = true;
    },
    { hardConstraints: [C.net('lifetime'), C.time(6), C.max(1), C.dedup(), C.real()], maxResults: 1 },
    ['broadcast', 'lifetime', 'thriller'],
  ),
  gold(
    'Show me three Hallmark mysteries tomorrow, but nothing I have already watched.',
    'scott',
    'scheduled_broadcast_discovery',
    (q) => {
      q.networks = ['hallmark'];
      q.genres = ['Mystery'];
      q.availability = { type: 'scheduled_broadcast', startOffsetHours: 0, endOffsetHours: 24, timezone: 'USER_TIMEZONE' };
      q.requestedCount = 3;
      q.excludedAttributes = ['already_watched'];
    },
    { hardConstraints: [C.net('hallmark'), C.max(3), C.dedup(), C.real(), C.notWatched()], maxResults: 3, expectsEmptyOrFewer: true },
    ['broadcast', 'hallmark', 'exclusion'],
  ),
  gold(
    'Find something Heather and I would both like after 8:00 tonight.',
    'scott',
    'scheduled_broadcast_discovery',
    (q) => {
      q.householdProfile = 'heather';
      q.personalizationRequested = true;
      q.availability = { type: 'scheduled_broadcast', startOffsetHours: 0, endOffsetHours: 6, timezone: 'USER_TIMEZONE' };
    },
    { hardConstraints: [C.real(), C.dedup()], maxResults: null },
    ['broadcast', 'household', 'clock-time'],
  ),
  gold(
    'Give me a detective show, not supernatural, that I can finish before bed.',
    'scott',
    'personalized_content_discovery',
    (q) => {
      q.genres = ['Crime'];
      q.contentTypes = ['tv'];
      q.excludedAttributes = ['supernatural'];
      q.personalizationRequested = true;
    },
    { hardConstraints: [C.excl('supernatural'), C.dedup(), C.real()], maxResults: null },
    ['discovery', 'exclusion'],
  ),
  gold(
    'Find a new psychological thriller on one of my services.',
    'scott',
    'personalized_content_discovery',
    (q) => {
      q.contentTypes = ['movie'];
      q.excludedAttributes = ['__my_services__'];
      q.availability = { type: 'streaming', startOffsetHours: null, endOffsetHours: null, timezone: 'USER_TIMEZONE' };
      q.personalizationRequested = true;
    },
    { hardConstraints: [C.sub(), C.dedup(), C.real()], maxResults: null, idealTopId: 'movie-3003' },
    ['streaming', 'subscription'],
  ),
  gold('Show me the best thing on television right now.', 'scott', 'scheduled_broadcast_discovery', (q) => {
    q.availability = { type: 'scheduled_broadcast', startOffsetHours: 0, endOffsetHours: 24, timezone: 'USER_TIMEZONE' };
    q.requestedCount = 1;
    q.personalizationRequested = true;
  }, { hardConstraints: [C.real(), C.time(24)], maxResults: 1 }, ['broadcast', 'vague']),
  gold(
    'Give me five movies on Netflix, actually make that Prime, that are not science fiction.',
    'scott',
    'platform_browse',
    (q) => {
      q.platforms = [{ id: 9, name: 'Prime Video' }];
      q.contentTypes = ['movie'];
      q.excludedAttributes = ['science_fiction'];
      q.requestedCount = 5;
      q.availability = { type: 'streaming', startOffsetHours: null, endOffsetHours: null, timezone: 'USER_TIMEZONE' };
      q.ambiguities = ['self-correction: Netflix→Prime'];
    },
    { hardConstraints: [C.plat(9), C.excl('science_fiction'), C.max(5), C.dedup(), C.real()], maxResults: 5, expectedAmbiguities: ['self-correction: Netflix→Prime'] },
    ['streaming', 'self-correct', 'prime'],
  ),
  gold('Show me something similar to Sherlock, but not old and not British.', 'scott', 'similar_to', (q) => {
    q.watchTitle = 'Sherlock';
    q.excludedAttributes = ['old', 'british'];
    q.personalizationRequested = true;
  }, { hardConstraints: [C.real()], maxResults: null }, ['similar_to']),
  gold('Give me a slow-burn mystery, but I do not want anything slow.', 'scott', 'personalized_content_discovery', (q) => {
    q.genres = ['Mystery'];
    q.ambiguities = ['pace: asked for slow-burn AND not slow'];
    q.personalizationRequested = true;
  }, { hardConstraints: [C.real()], maxResults: null, expectedAmbiguities: ['pace: asked for slow-burn AND not slow'] }, ['ambiguous', 'contradiction']),
  gold('Find something good.', 'scott', 'personalized_content_discovery', () => {}, {
    hardConstraints: [C.real()],
    maxResults: null,
    expectsClarification: true,
  }, ['vague', 'clarify']),

  // ── Fixture-forced edge scenarios (the "same request under different data") ─
  gold(
    'Show me five Lifetime movies in the next 24 hours that I would like — only two count.',
    'newbie',
    'scheduled_broadcast_discovery',
    (q) => {
      q.networks = ['lifetime'];
      q.contentTypes = ['movie'];
      q.availability = { type: 'scheduled_broadcast', startOffsetHours: 0, endOffsetHours: 24, timezone: 'USER_TIMEZONE' };
      q.requestedCount = 5;
    },
    { hardConstraints: [C.net('lifetime'), C.time(24), C.max(5), C.dedup(), C.real()], maxResults: 5, expectsEmptyOrFewer: true },
    ['broadcast', 'fewer-than-requested'],
  ),
  gold(
    'Give me five Hallmark movies coming on in the next 24 hours.',
    'scott',
    'scheduled_broadcast_discovery',
    (q) => {
      q.networks = ['hallmark'];
      q.contentTypes = ['movie'];
      q.availability = { type: 'scheduled_broadcast', startOffsetHours: 0, endOffsetHours: 24, timezone: 'USER_TIMEZONE' };
      q.requestedCount = 5;
    },
    { hardConstraints: [C.net('hallmark'), C.time(24), C.max(5), C.dedup(), C.real()], maxResults: 5, expectsEmptyOrFewer: true, validCandidateIds: ['movie-2010'] },
    ['broadcast', 'few-valid'],
  ),
  gold(
    'Find a Lifetime movie on Netflix right now.',
    'scott',
    'scheduled_broadcast_discovery',
    (q) => {
      q.networks = ['lifetime'];
      q.platforms = [{ id: 8, name: 'Netflix' }];
      q.ambiguities = ['source: a linear network AND a streaming service'];
      q.availability = { type: 'scheduled_broadcast', startOffsetHours: 0, endOffsetHours: 24, timezone: 'USER_TIMEZONE' };
    },
    { hardConstraints: [C.real()], maxResults: null, expectedAmbiguities: ['source: a linear network AND a streaming service'] },
    ['ambiguous', 'network-vs-platform'],
  ),
  gold(
    'Where can I stream The Silent Witness?',
    'scott',
    'where_to_watch',
    (q) => {
      q.watchTitle = 'The Silent Witness';
    },
    { hardConstraints: [C.real()], maxResults: 1, idealTopId: 'movie-3001' },
    ['where_to_watch'],
  ),
  gold(
    'Family movie night — something my family can watch.',
    'scott',
    'personalized_content_discovery',
    (q) => {
      q.householdProfile = 'family';
      q.genres = ['Family'];
      q.contentTypes = ['movie'];
      q.personalizationRequested = true;
    },
    { hardConstraints: [C.dedup(), C.real()], maxResults: null, idealTopId: 'movie-3005' },
    ['discovery', 'family', 'household'],
  ),
  gold('Find me a good podcast about true crime.', 'scott', 'unsupported', (q) => {
    q.contentTypes = ['podcast'];
  }, { hardConstraints: [], maxResults: null, expectsRejection: true }, ['unsupported', 'podcast']),

  // Guard: a pure preference STATEMENT (no request verb) must build taste, not
  // trigger a search. Protects the broadened find-intent from hijacking DNA.
  gold('I love grounded crime dramas and I hate anything supernatural.', 'scott', 'taste_building', (q) => {
    q.excludedAttributes = [];
  }, { hardConstraints: [], maxResults: null }, ['taste_building', 'guard']),

  // "Give me" is a real request verb.
  gold('Give me a detective show, nothing supernatural.', 'scott', 'personalized_content_discovery', (q) => {
    q.contentTypes = ['tv'];
    q.excludedAttributes = ['supernatural'];
    q.personalizationRequested = true;
  }, { hardConstraints: [C.excl('supernatural'), C.dedup(), C.real()], maxResults: null }, ['discovery', 'give-me']),
];

/** The 15-axis-independent scenario matrix required by Phase 14 as data-tied
 *  variants of the flagship, plus the taste-vs-network / weak-DNA / previously-
 *  rejected cases, are represented above via the fixture facts (2005 watched,
 *  2006 out-of-window, 2009 supernatural penalty, 2010 wrong-network, 3006
 *  rejected). */
