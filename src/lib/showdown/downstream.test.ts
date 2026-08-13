import { describe, it, expect } from 'vitest';
import { deriveDna } from '@/lib/preference/engine';
import { effectiveTaste } from '@/lib/preference/explain';
import { preferenceNudge } from '@/lib/preference/rank';
import type { PreferenceEvent } from '@/lib/preference/types';
import { TITLES } from '@/lib/voice/quickdna/definition';
import {
  TARGET_DECISIONS,
  answer,
  attributionOf,
  createSession,
  startSession,
  type ShowdownState,
} from './session';
import { decisionToEvents, sessionToEvents } from './canonical';
import { canonicalTitleId, mediaTypeFor } from './mediaType';
import { accumulateSession } from './evidence';
import { applyTonight } from './tonight';

/**
 * DOES ANY OF THIS ACTUALLY REACH THE RECOMMENDER?
 *
 * The version of Showdown this replaced was a closed loop: it wrote a profile
 * to localStorage that nothing else read, so every calibration answer changed
 * its own results screen and nothing else in the product. A calibration that
 * does not move recommendations is a quiz, not a calibration.
 *
 * These run the REAL canonical engine — the same `deriveDna` fold and the same
 * `preferenceNudge` the ranker calls — over events produced by a real Showdown
 * session, and assert the ranking signal actually moves. They stop short of a
 * live database (that is `store.int.test.ts`'s job and needs credentials); what
 * is proved here is the whole pure chain from a tap to a rank delta.
 */

const resolve = (id: string) => {
  const t = TITLES.find((x) => x.id === id);
  const canonical = canonicalTitleId(id);
  return t && canonical ? { titleId: canonical, tmdbId: t.tmdbId, mediaType: mediaTypeFor(id) } : null;
};

/** Play `rounds` full sessions, always taking whichever side is darker (or lighter). */
function playRounds(mode: 'dna' | 'tonight', prefer: 'dark' | 'light', rounds: number) {
  let s = startSession(createSession({}, 0, mode), 0);
  const decisions: ShowdownState['decisions'] = [];
  for (let r = 0; r < rounds; r++) {
    s = startSession(createSession({ profile: s.profile, seenPairs: s.seenPairs }, 0, mode), 0);
    for (let i = 0; i < TARGET_DECISIONS + 4 && s.current; i++) {
      const { left, right } = s.current;
      const darkness = (t: typeof left) =>
        t.traits.filter((e) => e.key === 'darkness').reduce((sum, e) => sum + (e.invert ? -e.strength : e.strength), 0);
      const leftDarker = darkness(left) >= darkness(right);
      const takeLeft = prefer === 'dark' ? leftDarker : !leftDarker;
      s = answer(s, takeLeft ? 'left' : 'right', 1000 + r * 100 + i, 900);
    }
    decisions.push(...s.decisions);
  }
  return { state: s, decisions };
}

/** Play a full session, always taking whichever side is darker. */
function playToward(mode: 'dna' | 'tonight', prefer: 'dark' | 'light'): ShowdownState {
  let s = startSession(createSession({}, 0, mode), 0);
  for (let i = 0; i < TARGET_DECISIONS + 4 && s.current; i++) {
    const { left, right } = s.current;
    const darkness = (t: typeof left) =>
      t.traits.filter((e) => e.key === 'darkness').reduce((sum, e) => sum + (e.invert ? -e.strength : e.strength), 0);
    const leftDarker = darkness(left) >= darkness(right);
    const takeLeft = prefer === 'dark' ? leftDarker : !leftDarker;
    s = answer(s, takeLeft ? 'left' : 'right', 1000 + i, 900);
  }
  return s;
}

/**
 * A stand-in for the `title_dimensions` cache the server action reads.
 *
 * THE ENGINE MATCHES ON A TITLE'S FINGERPRINT, so an event with no `dims`
 * carries no rankable signal at all — both nudges come back 0 and the chain is
 * silently inert. That is not a test artifact: it is a real deployment
 * dependency this test exists to make visible. In production
 * `recordShowdownSession` fills `dims` from the cache; a diagnostic title with
 * no cached fingerprint contributes nothing to ranking, however cleanly it was
 * answered.
 *
 * Derived here from the title's own `darkness` trait rather than invented per
 * title, so the fixture cannot accidentally encode the answer the assertion is
 * looking for — it is the same transformation for every title, in both runs.
 */
function fixtureDims(titleId: string): Record<string, number> | undefined {
  const t = TITLES.find((x) => x.id === titleId);
  if (!t) return undefined;
  const darkness = t.traits
    .filter((e) => e.key === 'darkness')
    .reduce((sum, e) => sum + (e.invert ? -e.strength : e.strength), 0);
  return { darkness: Math.max(0, Math.min(100, 50 + darkness * 50)) };
}

function eventsFor(state: ShowdownState): PreferenceEvent[] {
  return eventsFor2(state.decisions, state.mode);
}

