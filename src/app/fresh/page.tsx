'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

/**
 * A "start fresh" link — signs out of any current session and mints a brand-new
 * anonymous guest, then drops you into the Taste Quiz with zero history. Share it
 * so each person can try the quiz clean on their own device.
 */
export default function FreshStart() {
  const router = useRouter();
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const supabase = createClient();
        await supabase.auth.signOut();
        const { error } = await supabase.auth.signInAnonymously();
        if (!active) return;
        if (error) {
          setErr(error.message);
          return;
        }
        router.replace('/app/quiz');
      } catch (e) {
        if (active) setErr(e instanceof Error ? e.message : 'Could not start a fresh session.');
      }
    })();
    return () => {
      active = false;
    };
  }, [router]);

  return (
    <div className="grid min-h-dvh place-items-center p-6 text-center">
      <div>
        <div className="mx-auto h-9 w-9 animate-spin rounded-full border-2 border-white/20 border-t-brand-400" />
        <p className="mt-4 text-sm text-slate-300">Starting a fresh session…</p>
        {err && (
          <p className="mt-2 text-xs text-rose-300">
            {err} —{' '}
            <a href="/app/quiz" className="underline">
              continue anyway
            </a>
          </p>
        )}
      </div>
    </div>
  );
}
