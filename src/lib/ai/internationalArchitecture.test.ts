import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * ARCHITECTURE INVARIANTS for the international/audio contract — these protect
 * the "one shared meaning, no silent drift, no double-LLM" guarantees at the
 * SOURCE-STRUCTURE level, so a future refactor cannot quietly reintroduce a
 * second implementation.
 */

const read = (rel: string) => readFileSync(resolve(process.cwd(), rel), 'utf8');

describe('one shared writer of the international finder flags', () => {
  // The ONLY module allowed to ASSIGN the intl gates is the shared applier.
  const flagAssign = /\.(englishDubOnly|nonEnglishOriginal|englishOriginalOnly|excludeOriginalLanguages)\s*=/;
  for (const rel of [
    'src/lib/askInternational.ts',
    'src/lib/ai/canonicalToQuery.ts',
    'src/lib/ai/constraintReceipt.ts',
    'src/lib/finder.ts',
  ]) {
    it(`${rel} does NOT assign the intl gates directly (it goes through the applier / only reads)`, () => {
      expect(read(rel)).not.toMatch(flagAssign);
    });
  }
  it('the shared applier IS the writer', () => {
    expect(read('src/lib/nlu/internationalConstraints.ts')).toMatch(/q\.englishDubOnly = true/);
  });
});

describe('finder and ask share the same international implementation', () => {
  it('the legacy path routes through applyInternationalConstraints', () => {
    expect(read('src/lib/askInternational.ts')).toMatch(/applyInternationalConstraints/);
    expect(read('src/lib/askInternational.ts')).toMatch(/fromLegacyDetectors/);
  });
  it('the canonical path routes through the SAME applyInternationalConstraints', () => {
    expect(read('src/lib/ai/canonicalToQuery.ts')).toMatch(/applyInternationalConstraints/);
  });
  it('augmentInternational (shared by both routes) is imported by finder AND ask', () => {
    expect(read('src/app/api/finder/route.ts')).toMatch(/augmentInternational/);
    expect(read('src/app/api/ask/route.ts')).toMatch(/augmentInternational/);
  });
});

describe('Anthropic success does not re-invoke the OpenAI parser', () => {
  it('the finder route returns on AI search/clarify BEFORE parseAskWithAI', () => {
    const src = read('src/app/api/finder/route.ts');
    const aiBlock = src.indexOf("aiMode === 'anthropic'");
    const openaiParse = src.indexOf('parseAskWithAI(text)');
    expect(aiBlock).toBeGreaterThan(-1);
    expect(openaiParse).toBeGreaterThan(aiBlock);
    // Between the AI block and the OpenAI parse there is a return for the search
    // branch, so a successful anthropic interpretation never reaches gpt-4o-mini.
    const between = src.slice(aiBlock, openaiParse);
    expect(between).toMatch(/kind === 'search'/);
    expect(between).toMatch(/return finderJson/);
  });
});
