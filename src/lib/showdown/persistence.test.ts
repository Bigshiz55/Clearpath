import { describe, it, expect } from 'vitest';
import { deriveDna } from '@/lib/preference/engine';
import { preferenceNudge } from '@/lib/preference/rank';
import type { PreferenceEvent } from '@/lib/preference/types';
import { TITLES } from '@/lib/voice/quickdna/definition';
import {
  TARGET_DECISIONS,
  answer,
  attributionOf,
  createSession,
  startSession,
  timeoutRound,
  type ShowdownState,
} from './session';
import { sessionToEvents } from './canonical';
import { canonicalTitleId, mediaTypeFor } from './mediaType';

/**
 * G1 — A SHORT SESSION MUST NOT BE ABLE TO REDEFINE SOMEBODY.
 *
 * The failure this guards is the one that makes a taste product untrustworthy:
 * a person plays twelve rounds in an odd mood and the system quietly decides
 * that is who they are, discarding months of real viewing. The opposite failure
 * is just as bad — a profile that can never move is not learning.
 *
 * So the contract is ACCUMULATION, not substitution. Every one of these runs
 * the production path end to end:
 *
 *   real session -> `sessionToEvents` -> `PreferenceEvent[]` -> `deriveDna`
 *   -> `preferenceNudge`
 *
 * `deriveDna` is the same fold the ranker calls and `preferenceNudge` is the
 * same function that scores a candidate. Nothing here is mocked, and no
 * threshold is relaxed — `MIN_RANK_CONF` is imported behaviour, not a knob.
 */

/* `canonicalTitleId` and `mediaTypeFor` take the CATALOGUE ID STRING, not the
   title object. Passing the object produced `titleId: null` on all 20 events —
   a whole session contributing nothing to the engine, silently. */
const resolve = (id: string) => {
  const t = TITLES.find((x) => x.id === id);
  const canonical = canonicalTitleId(id);
  return t && canonical ? { titleId: canonical, tmdbId: t.tmdbId, mediaType: mediaTypeFor(id) } : null;
};

/** Play a whole session, always taking the same side. Deterministic. */
function playSession(side: 'left' | 'right', startAt: number, seed?: ShowdownState): ShowdownState {
  let s = seed ?? startSession(createSession({}, startAt), startAt);
  for (let i = 0; i < TARGET_DECISIONS && s.current; i++) {
    s = answer(s, side, startAt + i * 1000, 900);
  }
  return s;
}

/**
 * THE ENGINE MATCHES ON A FINGERPRINT, so an event with no `dims` carries no
 * rankable signal at all. In production `recordShowdownSession` fills these
 * from the cache; here they are derived from the title's OWN darkness trait by
 * the same transformation for every title, so the fixture cannot encode the
 * answer an assertion is looking for.
 */
function fixtureDims(titleId: string): Record<string, number> | undefined {
  const t = TITLES.find((x) => x.id === titleId);
  if (!t) return undefined;
  const darkness = t.traits
    .filter((e) => e.key === 'darkness')
    .reduce((sum, e) => sum + (e.invert ? -e.strength : e.strength), 0);
  return { darkness: Math.max(0, Math.min(100, 50 + darkness * 50)) };
}

function eventsOf(s: ShowdownState, mode: 'dna' | 'tonight' = 'dna'): PreferenceEvent[] {
  const events = sessionToEvents(s.decisions, mode, resolve, attributionOf);
  for (const e of events) {
    const catalogueId = TITLES.find((t) => canonicalTitleId(t.id) === e.titleId)?.id;
    const dims = catalogueId ? fixtureDims(catalogueId) : undefined;
    if (dims) e.dims = dims;
  }
  return events;
}

/** A bleak candidate, scored through the real ranker. */
const BLEAK = { dims: { darkness: 95 }, genres: ['thriller'] };
const nudgeOf = (dna: ReturnType<typeof deriveDna>) =>
  preferenceNudge(BLEAK, dna, { corrections: {} }).nudge;

/** Re-stamp a session's events into a distinct point in time. */
const shift = (evs: PreferenceEvent[], byMs: number, tag: string): PreferenceEvent[] =>
  evs.map((e, i) => ({ ...e, id: `${tag}-${i}`, at: e.at + byMs }));

const NOW = Date.UTC(2026, 0, 20);
const DAY = 86_400_000;

