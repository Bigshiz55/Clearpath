import { describe, it, expect } from 'vitest';
import { opensSearch, closesSearch } from './quickSearch';

/**
 * WHERE A QUERY GOES IS NO LONGER DECIDED HERE.
 *
 * This file used to assert that EVERY query landed on /app/ask. That was the
 * defect, not the contract: it meant searching "CSI: NY" asked the Judge for a
 * recommendation instead of finding the show. The routing tests now live in
 * `searchIntent.test.ts`, where a lookup and a request are told apart.
 */

describe('the keyboard', () => {
  // Duck-typed on purpose: the rule has to hold without a DOM, and across
  // realms — an element inside an iframe fails `instanceof HTMLElement`.
  const input = { tagName: 'INPUT', isContentEditable: false };
  const div = { tagName: 'DIV', isContentEditable: false };
  const note = { tagName: 'DIV', isContentEditable: true };

  it('opens on the shortcut everything else on the machine uses', () => {
    expect(opensSearch({ key: 'k', metaKey: true })).toBe(true);
    expect(opensSearch({ key: 'K', ctrlKey: true })).toBe(true);
  });

  it('opens on a bare slash when nothing is being typed into', () => {
    expect(opensSearch({ key: '/', target: div })).toBe(true);
    expect(opensSearch({ key: '/', target: null })).toBe(true);
  });

  it('but NEVER eats a slash out of somebody’s sentence', () => {
    expect(opensSearch({ key: '/', target: input })).toBe(false);
    expect(opensSearch({ key: '/', target: note }), 'contenteditable').toBe(false);
    expect(opensSearch({ key: '/', target: { tagName: 'textarea' } }), 'lowercase tagName').toBe(false);
  });

  it('still works from inside a field on the explicit shortcut', () => {
    // ⌘K is unambiguous — nobody types it as content.
    expect(opensSearch({ key: 'k', metaKey: true, target: input })).toBe(true);
  });

  it('ignores unrelated keys and modifier soup', () => {
    expect(opensSearch({ key: 'k' })).toBe(false);
    expect(opensSearch({ key: 'k', metaKey: true, altKey: true })).toBe(false);
    expect(opensSearch({ key: 'j', metaKey: true })).toBe(false);
    expect(opensSearch({ key: 'Enter' })).toBe(false);
  });

  it('closes on Escape, and only Escape', () => {
    expect(closesSearch({ key: 'Escape' })).toBe(true);
    // A stray key must not throw away a half-typed query.
    for (const k of ['Enter', 'Tab', ' ', 'Backspace']) {
      expect(closesSearch({ key: k }), k).toBe(false);
    }
  });
});
