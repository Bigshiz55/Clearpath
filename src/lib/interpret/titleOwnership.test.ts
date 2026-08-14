import { describe, expect, it } from 'vitest';
import { interpret } from './interpret';

/**
 * ══════════════════════════════════════════════════════════════════════════
 * A REQUESTED TITLE OCCURRENCE OWNS ITS SOURCE RANGE.
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Two live holes, measured on the wired interpreter before this suite:
 *
 *   "Show me The Lego movie"   → people ["Lego"]
 *       ARTICLE_LED rejected the larger "The Lego" candidate, and
 *       MONONYM_BEFORE_MEDIA then claimed the remainder.
 *
 *   "Show me The Lego Movie"   → subjects ["lego"]
 *   "Show me A Goofy Movie"    → subjects ["goofy"]
 *       Explicit request framing promotes the clause; the case-insensitive
 *       subject matcher then spends a title word as a generic subject.
 *
 * These are not Lego bugs and may not be fixed with a Lego list. The invariant
 * is OCCURRENCE OWNERSHIP, the same idiom the person/subject boundary already
 * uses: a requested-title occurrence owns its source range, and person or
 * positive-subject candidates whose ranges overlap it lose ownership. Only
 * overlapping occurrences lose — nothing is suppressed globally.
 *
 * The offline evidence for "this phrase names a work" is a CAPITALISED
 * article ("The", "A", "An") mid-request — the same capitalisation evidence
 * the interpreter already accepts for title references. A lowercase article
 * ("a Stallone movie", "a boxing movie") is ordinary description and MUST
 * keep its person/subject reading — asserted by the controls below.
 */

describe('a requested title is a lookup, and owns its words', () => {
  it('"Show me The Lego movie" → lookup, requested title, no person, no subject', () => {
    const r = interpret('Show me The Lego movie');
    expect(r.kind).toBe('lookup');
    expect(r.titles).toContainEqual({ span: 'The Lego movie', relation: 'requested' });
    expect(r.people, 'a title word was read as a person').toEqual([]);
    expect(r.subjects.filter((s) => s.wanted), 'a title word became an executable subject').toEqual([]);
  });

  it('"Show me The Lego Movie" → lookup, requested title, no person, no subject', () => {
    const r = interpret('Show me The Lego Movie');
    expect(r.kind).toBe('lookup');
    expect(r.titles).toContainEqual({ span: 'The Lego Movie', relation: 'requested' });
    expect(r.people).toEqual([]);
    expect(r.subjects.filter((s) => s.wanted)).toEqual([]);
  });

  it('"Show me A Goofy Movie" → lookup, requested title, no Goofy person, no goofy subject', () => {
    const r = interpret('Show me A Goofy Movie');
    expect(r.kind).toBe('lookup');
    expect(r.titles).toContainEqual({ span: 'A Goofy Movie', relation: 'requested' });
    expect(r.people).toEqual([]);
    expect(r.subjects.filter((s) => s.wanted)).toEqual([]);
  });
});

describe('controls — description keeps its meaning', () => {
  it('"Show me a Stallone movie" stays a person recommendation, never a title lookup', () => {
    const r = interpret('Show me a Stallone movie');
    expect(r.kind).toBe('recommendation');
    expect(r.people.map((p) => p.span)).toEqual(['Stallone']);
    expect(r.subjects.filter((s) => s.wanted)).toEqual([]);
    expect(r.titles.filter((t) => t.relation === 'requested')).toEqual([]);
  });

  it('"Show me a boxing movie" stays a subject recommendation, nothing invented', () => {
    const r = interpret('Show me a boxing movie');
    expect(r.kind).toBe('recommendation');
    expect(r.people).toEqual([]);
    expect(r.subjects.filter((s) => s.wanted).map((s) => s.span)).toEqual(['boxing']);
    expect(r.titles.filter((t) => t.relation === 'requested')).toEqual([]);
  });

  it('a full-name person request is untouched by title ownership', () => {
    const r = interpret('Show me a Tom Hanks courtroom movie');
    expect(r.kind).toBe('recommendation');
    expect(r.people.map((p) => p.span)).toEqual(['Tom Hanks']);
    expect(r.subjects.filter((s) => s.wanted).map((s) => s.span)).toEqual(['courtroom']);
  });
});
