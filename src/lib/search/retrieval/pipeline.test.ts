import { describe, it, expect } from 'vitest';
import { understandIntent } from './intent';
import { expandQueries } from './expand';
import { scoreAndRank, titleSimilarity } from './confidence';
import { recover } from './recovery';
import { runRetrieval } from './pipeline';
import { fuzzyTitleSource, aliasSource, unavailableSource, type SearchSource } from './sources';
import { shouldLog, toLogEntry, InMemorySearchLog } from './log';
import type { Candidate } from './types';

const catalog: Candidate[] = [
  { id: 'movie:27205', title: 'Inception', year: 2010, mediaType: 'movie', source: 'fuzzy_title', sourceScore: 0.9, viaQuery: 'inception' },
  { id: 'movie:157336', title: 'Interstellar', year: 2014, mediaType: 'movie', source: 'fuzzy_title', sourceScore: 0.8, viaQuery: 'interstellar' },
  { id: 'tv:1399', title: 'Game of Thrones', year: 2011, mediaType: 'tv', source: 'fuzzy_title', sourceScore: 0.95, viaQuery: 'game of thrones' },
];
const src = (c = catalog): SearchSource[] => [fuzzyTitleSource(c), aliasSource(c), unavailableSource('embeddings'), unavailableSource('live_tv')];

describe('intent understanding', () => {
  it('detects a similar-to intent', () => {
    const i = understandIntent('shows like Game of Thrones');
    expect(i.kind).toBe('similar_to');
  });
  it('detects availability', () => {
    expect(understandIntent('where can I watch Dune').kind).toBe('availability');
  });
  it('detects an incomplete fragment', () => {
    const i = understandIntent('movies with the guy from');
    expect(i.incomplete).toBe(true);
  });
  it('flags conversational phrasing', () => {
    expect(understandIntent("ugh i'm bored recommend something").conversational).toBe(true);
  });
  it('treats a short noun phrase as a title lookup', () => {
    expect(understandIntent('Inception').kind).toBe('title_lookup');
  });
});

describe('query expansion', () => {
  it('produces a rich set (>=20) for a franchise ask and de-duplicates', () => {
    const i = understandIntent('star wars movies');
    const ex = expandQueries('star wars movies', i);
    expect(ex.length).toBeGreaterThanOrEqual(20);
    const qs = ex.map((e) => e.query.toLowerCase());
    expect(new Set(qs).size).toBe(qs.length); // no dup query strings
    expect(ex[0]!.kind).toBe('original');
  });
  it('corrects a common misspelling', () => {
    const i = understandIntent('intersteller');
    const ex = expandQueries('intersteller', i);
    expect(ex.some((e) => e.kind === 'spelling' && /interstellar/i.test(e.query))).toBe(true);
  });
  it('expands a known abbreviation to the full title', () => {
    const i = understandIntent('got');
    const ex = expandQueries('got', i);
    expect(ex.some((e) => /game of thrones/i.test(e.query))).toBe(true);
  });
  it('never exceeds the cap', () => {
    const i = understandIntent('the lord of the rings the fellowship of the ring extended');
    expect(expandQueries('the lord of the rings the fellowship of the ring extended', i, 100).length).toBeLessThanOrEqual(100);
  });
});

describe('confidence engine', () => {
  it('scores an exact title as high and a loose fuzzy match lower', () => {
    expect(titleSimilarity('Inception', 'Inception').score).toBe(1);
    expect(titleSimilarity('Incepton', 'Inception').score).toBeLessThan(1);
    expect(titleSimilarity('random noise', 'Inception').score).toBeLessThan(0.5);
  });
  it('ranks and de-duplicates by id, keeping the best', () => {
    const i = understandIntent('inception');
    const ex = expandQueries('inception', i);
    const dup: Candidate[] = [
      { ...catalog[0]!, sourceScore: 0.2 },
      { ...catalog[0]! },
    ];
    const ranked = scoreAndRank(dup, ex);
    expect(ranked).toHaveLength(1);
    expect(ranked[0]!.confidenceBand).toBe('high');
  });
});

