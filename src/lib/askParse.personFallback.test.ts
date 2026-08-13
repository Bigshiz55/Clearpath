import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * THE AI-INDEPENDENT PERSON FALLBACK, ON A SPOKEN SENTENCE.
 *
 * `/api/ask` resolves a named actor two ways: the AI parser fills `raw.people`,
 * and — when there is no key, or the parser misses — `resolvePersonId` reads the
 * name straight out of the text. That fallback is what makes a named-actor
 * request work without an `OPENAI_API_KEY`, and on the reported query it
 * returned null: "you think i'll like" survived the stopword list, leaving six
 * words, and the 2–4 word guard correctly rejected them.
 *
 * The guard was never wrong. It was being handed the whole sentence.
 */
const searchPeople = vi.hoisted(() => vi.fn());
vi.mock('@/lib/tmdb/client', () => ({ searchPeople, searchKeywords: vi.fn() }));
vi.mock('@/lib/env', () => ({ serverEnv: { openaiKey: () => '' } }));

const { resolvePersonId } = await import('./askParse');

beforeEach(() => {
  vi.clearAllMocks();
  searchPeople.mockResolvedValue([{ id: 16483, name: 'Sylvester Stallone', knownFor: 'Rocky' }]);
});

describe('resolvePersonId reads a name out of a spoken request', () => {
  it('THE REPORTED QUERY resolves the actor', async () => {
    const id = await resolvePersonId("find me 3 Sylvester Stallone movies you think I'll like");
    expect(id).toBe(16483);
    // And it looked up the NAME, not the sentence.
    expect(searchPeople).toHaveBeenCalledWith('sylvester stallone');
  });

  for (const said of [
    'show me some Tom Hanks movies I would enjoy',
    'give me 5 Denzel Washington films',
    'I want to watch a couple of Tom Cruise movies',
    'recommend two Keanu Reeves movies you think I might like',
  ]) {
    it(`"${said}" reaches a two-word lookup`, async () => {
      await resolvePersonId(said);
      const arg = searchPeople.mock.calls[0]?.[0] as string | undefined;
      expect(arg, 'a name was extracted at all').toBeTruthy();
      expect(arg!.split(' ').length, `looked up "${arg}"`).toBeLessThanOrEqual(4);
    });
  }

  it('a request naming nobody never reaches the person index at all', async () => {
    /* The guard that stops "tonight" becoming an actor must survive the fix —
       and this one goes further than the shipped code did. "find me something
       to watch tonight" used to reduce to "something to", two words, which
       clears the word-count guard, so it spent a lookup on every plain request.
       Production was saved only by the `knownFor` check further down. */
    expect(await resolvePersonId('find me something to watch tonight')).toBeNull();
    expect(searchPeople, 'no name was found, so nothing should be looked up').not.toHaveBeenCalled();
  });

  it('and a person with no credits is not accepted', async () => {
    searchPeople.mockResolvedValue([{ id: 1, name: 'Nobody At All', knownFor: '' }]);
    expect(await resolvePersonId('find me 3 Nobody Atall movies I would like')).toBeNull();
  });
});
