/**
 * ONE LANGUAGE INTERPRETATION, NOT TWO.
 *
 * Each case here is a sentence whose meaning the canonical layer already
 * settled. What is asserted is that execution CONSUMED that settlement rather
 * than re-deriving it — the person became a cast constraint and not a theme,
 * the count came from the request clause and not the anecdote, and a subject
 * that genuinely was named survived alongside the person.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const searchPeople = vi.fn();
const searchBySubject = vi.fn();
const resolveKeywordIds = vi.fn(async () => [] as number[]);
const resolveProvider = vi.fn(async () => null);

vi.mock('server-only', () => ({}));
vi.mock('@/lib/tmdb/client', () => ({ searchPeople, searchKeywords: vi.fn(async () => []) }));
vi.mock('@/lib/ai/tools', () => ({ searchBySubject, resolveKeywordIds, resolveProvider }));

const { interpret } = await import('@/lib/interpret/interpret');
const { resolveCanonicalExecution, intentToQuery } = await import('./canonicalExecution');

const STALLONE = { id: 16483, name: 'Sylvester Stallone', profilePath: null, knownFor: 'Rocky, Rambo' };
const HANKS = { id: 31, name: 'Tom Hanks', profilePath: null, knownFor: 'Forrest Gump, Big' };

/** The real subject resolver's shape, for terms that are genuinely subjects. */
const subjectFor = (label: string, ids: number[]) => ({
  keywordIds: ids,
  lexemes: [label.toLowerCase()],
  canonical: label.toLowerCase(),
  label,
});

beforeEach(() => {
  vi.clearAllMocks();
  searchPeople.mockResolvedValue([]);
  searchBySubject.mockResolvedValue(null);
  resolveKeywordIds.mockResolvedValue([]);
  resolveProvider.mockResolvedValue(null);
});

const run = (text: string) => resolveCanonicalExecution(interpret(text));

describe('a person reaches the finder as a person', () => {
  beforeEach(() => searchPeople.mockResolvedValue([STALLONE]));

  it('the full-name request resolves and carries NO subject', async () => {
    const r = await run('Give me a Sylvester Stallone movie');
    expect(r.query.castIds).toEqual([16483]);
    expect(r.query.mediaType).toBe('movie');
    expect(r.query.subjectStrict).toBeUndefined();
    expect(r.query.subjectCanonical).toBeUndefined();
    expect(searchBySubject).not.toHaveBeenCalled();
  });

  it('TMDB is asked for the NAME, never the whole sentence', async () => {
    await run('I watched 3 movies yesterday. Give me a Sylvester Stallone movie.');
    expect(searchPeople).toHaveBeenCalledWith('Sylvester Stallone');
    expect(searchPeople).not.toHaveBeenCalledWith(expect.stringContaining('yesterday'));
  });

  it('the anecdote does not set the count', async () => {
    const r = await run('I watched 3 movies yesterday. Give me a Sylvester Stallone movie.');
    expect(r.limit).toBe(1);
    expect(r.query.finalCount).toBe(1);
  });

  it.each([
    ['I watched a movie yesterday. Give me 3 Sylvester Stallone movies.', 3],
    ['I watched 3 movies yesterday. Give me 5 Sylvester Stallone movies.', 5],
    ['3 Sylvester Stallone movies', 3],
  ])('%j asks for %i', async (text, n) => {
    const r = await run(text as string);
    expect(r.limit).toBe(n);
    expect(r.query.castIds).toEqual([16483]);
  });
});

describe('a person and a subject can both be true', () => {
  it('a Tom Hanks courtroom movie keeps BOTH', async () => {
    searchPeople.mockResolvedValue([HANKS]);
    searchBySubject.mockResolvedValue(subjectFor('Courtroom', [1234]));

    const r = await run('a Tom Hanks courtroom movie');
    expect(r.query.castIds).toEqual([31]);
    expect(searchBySubject).toHaveBeenCalledWith(['courtroom']);
    expect(r.query.subjectCanonical).toBe('courtroom');
    expect(r.query.subjectStrict).toBe(true);
  });

  it('a Sylvester Stallone boxing movie keeps BOTH', async () => {
    searchPeople.mockResolvedValue([STALLONE]);
    searchBySubject.mockResolvedValue(subjectFor('Boxing', [779]));

    const r = await run('a Sylvester Stallone boxing movie');
    expect(r.query.castIds).toEqual([16483]);
    expect(searchBySubject).toHaveBeenCalledWith(['boxing']);
    expect(r.query.subjectCanonical).toBe('boxing');
  });

  it('a subject with no person is still a subject', async () => {
    searchBySubject.mockResolvedValue(subjectFor('Courtroom', [1234]));
    const r = await run('a courtroom movie');
    expect(r.query.subjectCanonical).toBe('courtroom');
    expect(r.query.castIds).toBeUndefined();
  });

  it('the burrito never becomes a subject', async () => {
    searchBySubject.mockResolvedValue(subjectFor('Boxing', [779]));
    await run('Had a burrito for dinner. Give me a boxing movie');
    expect(searchBySubject).toHaveBeenCalledWith(['boxing']);
    expect(searchBySubject).not.toHaveBeenCalledWith(expect.arrayContaining(['burrito']));
  });
});

describe('surname-only identity is earned, never assumed', () => {
  it('one credited bearer resolves', async () => {
    searchPeople.mockResolvedValue([STALLONE]);
    const r = await run('Give me a Stallone movie');
    expect(r.query.castIds).toEqual([16483]);
    expect(r.people[0]).toMatchObject({ kind: 'resolved', evidence: 'sole-credited-match' });
  });

  it('several plausible bearers ask instead of guessing', async () => {
    searchPeople.mockResolvedValue([
      STALLONE,
      { id: 77, name: 'Frank Stallone', profilePath: null, knownFor: 'Rocky III' },
    ]);
    const r = await run('Give me a Stallone movie');
    expect(r.ambiguity).not.toBeNull();
    expect(r.ambiguity?.candidates.map((c) => c.name)).toEqual(['Sylvester Stallone', 'Frank Stallone']);
    expect(r.query.castIds).toBeUndefined();
  });

  it('popularity alone does not confer identity', async () => {
    // Top hit is an uncredited stub — the catalog cannot vouch for it.
    searchPeople.mockResolvedValue([{ id: 999, name: 'Stallone Fan', profilePath: null, knownFor: '' }]);
    const r = await run('Give me a Stallone movie');
    expect(r.people[0]).toMatchObject({ kind: 'unresolved' });
    expect(r.query.castIds).toBeUndefined();
  });
});

describe('the pure mapping does no I/O', () => {
  it('maps media, count and genres without a lookup', () => {
    const m = intentToQuery(interpret('Give me 3 horror movies'));
    expect(m.query.mediaType).toBe('movie');
    expect(m.requestedCount).toBe(3);
    expect(m.query.genreIds).toContain(27);
    expect(searchPeople).not.toHaveBeenCalled();
  });
});
