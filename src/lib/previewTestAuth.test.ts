import { describe, it, expect, afterEach } from 'vitest';
import {
  isPreviewTestAuthActive,
  isPreviewTestEmail,
  isActivePreviewTestFounder,
  previewTestSecret,
  PREVIEW_TEST_EMAIL,
} from './previewTestAuth';

/**
 * TEMPORARY mechanism, permanent safety properties. Two of these exist because
 * an earlier revision got it wrong: the secret was a hard-coded constant in a
 * file committed to a PUBLIC repository. These tests pin that the mechanism is
 * fail-closed on BOTH axes — environment and configured secret — so a
 * credential can never be smuggled back into the source to make it work.
 * Deleted together with the module after the Voice DNA live matrix completes.
 */

const savedVercelEnv = process.env.VERCEL_ENV;
const savedSecret = process.env.PREVIEW_TEST_SECRET;
const GOOD_SECRET = 'a'.repeat(32);

function restore(name: string, value: string | undefined): void {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}

afterEach(() => {
  restore('VERCEL_ENV', savedVercelEnv);
  restore('PREVIEW_TEST_SECRET', savedSecret);
});

describe('preview test auth fails closed', () => {
  it('is INACTIVE on production even with a secret configured', () => {
    process.env.VERCEL_ENV = 'production';
    process.env.PREVIEW_TEST_SECRET = GOOD_SECRET;
    expect(isPreviewTestAuthActive()).toBe(false);
    expect(isActivePreviewTestFounder(PREVIEW_TEST_EMAIL)).toBe(false);
  });

  it('is INACTIVE on preview when NO secret is configured', () => {
    process.env.VERCEL_ENV = 'preview';
    delete process.env.PREVIEW_TEST_SECRET;
    expect(previewTestSecret()).toBeNull();
    expect(isPreviewTestAuthActive()).toBe(false);
    expect(isActivePreviewTestFounder(PREVIEW_TEST_EMAIL)).toBe(false);
  });

  it('treats a too-short secret as unconfigured, not as weak protection', () => {
    process.env.VERCEL_ENV = 'preview';
    process.env.PREVIEW_TEST_SECRET = 'short';
    expect(previewTestSecret()).toBeNull();
    expect(isPreviewTestAuthActive()).toBe(false);
  });

  it('is INACTIVE in the test environment (NODE_ENV=test, no VERCEL_ENV)', () => {
    delete process.env.VERCEL_ENV;
    process.env.PREVIEW_TEST_SECRET = GOOD_SECRET;
    expect(isPreviewTestAuthActive()).toBe(false);
  });

  it('is ACTIVE only on preview WITH a secret, and grants only the one identity', () => {
    process.env.VERCEL_ENV = 'preview';
    process.env.PREVIEW_TEST_SECRET = GOOD_SECRET;
    expect(isPreviewTestAuthActive()).toBe(true);
    expect(isActivePreviewTestFounder(PREVIEW_TEST_EMAIL)).toBe(true);
    expect(isActivePreviewTestFounder('someone-else@example.com')).toBe(false);
    expect(isActivePreviewTestFounder('')).toBe(false);
    expect(isActivePreviewTestFounder(null)).toBe(false);
  });

  it('matches the synthetic email case-insensitively and nothing else', () => {
    expect(isPreviewTestEmail(PREVIEW_TEST_EMAIL.toUpperCase())).toBe(true);
    expect(isPreviewTestEmail(` ${PREVIEW_TEST_EMAIL} `)).toBe(true);
    expect(isPreviewTestEmail('voice-dna-live-test@example.org')).toBe(false);
    expect(isPreviewTestEmail(undefined)).toBe(false);
  });
});

describe('no credential is hard-coded in the source', () => {
  it('the module contains no long literal that could be a secret', async () => {
    const { readFileSync } = await import('node:fs');
    const { join } = await import('node:path');
    const src = readFileSync(join(__dirname, 'previewTestAuth.ts'), 'utf8');
    // Strip comments — the header deliberately DESCRIBES the past mistake.
    const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    // Exclude newlines: without that, the quote characters of two unrelated
    // statements pair up and the "literal" is really the code between them.
    const literals = code.match(/'[^'\n]{24,}'|"[^"\n]{24,}"/g) ?? [];
    const suspicious = literals.filter((l) => !/@example\.com/.test(l));
    expect(
      suspicious,
      `a long string literal in previewTestAuth.ts looks like a committed credential: ${suspicious.join(', ')}`,
    ).toEqual([]);
  });
});
