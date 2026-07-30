import { describe, it, expect } from 'vitest';
import { quickSearchHref, opensSearch, closesSearch, SEARCH_ROUTE, MAX_QUERY } from './quickSearch';

describe('where a query goes', () => {
  it('lands on the one front door for typed questions', () => {
    expect(quickSearchHref('Cinderella Man')).toBe(`${SEARCH_ROUTE}?q=Cinderella%20Man`);
  });

  it('does NOTHING on an empty box', () => {
    // Navigating on empty would take you off the screen you were on, which is
    // the exact cost this control exists to remove.
    for (const empty of ['', '   ', '\n\t ']) {
      expect(quickSearchHref(empty), JSON.stringify(empty)).toBeNull();
    }
  });

  it('trims, so a trailing space is not part of the search', () => {
    expect(quickSearchHref('  heat  ')).toBe(`${SEARCH_ROUTE}?q=heat`);
  });

  it('caps at what the route actually reads, rather than sending more', () => {
    const href = quickSearchHref('x'.repeat(MAX_QUERY + 250))!;
    expect(decodeURIComponent(href.split('q=')[1]!)).toHaveLength(MAX_QUERY);
  });

  it('encodes anything that would break the URL', () => {
    const href = quickSearchHref('c&a? #1 100% "good"')!;
    expect(href).not.toMatch(/[ "]/);
    expect(href.includes('&q=') || href.split('?').length === 2).toBe(true);
    expect(decodeURIComponent(href.split('q=')[1]!)).toBe('c&a? #1 100% "good"');
  });

  it('survives a title that is mostly punctuation', () => {
    expect(quickSearchHref('9½ Weeks')).toContain('9%C2%BD');
  });
});

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
