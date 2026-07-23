'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

const FLAG = 'wv_learn_session';

/**
 * The "learn my DNA over time" entry. Unlike /fresh (which wipes to a new guest
 * on every visit), this starts a clean session ONCE and then KEEPS it — so if
 * you stay in the app and make a bunch of selections, your DNA accumulates and
 * sharpens across visits. It never wipes on return.
 *
 * (Anonymous guests can't be re-assumed after a sign-out, so the persistence
 * relies on NOT signing out once the session exists.)
 */
export function LearnStart() {
  const router = useRouter();
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const supabase = createClient();
        const { data: { user } } = await supabase.auth.getUser();
        let started = false;
        try { started = localStorage.getItem(FLAG) === '1'; } catch { started = false; }

        if (!started) {
          // First time: clean slate, then remember it from here on.
          await supabase.auth.signOut();
          const { error } = await supabase.auth.signInAnonymously();
          if (error) { if (active) setErr(error.message); return; }
          try { localStorage.setItem(FLAG, '1'); } catch { /* private mode — still works this session */ }
        } else if (!user) {
          // Returning but the session was lost — mint a guest so we keep going.
          const { error } = await supabase.auth.signInAnonymously();
          if (error) { if (active) setErr(error.message); return; }
        }
        // else: returning with a live session → keep it, DNA accumulates.

        if (active) router.replace('/app');
      } catch (e) {
        if (active) setErr(e instanceof Error ? e.message : 'Could not start your learning session.');
      }
    })();
    return () => { active = false; };
  }, [router]);

  return (
    <div className="grid min-h-dvh place-items-center p-6 text-center">
      <div>
        <div className="mx-auto h-9 w-9 animate-spin rounded-full border-2 border-white/20 border-t-brand-400" />
        <p className="mt-4 text-sm text-slate-300">Setting up your learning session — this one remembers.</p>
        <p className="mt-1 text-xs text-slate-500">Keep making picks and your VERD1CT DNA sharpens over time.</p>
        {err && (
          <p className="mt-2 text-xs text-rose-300">
            {err} — <a href="/app" className="underline">continue anyway</a>
          </p>
        )}
      </div>
    </div>
  );
}