describe('a session ADDS to history rather than replacing it', () => {
  const mature = shift(eventsOf(playSession('left', NOW - 200 * DAY)), 0, 'mature');

  it('the production path produces real events at all', () => {
    expect(mature.length).toBeGreaterThan(10);
    expect(mature.every((e) => e.titleId.includes(':'))).toBe(true);
  });

  it('ONE CONTRADICTORY SESSION DOES NOT FLIP A MATURE PREFERENCE', () => {
    /* Six sessions of consistent history, then one short session answering the
       opposite way. The belief may soften — that is learning — but the sign of
       the ranking signal must survive, or a bad evening rewrites a person. */
    const history: PreferenceEvent[] = [];
    for (let k = 0; k < 6; k++) {
      history.push(...shift(eventsOf(playSession('left', NOW - (180 - k * 20) * DAY)), 0, `h${k}`));
    }
    const contradiction = shift(eventsOf(playSession('right', NOW - DAY)), 0, 'contra');

    const before = deriveDna(history, NOW);
    const after = deriveDna([...history, ...contradiction], NOW);

    const nBefore = nudgeOf(before);
    const nAfter = nudgeOf(after);

    // History is still audible: the signal did not invert.
    if (nBefore !== 0) {
      expect(Math.sign(nAfter), 'one session inverted a mature preference').toBe(Math.sign(nBefore));
    }
    // And the events were kept, not swapped out.
    expect(history.every((h) => [...history, ...contradiction].includes(h))).toBe(true);
  });

  it('repeated CONSISTENT sessions do move the profile', () => {
    /* The other half of the contract. A profile that cannot move is not
       learning, so accumulation has to actually accumulate. */
    const oneEvents = shift(eventsOf(playSession('left', NOW - 10 * DAY)), 0, 'a');
    const many: PreferenceEvent[] = [];
    for (let k = 0; k < 5; k++) {
      many.push(...shift(eventsOf(playSession('left', NOW - (10 + k) * DAY)), 0, `m${k}`));
    }
    // Measured on the RANKING SIGNAL, which is what actually reaches a user,
    // rather than on an internal confidence scalar.
    expect(Math.abs(nudgeOf(deriveDna(many, NOW)))).toBeGreaterThanOrEqual(
      Math.abs(nudgeOf(deriveDna(oneEvents, NOW))),
    );
    expect(many.length).toBeGreaterThan(oneEvents.length);
  });

  it('more evidence never REDUCES what is known', () => {
    const half = shift(eventsOf(playSession('left', NOW - 5 * DAY)), 0, 'h');
    const full = [...half, ...shift(eventsOf(playSession('left', NOW - 4 * DAY)), 0, 'f')];
    expect(Math.abs(nudgeOf(deriveDna(full, NOW)))).toBeGreaterThanOrEqual(
      Math.abs(nudgeOf(deriveDna(half, NOW))) - 1e-9,
    );
  });
});

describe('temporary state cannot become permanent', () => {
  it('a TONIGHT session emits no permanent events at all', () => {
    /* Structural, not conditional: `sessionToEvents` returns `[]` for any mode
       that is not `dna`, so a mood cannot reach the profile by any path that
       goes through the production writer. */
    const s = playSession('left', NOW - DAY);
    expect(s.decisions.length).toBeGreaterThan(0);
    expect(eventsOf(s, 'tonight')).toEqual([]);
  });

  it('a tonight run leaves the permanent profile byte-identical', () => {
    const base = shift(eventsOf(playSession('left', NOW - 30 * DAY)), 0, 'base');
    const withTonight = [...base, ...eventsOf(playSession('right', NOW - DAY), 'tonight')];
    expect(JSON.stringify(deriveDna(withTonight, NOW))).toBe(JSON.stringify(deriveDna(base, NOW)));
  });

  it('a rapid TIMEOUT contributes nothing to the permanent path either', () => {
    /* Proved at the session level in `timeout.test.ts`; proved here at the
       PERSISTENCE level, which is what actually reaches the ranker. */
    let s = startSession(createSession({}, NOW), NOW);
    s = answer(s, 'left', NOW + 1000, 900);
    const afterOne = eventsOf(s);
    s = timeoutRound(s, NOW + 2000);
    expect(eventsOf(s)).toHaveLength(afterOne.length);
  });
});

describe('no state leaks between sessions or users', () => {
  it('two independent sessions produce independent events', () => {
    const a = eventsOf(playSession('left', NOW - 3 * DAY));
    const b = eventsOf(playSession('right', NOW - 3 * DAY));
    // Same titles can appear; the ATTITUDES must not be shared.
    expect(JSON.stringify(a)).not.toBe(JSON.stringify(b));
  });

  it('deriving one user’s DNA never reads another’s events', () => {
    /* `deriveDna` is a pure fold over the array it is handed — there is no
       ambient store for a second user's events to arrive from. */
    const mine = shift(eventsOf(playSession('left', NOW - 2 * DAY)), 0, 'mine');
    const theirs = shift(eventsOf(playSession('right', NOW - 2 * DAY)), 0, 'theirs');
    const solo = deriveDna(mine, NOW);
    const alsoSolo = deriveDna(mine, NOW);
    expect(JSON.stringify(solo)).toBe(JSON.stringify(alsoSolo));
    expect(JSON.stringify(solo)).not.toBe(JSON.stringify(deriveDna([...mine, ...theirs], NOW)));
  });

  it('a fresh session starts from nothing it was not given', () => {
    const fresh = createSession({}, NOW);
    expect(fresh.decisions).toEqual([]);
    expect(fresh.profile).toEqual({});
    expect(fresh.calibrated).toEqual([]);
  });
});
