/**
 * A REMARK IS NOT AN ORDER.
 *
 * The deployed harness caught this against a real preview: "My wife likes
 * comedies." came back with 24 comedies. The interpreter was never wrong —
 * it read the sentence as a `statement` with an empty request clause — but no
 * branch in `/api/ask` ever asked whether the utterance contained a request, so
 * the discovery arms ran anyway and a legacy parser found the word "comedies".
 *
 * These tests pin the boundary itself and the three controls that prove it is a
 * rule about REQUESTS and not about wives, companions or comedies.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { interpret } from '@/lib/interpret/interpret';
import { acknowledgeStatement, isBareStatement, statementRecord } from './statementBoundary';

const ROOT = join(__dirname, '..', '..', '..');
const route = readFileSync(join(ROOT, 'src/app/api/ask/route.ts'), 'utf8');

describe('the statement boundary', () => {
  it('a third-party preference states a fact and asks for nothing', () => {
    const intent = interpret('My wife likes comedies.');
    expect(intent.kind).toBe('statement');
    expect(intent.requestClause).toBe('');
    expect(isBareStatement(intent)).toBe(true);
  });

  it('holds for first-person and negative statements too — it reads kind, not wording', () => {
    for (const text of [
      'I like comedies.',
      'My brother hates horror.',
      'We watched Yellowstone last night.',
      'My kids love animation.',
    ]) {
      expect(isBareStatement(interpret(text)), text).toBe(true);
    }
  });

  /* THE CONTROLS. Each of these carries a real request, so each must still
     execute. A boundary that silences them would trade one defect for a worse
     one. */
  it('a statement FOLLOWED by a request still searches', () => {
    const intent = interpret('I like Yellowstone. What should I watch?');
    expect(intent.kind).toBe('recommendation');
    expect(isBareStatement(intent)).toBe(false);
  });

  it('a request wrapped in irrelevant background still searches', () => {
    const intent = interpret('I had a burrito and want something fun tonight.');
    expect(intent.kind).toBe('recommendation');
    expect(isBareStatement(intent)).toBe(false);
  });

  it("a companion's taste plus a request still searches, and keeps the companion's genre", () => {
    const intent = interpret('My wife likes comedies. What should we watch?');
    expect(intent.kind).toBe('recommendation');
    expect(isBareStatement(intent)).toBe(false);
    expect(intent.genres.map((g) => g.holder)).toContain('companion');
  });

  it('ordinary requests are never statements', () => {
    for (const text of [
      'another boxing movie',
      'movies about chess',
      'three Sylvester Stallone movies',
      "a thriller that isn't slow",
      'Looking for a good thriller',
      'I want a thriller, nothing scary',
    ]) {
      expect(isBareStatement(interpret(text)), text).toBe(false);
    }
  });
});

describe('what the acknowledgement may say', () => {
  it('reads back only what the sentence actually carried', () => {
    const intent = interpret('My wife likes comedies.');
    const record = statementRecord(intent);
    expect(record.length).toBeGreaterThan(0);
    expect(record.join(' ')).toMatch(/comed/i);
    // The holder was recorded, so the read-back may not claim it as the user's.
    expect(record.join(' ')).toMatch(/watching with you/i);
  });

  it('asks for the request the sentence did not contain', () => {
    expect(acknowledgeStatement(interpret('My wife likes comedies.'))).toMatch(/mood for\?$/);
  });

  it('never invents a subject the statement did not name', () => {
    const text = acknowledgeStatement(interpret('I like comedies.'));
    expect(text).not.toMatch(/thriller|horror|western|documentary/i);
  });

  it('degrades to a bare acknowledgement when nothing was recorded', () => {
    const intent = interpret('My wife likes comedies.');
    const bare = { ...intent, genres: [], tones: [], subjects: [], people: [], titles: [], providers: [] };
    expect(acknowledgeStatement(bare)).toBe('Noted. What are you in the mood for?');
  });
});

describe('where the boundary sits in /api/ask', () => {
  const at = (needle: string) => {
    const i = route.indexOf(needle);
    expect(i, `route.ts no longer contains: ${needle}`).toBeGreaterThan(-1);
    return i;
  };

  it('runs before every arm that could execute a discovery search', () => {
    const boundary = at('isBareStatement(canonical)');
    // 2a) conversation-driven discovery
    expect(boundary).toBeLessThan(at('if (conversational && convState &&'));
    // the canonical execution + the shared finder call
    expect(boundary).toBeLessThan(at('await resolveCanonicalExecution('));
    expect(boundary).toBeLessThan(at('runFinder('));
  });

  /* AND AFTER THE TITLE ARM, WHICH IS NOT A DISCOVERY SEARCH. A bare title is a
     `statement` to the interpreter as well — "Rocky" asserts a name and frames
     no request — so a boundary placed above the lookup would answer "Rocky"
     with "Noted. What are you in the mood for?" instead of a verdict. */
  it('runs after the named-title lookup, so a bare title still gets its verdict', () => {
    expect(at('isBareStatement(canonical)')).toBeGreaterThan(at('await askJudgeTitle('));
    expect(isBareStatement(interpret('Rocky'))).toBe(true);
    expect(isBareStatement(interpret('Severance'))).toBe(true);
  });

  it('returns no items, so nothing can be rendered as a recommendation', () => {
    /* The branch's own extent, not a character budget: the fold that keeps
       "Noted" honest legitimately grew the branch past the old 700-char slice,
       and a window that fails on growth pins spelling, not the contract. */
    const start = route.indexOf('isBareStatement(canonical)');
    const guard = route.slice(start, route.indexOf('// 2a)', start));
    expect(guard).toMatch(/kind: 'clarify'/);
    expect(guard).toMatch(/items: \[\]/);
  });

  it('defers to the branches that already settled a browse or a comparison', () => {
    const line = route.split('\n').find((l) => l.includes('isBareStatement(canonical)')) ?? '';
    expect(line).toMatch(/!criticRequest/);
    expect(line).toMatch(/!lex/);
  });
});
