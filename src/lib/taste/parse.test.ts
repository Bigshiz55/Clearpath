import { describe, it, expect } from 'vitest';
import { parseAnswer, splitClauses, splitSentences } from './parse';
import type { Claim } from './types';

const AT = 1_700_000_000_000;
const ctx = (over: Partial<Parameters<typeof parseAnswer>[1]> = {}) => ({
  source: 'typed_interview' as const,
  at: AT,
  ...over,
});

const attr = (claims: Claim[], key: string) => claims.find((c) => c.attribute === key);
const titled = (claims: Claim[]) => claims.filter((c) => c.title && c.attribute === null);

describe('clause splitting', () => {
  it('splits on a contrast and drops the comma', () => {
    const c = splitClauses('I hate science fiction, but I loved Severance');
    expect(c.map((x) => x.text)).toEqual(['I hate science fiction', 'I loved Severance']);
    expect(c[1]?.connective).toBe('contrast');
  });

  it('treats "unless" as a suspending condition', () => {
    const c = splitClauses('I dislike foreign-language titles unless they have English audio');
    expect(c[1]?.connective).toBe('suspend');
  });

  it('never splits on a connective that opens the sentence', () => {
    const c = splitClauses('But I loved Severance');
    expect(c).toHaveLength(1);
  });

  it('splits sentences on punctuation and newlines', () => {
    expect(splitSentences('One. Two!\nThree')).toEqual(['One.', 'Two!', 'Three']);
  });
});

describe('the five statements the model must get right', () => {
  it('"I hate science fiction, but I loved Severance"', () => {
    const claims = parseAnswer('I hate science fiction, but I loved Severance', ctx());
    const sci = attr(claims, 'sci_fi');
    expect(sci).toBeDefined();
    expect(sci?.polarity).toBe(-1);
    expect(sci?.strength).toBeGreaterThan(0.8);
    expect(sci?.durability).toBe('durable');

    const [t] = titled(claims);
    expect(t?.title?.text).toBe('Severance');
    expect(t?.reaction).toBe('loved');
    // The user drew the link themselves by saying "but".
    expect(t?.contrasts).toContain(sci?.id);
  });

  it('"I hate slow shows, but I loved Mindhunter"', () => {
    const claims = parseAnswer('I hate slow shows, but I loved Mindhunter', ctx());
    const slow = attr(claims, 'slow_pace');
    expect(slow?.polarity).toBe(-1);
    const [t] = titled(claims);
    expect(t?.title?.text).toBe('Mindhunter');
    expect(t?.contrasts).toContain(slow?.id);
  });

  it('"I do not like horror, but I loved The Silence of the Lambs"', () => {
    const claims = parseAnswer('I do not like horror, but I loved The Silence of the Lambs', ctx());
    const horror = attr(claims, 'horror');
    expect(horror?.polarity).toBe(-1);
    const [t] = titled(claims);
    expect(t?.title?.text).toBe('The Silence of the Lambs');
    expect(t?.reaction).toBe('loved');
  });

  it('"I dislike foreign-language titles unless they have English audio"', () => {
    const claims = parseAnswer('I dislike foreign-language titles unless they have English audio', ctx());
    const f = attr(claims, 'foreign_language');
    expect(f?.polarity).toBe(-1);
    expect(f?.scope).toBe('conditional');
    expect(f?.condition?.mode).toBe('suspends');
    expect(f?.condition?.attributes).toContain('english_audio');
  });

  it('"I tolerate violence when the investigation is strong"', () => {
    const claims = parseAnswer('I tolerate violence when the investigation is strong', ctx());
    const v = attr(claims, 'violence');
    // Tolerating is not liking — this must never make us seek out violence.
    expect(v?.polarity).toBe(-1);
    expect(v?.strength).toBeLessThan(0.4);
    expect(v?.scope).toBe('conditional');
    expect(v?.condition?.mode).toBe('suspends');
    expect(v?.condition?.attributes).toContain('investigation');
  });
});

