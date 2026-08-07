import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { resolveCanonicalToResult } from './discoveryBridge';
import { CanonicalDiscoveryRequestSchema } from './schemas';

/**
 * ARCHITECTURAL SEPARATION TESTS (§32). These prove, at the source level, the
 * one invariant the whole design rests on: Claude = intelligence, the database +
 * verified providers = factual truth. They fail if a future change lets an LLM
 * become the source of a factual TV record, or lets a vendor SDK leak outside the
 * one sanctioned adapter.
 */

const root = process.cwd();
const read = (rel: string) => readFileSync(resolve(root, rel), 'utf8');

/** Modules that produce FACTUAL TV/schedule data. None may reach for an LLM —
 *  a schedule fact must come from a verified feed, never from model memory
 *  (CASE A: "what's on CBS tonight?" and CASE E: missing-EPG must degrade,
 *  never be filled from pretraining). */
const FACT_MODULES = [
  'src/lib/onTv.ts',
  'src/lib/tv/ingestedGuide.ts',
  'src/lib/tv/health.ts',
  'src/lib/tv/platform/query.ts',
  'src/lib/watchmode/cardAvailability.ts',
];

const LLM_MARKERS = [
  /@anthropic-ai\/sdk/,
  /from ['"]openai['"]/,
  /api\.openai\.com/,
  /from ['"].*\/ai\/orchestrator['"]/,
  /interpretDiscoveryRequest|continueDiscoveryConversation|adjudicateSubjectCentrality/,
];

describe('factual TV data paths contain no LLM calls (CASE A / CASE E)', () => {
  for (const mod of FACT_MODULES) {
    it(`${mod} imports no LLM client and calls no interpreter`, () => {
      const src = read(mod);
      for (const marker of LLM_MARKERS) {
        expect(marker.test(src), `${mod} should not reference ${marker}`).toBe(false);
      }
    });
  }
});

describe('the Anthropic SDK is confined to the one adapter', () => {
  it('only src/lib/ai/anthropic.ts imports @anthropic-ai/sdk', () => {
    // The adapter references the SDK...
    expect(read('src/lib/ai/anthropic.ts')).toMatch(/@anthropic-ai\/sdk/);
    // ...and the product-facing modules never do (they depend on the interface).
    for (const mod of [
      'src/lib/ai/orchestrator.ts',
      'src/lib/ai/discoveryBridge.ts',
      'src/lib/ai/tools.ts',
      'src/app/api/ask/route.ts',
      'src/app/api/finder/route.ts',
    ]) {
      expect(read(mod)).not.toMatch(/@anthropic-ai\/sdk/);
    }
  });
});

describe('the interpreter defers factual-lookup intents to deterministic handlers', () => {
  const dummySupabase = {} as never;

  it('exact_title is not answered by the AI discovery bridge', async () => {
    const req = CanonicalDiscoveryRequestSchema.parse({
      intent: 'exact_title',
      interpretationSummary: 'is Gone any good',
    });
    const out = await resolveCanonicalToResult(dummySupabase, 'user-1', req, 10);
    expect(out.kind).toBe('unavailable');
  });

  it('live_tv defers as well (linear airings are a verified-data concern)', async () => {
    const req = CanonicalDiscoveryRequestSchema.parse({
      intent: 'live_tv',
      interpretationSummary: 'what is on tonight',
    });
    const out = await resolveCanonicalToResult(dummySupabase, 'user-1', req, 10);
    expect(out.kind).toBe('unavailable');
  });
});
