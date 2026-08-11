import { describe, it, expect } from 'vitest';
import { deriveDna } from '@/lib/preference/engine';
import { effectiveTaste } from '@/lib/preference/explain';
import { MIN_RANK_CONF, preferenceNudge } from '@/lib/preference/rank';
import type { PreferenceEvent } from '@/lib/preference/types';
import { TITLES } from '@/lib/voice/quickdna/definition';
import { TARGET_DECISIONS, answer, createSession, startSession } from './session';
import { sessionToEvents, type CanonicalDecision } from './canonical';
import { canonicalTitleId, mediaTypeFor } from './mediaType';
import { assessCoverage, writeCoverage } from './dimensionCoverage';
import { parseHandoff, TONIGHT_TTL_MS } from './handoff';
import { applyTonight } from './tonight';

/**
 * THE WHOLE CHAIN, AND THE TWO THINGS IT MUST NEVER CONFLATE.
 *
 *   decisions -> events -> deriveDna -> fingerprint match -> confidence gate
 *   -> ranking contribution
 *
 * Two failures look identical from outside and have opposite fixes:
 *
 *   EVIDENCE NEVER ARRIVED    a bug. Nothing to gate; nothing to show.
 *   EVIDENCE ARRIVED, GATE HELD  correct. One 12-decision session reaches
 *                             confidence 0.190 against MIN_RANK_CONF 0.25, so
 *                             the nudge is exactly 0 — and that is the ranker
 *                             declining to act on a belief it is not yet sure
 *                             of, which is the behaviour we want.
 *
 * Every case below asserts which of those it is looking at. A test that only
 * checked "nudge === 0" after session one would pass just as happily if the
 * write path were broken.
 */

const resolve = (id: string) => {
  const t = TITLES.find((x) => x.id === id);
  const canonical = canonicalTitleId(id);
  return t && canonical ? { titleId: canonical, tmdbId: t.tmdbId, mediaType: mediaTypeFor(id) } : null;
};

/** The bleak candidate, described the way the ranker sees one. */
const BLEAK = { dims: { darkness: 95, humor: 5 }, genres: ['thriller'] };
/** A title on an axis this calibration says nothing about. */
const UNRELATED = { dims: { romance: 92, darkness: 50 }, genres: ['romance'] };

function playRounds(prefer: 'dark' | 'light', rounds: number): CanonicalDecision[] {
  let s = startSession(createSession({}, 0, 'dna'), 0);
  const out: CanonicalDecision[] = [];
  for (let r = 0; r < rounds; r++) {
    s = startSession(createSession({ profile: s.profile, seenPairs: s.seenPairs }, 0, 'dna'), 0);
    for (let i = 0; i < TARGET_DECISIONS + 4 && s.current; i++) {
      const { left, right } = s.current;
      const dark = (t: typeof left) =>
        t.traits.filter((e) => e.key === 'darkness').reduce((sum, e) => sum + (e.invert ? -e.strength : e.strength), 0);
      const leftDarker = dark(left) >= dark(right);
      s = answer(s, (prefer === 'dark' ? leftDarker : !leftDarker) ? 'left' : 'right', 1000 + r * 100 + i, 900);
    }
    out.push(...s.decisions);
  }
  return out;
}

/**
 * The fingerprint the `title_dimensions` cache would hold.
 *
 * `withDims: false` simulates the silent-failure condition: events insert
 * perfectly and the ranker can match nothing.
 */
function eventsWith(decisions: CanonicalDecision[], withDims: boolean): PreferenceEvent[] {
  const events = sessionToEvents(decisions, 'dna', resolve, () => 0.9);
  if (!withDims) return events;
  for (const e of events) {
    const id = TITLES.find((t) => `${mediaTypeFor(t.id)}:${t.tmdbId}` === e.titleId)?.id;
    const t = TITLES.find((x) => x.id === id);
    if (!t) continue;
    const dk = t.traits
      .filter((x) => x.key === 'darkness')
      .reduce((sum, x) => sum + (x.invert ? -x.strength : x.strength), 0);
    e.dims = { darkness: Math.max(0, Math.min(100, 50 + dk * 50)) };
  }
  return events;
}