describe('polarity, strength and hedging', () => {
  it('"love" outranks "like" outranks "kind of like"', () => {
    const s = (t: string) => attr(parseAnswer(t, ctx()), 'comedy')?.strength ?? 0;
    expect(s('I love comedies')).toBeGreaterThan(s('I like comedies'));
    expect(s('I like comedies')).toBeGreaterThan(s('I kind of like comedies'));
  });

  it('"sometimes" weakens a claim more than "usually"', () => {
    const s = (t: string) => attr(parseAnswer(t, ctx()), 'horror')?.strength ?? 0;
    expect(s('I sometimes like horror')).toBeLessThan(s('I usually like horror'));
  });

  it('reads a negated verb rather than the bare one', () => {
    expect(attr(parseAnswer("I don't like romance", ctx()), 'romance_genre')?.polarity).toBe(-1);
    expect(attr(parseAnswer('I do not enjoy romance', ctx()), 'romance_genre')?.polarity).toBe(-1);
  });

  it('carries polarity across "and", and flips it after "but not"', () => {
    const claims = parseAnswer('I like crime and thrillers but not gore', ctx());
    expect(attr(claims, 'crime')?.polarity).toBe(1);
    expect(attr(claims, 'thriller')?.polarity).toBe(1);
    expect(attr(claims, 'gore')?.polarity).toBe(-1);
  });
});

describe('durable versus temporary', () => {
  it('a mood marker makes a claim temporary', () => {
    const c = attr(parseAnswer("Lately I can't stand anything dark", ctx()), 'dark_tone');
    expect(c?.durability).toBe('temporary');
  });

  it('"tonight" is a request, not a personality', () => {
    const c = attr(parseAnswer('Tonight I want something feel-good', ctx()), 'feel_good');
    expect(c?.durability).toBe('temporary');
  });

  it('a plain stated taste is durable', () => {
    const c = attr(parseAnswer('I hate reality TV', ctx()), 'reality');
    expect(c?.durability).toBe('durable');
  });
});

describe('titles', () => {
  it('resolves a known title to its id without asking', () => {
    const claims = parseAnswer('I loved Severance', ctx({
      knownTitles: [{ titleId: 'tv:95396', title: 'Severance' }],
    }));
    const [t] = titled(claims);
    expect(t?.title?.titleId).toBe('tv:95396');
    expect(t?.title?.needsConfirmation).toBe(false);
  });

  it('flags an unrecognised title for confirmation instead of guessing', () => {
    const [t] = titled(parseAnswer('I loved Ozark', ctx()));
    expect(t?.title?.needsConfirmation).toBe(true);
    expect(t?.confidence).toBeLessThan(0.6);
  });

  it('reads a quoted title even when it is lowercase', () => {
    const [t] = titled(parseAnswer('I loved "the bear"', ctx()));
    expect(t?.title?.text).toBe('the bear');
  });

  it('records abandonment as its own reaction', () => {
    const [t] = titled(parseAnswer("I couldn't finish Westworld", ctx()));
    expect(t?.reaction).toBe('abandoned');
    expect(t?.polarity).toBe(-1);
  });

  it('does not invent a title out of ordinary words', () => {
    expect(titled(parseAnswer('I like slow shows', ctx()))).toHaveLength(0);
  });
});

describe('saying nothing rather than guessing', () => {
  it('an unparseable answer produces no claims', () => {
    expect(parseAnswer('hmm, not sure really', ctx())).toEqual([]);
    expect(parseAnswer('', ctx())).toEqual([]);
    expect(parseAnswer('asdf qwerty', ctx())).toEqual([]);
  });

  it('an attribute with no opinion attached produces no claim', () => {
    expect(parseAnswer('horror movies exist', ctx())).toEqual([]);
  });

  it('every claim quotes the user verbatim', () => {
    const text = 'I hate science fiction, but I loved Severance';
    for (const c of parseAnswer(text, ctx())) {
      expect(text).toContain(c.quote);
    }
  });

  it('ids are stable and unique for a given prefix', () => {
    const a = parseAnswer('I like comedy and I hate horror', ctx({ idPrefix: 'q1' }));
    const b = parseAnswer('I like comedy and I hate horror', ctx({ idPrefix: 'q1' }));
    expect(a.map((c) => c.id)).toEqual(b.map((c) => c.id));
    expect(new Set(a.map((c) => c.id)).size).toBe(a.length);
    expect(a[0]?.id.startsWith('q1:')).toBe(true);
  });
});
