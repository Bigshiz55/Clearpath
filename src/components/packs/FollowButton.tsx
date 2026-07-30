'use client';

import { useState } from 'react';
import { UserPlus, UserCheck } from 'lucide-react';
import { followSubject, unfollowSubject } from '@/lib/actions/packs';
import { useToast } from '@/components/Toast';
import type { TrackingSubscriptionType } from '@/lib/packs/types';

/** Optimistic follow/unfollow for a person, Case, franchise, or Pack via UserTracking. */
export function FollowButton({
  subscriptionType,
  subject,
  packSlug,
  initialTrackingId,
  label = 'Follow',
}: {
  subscriptionType: TrackingSubscriptionType;
  subject: string;
  packSlug: string;
  /** The user's existing `user_tracking.id` for this subject, or null if not following. */
  initialTrackingId: string | null;
  label?: string;
}) {
  const toast = useToast();
  const [trackingId, setTrackingId] = useState(initialTrackingId);
  const [pending, setPending] = useState(false);
  const following = trackingId != null;

  async function toggle() {
    setPending(true);
    if (following) {
      const prev = trackingId!;
      setTrackingId(null);
      const res = await unfollowSubject({ trackingId: prev, packSlug });
      if (!res.ok) {
        setTrackingId(prev);
        toast.show(res.error ?? 'Could not unfollow.', 'error');
      }
    } else {
      const res = await followSubject({ subscriptionType, subject, packSlug });
      if (res.ok) {
        toast.show(`Following ${label}.`, 'success');
        const data = res.data as { trackingId: string } | undefined;
        setTrackingId(data?.trackingId ?? null);
      } else {
        toast.show(res.error ?? 'Could not follow.', 'error');
      }
    }
    setPending(false);
  }

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={pending}
      aria-pressed={following}
      className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[13px] font-semibold transition disabled:opacity-60 ${
        following
          ? 'border-brand-300 bg-brand-500/25 text-white'
          : 'border-white/15 bg-white/[0.06] text-slate-300 hover:border-brand-300 hover:text-white'
      }`}
    >
      {following ? <UserCheck size={14} aria-hidden /> : <UserPlus size={14} aria-hidden />}
      {following ? 'Following' : label}
    </button>
  );
}
