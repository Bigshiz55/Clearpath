'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

/**
 * Creates a live Court room (`court_create`) and stores the host token, ready
 * to redirect into `/court/[code]`. Shared by every entry point that starts a
 * Verdict Room — the primary CTA and the "Invite the Jury" card both land in
 * the exact same room, no separate/duplicated creation logic.
 */
export function useStartCourt() {
  const router = useRouter();
  const supabase = createClient();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function start() {
    setLoading(true);
    setError(null);
    const { data, error } = await supabase.rpc('court_create', { p_media_type: 'any' });
    if (error) {
      setLoading(false);
      setError(error.code === '42P01' ? 'The Verdict Room needs a one-time setup (run migration 0004).' : error.message);
      return;
    }
    const row = Array.isArray(data) ? data[0] : data;
    const code = row?.code as string;
    const token = row?.host_token as string;
    if (!code) {
      setLoading(false);
      setError('Could not open a Verdict Room.');
      return;
    }
    try {
      localStorage.setItem(`court_host_${code}`, token);
    } catch {
      /* ignore */
    }
    router.push(`/court/${code}`);
  }

  return { start, loading, error };
}
