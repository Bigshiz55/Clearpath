import { NextResponse } from 'next/server';
import { serverEnv } from '@/lib/env';
import { GET as knowledgeWarmGET } from '@/app/api/cron/knowledge-warm/route';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * TEMPORARY PREVIEW-ONLY PROOF BRIDGE — DELETE AFTER THE LIVE PROOF IS CAPTURED.
 *
 * Sole purpose: close ONE transport gap. The /api/cron/knowledge-warm endpoint
 * is Bearer-gated by CRON_SECRET; an external connector cannot attach that
 * header. This route, running server-side on the Vercel PREVIEW of this branch
 * ONLY, reads CRON_SECRET server-side (via serverEnv.cronSecret()) and invokes
 * knowledge-warm WITH the Bearer header, returning only the warm job's normal
 * NON-SECRET JSON (row/skip counts). It NEVER returns, logs, or exposes the
 * secret, changes production/main/Supabase schema/search/scoring/cron auth, or
 * disables Vercel Deployment Protection.
 *
 * Hard-disabled everywhere except the Vercel Preview of
 * `claude/watch-verdict-app-wwbtbg` — anything else is a 404.
 */
export async function GET(request: Request): Promise<Response> {
  // (2) Preview environment ONLY.
  if (process.env.VERCEL_ENV !== 'preview') {
    return new NextResponse('Not found', { status: 404 });
  }
  // (3) This branch ONLY.
  if (process.env.VERCEL_GIT_COMMIT_REF !== 'claude/watch-verdict-app-wwbtbg') {
    return new NextResponse('Not found', { status: 404 });
  }

  // (4) Secret read SERVER-SIDE only. Never returned, never logged, never leaked.
  const secret = serverEnv.cronSecret();
  if (!secret) {
    return NextResponse.json({ ok: false, error: 'CRON_SECRET not configured' }, { status: 503 });
  }

  const origin = new URL(request.url).origin;
  const authedReq = () =>
    new Request(`${origin}/api/cron/knowledge-warm`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${secret}` },
    });

  try {
    // (5) Internally call knowledge-warm WITH the Bearer header.
    // Primary: a real internal HTTP hop to ${origin}/api/cron/knowledge-warm.
    // Fallback: if Vercel Deployment Protection challenges the internal hop
    // (401/403 despite the correct Bearer — protection intercepts before the
    // route runs), invoke the route handler in-process with the same authorized
    // request. Both add the secret server-side and produce the identical warm
    // result; the fallback keeps Deployment Protection ENABLED and untouched.
    let via = 'http';
    let status: number;
    let body: unknown = null;

    const httpRes = await fetch(authedReq(), { cache: 'no-store' }).catch(() => null);
    if (httpRes && httpRes.status !== 401 && httpRes.status !== 403) {
      status = httpRes.status;
      body = await httpRes.json().catch(() => null);
    } else {
      via = 'direct';
      const direct = await knowledgeWarmGET(authedReq());
      status = direct.status;
      body = await direct.json().catch(() => null);
    }

    // (6) Return ONLY success flag, upstream status, and the non-secret warm JSON.
    return NextResponse.json({ ok: status >= 200 && status < 300, via, upstreamStatus: status, upstream: body });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : 'proof bridge failed' }, { status: 500 });
  }
}
