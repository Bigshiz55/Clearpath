import { describe, it, expect, afterEach } from 'vitest';
import {
  isPreviewTestAuthActive,
  isPreviewTestEmail,
  isActivePreviewTestFounder,
  PREVIEW_TEST_EMAIL,
} from './previewTestAuth';

/**
 * TEMPORARY mechanism, permanent safety property: the preview-only live-test
 * auth must be provably inert everywhere except a Vercel preview (or local
 * `next dev`). These tests pin the fail-closed behaviour; they are deleted
 * together with the module after the Voice DNA live matrix completes.
 */

const savedVercelEnv = process.env.VERCEL_ENV;

afterEach(() => {
  if (savedVercelEnv === undefined) delete process.env.VERCEL_ENV;
  else process.env.VERCEL_ENV = savedVercelEnv;
});

describe('preview test auth stays off everywhere that matters', () => {
  it('is INACTIVE on production deployments', () => {
    process.env.VERCEL_ENV = 'production';
    expect(isPreviewTestAuthActive()).toBe(false);
    expect(isActivePreviewTestFounder(PREVIEW_TEST_EMAIL)).toBe(false);
  });

  it('is INACTIVE in the test environment (NODE_ENV=test, no VERCEL_ENV)', () => {
    delete process.env.VERCEL_ENV;
    expect(isPreviewTestAuthActive()).toBe(false);
    expect(isActivePreviewTestFounder(PREVIEW_TEST_EMAIL)).toBe(false);
  });

  it('is ACTIVE on a Vercel preview, and only grants the one synthetic email', () => {
    process.env.VERCEL_ENV = 'preview';
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
