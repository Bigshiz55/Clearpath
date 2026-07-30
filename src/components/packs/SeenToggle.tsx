'use client';

import { useState } from 'react';
import { Check, Eye } from 'lucide-react';
import { setSeen } from '@/lib/actions/packs';
import { useToast } from '@/components/Toast';
import type { UserSeenSubjectType } from '@/lib/packs/types';

/** Optimistic seen/unseen toggle for a programme or a Case — same UserSeen mechanism either way. */
export function SeenToggle({
  subjectType,
  subjectId,
  packSlug,
  initialSeen,
  size = 'sm',
}: {
  subjectType: UserSeenSubjectType;
  subjectId: string;
  packSlug: string;
  initialSeen: boolean;
  size?: 'sm' | 'md';
}) {
  const toast = useToast();
  const [seen, setSeenState] = useState(initialSeen);
  const [pending, setPending] = useState(false);

  async function toggle() {
    const next = !seen;
    setSeenState(next);
    setPending(true);
    const res = await setSeen({ subjectType, subjectId, packSlug, seen: next });
    setPending(false);
    if (!res.ok) {
      setSeenState(!next);
      toast.show(res.error ?? 'Could not update.', 'error');
    }
  }

  const px = size === 'sm' ? 'px-2.5 py-1 text-[12px]' : 'px-3 py-1.5 text-sm';

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={pending}
      aria-pressed={seen}
      className={`inline-flex items-center gap-1 rounded-full border font-semibold transition disabled:opacity-60 ${px} ${
        seen
          ? 'border-emerald-400/40 bg-emerald-500/15 text-emerald-300'
          : 'border-white/15 bg-white/[0.06] text-slate-300 hover:border-brand-300 hover:text-white'
      }`}
    >
      {seen ? <Check size={size === 'sm' ? 12 : 14} aria-hidden /> : <Eye size={size === 'sm' ? 12 : 14} aria-hidden />}
      {seen ? 'Seen' : 'Mark seen'}
    </button>
  );
}
