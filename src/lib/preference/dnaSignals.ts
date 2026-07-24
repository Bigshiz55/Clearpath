import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { emptyTally, computeDnaConfidence, type DnaSignalTally, type DnaConfidenceResult } from './dnaConfidence';

/**
 * Server loader that tallies the REAL signals behind DNA Confidence from what we
 * already store — the preference-event log, the watchlist, and recommendation
 * outcomes. Cost-safe (three bounded, indexed reads) and fail-open: any missing
 * table or read error degrades that channel to zero rather than throwing, so the
 * confidence number always renders.
 *
 * Signal sources are kept distinct to avoid double-counting inflation:
 *   • calibration / pack answers ← preference_events.source
 *   • "I'd watch" / "not for me"  ← preference_events attraction (non-calibration)
 *   • corrections                 ← preference_events.corrections
 *   • saved / watched / rated     ← watchlist_items
 *   • recs accepted / rejected    ← recommendation_outcomes
 */

const EVENT_CAP = 2000;

interface EvRow {
  action: string | null;
  attraction_grade: string | null;
  experience_grade: string | null;
  corrections: unknown;
  source: string | null;
  session_id?: string | null;
}
interface WlRow {
  status: string | null;
  rating: number | null;
  priority: number | null;
  watched_at: string | null;
}
interface OutRow {
  kind: string | null;
  outcome: string | null;
}

const POS_ATTRACTION = new Set(['must_watch', 'interested']);
const NEG_ATTRACTION = new Set(['not_interested', 'absolutely_not']);
const REC_ACCEPTED = new Set(['watched', 'saved', 'rated_up']);
const REC_REJECTED = new Set(['dismissed', 'rated_down', 'corrected', 'skipped']);

export interface LoadSignalsOpts {
  /** When set, only count events/outcomes tagged with this founder test session. */
  sessionId?: string;
}

/** Tally every DNA-confidence signal for a user. Fail-open per source. */
export async function loadDnaSignals(
  supabase: SupabaseClient,
  userId: string,
  opts: LoadSignalsOpts = {},
): Promise<DnaSignalTally> {
  const t = emptyTally();
  if (!userId) return t;

  // 1) Preference events (calibration/pack/attraction/corrections).
  try {
    let q = supabase
      .from('preference_events')
      .select('action,attraction_grade,experience_grade,corrections,source,session_id')
      .eq('user_id', userId)
      .is('undone_at', null)
      .order('event_at', { ascending: false })
      .limit(EVENT_CAP);
    if (opts.sessionId) q = q.eq('session_id', opts.sessionId);
    const { data } = await q;
    for (const rRaw of (data as EvRow[] | null) ?? []) {
      const src = (rRaw.source ?? '').toLowerCase();
      if (src === 'calibration') t.calibrationAnswers += 1;
      else if (src.startsWith('pack:')) t.packAnswers += 1;
      else {
        // Non-calibration surfaces contribute attraction signal.
        const a = rRaw.attraction_grade ?? '';
        if (POS_ATTRACTION.has(a) || rRaw.action === 'unseen_interested') t.wouldWatch += 1;
        else if (NEG_ATTRACTION.has(a) || rRaw.action === 'unseen_not_interested') t.notForMe += 1;
      }
      if (Array.isArray(rRaw.corrections) && rRaw.corrections.length > 0) t.corrections += 1;
    }
  } catch {
    /* fail-open */
  }

  // 2) Watchlist (saved / watched / completed / ratings).
  try {
    // Session scoping isn't modeled on watchlist_items; founder isolation is by user_id.
    const { data } = await supabase
      .from('watchlist_items')
      .select('status,rating,priority,watched_at')
      .eq('user_id', userId)
      .limit(3000);
    let saved = 0;
    for (const r of (data as WlRow[] | null) ?? []) {
      const s = r.status ?? '';
      if (s === 'strict' || s === 'possible' || s === 'watching' || (typeof r.priority === 'number' && r.priority > 0)) saved += 1;
      if (s === 'watched') {
        t.watched += 1;
        if (r.watched_at) t.completed += 1;
      }
      if (typeof r.rating === 'number') t.ratings += 1;
    }
    t.saved = saved;
    t.watchlists = saved > 0 ? 1 : 0;
  } catch {
    /* fail-open */
  }

  // 3) Recommendation outcomes (accepted / rejected).
  try {
    let q = supabase.from('recommendation_outcomes').select('kind,outcome,session_id').eq('user_id', userId).limit(3000);
    if (opts.sessionId) q = q.eq('session_id', opts.sessionId);
    const { data } = await q;
    for (const r of (data as OutRow[] | null) ?? []) {
      const k = (r.kind ?? r.outcome ?? '').toLowerCase();
      if (REC_ACCEPTED.has(k)) t.recsAccepted += 1;
      else if (REC_REJECTED.has(k)) t.recsRejected += 1;
    }
  } catch {
    /* fail-open */
  }

  return t;
}

/** Load the tally AND resolve it to a confidence read-out in one call. */
export async function loadDnaConfidence(
  supabase: SupabaseClient,
  userId: string,
  opts: LoadSignalsOpts = {},
): Promise<{ tally: DnaSignalTally; confidence: DnaConfidenceResult }> {
  const tally = await loadDnaSignals(supabase, userId, opts);
  return { tally, confidence: computeDnaConfidence(tally) };
}

/** Count of onboarding calibration answers (drives Quiz Progress), 0..∞ (UI caps at 20). */
export async function countCalibrationAnswers(supabase: SupabaseClient, userId: string, sessionId?: string): Promise<number> {
  if (!userId) return 0;
  try {
    let q = supabase
      .from('preference_events')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('source', 'calibration')
      .is('undone_at', null);
    if (sessionId) q = q.eq('session_id', sessionId);
    const { count } = await q;
    return count ?? 0;
  } catch {
    return 0;
  }
}
