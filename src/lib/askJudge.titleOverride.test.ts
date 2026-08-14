import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * THE CANONICAL LOOKUP HAND-OFF. `looksLikeTitleAsk` rejects request framing
 * ("show me" is on its stoplist), so "Show me The Lego Movie" never reached
 * the title machinery and fell through to discovery — where the title's own
 * words came back as a person or a subject (measured live). The canonical
 * interpreter already isolated the span; the override carries it past the
 * legacy gate and past the classifier's media-noun-stripping extraction.
 */
const searchTitles = vi.fn<(q: string) => Promise<never[]>>(async () => []);
vi.mock('@/lib/tmdb/client', async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  searchTitles: (q: string) => searchTitles(q),
}));
vi.mock('server-only', () => ({}));

import { askJudgeTitle } from './askJudge';

const supabase = {} as never;

beforeEach(() => {
  searchTitles.mockClear();
});

describe('the requested-title override reaches the catalog', () => {
  it('WITHOUT the override, request framing never reaches the title search', async () => {
    const out = await askJudgeTitle(supabase, 'u', 'Show me The Lego Movie');
    expect(out).toBeNull();
    expect(searchTitles).not.toHaveBeenCalled();
  });

  it('WITH the canonical span, the catalog is asked for the REAL title', async () => {
    const out = await askJudgeTitle(supabase, 'u', 'Show me The Lego Movie', undefined, 'The Lego Movie');
    expect(out).toBeNull(); // empty catalog → honest null, no verdict invented
    expect(searchTitles).toHaveBeenCalledWith('The Lego Movie');
  });
});