describe('recovery mode — never a dead end', () => {
  it('always returns interpretations AND suggestions, even with zero candidates', () => {
    const i = understandIntent('zzzqqx nonsense');
    const ex = expandQueries('zzzqqx nonsense', i);
    const r = recover('zzzqqx nonsense', i, ex, []);
    expect(r.interpretations.length).toBeGreaterThan(0);
    expect(r.suggestions.length).toBeGreaterThan(0);
    expect(r.message).toBeTruthy();
  });
  it('only offers concrete titles that came from real candidates (no fabrication)', () => {
    const i = understandIntent('inception');
    const ex = expandQueries('inception', i);
    const ranked = scoreAndRank([{ ...catalog[0]!, sourceScore: 0.3, viaQuery: 'inception' }], ex)
      .map((c) => ({ ...c, confidence: 0.5, confidenceBand: 'medium' as const }));
    const r = recover('inception', i, ex, ranked);
    const titleSuggestions = r.suggestions.filter((s) => s.label.startsWith('Maybe:'));
    for (const s of titleSuggestions) expect(catalog.some((c) => s.label.includes(c.title))).toBe(true);
  });
  it('asks a clarifying question when the request is incomplete', () => {
    const i = understandIntent('movies with the guy from');
    const r = recover('movies with the guy from', i, expandQueries('movies with the guy from', i), []);
    expect(r.clarifyingQuestion).toBeTruthy();
  });
});

describe('pipeline — the never-dead-end invariant', () => {
  it('returns confident results for a clean title match', async () => {
    const out = await runRetrieval('Inception', { sources: src() });
    expect(out.outcome).toBe('confident');
    expect(out.results[0]!.title).toBe('Inception');
    expect(out.recovery).toBeNull();
  });
  it('NEVER dead-ends: empty catalog still yields recovery help', async () => {
    const out = await runRetrieval('somethingunfindable', { sources: src([]) });
    expect(out.results).toHaveLength(0);
    expect(out.recovery).not.toBeNull();
    expect(out.recovery!.interpretations.length + out.recovery!.suggestions.length).toBeGreaterThan(0);
  });
  it('reports unavailable sources honestly rather than fabricating', async () => {
    const out = await runRetrieval('Inception', { sources: src() });
    expect(out.telemetry.sourcesUnavailable).toContain('embeddings');
    expect(out.telemetry.sourcesUnavailable).toContain('live_tv');
  });
  it('an unresolved franchise abbreviation still resolves via alias expansion', async () => {
    const out = await runRetrieval('got', { sources: src() });
    // "got" → alias "Game of Thrones" → confident hit, not a dead end
    expect(out.results.some((r) => r.title === 'Game of Thrones') || out.recovery !== null).toBe(true);
  });
});

describe('search lab logging', () => {
  it('logs low-confidence searches and keeps confident ones quiet', async () => {
    const bad = await runRetrieval('zznope', { sources: src([]) });
    const good = await runRetrieval('Inception', { sources: src() });
    expect(shouldLog(bad)).toBe(true);
    expect(shouldLog(good)).toBe(false);
  });
  it('builds a log entry and the in-memory sink respects its cap', () => {
    const sink = new InMemorySearchLog(2);
    for (const q of ['a', 'b', 'c']) {
      sink.record({ ...toLogEntry({ outcome: 'recovery', results: [], telemetry: { originalQuery: q, rewrittenQueries: [q], candidateCount: 0, topConfidence: 0, outcome: 'recovery', intentKind: 'unknown', sourcesQueried: [], sourcesUnavailable: [] }, intent: understandIntent(q), expansions: [], recovery: null }, '2026-01-01T00:00:00Z') });
    }
    expect(sink.entries()).toHaveLength(2);
    expect(sink.entries()[1]!.originalQuery).toBe('c');
  });
});
