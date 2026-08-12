import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { followUpPrompt, GUT_CALL, type ReasonChip } from './reasons';
import { QUICK_TRAITS, type TraitKey } from '@/lib/voice/quickdna/traits';

/**
 * A FOLLOW-UP IS A REACTION, NOT A FORM.
 *
 * The evidence side was already right — chips come from the axes these two
 * titles genuinely diverge on, the question only fires when attribution is
 * ambiguous, and "gut call" is a real answer that moves nothing. What shipped
 * on top of it referred to none of that: "What tipped it?" over four taxonomy
 * buttons, with nothing on screen naming the decision the player had just made.
 */

const chip = (key: string, label: string, high = true): ReasonChip =>
  ({ id: `${key}-${high ? 'hi' : 'lo'}`, label, key, high }) as ReasonChip;

describe('the question is about the film they picked', () => {
  it('states the decision back by name', () => {
    const p = followUpPrompt('Prisoners', [chip('grounded', 'More realistic')]);
    expect(p.lead).toBe('You went with Prisoners.');
  });

  it('turns the leading axis into a named guess, not a category', () => {
    const p = followUpPrompt('Prisoners', [chip('grounded', 'More realistic')]);
    expect(p.question).toBe('Was it the danger felt more real?'); // noun phrase — no "that"
    // The old form's wording must not survive anywhere in the sentence.
    expect(p.question).not.toContain('What tipped it');
  });

  it('asks the OPPOSITE question when the winner sits on the low pole', () => {
    /* A guess in the wrong direction is worse than no guess: it tells the
       player the game was not paying attention. */
    const p = followUpPrompt('Paddington', [chip('darkness', 'Lighter', false)]);
    /* "Was it you wanted the lighter one?" is what the naive join produced, and
       rendered QA caught it on screen. A phrase opening with a pronoun needs
       the complementiser; one opening with a noun phrase does not. */
    expect(p.question).toBe('Was it that you wanted the lighter one?');
  });

  it('carries the chip the question is about, so Yes maps to real evidence', () => {
    const c = chip('grounded', 'More realistic');
    expect(followUpPrompt('Prisoners', [c]).hypothesis).toBe(c);
  });

  it('degrades to the chip label rather than inventing a sentence', () => {
    // An axis with no hand-written phrasing must still read as English.
    const p = followUpPrompt('Some Film', [chip('legal', 'More courtroom')]);
    expect(p.question).toBe('Was it more courtroom?');
  });

  it('never fabricates a hypothesis when there are no chips', () => {
    const p = followUpPrompt('Some Film', []);
    expect(p.hypothesis).toBeNull();
  });

  it('survives an unnamed winner', () => {
    // `neither` and `both` have no winner; the screen must not print "undefined".
    const p = followUpPrompt(null, [chip('grounded', 'More realistic')]);
    expect(p.lead).not.toContain('undefined');
    expect(p.lead.length).toBeGreaterThan(0);
  });
});

describe('no internal vocabulary reaches the player', () => {
  const src = readFileSync('src/lib/showdown/reasons.ts', 'utf8');
  const block = src.slice(src.indexOf('const HYPOTHESIS'), src.indexOf('export interface FollowUpPrompt'));

  it('every hypothesis sentence is prose, not an axis key', () => {
    /* Session 1 QA caught raw axis labels leaking into the results screen.
       Same standard here: `characterFocus` and `horrorTolerance` are our words
       for our machinery. */
    const sentences = [...block.matchAll(/'([^']{4,})'/g)].map((m) => m[1]!);
    expect(sentences.length).toBeGreaterThan(10);
    for (const s of sentences) {
      expect(s, `"${s}" looks like an axis key`).not.toMatch(/^[a-z]+[A-Z]/);
      expect(s).toMatch(/[ ?]/); // a phrase, never a bare identifier
    }
  });

  it('no camelCase IDENTIFIER is rendered where prose belongs', () => {
    /* Checked against camelCase keys only, on purpose. Several keys — `crime`,
       `romance`, `comedy`, `war` — are ordinary English words that legitimately
       appear in a sentence, so asserting "the key never appears" would fail on
       correct copy. What can never appear is something that reads as code:
       `horrorTolerance`, `trueCrime`, `characterFocus`. */
    const identifiers = (Object.keys(QUICK_TRAITS) as TraitKey[]).filter((k) => /[a-z][A-Z]/.test(k));
    expect(identifiers.length).toBeGreaterThan(3);
    for (const key of identifiers) {
      const p = followUpPrompt('X', [chip(key, QUICK_TRAITS[key])]);
      expect(p.question, `${key} leaked its key`).not.toContain(key);
      expect(p.question).not.toMatch(/[a-z][A-Z]/);
    }
  });
});

describe('the gut call stays untouched', () => {
  it('is not a hypothesis and names no axis', () => {
    /* It must remain the easy answer that fabricates nothing — the most
       valuable tap in the product is the one that declines to explain. */
    expect(GUT_CALL.id).toBe('gut');
    expect(followUpPrompt('X', [GUT_CALL]).hypothesis).toBe(GUT_CALL);
    expect(GUT_CALL.label.toLowerCase()).toContain('gut');
  });
});
