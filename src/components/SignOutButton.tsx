'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';

export function SignOutButton({ className }: { className?: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function signOut() {
    setLoading(true);
    try {
      const supabase = createClient();
      await supabase.auth.signOut();
    } catch {
      /* ignore */
    }
    router.push('/');
    router.refresh();
  }

  return (
    <button onClick={signOut} disabled={loading} className={className ?? 'btn-ghost'}>
      {loading ? 'Signing out…' : 'Sign out'}
    </button>
  );
}
