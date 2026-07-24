'use client';

import { usePathname } from 'next/navigation';

/**
 * The tiny "build <sha> · <branch>" deploy marker shown at the bottom of every
 * /app screen. It's hidden on the quiz route so the diagnostic line can't eat
 * vertical space the one-tile rating card needs. SHA/branch are read server-side
 * (force-dynamic layout) and passed in — this client wrapper only decides
 * visibility per route.
 */
export function BuildBadge({ sha, branch }: { sha: string; branch: string }) {
  const pathname = usePathname();
  if (pathname === '/app/quiz') return null;
  return (
    <div className="mt-10 text-center text-[10px] tracking-wide text-slate-600">
      build {sha}{branch ? ` · ${branch.replace(/^.*\//, '')}` : ''}
    </div>
  );
}
