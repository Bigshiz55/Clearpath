'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useToast } from '@/components/Toast';

type Mode = 'signin' | 'signup' | 'magic';

export function LoginForm({ next }: { next: string }) {
  const router = useRouter();
  const toast = useToast();
  const [mode, setMode] = useState<Mode>('magic');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handle(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setNotice(null);
    setLoading(true);
    try {
      // Build the auth redirect from the actual site the user is on — never a
      // build-time env var — so a missing NEXT_PUBLIC_SITE_URL can't send the
      // confirmation email to localhost.
      const redirectTo = `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`;
      const supabase = createClient();
      if (mode === 'magic') {
        const { error } = await supabase.auth.signInWithOtp({
          email,
          options: { emailRedirectTo: redirectTo },
        });
        if (error) throw error;
        setNotice('Check your email and tap the link to get in — no password needed.');
      } else if (mode === 'signup') {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: redirectTo },
        });
        if (error) throw error;
        if (data.session) {
          toast.show('Welcome to WatchVerdict!', 'success');
          router.push(next);
          router.refresh();
        } else {
          setNotice('Account created. Check your email to confirm, then sign in.');
          setMode('signin');
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        toast.show('Signed in.', 'success');
        router.push(next);
        router.refresh();
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Something went wrong.';
      setError(message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="card w-full max-w-md p-7">
      <h1 className="text-2xl font-bold text-white">
        {mode === 'signup' ? 'Create your account' : mode === 'magic' ? 'Email me a link' : 'Welcome back'}
      </h1>
      <p className="mt-1 text-sm text-slate-400">
        {mode === 'signup'
          ? 'Start getting verdicts tuned to your taste.'
          : mode === 'magic'
            ? 'We’ll send a secure one-time sign-in link.'
            : 'Sign in to your WatchVerdict account.'}
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

        {mode !== 'magic' && (
          <div>
            <label className="label" htmlFor="password">
              Password
            </label>
            <input
              id="password"
              type="password"
              autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="input"
              placeholder="At least 8 characters"
            />
          </div>
        )}

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

        <button type="submit" disabled={loading} className="btn-primary w-full">
          {loading
            ? 'Please wait…'
            : mode === 'signup'
              ? 'Create account'
              : mode === 'magic'
                ? 'Send link'
                : 'Sign in'}
        </button>
      </form>

      <div className="mt-5 space-y-2 text-center text-sm">
        {mode !== 'magic' && (
          <button onClick={() => setMode('magic')} className="text-brand-300 hover:underline">
            Email me a sign-in link instead
          </button>
        )}
        <div className="text-slate-400">
          {mode === 'signup' ? (
            <>
              Already have an account?{' '}
              <button onClick={() => setMode('signin')} className="text-brand-300 hover:underline">
                Sign in
              </button>
            </>
          ) : (
            <>
              New here?{' '}
              <button onClick={() => setMode('signup')} className="text-brand-300 hover:underline">
                Create an account
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
