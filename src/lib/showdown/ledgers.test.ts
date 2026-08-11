import { describe, it, expect } from 'vitest';
import { TITLES } from '@/lib/voice/quickdna/definition';
import { TRAIT_KEYS, traitBelief, type TraitKey, type TraitProfile } from '@/lib/voice/quickdna/traits';
import {
  TARGET_DECISIONS,
  answer,
  createSession,
  evidenceFor,
  markUnseen,
  permanentEvidenceFor,
  sessionEvidenceFor,
  startSession,
  type ShowdownState,
} from './session';
import { applyPermanent, accumulateSession } from './evidence';
import { hasTonightContext, tonightNudge, applyTonight, TONIGHT_NUDGE_MAX } from './tonight';
import { sessionToEvents, gradeForAttribution } from './canonical';
import { canonicalTitleId, mediaTypeFor, TV_TITLE_IDS } from './mediaType';
import { TWIST_ATTRIBUTION_MIN } from './attribution';

/**
 * THE TWO LEDGERS, AND THE ONE THING THAT MUST NEVER HAPPEN.
 *
 * Tonight is a mood. Taste DNA is an identity. The entire point of this rebuild
 * is that the first can never be written into the second, and these are the
 * cases that would catch it if it ever could — asserted on BEHAVIOUR, because a
 * type signature is checked at build time and a future `as` cast would sail
 * straight past it.
 */

const byId = (id: string) => TITLES.find((t) => t.id === id)!;
const matchup = {
  left: byId('se7en'),
  right: byId('knives-out'),
  testing: ['darkness' as TraitKey],
  gain: 1,
  attribution: 1,
  twist: false,
};

/** Play a whole session, always taking the left film. */
function playAll(mode: 'dna' | 'tonight', seed: TraitProfile = {}): ShowdownState {
  let s = startSession(createSession({ profile: seed }, 0, mode), 0);
  for (let i = 0; i < TARGET_DECISIONS + 4 && s.current; i++) {
    s = answer(s, i % 3 === 2 ? 'neither' : 'left', 1000 + i, 900);
  }
  return s;
}

describe('a tonight session cannot move permanent Taste DNA', () => {
  it('leaves the profile byte-identical across a whole session', () => {
    const seeded = applyPermanent({}, permanentEvidenceFor(matchup, 'left'));
    const before = JSON.stringify(seeded);

    const played = playAll('tonight', seeded);

    expect(played.decisions.length, 'the session did not actually run').toBeGreaterThan(4);
    expect(JSON.stringify(played.profile), 'a tonight session mutated permanent DNA').toBe(before);
  });

  it('returns the SAME profile object, not an equal copy', () => {
    // Reference equality is the stronger claim: it proves no write was even
    // attempted, rather than that a write happened to be a no-op.
    const seeded: TraitProfile = applyPermanent({}, permanentEvidenceFor(matchup, 'left'));
    let s = startSession(createSession({ profile: seeded }, 0, 'tonight'), 0);
    s = answer(s, 'left', 1000, 900);
    expect(s.profile).toBe(seeded);
  });

  it('produces session evidence and no permanent evidence', () => {
    const ev = evidenceFor(matchup, 'left', 'tonight');
    expect(ev.session.length, 'tonight taught nothing at all').toBeGreaterThan(0);
    expect(ev.permanent, 'tonight produced permanent evidence').toEqual([]);
  });

  it('and dna mode is the exact mirror', () => {
    const ev = evidenceFor(matchup, 'left', 'dna');
    expect(ev.permanent.length).toBeGreaterThan(0);
    expect(ev.session, 'dna mode produced session evidence').toEqual([]);
  });

  it('session evidence carries no belief fields at all', () => {
    // It is not a weakened belief — it is a different kind of thing. If a
    // `target`/`weight` ever appears here, `applyPermanent` would start
    // accepting it and the wall is gone.
    for (const e of sessionEvidenceFor(matchup, 'left')) {
      expect(e.kind).toBe('session');
      expect(e).not.toHaveProperty('target');
      expect(e).not.toHaveProperty('weight');
      expect(typeof e.lean).toBe('number');
    }
  });

  it('a tonight session writes NOTHING to the canonical log', () => {
    const played = playAll('tonight');
    const events = sessionToEvents(
      played.decisions,
      played.mode,
      (id) => {
        const cid = canonicalTitleId(id);
        const t = TITLES.find((x) => x.id === id)!;
        return cid ? { titleId: cid, tmdbId: t.tmdbId, mediaType: mediaTypeFor(id) } : null;
      },
      () => 1,
    );
    expect(events, 'tonight reached the permanent event log').toEqual([]);
  });
});

describe('a dna session does write permanent evidence', () => {
  it('moves beliefs and records canonical events', () => {
    const played = playAll('dna');
    const moved = TRAIT_KEYS.filter((k) => traitBelief(played.profile, k).evidence > 0);
    expect(moved.length, 'a full DNA session learned nothing').toBeGreaterThan(3);

    const events = sessionToEvents(
      played.decisions,
      played.mode,
      (id) => {
        const cid = canonicalTitleId(id);
        const t = TITLES.find((x) => x.id === id)!;
        return cid ? { titleId: cid, tmdbId: t.tmdbId, mediaType: mediaTypeFor(id) } : null;
      },
      () => 0.9,
    );
    expect(events.length, 'a DNA session produced no canonical events').toBeGreaterThan(0);
    for (const e of events) {
      expect(e.titleId, 'event id is not a canonical movie:/tv: key').toMatch(/^(movie|tv):\d+$/);
      expect(e.source).toBe('showdown');
    }
  });

  it('never files a head-to-head as an EXPERIENCE grade', () => {
    // Claiming they watched it is a different and much stronger assertion than
    // the one they made, and would outrank titles they actually did watch.
    const played = playAll('dna');
    const events = sessionToEvents(played.decisions, 'dna', (id) => {
      const cid = canonicalTitleId(id);
      const t = TITLES.find((x) => x.id === id)!;
      return cid ? { titleId: cid, tmdbId: t.tmdbId, mediaType: mediaTypeFor(id) } : null;
    }, () => 0.9);
    for (const e of events) {
      expect(e.experienceGrade).toBeUndefined();
      expect(e.attractionGrade).toBeDefined();
    }
  });

  it('a clean comparison outranks a confounded one on the canonical ladder', () => {
    expect(gradeForAttribution(TWIST_ATTRIBUTION_MIN)).toBe('must_watch');
    expect(gradeForAttribution(0.6)).toBe('interested');
    expect(gradeForAttribution(0.2)).toBe('maybe_interested');
  });
});

