import { describe, it, expect } from 'vitest';
import { canonicalRequestRoute, isTitleRequest } from './requestRoute';

/**
 * THE SERVER HALF OF THE CONTRACT — the pure decision both the route and the
 * hero box consult. The browser half lives in tests/mobile/nl-request-route.spec.ts;
 * neither alone is sufficient, and a pure test alone is exactly the gap that let
 * "3 Sylvester Stallone movies" ship as a generic feed.
 */
describe('the live defect, pinned', () => {
  it('routes the exact production utterance to the canonical front door', () => {
    const r = canonicalRequestRoute('3 Sylvester Stallone movies');
    expect(r.kind).toBe('request');
    if (r.kind !== 'request') return;
    expect(r.count, 'the stated count was lost').toBe(3);
    expect(decodeURIComponent(r.href)).toContain('Sylvester Stallone');
    expect(r.href).toMatch(/^\/app\/finder\?q=/);
    expect(r.href).toContain('run=1');
    // Never the feed, never browse.
    expect(r.href).not.toContain('/app/watch');
    expect(r.href).not.toContain('/api/browse');
  });

  it('preserves the personalized and casual phrasings', () => {
    const a = canonicalRequestRoute("find me 3 Sylvester Stallone movies you think I'll like");
    expect(a.kind).toBe('request');
    if (a.kind === 'request') {
      expect(a.count).toBe(3);
      expect(a.personalized).toBe(true);
    }
    const b = canonicalRequestRoute('how about a Bruce Willis movie');
    expect(b.kind).toBe('request');
    if (b.kind === 'request') expect(decodeURIComponent(b.href)).toContain('Bruce Willis');
  });
});

describe('what must NOT become a search', () => {
  it('a pure taste statement still builds DNA', () => {
    expect(isTitleRequest('I love clever thrillers with a twist, but I avoid anything too slow or gory.')).toBe(false);
    expect(isTitleRequest('I hate gore and jump scares')).toBe(false);
  });

  it('a single capitalised word does not fake a person', () => {
    // Sentence-initial capitals and one-word proper nouns must not trip the
    // person shape, or every sentence starting with a capital becomes a search.
    expect(isTitleRequest('Movies')).toBe(false);
    expect(isTitleRequest('I like movies')).toBe(false);
  });

  it('empty input is never a request', () => {
    expect(isTitleRequest('')).toBe(false);
    expect(isTitleRequest('   ')).toBe(false);
  });
});

describe('the existing gate is not weakened', () => {
  it('still routes the genre/mood cases it always did', () => {
    for (const q of ['a good scary movie', 'boxing movies I would like', 'find me a family movie']) {
      expect(isTitleRequest(q), q).toBe(true);
    }
  });
});
