'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { reportReliabilityEvent } from '@/lib/monitoringClient';

/**
 * `strandedOn` is set only when the server has PROVEN that a magic link sent
 * from this deployment would be redirected somewhere else — see
 * `src/lib/auth/redirectCheck.ts`. In that state the worst thing this form can
 * do is succeed: the email arrives, the person taps it, and they land on a
 * different site (historically `http://localhost:3000`) with no explanation.
 * Refusing to send, and naming where the link would have taken them, is the
 * only honest behaviour.
 */
export function LoginForm({ next, strandedOn }: { next: string; strandedOn?: string }) {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handle(e: React.FormEvent) {
    e.preventDefault();
    if (strandedOn) return;
    setError(null);
    setNotice(null);
    setLoading(true);
    try {
      // Build the auth redirect from the actual site the user is on — never a
      // build-time env var — so a missing NEXT_PUBLIC_SITE_URL can't send the
      // confirmation email to localhost.
      const redirectTo = `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`;
      const supabase = createClient();
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: { emailRedirectTo: redirectTo },
      });
      if (error) throw error;
      setNotice('Check your email and tap the link to get in — no password needed.');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Something went wrong.';
      setError(message);
      reportReliabilityEvent('signin_email_failure', {});
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="card w-full max-w-md p-7">
      <h1 className="text-2xl font-bold text-white">Email me a link</h1>
      <p className="mt-1 text-sm text-slate-400">We&rsquo;ll send a secure one-time sign-in link. No password, ever.</p>

      {strandedOn && (
        <div
          role="alert"
          data-testid="auth-redirect-blocked"
          className="mt-5 rounded-lg border border-amber-400/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-100"
        >
          <p className="font-semibold">Sign-in links from this deployment would not come back here.</p>
          <p className="mt-1 text-amber-200/90">
            Supabase would send you to <span className="font-mono">{strandedOn}</span> instead of{' '}
            <span className="font-mono">this site</span>, so we&rsquo;re not sending an email you
            couldn&rsquo;t use. Add this deployment&rsquo;s URL to the project&rsquo;s allowed redirect
            URLs and reload.
          </p>
        </div>
      )}

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
            disabled={Boolean(strandedOn)}
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

        <button type="submit" disabled={loading || Boolean(strandedOn)} className="btn-primary w-full">
          {loading ? 'Please wait…' : 'Send link'}
        </button>
      </form>
    </div>
  );
}