function eventsFor2(
  decisions: ShowdownState['decisions'],
  mode: 'dna' | 'tonight' = 'dna',
): PreferenceEvent[] {
  const events = sessionToEvents(decisions, mode, resolve, () => 0.9);
  for (const e of events) {
    const catalogueId = TITLES.find((t) => `${mediaTypeFor(t.id)}:${t.tmdbId}` === e.titleId)?.id;
    const dims = catalogueId ? fixtureDims(catalogueId) : undefined;
    if (dims) e.dims = dims;
  }
  return events;
}

describe('Build My DNA changes the canonical profile, and the ranking with it', () => {
  it('produces canonical events the real engine can fold', () => {
    const played = playToward('dna', 'dark');
    const events = eventsFor(played);
    expect(events.length, 'a full calibration produced no canonical events').toBeGreaterThan(4);

    const dna = deriveDna(events, Date.now());
    // ATTRACTION is the channel a head-to-head belongs to; the engine must have
    // actually accumulated there, not merely accepted the rows.
    expect(dna.attraction.samples, 'the engine folded nothing into attraction').toBeGreaterThan(0);
    expect(dna.experience.samples, 'a head-to-head was mis-filed as watched').toBe(0);
  });

  it('one session moves the canonical belief in the expected direction', () => {
    const dark = deriveDna(eventsFor(playToward('dna', 'dark')), Date.now());
    const light = deriveDna(eventsFor(playToward('dna', 'light')), Date.now());

    const dPref = effectiveTaste(dark)['darkness']!;
    const lPref = effectiveTaste(light)['darkness']!;

    // The BELIEF moves after a single run, and in opposite directions for
    // opposite play. Whether it is yet confident enough to act on is the next
    // case — these are two different claims and conflating them is how "the
    // profile changed" gets mistaken for "the recommendations changed".
    expect(dPref.pref, 'picking bleak films did not raise the darkness belief').toBeGreaterThan(60);
    expect(lPref.pref, 'avoiding bleak films did not lower the darkness belief').toBeLessThan(dPref.pref);
    expect(dPref.polarity).toBe(1);
  });

  it('two sessions cross the ranker’s confidence floor and change the ranking', () => {
    /* MEASURED, NOT ASSUMED. One 12-decision run reaches confidence 0.190 on
       `darkness`, just under the engine's MIN_RANK_CONF of 0.25, so it moves
       the belief without yet moving the order. Two runs reach 0.338 and produce
       a real nudge of about +3. That is a product fact worth pinning: a single
       Showdown is a down-payment on personalisation, not the whole of it, and
       anything claiming otherwise on the results screen would be overselling. */
    const dark = deriveDna(eventsFor2(playRounds('dna', 'dark', 2).decisions), Date.now());
    const light = deriveDna(eventsFor2(playRounds('dna', 'light', 2).decisions), Date.now());

    const bleak = { dims: { darkness: 95, humor: 5 }, genres: ['thriller'] };
    const dNudge = preferenceNudge(bleak, dark, { corrections: {} }).nudge;
    const lNudge = preferenceNudge(bleak, light, { corrections: {} }).nudge;

    expect(dNudge, 'two calibrations still did not reach the ranker').toBeGreaterThan(0);
    expect(
      dNudge,
      'calibrating toward bleak films did not rank bleak content above calibrating away from them',
    ).toBeGreaterThan(lNudge);
  });

  it('a calibration with no events leaves the ranking untouched', () => {
    const empty = deriveDna([], Date.now());
    const nudge = preferenceNudge({ dims: { darkness: 95 }, genres: [] }, empty, { corrections: {} }).nudge;
    expect(nudge).toBe(0);
  });
});

/**
 * DOES THE NEW EVIDENCE ACTUALLY CHANGE THE ORDER?
 *
 * A richer game that produces an identical ranking is a richer RESULTS SCREEN
 * and nothing more — which is the failure mode the whole rebuild is against. So
 * these hold one session's picks completely fixed and vary ONLY the follow-up
 * answers, then read the nudge the real ranker would apply. Any difference is
 * attributable to the second question and to nothing else: same pairs, same
 * verdicts, same timestamps, same fingerprints.
 */
