'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';

export function GuestSaveButton({ className = '' }: { className?: string }) {
  const supabase = createClient();
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  async function send() {
    const trimmed = email.trim();
    if (!trimmed) {
      setError('Enter an email.');
      return;
    }
    setLoading(true);
    setError(null);

    const redirectTo = `${window.location.origin}/auth/callback?next=${encodeURIComponent(window.location.pathname)}`;

    // Try linking this email onto the CURRENT anonymous session first — if
    // it's genuinely new, this keeps the same account id (watchlist, ratings
    // and taste all carry over with zero merge needed). If that email
    // already belongs to a different account, this errors and we fall back
    // to a normal sign-in link instead — /auth/callback then offers an
    // explicit merge-or-discard choice for that case, never a silent guess.
    const { error: linkError } = await supabase.auth.updateUser({ email: trimmed }, { emailRedirectTo: redirectTo });
    if (linkError) {
      const { error: signInError } = await supabase.auth.signInWithOtp({
        email: trimmed,
        options: { emailRedirectTo: redirectTo },
      });
      if (signInError) {
        setError(signInError.message);
        setLoading(false);
        return;
      }
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
                <div className="text-3xl">📬</div>
                <h3 className="mt-2 text-lg font-bold text-white">Check your email</h3>
                <p className="mt-1 text-sm text-slate-400">
                  We sent a link to <span className="text-slate-200">{email}</span>. Tap it to finish saving your
                  account — no password needed.
                </p>
                <button onClick={() => setOpen(false)} className="btn-primary mt-5 w-full">Done</button>
              </div>
            ) : (
              <>
                <h3 className="text-lg font-bold text-white">Save your account</h3>
                <p className="mt-1 text-sm text-slate-400">
                  Keep your watchlist, ratings, and taste — and use them on any device. No password, just a link.
                </p>
                <input
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  type="email"
                  placeholder="Email"
                  className="input mt-4"
                  autoComplete="email"
                />
                {error && <p className="mt-2 text-sm text-red-300">{error}</p>}
                <div className="mt-4 flex gap-2">
                  <button onClick={send} disabled={loading} className="btn-primary flex-1">
                    {loading ? 'Sending…' : 'Send link'}
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
