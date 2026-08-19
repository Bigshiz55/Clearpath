/**
 * "another boxing movie" RETURNED NOTHING — AND THE INTERPRETER WAS RIGHT.
 *
 * The deployed harness measured zero results for a sentence `interpret()` reads
 * perfectly: `recommendation`, media `movie`, required subject `boxing`. The
 * loss happens one layer down, where `/api/ask`'s named-title arm re-reads the
 * raw utterance with `looksLikeTitleAsk` + `classifySearch`, strips the media
 * noun, and asks the catalog for a film called "another boxing". Discovery
 * never runs.
 *
 * These tests pin the seam. The rule is about OWNERSHIP, not about boxing: the
 * legacy extractor may not look up a span whose every identity-bearing word the
 * canonical reading has already bound to a subject, genre, tone, person or
 * provider. The controls prove real title asks are untouched — that is the half
 * that makes the fix a repair rather than a trade.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { interpret } from '@/lib/interpret/interpret';
import { classifySearch } from '@/lib/nlu/searchMode';
import { looksLikeTitleAsk } from '@/lib/askJudge';
import { canonicalClaimsSpan, canonicalClaimedWords } from './titleSpanOwnership';

const ROOT = join(__dirname, '..', '..', '..');
const route = readFileSync(join(ROOT, 'src/app/api/ask/route.ts'), 'utf8');

/** Exactly what the route computes before deciding whether to look up a title. */
function wouldEnterTitleArm(text: string): boolean {
  const intent = interpret(text);
  const cls = classifySearch(text);
  const canonicalRequestedTitle =
    intent.kind === 'lookup' ? intent.titles.find((t) => t.relation === 'requested')?.span ?? null : null;
  const span = canonicalRequestedTitle ?? cls.requestedTitle ?? text;
  const belongsElsewhere = canonicalRequestedTitle == null && canonicalClaimsSpan(intent, span);
  return looksLikeTitleAsk(text) && !belongsElsewhere;
}

describe('the sentence the deployed harness caught', () => {
  it('is read as a subject request, not a title', () => {
    const intent = interpret('another boxing movie');
    expect(intent.kind).toBe('recommendation');
    expect(intent.media).toBe('movie');
    expect(intent.subjects.map((s) => s.span)).toEqual(['boxing']);
    expect(intent.titles).toEqual([]);
  });

  it('is nonetheless offered to the title machinery as the phantom title "another boxing"', () => {
    // The defect, stated as a fact about the legacy readers. Both still behave
    // exactly as they did; what changes is that the route stops believing them.
    expect(looksLikeTitleAsk('another boxing movie')).toBe(true);
    expect(classifySearch('another boxing movie').requestedTitle).toBe('another boxing');
  });

  it('no longer enters the title arm, because the canonical reading owns every word of that span', () => {
    expect(wouldEnterTitleArm('another boxing movie')).toBe(false);
  });
});

describe('the same defect, other subjects — it was never about boxing', () => {
  it('blocks any determiner + subject + medium ask from the title arm', () => {
    for (const text of [
      'another boxing movie',
      'a boxing movie',
      'movies about chess',
      'a movie about chess',
      'two space movies',
      'another courtroom drama',
      'another western',
      'three Sylvester Stallone movies',
    ]) {
      expect(wouldEnterTitleArm(text), text).toBe(false);
    }
  });

  it('claims the words the canonical layer bound, and only those', () => {
    const claimed = canonicalClaimedWords(interpret('another boxing movie'));
    expect([...claimed]).toEqual(['boxing']);
    // The medium and the determiner are structure, not identity.
    expect(claimed.has('movie')).toBe(false);
    expect(claimed.has('another')).toBe(false);
  });

  it('a person the sentence named is a claim too', () => {
    const claimed = canonicalClaimedWords(interpret('three Sylvester Stallone movies'));
    expect(claimed.has('sylvester')).toBe(true);
    expect(claimed.has('stallone')).toBe(true);
  });
});

describe('the controls — a real title ask still reaches the title machinery', () => {
  it('bare names, names with a year, names with a provider, and explicit lookups all still enter', () => {
    for (const text of [
      'Rocky',
      'Severance',
      'Breaking Bad',
      'Snake Eyes',
      'The Lego Movie',
      'Dune 2021',
      'Creed 2015',
      'Gone on BritBox',
      'Is Yellowstone any good?',
      'What about Heat?',
      'put Yellowstone on trial',
      'judge The Bear',
    ]) {
      expect(wouldEnterTitleArm(text), text).toBe(true);
    }
  });

  it('a canonical lookup is never blocked, even if its words look like a subject', () => {
    // "Show me The Lego Movie" is `kind: 'lookup'`; the canonical span wins and
    // the ownership test is not consulted at all.
    const intent = interpret('Show me The Lego Movie');
    expect(intent.kind).toBe('lookup');
    expect(canonicalClaimsSpan(intent, 'The Lego Movie')).toBe(false);
  });

  it('a title span is not a claim — otherwise every named title would block itself', () => {
    const claimed = canonicalClaimedWords(interpret('I like Yellowstone. What should I watch?'));
    expect(claimed.has('yellowstone')).toBe(false);
  });

  it('says no when the canonical reading bound nothing at all', () => {
    expect(canonicalClaimsSpan(interpret('Rocky'), 'Rocky')).toBe(false);
    expect(canonicalClaimsSpan(null, 'Rocky')).toBe(false);
  });

  it('a span made only of structure names nothing, whatever the extractor produced', () => {
    expect(canonicalClaimsSpan(interpret('another movie'), 'another')).toBe(true);
  });
});

describe('where the fence sits in /api/ask', () => {
  it('gates the lookup itself, not something downstream of it', () => {
    const fence = route.indexOf('titleSpanBelongsElsewhere');
    const call = route.indexOf('await askJudgeTitle(');
    expect(fence).toBeGreaterThan(-1);
    expect(fence).toBeLessThan(call);
    const cond = route.slice(fence, call);
    expect(cond).toMatch(/!titleSpanBelongsElsewhere/);
  });

  it('never overrides a canonical lookup', () => {
    expect(route).toMatch(/canonicalRequestedTitle == null && canonicalClaimsSpan\(canonical, legacyTitleSpan\)/);
  });
});
