import { describe, it, expect } from 'vitest';
import { wantsTitleResults } from './requestIntent';

/**
 * THE REPORTED BUG: someone typed "boxing movies I would like" into State Your
 * Case and got The Shawshank Redemption, The Godfather and Obsession — the
 * generic Watch Now grid, with their sentence discarded and no sign anything
 * had gone wrong. The noun test matched `movies`, but the verb test only knew
 * the elided `I'd like`, so every unelided phrasing fell through to the
 * taste-only branch, whose client-side handler pushes to /app/watch.
 */
describe('wantsTitleResults — a request to be shown titles', () => {
  it('THE REGRESSION: "boxing movies I would like" is a request, not a taste statement', () => {
    expect(wantsTitleResults('boxing movies I would like')).toBe(true);
  });

  it.each([
    'boxing movies I would like',
    'boxing movies I would enjoy',
    'movies I would love',
    'a war film I would like to see',
    'any good boxing movies',
    'what should i watch tonight, something with boxing',
    'recommendations for boxing movies',
    'suggestions for a scary movie',
    'find me boxing movies',
    'good boxing movies',
    'show me thrillers',
    'something light and funny',
    'I want a comedy',
    "I'd like a documentary",
    'in the mood for a western',
    'looking for a rom-com',
  ])('treats %j as a request for titles', (text) => {
    expect(wantsTitleResults(text)).toBe(true);
  });

  it.each([
    'I love Quentin Tarantino',
    'I hate jump scares',
    'my wife and I disagree about everything',
    'Denzel Washington is my favourite actor',
  ])('leaves %j as a pure taste statement so it only builds DNA', (text) => {
    expect(wantsTitleResults(text)).toBe(false);
  });

  it('still requires a noun to show — a bare request verb is not enough', () => {
    // No genre/media noun, so there is nothing to filter on; this stays a
    // taste-building sentence rather than an empty search.
    expect(wantsTitleResults('I would like Tarantino')).toBe(false);
  });
});
