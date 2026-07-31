import { getBuildInfo } from '@/lib/buildInfo';

/**
 * BUILD STAMP — which commit is actually live, on every page. A plain,
 * in-flow footer at the end of the document, not `fixed` — the bottom of the
 * viewport is already spoken for (MobileNav, the docket bar, the feedback
 * FAB), and this has no reason to compete with any of them. It only shows up
 * once a reader scrolls past everything else.
 *
 * Never empty, never crashes: `getBuildInfo()` falls back to a real local git
 * SHA when Vercel's vars are absent (see next.config.mjs), and this falls
 * back once more to the literal "dev" if even that comes back empty.
 */
export function Footer() {
  const info = getBuildInfo();
  const sha = info.gitShaShort || 'dev';
  const fullSha = info.gitSha;
  const branch = info.gitBranch || 'dev';
  const when = info.buildTimeIso ? info.buildTimeLabel : 'dev';

  return (
    <footer className="border-t border-white/5 px-4 py-4 text-center text-[11px] text-slate-600">
      <p>
        Build{' '}
        {fullSha ? (
          <a
            href={`https://github.com/bigshiz55/clearpath/commit/${fullSha}`}
            target="_blank"
            rel="noopener noreferrer"
            className="font-mono text-slate-500 underline decoration-dotted underline-offset-2 hover:text-slate-300"
          >
            {sha}
          </a>
        ) : (
          <span className="font-mono text-slate-500">{sha}</span>
        )}
        {' · '}
        {branch}
        {' · '}
        {when}
      </p>
    </footer>
  );
}
