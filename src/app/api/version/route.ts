import { NextResponse } from 'next/server';
import { getBuildInfo } from '@/lib/buildInfo';

export const dynamic = 'force-dynamic';

/**
 * Which commit is actually live — a one-request answer to "is this deployed
 * yet?" without opening the Vercel dashboard. Sourced from the same
 * build-time metadata as the footer stamp and BuildVersionBadge (never
 * hardcoded, never a secret). `Cache-Control: no-store` is set explicitly in
 * addition to the blanket `/api/:path*` no-store header in next.config.mjs,
 * so a deploy is never masked by a stale cached response.
 */
export async function GET() {
  const info = getBuildInfo();
  return NextResponse.json(
    {
      sha: info.gitSha || null,
      shortSha: info.gitShaShort || 'dev',
      branch: info.gitBranch || 'dev',
      deployedAt: info.buildTimeIso || null,
      vercelEnv: info.vercelEnv || 'development',
      appVersion: info.appVersion,
      schemaVersion: info.schemaVersion || null,
    },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
