import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const read = (p: string) => readFileSync(join(__dirname, '..', '..', '..', p), 'utf8');

/**
 * RELIABILITY SPRINT — item 6, "make all three Packs reliably usable."
 * Source-level on purpose: these are server components / server-only
 * modules that need a real (or heavily mocked) Supabase + TVmaze backend to
 * render meaningfully.
 */

describe('Hallmark Universe — the lazy ingest that runs on a visitor\'s own page load is bounded', () => {
  it('the Pack page declares a maxDuration long enough for an inline ingest to finish honestly', () => {
    const src = read('src/app/packs/[slug]/page.tsx');
    expect(src).toMatch(/export const maxDuration = 60/);
  });

  it('every TVmaze fetch call is wrapped in an AbortController timeout, not left unbounded', () => {
    const src = read('src/lib/viewing/ingest/tvmazeIngest.ts');
    expect(src).toMatch(/const FETCH_TIMEOUT_MS = 10_000/);
    expect(src).toMatch(/new AbortController\(\)/);
    expect(src).toMatch(/signal: controller\.signal/);
  });
});

describe('Crime Case Files — an all-unmatched list reads as "not yet curated," not as a broken feature', () => {
  const src = read('src/components/packs/CaseList.tsx');

  it('shows an explanatory banner when there are unmatched episodes but zero verified Cases', () => {
    expect(src).toMatch(/cases\.length === 0 && unmatched\.length > 0/);
    expect(src).toMatch(/reviewed by hand, not guessed automatically/);
  });

  it('never implies the unmatched episodes themselves are fake or missing — they\'re real listings', () => {
    expect(src).toMatch(/the episodes below are real listings/);
  });
});

describe('the two case-linking pipelines are honestly documented as separate, not silently contradictory', () => {
  const src = read('src/lib/packs/cases.ts');

  it('beforeYouWatch no longer claims reviewQueue.ts writes to case_programmes (it doesn\'t)', () => {
    expect(src).not.toMatch(/Uses only CONFIRMED case_programmes links \(human-reviewed/);
  });

  it('documents that reviewQueue.ts is a separate pipeline that does not write case_programmes', () => {
    expect(src).toContain('reviewQueue.ts` is a separate');
    expect(src).toMatch(/does not write here/);
  });
});
