import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { persistDecisionRun } from '@/lib/graph/store';
import { buildDocketVerdictRun } from '@/lib/graph/decisionRun';

export const dynamic = 'force-dynamic';

/**
 * RECORD A DOCKET VERDICT AS A DECISION RUN — Phase 8.
 *
 * The docket's verdict is computed in the browser (`deliverVerdict` in
 * VerdictDelivery) and used to exist only as React state: the ruled-out
 * reasons — ready-made rejection evidence — evaporated on navigation. This
 * beacon persists the decision the client ALREADY computed, as execution
 * evidence, into the same decision_runs store every other surface uses.
 *
 * NOT a taste write. The run is request_only (the docket is explicitly
 * ephemeral) and INV-9 forbids wrote_taste/seeded_title edges from this
 * entry point — the docket store's own "never touches the preference log"
 * contract, now enforced at the graph layer too.
 *
 * Auth: the signed-in user records their own run (RLS owner-insert).
 * Fire-and-forget from the client; a failure here can never affect the
 * verdict the user is already looking at.
 */

const MAX_ITEMS = 12; // MAX_DOCKET is 8; headroom, not an invitation.

interface Entry {
  key?: unknown;
  title?: unknown;
  score?: unknown;
  reason?: unknown;
}

const cleanKey = (v: unknown): string | null =>
  typeof v === 'string' && /^[a-z]+-\d+$/.test(v) ? v : null;
const cleanText = (v: unknown, max: number): string | undefined =>
  typeof v === 'string' ? v.slice(0, max) : undefined;
const cleanScore = (v: unknown): number | null =>
  typeof v === 'number' && Number.isFinite(v) ? Math.round(v) : null;

function cleanRanked(e: Entry | null | undefined): { key: string; title?: string; score?: number | null } | null {
  const key = cleanKey(e?.key);
  if (!key) return null;
  return { key, title: cleanText(e?.title, 200), score: cleanScore(e?.score) };
}

export async function POST(request: Request) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false }, { status: 401 });

  let body: { winner?: Entry; backup?: Entry; alsoRan?: Entry[]; ruledOut?: Entry[] };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  const ruledOut = (Array.isArray(body.ruledOut) ? body.ruledOut : [])
    .slice(0, MAX_ITEMS)
    .flatMap((e) => {
      const key = cleanKey(e?.key);
      const reason = cleanText(e?.reason, 300);
      return key && reason ? [{ key, title: cleanText(e?.title, 200), reason }] : [];
    });

  const run = buildDocketVerdictRun({
    runId: crypto.randomUUID(),
    winner: cleanRanked(body.winner),
    backup: cleanRanked(body.backup),
    alsoRan: (Array.isArray(body.alsoRan) ? body.alsoRan : [])
      .slice(0, MAX_ITEMS)
      .flatMap((e) => {
        const r = cleanRanked(e);
        return r ? [r] : [];
      }),
    ruledOut,
    createdAt: new Date().toISOString(),
  });

  const ok = await persistDecisionRun(supabase, user.id, run);
  return NextResponse.json({ ok });
}
