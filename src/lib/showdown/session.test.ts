import { describe, it, expect } from 'vitest';
import { TITLES } from '@/lib/voice/quickdna/definition';
import { traitBelief, traitConfidence, type TraitKey } from '@/lib/voice/quickdna/traits';
import { pairKey } from './matchup';
import {
  NEITHER_WEIGHT,
  SHOWDOWN_WEIGHT,
  TARGET_DECISIONS,
  answer,
  createSession,
  evidenceFor,
  isComplete,
  markUnseen,
  startSession,
} from './session';

/**
 * WHAT A TAP MEANS.
 *
 * A pairwise choice is a COMPARATIVE statement and the whole evidence layer
 * turns on reading it that way. These pin the reading directly: given two
 * titles and an answer, exactly which beliefs move and which must not.
 */

const byId = (id: string) => TITLES.find((t) => t.id === id)!;

/** A pair that splits hard on darkness and agrees on investigation. */
const dark = byId('se7en');
const light = byId('knives-out');
const matchup = { left: dark, right: light, testing: ['darkness' as TraitKey], gain: 1 };

const find = (ev: ReturnType<typeof evidenceFor>, key: TraitKey) => ev.find((e) => e.key === key);

describe('choosing a side is comparative, not absolute', () => {
  it('moves the contested axis toward the winner', () => {
    const left = find(evidenceFor(matchup, 'left'), 'darkness')!;
    expect(left.target, 'picking the dark film did not push darkness up').toBe(100);

    const right = find(evidenceFor(matchup, 'right'), 'darkness')!;
    expect(right.target, 'picking the light film did not push darkness down').toBe(0);
  });

  it('says nothing about an axis the two films agree on', () => {
    // Both are investigations, so choosing between them is no evidence at all
    // about whether this person likes investigations.
    const ev = evidenceFor(matchup, 'left');
    const shared = find(ev, 'investigation');
    if (shared) {
      // If it appears at all it must be because they genuinely differ in
      // degree — never because one of them merely mentions it.
      expect(Math.abs(shared.weight)).toBeLessThan(SHOWDOWN_WEIGHT);
    }
  });

  it('weights a decisive split more heavily than a marginal one', () => {
    const ev = evidenceFor(matchup, 'left');
    const darkness = find(ev, 'darkness')!;
    const weaker = ev.filter((e) => e.key !== 'darkness');
    for (const w of weaker) {
      expect(darkness.weight).toBeGreaterThanOrEqual(w.weight);
    }
  });

  it('never exceeds the ceiling for a single decision', () => {
    for (const v of ['left', 'right', 'neither'] as const) {
      for (const e of evidenceFor(matchup, v)) {
        expect(e.weight).toBeLessThanOrEqual(SHOWDOWN_WEIGHT);
      }
    }
  });
});

describe('“Neither” is evidence, not a skip', () => {
  const ev = evidenceFor(matchup, 'neither');

  it('produces evidence at all', () => {
    expect(ev.length, 'Neither was treated as a skip').toBeGreaterThan(0);
  });

  it('condemns what the two films SHARE', () => {
    // Both are investigations; refusing both is real evidence against them.
    const shared = find(ev, 'investigation');
    expect(shared, 'refusing two investigations taught nothing about investigation').toBeDefined();
    expect(shared!.target).toBe(0);
  });

  it('takes no side on what they disagree about', () => {
    // Refusing both says nothing about whether this person wanted the dark one
    // or the light one — inventing a direction here would fabricate an opinion.
    expect(find(ev, 'darkness'), 'Neither invented a preference on the contested axis').toBeUndefined();
  });

  it('speaks more softly than an explicit pick', () => {
    expect(NEITHER_WEIGHT).toBeLessThan(SHOWDOWN_WEIGHT);
  });

  it('does not conclude either film was wanted', () => {
    let s = startSession(createSession(), 0);
    const shown = s.current!;
    const after = answer(s, 'neither', 1000, 900);
    for (const e of shown.left.traits) {
      const belief = traitBelief(after.profile, e.key);
      const signed = e.invert ? -e.strength : e.strength;
      // Nothing the losing pair asserted may end up read as a positive.
      if (signed > 0.6) expect(belief.pref, `${e.key} read as a want`).toBeLessThanOrEqual(70);
    }
  });
});

describe('“Haven’t seen either” is about recognition, not taste', () => {
  it('moves no belief at all', () => {
    const s = startSession(createSession(), 0);
    const before = JSON.stringify(s.profile);
    const after = markUnseen(s, 1000);
    expect(JSON.stringify(after.profile), 'an unseen pair changed a belief').toBe(before);
  });

  it('retires both titles so they are never offered again', () => {
    const s = startSession(createSession(), 0);
    const shown = s.current!;
    const after = markUnseen(s, 1000);
    expect(after.unseenTitles).toContain(shown.left.id);
    expect(after.unseenTitles).toContain(shown.right.id);
    // And the next matchup contains neither of them.
    if (after.current) {
      expect([after.current.left.id, after.current.right.id]).not.toContain(shown.left.id);
      expect([after.current.left.id, after.current.right.id]).not.toContain(shown.right.id);
    }
  });

  it('is not counted as a decision', () => {
    const s = markUnseen(startSession(createSession(), 0), 1000);
    expect(s.decisions.length).toBe(0);
  });
});

describe('the session behaves like a session', () => {
  it('records provenance for every decision', () => {
    let s = startSession(createSession(), 0);
    s = answer(s, 'left', 1000, 850);
    const d = s.decisions[0]!;
    expect(d.leftId).toBeTruthy();
    expect(d.rightId).toBeTruthy();
    expect(d.verdict).toBe('left');
    expect(d.testing.length, 'no reason recorded for asking').toBeGreaterThan(0);
    expect(d.responseMs).toBe(850);
    expect(d.gain).toBeGreaterThan(0);
  });

  it('ends after a bounded number of decisions', () => {
    let s = startSession(createSession(), 0);
    for (let i = 0; i < 40 && s.current; i++) s = answer(s, 'left', 1000 + i, 900);
    expect(s.decisions.length).toBeLessThanOrEqual(TARGET_DECISIONS);
    expect(isComplete(s)).toBe(true);
  });

  it('answering with nothing dealt is a no-op, not a crash', () => {
    const empty = createSession();
    expect(answer(empty, 'left', 0, 0)).toEqual(empty);
    expect(markUnseen(empty, 0)).toEqual(empty);
  });

  it('resumes from a seed without re-asking what was already asked', () => {
    const first = startSession(createSession(), 0);
    const askedKey = pairKey(first.current!.left.id, first.current!.right.id);
    const resumed = startSession(createSession({ seenPairs: [askedKey] }), 0);
    expect(pairKey(resumed.current!.left.id, resumed.current!.right.id)).not.toBe(askedKey);
  });

  it('a decision already recorded survives the next deal failing', () => {
    // Simulated by exhausting the pool: `current` goes null but the history
    // and everything learned from it stay exactly where they were.
    let s = startSession(createSession(), 0);
    for (let i = 0; i < 40 && s.current; i++) s = answer(s, 'left', 1000 + i, 900);
    const learned = Object.keys(s.profile).filter((k) => traitConfidence(s.profile, k as TraitKey) > 0);
    expect(s.current).toBeNull();
    expect(s.decisions.length).toBeGreaterThan(0);
    expect(learned.length, 'the session ended and took its learning with it').toBeGreaterThan(5);
  });
});