describe('after session 1: evidence arrives, and the gate correctly holds', () => {
  const decisions = playRounds('dark', 1);
  const events = eventsWith(decisions, true);
  const dna = deriveDna(events, Date.now());
  const belief = effectiveTaste(dna)['darkness']!;

  it('1. evidence reached the log', () => {
    expect(decisions.length).toBe(TARGET_DECISIONS);
    expect(events.length, 'no canonical events were produced').toBeGreaterThan(4);
    expect(dna.attraction.samples, 'the engine folded nothing').toBeGreaterThan(0);
  });

  it('1. and the belief moved in the expected direction', () => {
    expect(belief.pref, 'picking bleak films did not raise the darkness belief').toBeGreaterThan(60);
    expect(belief.polarity).toBe(1);
  });

  it('2. ONE FULL SCAN NOW CLEARS THE GATE — re-measured after the redesign', () => {
    /* THE NUMBER MOVED BECAUSE THE PRODUCT MOVED, and the old figure is worth
       stating so the change is legible rather than silently absorbed:
       12 decisions -> confidence 0.190, nudge exactly 0.
       20 decisions -> confidence 0.336, nudge ~+3.0.
       The gate is untouched at MIN_RANK_CONF 0.25. What changed is that a
       twenty-round scan over a 113-title pool gathers enough evidence to pass
       it, which is the entire point of the cold-start redesign: one session
       should be worth something. The gate-holds-correctly case still exists —
       see the sparse-evidence case below — so this is a re-measurement, not a
       relaxation. */
    expect(belief.confidence, 'a full scan no longer reaches the ranker').toBeGreaterThan(MIN_RANK_CONF);
    expect(preferenceNudge(BLEAK, dna, { corrections: {} }).nudge).toBeGreaterThan(0);
  });

  it('2b. the gate still HOLDS when evidence really is thin', () => {
    // A short, abandoned scan must not reach the ranker. This is the case the
    // original session-1 assertion was protecting, kept explicitly.
    const short = eventsWith(playRounds('dark', 1).slice(0, 3), true);
    const thin = deriveDna(short, Date.now());
    const b = effectiveTaste(thin)['darkness'];
    expect(short.length, 'the short scan wrote nothing at all — that is a broken write').toBeGreaterThan(0);
    if (b) expect(b.confidence).toBeLessThan(MIN_RANK_CONF);
    expect(preferenceNudge(BLEAK, thin, { corrections: {} }).nudge).toBe(0);
  });
});

describe('after session 2: the gate opens and ranking moves', () => {
  const dna = deriveDna(eventsWith(playRounds('dark', 2), true), Date.now());
  const belief = effectiveTaste(dna)['darkness']!;

  it('confidence clears the gate', () => {
    expect(belief.confidence).toBeGreaterThan(MIN_RANK_CONF);
  });

  it('the matching title receives a real, positive contribution', () => {
    const nudge = preferenceNudge(BLEAK, dna, { corrections: {} }).nudge;
    expect(nudge, 'two calibrations still produced no ranking contribution').toBeGreaterThan(0);
  });

  it('a divergent title does NOT receive the same contribution', () => {
    // The claim is semantic, not positional: this asserts what the nudge is
    // FOR, rather than freezing an arbitrary recommendation order.
    const matching = preferenceNudge(BLEAK, dna, { corrections: {} }).nudge;
    const unrelated = preferenceNudge(UNRELATED, dna, { corrections: {} }).nudge;
    expect(
      matching,
      'a romance the calibration said nothing about scored as well as the bleak thriller it did',
    ).toBeGreaterThan(unrelated);
  });

  it('and calibrating the OTHER way does not favour bleak content', () => {
    const opposite = deriveDna(eventsWith(playRounds('light', 2), true), Date.now());
    const away = preferenceNudge(BLEAK, opposite, { corrections: {} }).nudge;
    const toward = preferenceNudge(BLEAK, dna, { corrections: {} }).nudge;
    expect(toward).toBeGreaterThan(away);
  });
});

