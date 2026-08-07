import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { isFounderOrAdminEmail } from '@/lib/admin';
import { resolveFounderAccess } from '@/lib/founder/gate';
import { getBuildInfo } from '@/lib/buildInfo';
import { runSubjectSelfTest } from '@/lib/nlu/subjectSelfTest';

export const dynamic = 'force-dynamic';

/**
 * FOUNDER-ONLY. Runs the DETERMINISTIC, OFFLINE subject self-test (the
 * red-team spot-check) against the deployed build. It needs no TMDB or OpenAI
 * key: it exercises the real `evaluateSubjectCentrality` over a frozen corpus,
 * so the founder can prove — on production, in the browser — that the
 * Snake-Eyes class of failure is rejected and central subjects pass.
 *
 * Everyone who is not a founder/admin (and has no valid founder code) gets the
 * same hidden 404 the founder pages return. No secrets are read or returned;
 * the response is pure pass/fail evidence plus the build SHA it ran on.
 *
 * Body: { mode: 'regression' | 'random' | 'seed', seed?: number, cases?: number }
 */

const MAX_CASES = 2000; // an in-browser click must stay bounded

export async function POST(req: Request) {
  const headers = { 'cache-control': 'no-store' };

  // Same gate as the founder pages: an authorized email OR a valid founder code.
  let authorized = false;
  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (user && isFounderOrAdminEmail(user.email)) authorized = true;
  } catch {
    // treat as unauthenticated
  }
  if (!authorized) {
    const access = await resolveFounderAccess();
    if (access.allowed) authorized = true;
  }
  if (!authorized) {
    // Hidden 404 — identical to what a stranger sees on the founder routes.
    return new NextResponse('Not Found', { status: 404 });
  }

  let body: { mode?: string; seed?: number; cases?: number } = {};
  try {
    body = (await req.json()) as typeof body;
  } catch {
    // default to regression on a malformed body
  }

  const mode: 'regression' | 'random' | 'seed' =
    body.mode === 'random' || body.mode === 'seed' ? body.mode : 'regression';
  const seed = Number.isFinite(body.seed) ? Math.floor(Number(body.seed)) : undefined;
  const cases = Number.isFinite(body.cases) ? Math.min(MAX_CASES, Math.max(1, Math.floor(Number(body.cases)))) : undefined;

  const summary = runSubjectSelfTest({ mode, seed, cases });

  return NextResponse.json(
    {
      sha: getBuildInfo().gitSha || 'unknown',
      ranAt: 'deterministic-offline', // no clock — result depends only on inputs
      ...summary,
    },
    { headers },
  );
}
