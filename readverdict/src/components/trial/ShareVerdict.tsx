'use client';

import { useState } from 'react';
import type { Trial } from '@/lib/trial/types';
import { siteUrl } from '@/lib/env';
import { Button } from '@/components/ui/Button';

/**
 * Share a compact, spoiler-free verdict. Uses the Web Share API when available,
 * else copies a text card + link to the clipboard. No fabricated data — only the
 * verdict, match, and the honest headline reasons.
 */
export function ShareVerdict({ trial, workId }: { trial: Trial; workId: string }) {
  const [status, setStatus] = useState<'idle' | 'shared' | 'copied'>('idle');
  const { verdict, defendant } = trial;

  const summary =
    `ReadVerdict — ${defendant.title}\n` +
    `${verdict.call} · Match ${verdict.matchScore}/100\n` +
    (verdict.strongestReason ? `For: ${verdict.strongestReason}\n` : '') +
    (verdict.strongestConcern ? `Against: ${verdict.strongestConcern}\n` : '') +
    `${verdict.sentence}`;

  const url = `${siteUrl()}/trial/${encodeURIComponent(workId)}`;

  const share = async () => {
    const nav = typeof navigator !== 'undefined' ? navigator : undefined;
    if (nav && 'share' in nav) {
      try {
        await nav.share({ title: `ReadVerdict — ${defendant.title}`, text: summary, url });
        setStatus('shared');
        return;
      } catch {
        // fall through to copy
      }
    }
    try {
      await nav?.clipboard?.writeText(`${summary}\n${url}`);
      setStatus('copied');
    } catch {
      setStatus('idle');
    }
  };

  return (
    <div className="inline-flex items-center gap-2">
      <Button size="sm" variant="secondary" onClick={share}>Share verdict</Button>
      {status === 'copied' && <span className="text-xs text-verdict-must">Copied to clipboard</span>}
      {status === 'shared' && <span className="text-xs text-verdict-must">Shared</span>}
    </div>
  );
}
