'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { followUser, unfollowUser } from '@/lib/actions/social';
import { useToast } from '@/components/Toast';

export function FollowButton({ targetId, initialFollowing }: { targetId: string; initialFollowing: boolean }) {
  const [following, setFollowing] = useState(initialFollowing);
  const [busy, setBusy] = useState(false);
  const router = useRouter();
  const toast = useToast();

  async function toggle() {
    setBusy(true);
    const res = following ? await unfollowUser(targetId) : await followUser(targetId);
    setBusy(false);
    if (res.ok) {
      setFollowing(!following);
      router.refresh();
    } else {
      toast.show(res.error ?? 'Failed.', 'error');
    }
  }

  return (
    <button onClick={toggle} disabled={busy} className={following ? 'btn-secondary' : 'btn-primary'}>
      {busy ? '…' : following ? 'Following ✓' : '+ Follow'}
    </button>
  );
}
