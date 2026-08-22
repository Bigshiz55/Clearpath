'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
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
      if (mode === 'signin') {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      } else {
        // A confirmation email only appears here if the Supabase project still
        // has "Confirm email" on; the intended production setting is off, so
        // signUp returns a session immediately. Redirect target only matters
        // in the confirm-on case, and routes through the same callback.
        const emailRedirectTo = `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`;
        const { data, error } = await supabase.auth.signUp({ email, password, options: { emailRedirectTo } });
        if (error) throw error;
        if (!data.session) {
          // Confirmation is on for this project — a one-time account-creation
          // email, not a sign-in mechanism. Sign-in itself never waits on email.
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
