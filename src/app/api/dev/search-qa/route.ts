import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { isAdminEmail } from '@/lib/admin';
import { buildSearchQa } from '@/lib/searchQa';
import { getBuildInfo } from '@/lib/buildInfo';

export const dynamic = 'force-dynamic';

/**
 * Search QA endpoint — development & AUTHORIZED test users only. Returns the
 * full offline understanding funnel for a query (parse → constraints →
 * confidence → follow-up) plus the running version/commit, so a tester can see
 * exactly what the engine understood and on which build. Never exposed to
 * public production unless an admin is signed in or SEARCH_QA=1 is set. Live
 * candidate/availability sections are honestly marked unavailable without a key.
 */
function qaAllowedByEnv(): boolean {
  if (process.env.SEARCH_QA === '1') return true;
  // Vercel sets VERCEL_ENV to 'production' | 'preview' | 'development'. Anything
  // other than public production is fair game; production requires an admin.
  return (process.env.VERCEL_ENV ?? 'development') !== 'production';
}

export async function POST(req: Request) {
  let allowed = qaAllowedByEnv();
  if (!allowed) {
    try {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      allowed = isAdminEmail(user?.email);
    } catch {
      /* fall through to 404 */
    }
  }
  if (!allowed) return NextResponse.json({ error: 'Not found.' }, { status: 404 });

  let body: { query?: unknown } = {};
  try { body = await req.json(); } catch { /* empty */ }
  const query = typeof body.query === 'string' ? body.query : '';
  if (!query.trim()) return NextResponse.json({ error: 'Provide a query.' }, { status: 400 });

  const view = buildSearchQa(query);
  const b = getBuildInfo();
  return NextResponse.json({
    view,
    build: { version: b.appVersion, sha: b.gitShaShort, branch: b.gitBranch, env: b.vercelEnv || 'development', builtAt: b.buildTimeLabel, schema: b.schemaVersion },
  });
}