describe('“haven’t seen either” writes no preference evidence in EITHER mode', () => {
  for (const mode of ['dna', 'tonight'] as const) {
    it(`${mode}: no belief moves, no tilt, no canonical event`, () => {
      const seeded = applyPermanent({}, permanentEvidenceFor(matchup, 'left'));
      let s = startSession(createSession({ profile: seeded }, 0, mode), 0);
      const beforeProfile = JSON.stringify(s.profile);
      const beforeLean = JSON.stringify(s.lean);
      const shown = s.current!;

      s = markUnseen(s, 1000);

      expect(JSON.stringify(s.profile), 'unfamiliarity moved permanent DNA').toBe(beforeProfile);
      expect(JSON.stringify(s.lean), 'unfamiliarity moved tonight').toBe(beforeLean);
      // Recognition bookkeeping IS expected — both titles retire from the pool.
      expect(s.unseenTitles).toContain(shown.left.id);
      expect(s.unseenTitles).toContain(shown.right.id);
      // And it is not recorded as a decision, so it produces no canonical event.
      expect(s.decisions.length).toBe(0);
    });
  }
});

describe('“Neither” acts only on shared ground', () => {
  it('permanent: never writes an axis the two films disagree about', () => {
    const ev = permanentEvidenceFor(matchup, 'neither');
    expect(ev.length, 'Neither was treated as a skip').toBeGreaterThan(0);
    for (const e of ev) {
      const l = matchup.left.traits.filter((t) => t.key === e.key).reduce((s, t) => s + (t.invert ? -t.strength : t.strength), 0);
      const r = matchup.right.traits.filter((t) => t.key === e.key).reduce((s, t) => s + (t.invert ? -t.strength : t.strength), 0);
      const shared = Math.min(Math.abs(l), Math.abs(r));
      expect(shared, `Neither wrote ${e.key}, which the films do not share`).toBeGreaterThan(0);
      expect(Math.sign(l) === Math.sign(r) || l === 0 || r === 0).toBe(true);
    }
  });

  it('tonight: shared rejection lands only in the session ledger', () => {
    const ev = evidenceFor(matchup, 'neither', 'tonight');
    expect(ev.permanent).toEqual([]);
    expect(ev.session.length).toBeGreaterThan(0);
  });
});

describe('tonight context bends ranking, reversibly', () => {
  const items = TITLES.slice(0, 8).map((t) => ({ id: t.id, score: 50, traits: t.traits }));

  it('an empty context is a no-op', () => {
    expect(hasTonightContext({})).toBe(false);
    const ranked = applyTonight(items, {});
    expect(ranked.map((r) => r.id)).toEqual(items.map((i) => i.id));
    expect(ranked.every((r) => r.tonightNudge === 0)).toBe(true);
  });

  it('a comedy night floats comedies and sinks bleak ones', () => {
    const lean = accumulateSession({}, [
      { kind: 'session', key: 'comedy', lean: 1 },
      { kind: 'session', key: 'darkness', lean: -1 },
    ]);
    expect(hasTonightContext(lean)).toBe(true);
    const ranked = applyTonight(items, lean);
    const office = ranked.find((r) => r.id === 'office');
    const se7en = ranked.find((r) => r.id === 'se7en');
    if (office && se7en) {
      expect(office.tonightNudge, 'a comedy night did not favour the comedy').toBeGreaterThan(se7en.tonightNudge);
    }
  });

  it('is bounded — a mood re-orders, it does not replace the ranking', () => {
    const lean = accumulateSession({}, TRAIT_KEYS.map((key) => ({ kind: 'session' as const, key, lean: 1 })));
    for (const r of applyTonight(items, lean)) {
      expect(Math.abs(r.tonightNudge)).toBeLessThanOrEqual(TONIGHT_NUDGE_MAX);
    }
  });

  it('clearing the context restores the original order exactly', () => {
    const lean = accumulateSession({}, [{ kind: 'session', key: 'comedy', lean: 1 }]);
    const withNight = applyTonight(items, lean).map((r) => r.id);
    const cleared = applyTonight(items, null).map((r) => r.id);
    expect(cleared).toEqual(items.map((i) => i.id));
    // And the night genuinely did something, so the restore is meaningful.
    expect(withNight).not.toEqual(cleared);
  });
});

describe('the media-type table is complete', () => {
  it('classifies every diagnostic title', () => {
    for (const t of TITLES) {
      const id = canonicalTitleId(t.id);
      expect(id, `${t.id} has no canonical id`).not.toBeNull();
      expect(id).toMatch(/^(movie|tv):\d+$/);
    }
  });

  it('names only titles that exist — a stale entry would silently mistype a film', () => {
    for (const id of TV_TITLE_IDS) {
      expect(TITLES.some((t) => t.id === id), `${id} is listed as TV but is not in the catalogue`).toBe(true);
    }
  });
});
