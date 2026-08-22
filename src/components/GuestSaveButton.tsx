'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';

export function GuestSaveButton({ className = '' }: { className?: string }) {
  const supabase = createClient();
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  async function send() {
    const trimmed = email.trim();
    if (!trimmed) {
      setError('Enter an email.');
      return;
    }
    if (password.length < 8) {
      setError('Use a password of at least 8 characters.');
      return;
    }
    setLoading(true);
    setError(null);

    const redirectTo = `${window.location.origin}/auth/callback?next=${encodeURIComponent(window.location.pathname)}`;

    // Set an email AND password on the CURRENT anonymous session — this keeps
    // the same account id, so the guest's watchlist, ratings and taste carry
    // over with zero merge needed, and the account is a real password login
    // afterward (no emailed link, no expiry window). If the email already
    // belongs to a different account, updateUser errors: we surface that
    // honestly and point to the sign-in page rather than silently guessing a
    // merge. (The /auth/callback merge path remains for the confirm-email
    // case, but the password upgrade never depends on an inbox.)
    const { error: linkError } = await supabase.auth.updateUser(
      { email: trimmed, password },
      { emailRedirectTo: redirectTo },
    );
    if (linkError) {
      setError(
        /already|registered|exists/i.test(linkError.message)
          ? 'That email already has an account. Sign in with it from the sign-in page instead.'
          : linkError.message,
      );
      setLoading(false);
      return;
    }

    setLoading(false);
    setSent(true);
  }

  return (
    <>
      <button onClick={() => setOpen(true)} className={className || 'btn-secondary'}>
        Save your account
      </button>
      {open && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4" onClick={() => setOpen(false)}>
          <div className="card w-full max-w-sm p-6" onClick={(e) => e.stopPropagation()}>
            {sent ? (
              <div className="text-center">
                <div className="text-3xl">✅</div>
                <h3 className="mt-2 text-lg font-bold text-white">Account saved</h3>
                <p className="mt-1 text-sm text-slate-400">
                  <span className="text-slate-200">{email}</span> is now your login — everything you&rsquo;ve done
                  carries over, on any device. Sign in with your email and password next time.
                </p>
                <button onClick={() => setOpen(false)} className="btn-primary mt-5 w-full">Done</button>
              </div>
            ) : (
              <>
                <h3 className="text-lg font-bold text-white">Save your account</h3>
                <p className="mt-1 text-sm text-slate-400">
                  Keep your watchlist, ratings, and taste — and use them on any device. Set an email and password.
                </p>
                <input
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  type="email"
                  placeholder="Email"
                  className="input mt-4"
                  autoComplete="email"
                />
                <input
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  type="password"
                  placeholder="Password (at least 8 characters)"
                  className="input mt-3"
                  autoComplete="new-password"
                  minLength={8}
                />
                {error && <p className="mt-2 text-sm text-red-300">{error}</p>}
                <div className="mt-4 flex gap-2">
                  <button onClick={send} disabled={loading} className="btn-primary flex-1">
                    {loading ? 'Saving…' : 'Save account'}
                  </button>
                  <button onClick={() => setOpen(false)} className="btn-ghost">Later</button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
