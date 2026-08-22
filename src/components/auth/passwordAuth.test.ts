/**
 * NO MAGIC LINK ANYWHERE IN THE PRODUCT AUTH SURFACE.
 *
 * The emailed one-time link (signInWithOtp) and its ~55-second Supabase
 * expiry window were the whole complaint: a sign-in that makes the user leave
 * the app, wait for an inbox, and beat a countdown. These pins keep it gone —
 * the login form and the guest upgrade are email+password, resolve in place,
 * and no auth component may reintroduce the OTP path. The `/auth/callback` and
 * `/auth/merge` routes are deliberately preserved (anon-data merge + optional
 * signUp confirmation ride them), so they are NOT swept.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(__dirname, '..', '..', '..');
const LOGIN = readFileSync(join(ROOT, 'src', 'components', 'auth', 'LoginForm.tsx'), 'utf8');
const GUEST = readFileSync(join(ROOT, 'src', 'components', 'GuestSaveButton.tsx'), 'utf8');

describe('the login form is email + password, resolving in place', () => {
  it('signs in with a password and can create an account with one', () => {
    expect(LOGIN).toMatch(/signInWithPassword\(\{ email, password \}\)/);
    expect(LOGIN).toMatch(/supabase\.auth\.signUp\(\{ email, password/);
  });

  it('collects a password and navigates itself after a session (no emailed link supplies it)', () => {
    expect(LOGIN).toMatch(/type="password"/);
    expect(LOGIN).toMatch(/router\.refresh\(\)/);
    expect(LOGIN).toMatch(/router\.push\(next\)/);
  });

  it('never calls the passwordless OTP path, and shows no "check your inbox to sign in" wait', () => {
    expect(LOGIN).not.toMatch(/signInWithOtp/);
    expect(LOGIN).not.toMatch(/emailRedirectTo[\s\S]{0,40}signInWithOtp/);
    // The words that describe the removed flow must not describe sign-in.
    expect(LOGIN).not.toMatch(/tap the link|send.{0,4}link|no password/i);
  });
});

describe('the guest upgrade sets a password on the SAME account (no orphaning, no link)', () => {
  it('links email AND password via updateUser, preserving the anonymous id', () => {
    expect(GUEST).toMatch(/updateUser\(\s*\{ email: trimmed, password \}/);
  });

  it('does not fall back to an emailed sign-in link', () => {
    expect(GUEST).not.toMatch(/signInWithOtp/);
    expect(GUEST).not.toMatch(/Check your email/);
    expect(GUEST).not.toMatch(/no password/i);
  });
});

describe('no product auth component reintroduces the magic link', () => {
  it('signInWithOtp appears in zero files under src/components (auth + guest surfaces)', () => {
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const p = join(dir, entry.name);
        if (entry.isDirectory()) walk(p);
        else if (/\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)) {
          if (/signInWithOtp/.test(readFileSync(p, 'utf8'))) offenders.push(p);
        }
      }
    };
    walk(join(ROOT, 'src', 'components'));
    expect(offenders, `signInWithOtp still present in: ${offenders.join(', ')}`).toEqual([]);
  });
});

describe('the anon-merge callback is preserved', () => {
  it('still exists — passwords do not remove the guest-data merge path', () => {
    // A regression guard: deleting these while removing magic link would
    // orphan every anonymous guest and break signUp confirmation.
    expect(() => readFileSync(join(ROOT, 'src', 'app', 'auth', 'callback', 'route.ts'), 'utf8')).not.toThrow();
    expect(() => readFileSync(join(ROOT, 'src', 'app', 'auth', 'merge', 'page.tsx'), 'utf8')).not.toThrow();
  });
});
