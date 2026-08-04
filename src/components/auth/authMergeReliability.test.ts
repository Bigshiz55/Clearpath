import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const read = (p: string) => readFileSync(join(__dirname, '..', '..', '..', p), 'utf8');

/**
 * RELIABILITY SPRINT — item 7. Source-level: both files are server-only
 * routes reached mid-auth-exchange, not meaningfully testable without a
 * live Supabase project. Behavioral coverage for the underlying merge logic
 * lives in src/lib/actions/mergeAccount.test.ts; these pin the two routes
 * that call it.
 */
describe('the /auth/merge decision page no longer skips a signal-only anonymous session', () => {
  const src = read('src/app/auth/merge/page.tsx');

  it('checks anonSignalCount before deciding there is nothing to do', () => {
    expect(src).toMatch(/preview\.anonItemCount === 0 && preview\.anonSignalCount === 0/);
  });

  it('actually merges (not just redirects) when there is only signal data and no watchlist conflict to ask about', () => {
    expect(src).toMatch(/if \(preview\.anonItemCount === 0\) \{\s*\n\s*await performMerge\(preview\.anonUserId\)/);
  });
});

describe('the /auth/callback route no longer silently swallows a merge failure', () => {
  const src = read('src/app/auth/callback/route.ts');

  it('redirects to the merge decision screen on a merge exception, instead of a bare catch that does nothing', () => {
    // The old bug: the catch block's only content was a comment — nothing
    // was returned, so the function fell through to a plain sign-in
    // redirect with the anonymous data left stranded and no trace.
    const catchBlock = src.slice(src.indexOf('} catch {'));
    expect(catchBlock).toContain("new URL('/auth/merge'");
    expect(catchBlock).toContain("mergeUrl.searchParams.set('anon', anonUserId)");
  });
});
