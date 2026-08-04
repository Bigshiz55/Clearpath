/**
 * Build / version metadata (client-safe, no secrets). Values are inlined at
 * BUILD time by next.config.mjs (`env:` map) from package.json, the git commit
 * and branch, Vercel's environment, the build timestamp, and the latest
 * migration file — so every screen can show exactly which build is running with
 * zero hardcoded values. These are NON-secret facts about the deployment.
 *
 * IMPORTANT: reference `process.env.NEXT_PUBLIC_*` as STATIC literals so Next.js
 * inlines them into the client bundle (a dynamic lookup would be undefined in the
 * browser).
 */

export type EnvKind = 'Production' | 'Preview' | 'Development' | 'TestScott' | 'TestHeather' | 'TestAmy';

export interface BuildInfo {
  appVersion: string;
  buildTimeIso: string;
  buildTimeLabel: string;
  gitSha: string; // full
  gitShaShort: string; // 7 chars
  gitBranch: string; // short (no refs/heads/)
  vercelEnv: string; // raw: 'production' | 'preview' | 'development' | ''
  deployUrl: string; // raw VERCEL_URL, may be ''
  deployId: string; // friendly short id derived from deployUrl / project
  schemaVersion: string; // latest migration, e.g. '0025_founder_test'
  apiVersion: string;
  supabaseProject: string; // project ref from the public Supabase URL host
  databaseEnv: string; // 'Production' | 'Local' | project ref
}

function raw(v: string | undefined): string {
  return (v ?? '').trim();
}

/** Short 7-char commit. */
export function shortSha(sha: string): string {
  return sha ? sha.slice(0, 7) : '';
}

/** Strip refs/heads/ and any owner prefix to a readable branch name. */
export function shortBranch(branch: string): string {
  return branch.replace(/^refs\/heads\//, '');
}

/**
 * "Jul 24, 2026 – 6:24 PM" from an ISO timestamp (locale-stable, UTC-safe).
 *
 * `timeZone: 'UTC'` is required, not cosmetic: `BuildVersionBadge` and
 * `Footer` are client components, so this runs once during the server's
 * initial render AND again in the browser during hydration. Without a fixed
 * zone, `Intl.DateTimeFormat` uses whichever local timezone the runtime
 * happens to be in — the Node server process and the visitor's browser can
 * disagree, producing two different formatted strings for the same instant
 * and a real React hydration-mismatch error on every single page.
 */
export function formatBuildTime(iso: string): string {
  if (!iso) return 'unknown';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  try {
    return new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      timeZone: 'UTC',
    })
      .format(d)
      .replace(',', ',')
      .replace(' at ', ' – ');
  } catch {
    return d.toISOString();
  }
}

/** A friendly, short deployment id from VERCEL_URL (project-ish prefix). */
export function deployIdFrom(deployUrl: string): string {
  if (!deployUrl) return '';
  const host = deployUrl.replace(/^https?:\/\//, '').split('/')[0] ?? '';
  const label = host.replace(/\.vercel\.app$/, '');
  // Preview hosts look like `project-git-branch-team` — keep the leading project.
  const project = label.split('-git-')[0] ?? label;
  return project || label;
}

/** Supabase project ref from the public URL host (non-secret; it's in the URL). */
function supabaseProjectFrom(url: string): string {
  if (!url) return '';
  const host = url.replace(/^https?:\/\//, '').split('/')[0] ?? '';
  // `abcdxyz.supabase.co` → `abcdxyz`
  return host.split('.')[0] ?? '';
}

let cached: BuildInfo | null = null;

export function getBuildInfo(): BuildInfo {
  if (cached) return cached;
  const buildTimeIso = raw(process.env.NEXT_PUBLIC_BUILD_TIME);
  const gitSha = raw(process.env.NEXT_PUBLIC_GIT_SHA);
  const gitBranch = shortBranch(raw(process.env.NEXT_PUBLIC_GIT_BRANCH));
  const vercelEnv = raw(process.env.NEXT_PUBLIC_VERCEL_ENV).toLowerCase();
  const deployUrl = raw(process.env.NEXT_PUBLIC_DEPLOY_URL);
  const supabaseUrl = raw(process.env.NEXT_PUBLIC_SUPABASE_URL);
  const project = supabaseProjectFrom(supabaseUrl);
  cached = {
    appVersion: raw(process.env.NEXT_PUBLIC_APP_VERSION) || '0.0.0',
    buildTimeIso,
    buildTimeLabel: formatBuildTime(buildTimeIso),
    gitSha,
    gitShaShort: shortSha(gitSha),
    gitBranch,
    vercelEnv,
    deployUrl,
    deployId: deployIdFrom(deployUrl),
    schemaVersion: raw(process.env.NEXT_PUBLIC_SCHEMA_VERSION),
    apiVersion: raw(process.env.NEXT_PUBLIC_API_VERSION) || 'v1',
    supabaseProject: project,
    databaseEnv: vercelEnv === 'production' ? 'Production' : project ? project : 'Local',
  };
  return cached;
}

/** The four canonical founder routes → their environment label. */
const FOUNDER_ROUTES: Record<string, EnvKind> = {
  '/testscott': 'TestScott',
  '/testheather': 'TestHeather',
  '/testamy': 'TestAmy',
};

/**
 * Resolve the environment label to show, given the current pathname. A founder
 * route always wins (it's the identity the user is testing); otherwise the Vercel
 * environment decides Production / Preview / Development.
 */
export function resolveEnvironment(pathname: string, vercelEnv: string): EnvKind {
  const p = (pathname || '').toLowerCase().replace(/\/+$/, '');
  for (const [route, label] of Object.entries(FOUNDER_ROUTES)) {
    if (p === route || p.startsWith(route + '/')) return label;
  }
  if (vercelEnv === 'production') return 'Production';
  if (vercelEnv === 'preview') return 'Preview';
  return 'Development';
}

/** True for the environments that must show only the minimal public badge. */
export function isPublicProduction(env: EnvKind): boolean {
  return env === 'Production';
}

/** The compact one-line badge text per the environment rules. */
export function badgeText(env: EnvKind, info: BuildInfo): string {
  if (isPublicProduction(env)) return `WatchVerd1ct v${info.appVersion}`;
  // Preview / Development / Founder: full identification.
  const parts = [env, info.gitBranch || '—', info.gitShaShort || '—', `v${info.appVersion}`];
  return parts.join(' • ');
}
