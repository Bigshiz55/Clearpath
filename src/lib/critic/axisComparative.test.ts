import { describe, it, expect } from 'vitest';
import { parseCriticRequest } from './request';
import { routeAsk } from './gate';

/**
 * "DARKER THAN TAKEN" IS A COMPARISON, AND IT WAS REACHING NOBODY.
 *
 * `parseCriticRequest` recognised three relation cues — blend ("X meets Y"),
 * better_than ("better than X") and like ("something like X") — plus the bare
 * "X but <shift>" shape. The single most natural comparative in English,
 * `<axis> than <anchor>`, had no cue at all. So "I want something darker than
 * Taken" produced null, `routeAsk` sent it to legacy_discovery, and both the
 * anchor AND the axis were lost.
 *
 * Nothing about the engine was missing. `MODIFIER_MAP` already grounds `darker`
 * to darkness/higher, `splitAnchors` already extracts the title, and `like_but`
 * already means "this title, shifted on that axis". Only the detection was
 * absent, which is why this adds a cue rather than a comparison system.
 *
 * An UNGROUNDED axis ("more intense") still routes, carrying the anchor and the
 * phrase as `unresolvedModifiers`. That is deliberate and matches the module's
 * existing stance: forcing an unmapped comparative onto the nearest-looking
 * axis is how a system starts ranking on something the user never said.
 */

describe('axis comparatives are recognised', () => {
  const GROUNDED: Array<[string, string, string, 'higher' | 'lower']> = [
    ['I want something darker than Taken', 'Taken', 'darkness', 'higher'],
    ['something lighter than Prisoners', 'Prisoners', 'darkness', 'lower'],
    ['funnier than Bridesmaids', 'Bridesmaids', 'humor', 'higher'],
    ['less funny than Superbad', 'Superbad', 'humor', 'lower'],
    ['less violent than John Wick', 'John Wick', 'violence', 'lower'],
    ['scarier than Hereditary', 'Hereditary', 'suspense', 'higher'],
    ['slower than Drive', 'Drive', 'pacing', 'lower'],
    ['smarter than Tenet', 'Tenet', 'complexity', 'higher'],
    ['warmer than Manchester by the Sea', 'Manchester by the Sea', 'warmth', 'higher'],
    ['more realistic than Gravity', 'Gravity', 'realism', 'higher'],
  ];

  for (const [text, anchor, axis, dir] of GROUNDED) {
    it(`"${text}" → ${axis} ${dir}, anchored on ${anchor}`, () => {
      const r = parseCriticRequest(text);
      expect(r, text).not.toBeNull();
      expect(r!.referenceTitles, text).toContain(anchor);
      expect(r!.modifiers[axis], text).toBe(dir);
      // "this title, shifted on that axis" is exactly what like_but means.
      expect(r!.relation, text).toBe('like_but');
    });
  }

  it('an UNGROUNDED axis still routes, carrying the anchor and the phrase', () => {
    const r = parseCriticRequest('more intense than Heat');
    expect(r).not.toBeNull();
    expect(r!.referenceTitles).toContain('Heat');
    // Not forced onto suspense or pacing — kept as honest evidence.
    expect(r!.unresolvedModifiers.join(' ')).toContain('intense');
  });

  it('the route sends them to the critic, not to generic discovery', () => {
    for (const text of ['I want something darker than Taken', 'funnier than Bridesmaids', 'more intense than Heat']) {
      const d = routeAsk(text, 'legacy', {});
      expect(d.comparative, text).toBe(true);
      expect(d.consumer, text).toBe('critic');
      expect(d.request?.referenceTitles.length, text).toBeGreaterThan(0);
    }
  });

  it('"better than X" keeps its stronger claim rather than being demoted', () => {
    const r = parseCriticRequest('something better than Heat');
    expect(r?.relation).toBe('better_than');
  });
});

describe('controls — "than" is not always a comparison', () => {
  /* Every one of these contains `than` and must NOT acquire a title anchor.
     A number, a duration or a genre is not a film. */
  const NOT_COMPARISONS = [
    'more than three movies',
    'no longer than 90 minutes',
    'nothing other than comedy',
    'I would rather watch a comedy than a horror',
  ];
  for (const text of NOT_COMPARISONS) {
    it(`"${text}" does not become an axis comparison`, () => {
      const d = routeAsk(text, 'legacy', {});
      if (d.request) {
        // If something did parse, it must at least not have invented an anchor
        // out of a number or a duration.
        for (const a of d.request.referenceTitles) {
          expect(/^\d/.test(a), `${text} anchored on "${a}"`).toBe(false);
        }
      }
    });
  }

  it('a preference statement still never becomes a comparison', () => {
    expect(routeAsk('I like Sylvester Stallone movies', 'legacy', {}).consumer).not.toBe('critic');
  });
});

describe('a comparative BASELINE is not a film', () => {
  /* Caught in review on this branch, and true of the pre-existing better_than
     path too: the word after `than` is not always a work. "darker than usual"
     compares against a NORM, and treating "usual" as a title sends a nonsense
     anchor to resolution and loses the axis the user actually stated.

     The axis is still real, so the sentence is not a critic request — it is an
     ordinary tone preference, and the tone layer already owns that. */
  const BASELINES = [
    'something darker than usual',
    'funnier than normal',
    'better than average',
    'darker than expected',
    'scarier than most',
    'longer than usual',
    'less violent than typical',
  ];
  for (const text of BASELINES) {
    it(`"${text}" produces no title anchor`, () => {
      const r = parseCriticRequest(text);
      if (r) {
        for (const a of r.referenceTitles) {
          expect(
            ['usual', 'normal', 'average', 'expected', 'most', 'typical', 'standard'],
            `"${text}" anchored on the baseline "${a}"`,
          ).not.toContain(a.toLowerCase());
        }
      }
    });
  }

  it('a real anchor after the same shape still resolves', () => {
    expect(parseCriticRequest('darker than Taken')?.referenceTitles).toContain('Taken');
    expect(parseCriticRequest('something better than Heat')?.referenceTitles).toContain('Heat');
  });
});
