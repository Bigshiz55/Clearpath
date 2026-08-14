import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { loadDnaConfidence, countCalibrationAnswers } from '@/lib/preference/dnaSignals';
import { calibrationProgress } from '@/lib/preference/calibration';

export const dynamic = 'force-dynamic';

/**
 * THE ONBOARDING DNA READ-OUT — real metrics only, computed from PERSISTED
 * state on every call.
 *
 * Two numbers, both already canonical in this product, neither invented for
 * this endpoint:
 *
 *   • DNA CONFIDENCE — `computeDnaConfidence` over the real signal tally
 *     (the same computation the DNA hub's confidence panel shows). Moves
 *     only when a preference event / watchlist row / outcome actually
 *     lands.
 *   • QUIZ PROGRESS — `calibrationProgress` over the count of persisted
 *     calibration answers (the same model /api/calibration reports).
 *
 * There is deliberately NO client-side arithmetic feeding this — a reload
 * shows exactly what a refetch shows, because both are the same server
 * fold of the same stored rows.
 */
export async function GET(request: Request) {
  try {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });

    const sessionId = new URL(request.url).searchParams.get('session') ?? undefined;

    const [{ confidence }, answered] = await Promise.all([
      loadDnaConfidence(supabase, user.id, { sessionId }),
      countCalibrationAnswers(supabase, user.id, sessionId),
    ]);

    return NextResponse.json({
      confidence: { percent: confidence.percent, tier: confidence.tier },
      quiz: calibrationProgress(answered),
    });
  } catch {
    return NextResponse.json({ error: 'Could not read DNA progress.' }, { status: 500 });
  }
}
