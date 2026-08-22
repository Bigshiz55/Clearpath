'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { autoMergeIfSafe } from '@/lib/actions/mergeAccount';
import { reportReliabilityEvent } from '@/lib/monitoringClient';

/**
 * EMAIL + PASSWORD, NO MAGIC LINK. Sign-in resolves in place — no emailed
 * link, no 55-second link-expiry window, no "check your inbox" wait. The one
 * form does both jobs: it signs an existing account in, and (via "Create
 * account") registers a new one with the same email + password. Both write
 * the SSR session cookies directly, so the very next navigation is
 * authenticated.
 *
 * The passwordless email-OTP flow this replaced is gone from the product; the
 * `/auth/callback` + `/auth/merge` routes stay, because anonymous-guest data
 * merges still travel through them (and a new-account confirmation email, if
 * the Supabase project still requires one, lands there too — see
 * DEPLOYMENT.md for the "Confirm email" setting that turns that into an
 * instant session instead).
 */
export function LoginForm({ next }: { next: string }) {
  const router = useRouter();
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  /**
   * Reconcile a just-signed-in account with the guest data left on
   * `anonUserId`, the same way /auth/callback does: auto-merge when the target
   * is empty, otherwise send the user to the explicit merge-or-discard screen.
   * Returns true when it has taken over navigation (a redirect to /auth/merge),
   * so the caller stops. A merge failure is never allowed to block sign-in —
   * it routes to the same decision screen rather than discarding silently.
   */
  async function mergeGuestData(anonUserId: string): Promise<boolean> {
    const goToMerge = () => {
      const params = new URLSearchParams({ anon: anonUserId, next });
      router.push(`/auth/merge?${params.toString()}`);
      return true;
    };
    try {
      const result = await autoMergeIfSafe(anonUserId);
      return result.status === 'needs_decision' ? goToMerge() : false;
    } catch {
      return goToMerge();
    }
  }

  async function handle(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setNotice(null);
    if (password.length < 8) {
      setError('Use a password of at least 8 characters.');
      return;
    }
    setLoading(true);
    try {
      const supabase = createClient();

      // GUEST DATA MUST NOT BE ORPHANED. An anonymous guest (watchlist,
      // ratings, Watch DNA) can reach this form, and signing into — or signing
      // up a brand-new — account swaps the session away from that anonymous
      // user. The magic-link flow carried the data across via /auth/callback;
      // the password flow has no callback, so it must handle the carry-over
      // itself. Capture the anonymous id BEFORE the session swaps.
      let anonUserId: string | null = null;
      try {
        const { data: { user: preUser } } = await supabase.auth.getUser();
        if (preUser?.is_anonymous) anonUserId = preUser.id;
      } catch { /* no session — nothing to carry over */ }

      if (mode === 'signin') {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        // The account already existed, so its data and the guest's must be
        // reconciled — auto-merge when the target is empty, otherwise a
        // decision screen, never a silent discard (same contract as the
        // callback).
        if (anonUserId && (await mergeGuestData(anonUserId))) return;
      } else if (anonUserId) {
        // A guest creating an account: UPGRADE the anonymous account in place
        // (updateUser keeps the same id, so watchlist/ratings/DNA carry over
        // with zero merge). signUp would mint a NEW user and strand the guest
        // data — exactly the orphaning to avoid.
        const { error } = await supabase.auth.updateUser({ email, password });
        if (error) throw error;
      } else {
        // A brand-new visitor with no guest session: a plain sign-up. A
        // confirmation email only appears if the Supabase project still has
        // "Confirm email" on; the intended setting is off, so signUp returns a
        // session immediately (and any email routes through /auth/callback).
        const emailRedirectTo = `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`;
        const { data, error } = await supabase.auth.signUp({ email, password, options: { emailRedirectTo } });
        if (error) throw error;
        if (!data.session) {
          setNotice('Account created. Confirm it from the email we just sent, then sign in.');
          setMode('signin');
          setLoading(false);
          return;
        }
      }
      // Session cookies are set on the client; refresh so the server sees them,
      // then land on the requested page. The magic-link flow used to supply
      // this navigation via the callback redirect — the password flow must do
      // it itself.
      router.refresh();
      router.push(next);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Something went wrong.';
      // Turn Supabase's opaque "Invalid login credentials" into an actionable
      // nudge toward creating the account, without revealing whether the email
      // exists (the message is identical either way).
      setError(
        mode === 'signin' && /invalid login credentials/i.test(message)
          ? 'That email and password don’t match. Check them, or create an account below.'
          : message,
      );
      reportReliabilityEvent('signin_password_failure', {});
    } finally {
      setLoading(false);
    }
  }

  const signup = mode === 'signup';
  return (
    <div className="card w-full max-w-md p-7">
      <h1 className="text-2xl font-bold text-white">{signup ? 'Create your account' : 'Sign in'}</h1>
      <p className="mt-1 text-sm text-slate-400">
        {signup ? 'Email and a password — that’s it. You’re in right away.' : 'Enter your email and password.'}
      </p>

      <form onSubmit={handle} className="mt-6 space-y-4">
        <div>
          <label className="label" htmlFor="email">
            Email
          </label>
          <input
            id="email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="input"
            placeholder="you@example.com"
          />
        </div>

        <div>
          <label className="label" htmlFor="password">
            Password
          </label>
          <input
            id="password"
            type="password"
            autoComplete={signup ? 'new-password' : 'current-password'}
            required
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="input"
            placeholder={signup ? 'At least 8 characters' : 'Your password'}
          />
        </div>

        {error && (
          <div className="rounded-lg border border-red-400/40 bg-red-500/10 px-3 py-2 text-sm text-red-200">
            {error}
          </div>
        )}
        {notice && (
          <div className="rounded-lg border border-emerald-400/40 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-200">
            {notice}
          </div>
        )}

        <button type="submit" disabled={loading} className="btn-primary w-full" data-testid="auth-submit">
          {loading ? 'Please wait…' : signup ? 'Create account' : 'Sign in'}
        </button>
      </form>

      <button
        type="button"
        onClick={() => {
          setMode(signup ? 'signin' : 'signup');
          setError(null);
          setNotice(null);
        }}
        className="mt-4 w-full text-sm text-brand-300 hover:text-brand-200"
        data-testid="auth-mode-toggle"
      >
        {signup ? 'Already have an account? Sign in' : 'New here? Create an account'}
      </button>
    </div>
  );
}
