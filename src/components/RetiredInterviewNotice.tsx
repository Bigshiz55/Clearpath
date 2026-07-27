'use client';

import { useSearchParams } from 'next/navigation';

/**
 * Shown ONLY to someone who followed the retired Taste Interview URL.
 *
 * A redirect that drops you somewhere unexplained is its own small bug, so the
 * old route carries `?from=interview` and this says what happened. Everyone
 * else — the overwhelming majority, who never saw the interview — gets nothing.
 */
export function RetiredInterviewNotice() {
  const params = useSearchParams();
  if (params.get('from') !== 'interview') return null;
  return (
    <p
      className="rounded-xl border border-amber-400/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-100"
      role="status"
      data-testid="retired-interview-notice"
    >
      The Taste Interview is no longer available. You can build your Viewer DNA through the title
      quiz or by importing your history.
    </p>
  );
}
