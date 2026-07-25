import { describe, it, expect } from 'vitest';
import { classifySearch, type SearchMode } from './searchMode';

/** The 20 mandated cases from the production-failure report, as assertions. */
describe('search mode router — mandated cases', () => {
  const P = (name: string) => expect.objectContaining({ name });

  it('1. "Gone on BritBox" → exact_title, title Gone, hard BritBox', () => {
    const c = classifySearch('Gone on BritBox');
    expect(c.mode).toBe<SearchMode>('exact_title');
    expect(c.requestedTitle?.toLowerCase()).toBe('gone');
    expect(c.requiredProvider).toEqual(P('BritBox'));
    expect(c.providerStrength).toBe('hard');
  });

  it('variants of #1 all route to exact_title with title=Gone + BritBox', () => {
    for (const q of ['Find Gone on BritBox', 'Is Gone on BritBox?', 'Show me Gone from BritBox', 'Gone BritBox', 'I want to watch Gone on BritBox']) {
      const c = classifySearch(q);
      expect(c.mode, q).toBe('exact_title');
      expect(c.requestedTitle?.toLowerCase(), q).toBe('gone');
      expect(c.requiredProvider?.name, q).toBe('BritBox');
    }
  });

  it('3. "Gone movie" → exact_title, contentType movie', () => {
    const c = classifySearch('Gone movie');
    expect(c.mode).toBe('exact_title');
    expect(c.contentType).toBe('movie');
    expect(c.requestedTitle?.toLowerCase()).toBe('gone');
  });

  it('4. "Gone TV series" → exact_title, contentType tv', () => {
    const c = classifySearch('Gone TV series');
    expect(c.mode).toBe('exact_title');
    expect(c.contentType).toBe('tv');
  });

  it('5. "Gone Girl on BritBox" → exact_title, title Gone Girl', () => {
    const c = classifySearch('Gone Girl on BritBox');
    expect(c.mode).toBe('exact_title');
    expect(c.requestedTitle?.toLowerCase()).toBe('gone girl');
    expect(c.requiredProvider?.name).toBe('BritBox');
  });

  it('6. "shows like Gone on BritBox" → similar_to, BritBox constrained', () => {
    const c = classifySearch('shows like Gone on BritBox');
    expect(c.mode).toBe('similar_to');
    expect(c.reference?.toLowerCase()).toContain('gone');
    expect(c.requiredProvider?.name).toBe('BritBox');
  });

  it('7. "Gone on Netflix" → exact_title, hard Netflix', () => {
    const c = classifySearch('Gone on Netflix');
    expect(c.mode).toBe('exact_title');
    expect(c.requestedTitle?.toLowerCase()).toBe('gone');
    expect(c.requiredProvider?.name).toBe('Netflix');
  });

  it('10. "Sherlock on BritBox" → exact_title Sherlock + BritBox', () => {
    const c = classifySearch('Sherlock on BritBox');
    expect(c.mode).toBe('exact_title');
    expect(c.requestedTitle?.toLowerCase()).toBe('sherlock');
    expect(c.requiredProvider?.name).toBe('BritBox');
  });

  it('11. "Sherlock-like shows on BritBox" → similar_to, not exact', () => {
    const c = classifySearch('Sherlock-like shows on BritBox');
    expect(c.mode).toBe('similar_to');
  });

  it('12. "The Gone on BritBox" → exact_title with article-safe title', () => {
    const c = classifySearch('The Gone on BritBox');
    expect(c.mode).toBe('exact_title');
    expect(c.requestedTitle?.toLowerCase()).toMatch(/^(the )?gone$/);
    expect(c.requiredProvider?.name).toBe('BritBox');
  });

  it('13. "Gone Brit Box" → provider normalized to BritBox', () => {
    const c = classifySearch('Gone Brit Box');
    expect(c.requiredProvider?.name).toBe('BritBox');
    expect(c.requestedTitle?.toLowerCase()).toBe('gone');
    expect(c.mode).toBe('exact_title');
  });

  it('"crime dramas on BritBox" → provider_catalog, no title', () => {
    const c = classifySearch('crime dramas on BritBox');
    expect(c.mode).toBe('provider_catalog');
    expect(c.requestedTitle).toBeNull();
    expect(c.requiredProvider?.name).toBe('BritBox');
  });

  it('"something like Gone but less dark" → forensic/similar (never exact substitution)', () => {
    const c = classifySearch('something like Gone but less dark');
    expect(['forensic', 'similar_to']).toContain(c.mode);
    expect(c.mode).not.toBe('exact_title');
  });

  it('soft provider: "Gone, preferably on BritBox" → soft', () => {
    const c = classifySearch('Gone, preferably on BritBox');
    expect(c.providerStrength).toBe('soft');
    expect(c.mode).toBe('exact_title');
  });

  it('16. one-word titles with a provider all route to exact_title', () => {
    for (const t of ['Gone', 'You', 'From', 'Them', 'Dark', 'Bodies', 'Inside', 'Vigil', 'Ghosts']) {
      const c = classifySearch(`${t} on BritBox`);
      expect(c.mode, t).toBe('exact_title');
      expect(c.requestedTitle?.toLowerCase(), t).toBe(t.toLowerCase());
      expect(c.requiredProvider?.name, t).toBe('BritBox');
    }
  });

  it('person cue: "movies starring Tom Hanks" → person', () => {
    expect(classifySearch('movies starring Tom Hanks').mode).toBe('person');
  });
});
