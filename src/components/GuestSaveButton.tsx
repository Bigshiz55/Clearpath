'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

export function GuestSaveButton({ className = '' }: { className?: string }) {
  const supabase = createClient();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function save() {
    if (!email.trim() || password.length < 6) {
      setError('Enter an email and a password of 6+ characters.');
      return;
    }
    setLoading(true);
    setError(null);
    // Links an email/password identity onto the current anonymous user, keeping
    // the same account id — so watchlist, ratings and taste all carry over.
    const { error } = await supabase.auth.updateUser({ email: email.trim(), password });
    setLoading(false);
    if (error) {
      setError(error.message);
      return;
    }
    setDone(true);
    router.refresh();
  }

  return (
    <>
      <button onClick={() => setOpen(true)} className={className || 'btn-secondary'}>
        Save your account
      </button>
      {open && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4" onClick={() => setOpen(false)}>
          <div className="card w-full max-w-sm p-6" onClick={(e) => e.stopPropagation()}>
            {done ? (
              <div className="text-center">
                <div className="text-3xl">✅</div>
                <h3 className="mt-2 text-lg font-bold text-white">Account saved</h3>
                <p className="mt-1 text-sm text-slate-400">
                  Everything you’ve saved is now tied to <span className="text-slate-200">{email}</span>. Sign in
                  with it on any device and your list and taste come with you.
                </p>
                <button onClick={() => setOpen(false)} className="btn-primary mt-5 w-full">Done</button>
              </div>
            ) : (
              <>
                <h3 className="text-lg font-bold text-white">Save your account</h3>
                <p className="mt-1 text-sm text-slate-400">
                  Keep your watchlist, ratings, and taste — and use them on any device. No re-doing anything.
                </p>
                <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" placeholder="Email" className="input mt-4" autoComplete="email" />
                <input value={password} onChange={(e) => setPassword(e.target.value)} type="password" placeholder="Password (6+ characters)" className="input mt-2" autoComplete="new-password" />
                {error && <p className="mt-2 text-sm text-red-300">{error}</p>}
                <div className="mt-4 flex gap-2">
                  <button onClick={save} disabled={loading} className="btn-primary flex-1">{loading ? 'Saving…' : 'Save account'}</button>
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