describe('the follow-up answers reach the ranker', () => {
  const played = playToward('dna', 'dark');

  /**
   * Re-file every pick with the same follow-up answer.
   *
   * THE REAL ATTRIBUTION, not the 0.9 the older cases pin. 0.9 is a Twist —
   * already the top of the inferred ladder — so a follow-up could not possibly
   * change anything there, and a test that used it would prove the feature does
   * nothing rather than proving the fixture was wrong. Real sweep matchups sit
   * near 0.3, which is where the second question earns its second.
   */
  function withFollowUp(patch: Partial<ShowdownState['decisions'][number]>) {
    const decisions = played.decisions.map((d) => ({ ...d, ...patch }));
    const events = sessionToEvents(decisions, 'dna', resolve, (d) =>
      attributionOf(d as ShowdownState['decisions'][number]),
    );
    for (const e of events) {
      const catalogueId = TITLES.find((t) => `${mediaTypeFor(t.id)}:${t.tmdbId}` === e.titleId)?.id;
      const dims = catalogueId ? fixtureDims(catalogueId) : undefined;
      if (dims) e.dims = dims;
    }
    return events;
  }

  const bleak = { dims: { darkness: 95, humor: 5 }, genres: ['thriller'] };
  const nudgeOf = (events: PreferenceEvent[]) =>
    preferenceNudge(bleak, deriveDna(events, Date.now()), { corrections: {} }).nudge;

  it('"watching that tonight" outranks "just better than the other one"', () => {
    const must = nudgeOf(withFollowUp({ intensity: 'must' }));
    const relative = nudgeOf(withFollowUp({ intensity: 'relative' }));

    expect(must, 'a stated appetite produced no ranking signal at all').toBeGreaterThan(0);
    expect(
      must,
      'saying "I am watching that tonight" ranked no higher than "it was just the better of two"',
    ).toBeGreaterThan(relative);
  });

  it('a named reason outranks the same pick left unexplained', () => {
    const explained = nudgeOf(withFollowUp({ reason: 'darkness:hi' }));
    const silent = nudgeOf(withFollowUp({}));

    expect(
      explained,
      'explaining every pick changed the ranking not at all — the reason never crossed to the engine',
    ).toBeGreaterThan(silent);
  });

  it('but a gut call is honoured as the non-answer it is', () => {
    const gut = nudgeOf(withFollowUp({ reason: 'gut' }));
    const silent = nudgeOf(withFollowUp({}));
    expect(gut, '"just a gut call" was banked as if it had named an axis').toBe(silent);
  });

  it('and a stated appetite beats an inferred one, whichever way it points', () => {
    // The ordering must be total, not merely "must beats relative": a ladder
    // with a hole in it is how one rung silently stops meaning anything.
    const must = nudgeOf(withFollowUp({ intensity: 'must' }));
    const keen = nudgeOf(withFollowUp({ intensity: 'keen' }));
    const relative = nudgeOf(withFollowUp({ intensity: 'relative' }));
    expect(must).toBeGreaterThan(keen);
    expect(keen).toBeGreaterThan(relative);
  });
});

describe('"Both" is two answers, not a coin toss', () => {
  it('records positive interest in BOTH titles', () => {
    const events = decisionToEvents(
      { leftId: 'a', rightId: 'b', verdict: 'both', at: 1, responseMs: 500 },
      {
        left: { titleId: 'movie:1', tmdbId: 1, mediaType: 'movie' },
        right: { titleId: 'movie:2', tmdbId: 2, mediaType: 'movie' },
      },
      0.6,
    );
    /* THE DEFECT THIS PINS. `both` existed in the engine before it existed on
       screen, and the canonical crossing had no branch for it — it fell through
       `verdict === 'left' ? left : right` and filed "I want both of these" as a
       vote for whichever poster happened to be on the right. Half the answer
       was discarded and a preference nobody expressed was invented, silently,
       for as long as no control could produce the verdict. */
    expect(events.map((e) => e.titleId).sort()).toEqual(['movie:1', 'movie:2']);
    expect(events.every((e) => e.action === 'unseen_interested')).toBe(true);
  });
});

describe('Pick for tonight changes ranking without touching the profile', () => {
  it('writes nothing canonical, so the permanent profile is identical', () => {
    const before = deriveDna([], Date.now());
    const played = playToward('tonight', 'dark');
    const events = eventsFor(played);

    expect(events, 'a tonight session reached the canonical log').toEqual([]);
    const after = deriveDna(events, Date.now());
    expect(JSON.stringify(after), 'tonight changed the permanent profile').toBe(JSON.stringify(before));
  });

  it('still reorders the current session', () => {
    const played = playToward('tonight', 'dark');
    expect(played.decisions.length).toBeGreaterThan(4);

    const items = TITLES.slice(0, 10).map((t) => ({ id: t.id, score: 50, traits: t.traits }));
    const ranked = applyTonight(items, played.lean);
    const moved = ranked.some((r) => r.tonightNudge !== 0);
    expect(moved, 'a full tonight session did not bend the ranking at all').toBe(true);
  });

  it('and clearing the session removes the bias entirely', () => {
    const played = playToward('tonight', 'dark');
    const items = TITLES.slice(0, 10).map((t) => ({ id: t.id, score: 50, traits: t.traits }));

    const withNight = applyTonight(items, played.lean).map((r) => r.id);
    const cleared = applyTonight(items, null).map((r) => r.id);

    expect(cleared, 'clearing the night did not restore the original order').toEqual(items.map((i) => i.id));
    expect(withNight, 'the night never changed anything, so the restore proves nothing').not.toEqual(cleared);
  });

  it('an expired context is indistinguishable from never having played', () => {
    // Expiry is just "the lean is gone" — there is no state to unwind, which is
    // the property that makes session context safe to throw away at any moment.
    const items = TITLES.slice(0, 10).map((t) => ({ id: t.id, score: 50, traits: t.traits }));
    const expired = applyTonight(items, accumulateSession({}, []));
    const never = applyTonight(items, null);
    expect(expired.map((r) => r.id)).toEqual(never.map((r) => r.id));
  });
});
