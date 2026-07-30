import { describe, it, expect } from 'vitest';
import { buildQueryPlan, extractCount } from './queryPlan';

describe('query planner — the Lifetime regression', () => {
  it('PERMANENT: "Send me three movies I should watch on Lifetime"', () => {
    const p = buildQueryPlan('Send me three movies I should watch on Lifetime');
    expect(p.intent).toBe('recommendation');
    expect(p.count.requested).toBe(3);
    expect(p.mediaTypes).toEqual(['movie']);
    expect(p.sources).toHaveLength(1);
    expect(p.sources[0]).toMatchObject({ canonicalName: 'Lifetime', sourceType: 'network', required: true });
    expect(p.personalized).toBe(true);
    expect(p.hardConstraints).toContain('mediaType=movie');
    expect(p.hardConstraints).toContain('count=3');
    expect(p.hardConstraints).toContain('source=Lifetime(network)');
  });

  it('count extraction across phrasings', () => {
    for (const [q, n] of [['3 movies', 3], ['three films', 3], ['a couple of movies', 2], ['a few shows', 3], ['several', 4], ['one movie', 1]] as const) {
      expect(extractCount(q), q).toBe(n);
    }
  });

  it('media words normalize; "movies" never implies tv', () => {
    expect(buildQueryPlan('3 movies on Lifetime').mediaTypes).toEqual(['movie']);
    expect(buildQueryPlan('3 films on Lifetime').mediaTypes).toEqual(['movie']);
    expect(buildQueryPlan('3 shows on Hulu').mediaTypes).toEqual(['tv_series']);
  });

  it('network vs streaming provider is distinguished', () => {
    expect(buildQueryPlan('movies on Lifetime').sources[0]?.sourceType).toBe('network');
    expect(buildQueryPlan('movies on Netflix').sources[0]?.sourceType).toBe('streaming_provider');
    expect(buildQueryPlan('movies on lmn').sources[0]?.canonicalName).toBe('Lifetime Movie Network');
  });

  it('LMN is NOT auto-included for a bare "Lifetime" request', () => {
    const p = buildQueryPlan('three Lifetime movies');
    expect(p.sources.map((s) => s.canonicalName)).toEqual(['Lifetime']);
    expect(p.sources.map((s) => s.canonicalName)).not.toContain('Lifetime Movie Network');
  });

  it('multi-group: "2 movies on Lifetime and 3 shows on Hulu" → two independent groups', () => {
    const p = buildQueryPlan('2 movies on Lifetime and 3 shows on Hulu');
    expect(p.groups).toHaveLength(2);
    expect(p.groups![0]).toMatchObject({ count: 2, mediaTypes: ['movie'] });
    expect(p.groups![0]!.sources[0]!.canonicalName).toBe('Lifetime');
    expect(p.groups![1]).toMatchObject({ count: 3, mediaTypes: ['tv_series'] });
    expect(p.groups![1]!.sources[0]!.canonicalName).toBe('Hulu');
  });

  it('ambiguous "three Hallmark movies" surfaces one follow-up', () => {
    const p = buildQueryPlan('three Hallmark movies');
    expect(p.ambiguities.length).toBeGreaterThan(0);
    expect(p.ambiguities[0]).toMatch(/Hallmark/);
  });
});

// ── Adversarial corpus: thousands of realistic phrasings ─────────────────────
describe('query planner — adversarial corpus', () => {
  const COUNTS = [['1', 1], ['2', 2], ['3', 3], ['two', 2], ['three', 3], ['a couple of', 2], ['a few', 3]] as const;
  const MEDIA = [['movies', 'movie'], ['films', 'movie'], ['shows', 'tv_series'], ['series', 'tv_series']] as const;
  const SOURCES = [['Lifetime', 'Lifetime', 'network'], ['life time', 'Lifetime', 'network'], ['Netflix', 'Netflix', 'streaming_provider'], ['LMN', 'Lifetime Movie Network', 'network'], ['Hulu', 'Hulu', 'streaming_provider'], ['Prime', 'Prime Video', 'streaming_provider']] as const;
  const PREPS = ['on', 'from'];
  const VERBS = ['', 'send me ', 'give me ', 'find ', 'show me ', 'i want ', 'recommend '];

  const cases: { q: string; count: number; media: string; src: string; type: string }[] = [];
  for (const [cw, cn] of COUNTS) for (const [mw, mk] of MEDIA) for (const [sw, sn, st] of SOURCES) for (const prep of PREPS) for (const v of VERBS) {
    cases.push({ q: `${v}${cw} ${mw} ${prep} ${sw}`.trim(), count: cn, media: mk, src: sn, type: st });
  }

  it(`plans ${cases.length} combinations with correct count/media/source`, () => {
    let pass = 0;
    const fails: string[] = [];
    for (const c of cases) {
      const p = buildQueryPlan(c.q);
      const ok = p.count.requested === c.count
        && p.mediaTypes[0] === c.media
        && p.sources[0]?.canonicalName === c.src
        && p.sources[0]?.sourceType === c.type
        && p.sources[0]?.required === true;
      if (ok) pass++; else if (fails.length < 10) fails.push(`${c.q} → count=${p.count.requested} media=${p.mediaTypes[0]} src=${p.sources[0]?.canonicalName}`);
    }
    expect(fails, fails.join(' | ')).toEqual([]);
    expect(pass).toBe(cases.length);
  });
});
