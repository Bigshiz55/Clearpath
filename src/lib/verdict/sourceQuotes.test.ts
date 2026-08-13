import { describe, it, expect } from 'vitest';
import { withoutRawSourceQuotes } from './sourceQuotes';
import type { RatingSource } from '@/lib/types';

const src = (name: string, raw: string | null): RatingSource => ({
  name,
  value: raw ? 87 : null,
  raw,
  available: raw != null,
});

const SOURCES = [src('TMDB Audience', '8.7/10 (23,328 votes)'), src('IMDb', '9.2/10'), src('Metacritic', null)];

describe('withoutRawSourceQuotes', () => {
  it('drops the reason that pastes a source row into a sentence', () => {
    const kept = withoutRawSourceQuotes(
      [
        'Well received by audiences (8.7/10 (23,328 votes)).',
        'Highly watchable — approachable format and easy to access.',
      ],
      SOURCES,
    );
    expect(kept).toEqual(['Highly watchable — approachable format and easy to access.']);
  });

  it('keeps reasons that merely contain numbers of their own', () => {
    // A runtime is arithmetic a reader asked for; it is not a database row, and
    // `splitMath` can already lift it. It must survive.
    const reasons = ['Long runtime (175 min) — a real time commitment.', 'Completed 5-season run, as you asked'];
    expect(withoutRawSourceQuotes(reasons, SOURCES)).toEqual(reasons);
  });

  it('matches on the sources this title actually has, not a hardcoded phrase', () => {
    const reasons = ['Well received by audiences (8.7/10 (23,328 votes)).'];
    // A different title, whose sources say something else — nothing to drop.
    expect(withoutRawSourceQuotes(reasons, [src('IMDb', '6.1/10')])).toEqual(reasons);
  });

  it('is a no-op when no source carries a display string', () => {
    const reasons = ['Solid, middle-of-the-road option if the premise appeals to you.'];
    expect(withoutRawSourceQuotes(reasons, [src('Metacritic', null)])).toEqual(reasons);
    expect(withoutRawSourceQuotes(reasons, [])).toEqual(reasons);
  });

  it('never invents or rewrites — surviving reasons come back byte-identical', () => {
    const reasons = ['Backed by a large, reliable pool of audience data.'];
    expect(withoutRawSourceQuotes(reasons, SOURCES)[0]).toBe(reasons[0]);
  });
});
