import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import { GET } from './route';

/**
 * The temporary proof bridge must be HARD-DISABLED (404) anywhere except the
 * Vercel Preview of claude/watch-verdict-app-wwbtbg. These tests hit only the
 * guard clauses (which return BEFORE any secret is read or the warm is invoked).
 */
const url = 'https://preview.example/api/dev/knowledge-warm-proof';
const req = () => new Request(url);

describe('dev knowledge-warm proof bridge — preview + branch locked', () => {
  const prevEnv = process.env.VERCEL_ENV;
  const prevRef = process.env.VERCEL_GIT_COMMIT_REF;
  beforeEach(() => {
    delete process.env.VERCEL_ENV;
    delete process.env.VERCEL_GIT_COMMIT_REF;
  });
  afterEach(() => {
    if (prevEnv === undefined) delete process.env.VERCEL_ENV; else process.env.VERCEL_ENV = prevEnv;
    if (prevRef === undefined) delete process.env.VERCEL_GIT_COMMIT_REF; else process.env.VERCEL_GIT_COMMIT_REF = prevRef;
  });

  it('404 when not on Vercel Preview (e.g. production or local)', async () => {
    process.env.VERCEL_ENV = 'production';
    process.env.VERCEL_GIT_COMMIT_REF = 'claude/watch-verdict-app-wwbtbg';
    expect((await GET(req())).status).toBe(404);
  });

  it('404 when VERCEL_ENV is unset (local/dev)', async () => {
    expect((await GET(req())).status).toBe(404);
  });

  it('404 on a preview of any OTHER branch', async () => {
    process.env.VERCEL_ENV = 'preview';
    process.env.VERCEL_GIT_COMMIT_REF = 'main';
    expect((await GET(req())).status).toBe(404);
  });

  it('past the guards on the correct preview+branch it does NOT 404 (503 only when no secret configured — secret never exposed)', async () => {
    process.env.VERCEL_ENV = 'preview';
    process.env.VERCEL_GIT_COMMIT_REF = 'claude/watch-verdict-app-wwbtbg';
    const res = await GET(req());
    // With no CRON_SECRET in the test env, it stops at 503 BEFORE any warm call.
    expect(res.status).toBe(503);
    const body = (await res.json()) as { ok: boolean };
    expect(body.ok).toBe(false);
    // No long token (a real secret value) ever appears in the response body.
    expect(JSON.stringify(body)).not.toMatch(/[A-Za-z0-9_-]{24,}/);
  });
});