describe('missing fingerprints are DETECTED, never mistaken for applied evidence', () => {
  const decisions = playRounds('dark', 2);

  it('the write reports exactly how much of it can affect ranking', () => {
    const inert = writeCoverage(eventsWith(decisions, false));
    expect(inert.events).toBeGreaterThan(0);
    expect(inert.withDims, 'events without dims were counted as usable').toBe(0);
    expect(inert.withoutDims).toBe(inert.events);
    expect(inert.unfingerprinted.length, 'the offending titles were not named').toBeGreaterThan(0);

    const live = writeCoverage(eventsWith(decisions, true));
    expect(live.withDims).toBe(live.events);
    expect(live.withoutDims).toBe(0);
  });

  it('without fingerprints the ranking is inert even though the belief is strong', () => {
    // THE SILENT FAILURE, made loud. Two full calibrations, a confident belief,
    // and a nudge of zero — indistinguishable from the confidence gate unless
    // something reports coverage, which is why `writeCoverage` exists.
    const dna = deriveDna(eventsWith(decisions, false), Date.now());
    expect(dna.attraction.samples, 'the events did not even record').toBeGreaterThan(0);
    expect(preferenceNudge(BLEAK, dna, { corrections: {} }).nudge).toBe(0);

    // And the same decisions WITH fingerprints do move it — so the difference
    // is provably the fingerprints and nothing else.
    const withDims = deriveDna(eventsWith(decisions, true), Date.now());
    expect(preferenceNudge(BLEAK, withDims, { corrections: {} }).nudge).toBeGreaterThan(0);
  });

  it('coverage assessment names every unfingerprinted diagnostic title', () => {
    const empty = assessCoverage(new Map());
    expect(empty.covered).toBe(0);
    expect(empty.total).toBe(TITLES.length);
    expect(empty.missing.length).toBe(TITLES.length);
    expect(empty.usable, 'zero coverage reported as usable').toBe(false);

    const full = new Map(TITLES.map((t) => [`${mediaTypeFor(t.id)}-${t.tmdbId}`, {}]));
    const ok = assessCoverage(full);
    expect(ok.covered).toBe(TITLES.length);
    expect(ok.missing).toEqual([]);
    expect(ok.usable).toBe(true);
  });
});

describe('the tonight handoff survives the route change', () => {
  it('a completed night is readable on the next page', () => {
    const now = 1_000_000;
    const raw = JSON.stringify({ lean: { comedy: 0.8 }, at: now, decisions: 12 });
    const carried = parseHandoff(raw, now + 5_000);
    expect(carried, 'the night did not survive the transition').not.toBeNull();
    expect(carried!.lean.comedy).toBeCloseTo(0.8);
    expect(carried!.decisions).toBe(12);
  });

  it('and actually bends the destination ranking', () => {
    const now = 1_000_000;
    const carried = parseHandoff(JSON.stringify({ lean: { comedy: 1 }, at: now, decisions: 12 }), now)!;
    const items = TITLES.slice(0, 10).map((t) => ({ id: t.id, score: 50, traits: t.traits }));
    const ranked = applyTonight(items, carried.lean);
    expect(ranked.some((r) => r.tonightNudge !== 0), 'the carried night changed nothing').toBe(true);
  });

  it('a stale night is discarded rather than silently reapplied', () => {
    const now = 1_000_000;
    const raw = JSON.stringify({ lean: { comedy: 1 }, at: now, decisions: 12 });
    expect(parseHandoff(raw, now + TONIGHT_TTL_MS + 1)).toBeNull();
  });

  it('an empty or malformed night is not a crash', () => {
    expect(parseHandoff(null, 1)).toBeNull();
    expect(parseHandoff('not json', 1)).toBeNull();
    expect(parseHandoff(JSON.stringify({ lean: {}, at: 1, decisions: 0 }), 1)).toBeNull();
  });
});
