import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { MatchCandidate } from './matching';

/**
 * Review queue data layer. Trusted/service-role side (mirrors the posture of
 * `src/lib/supabase/admin.ts`) — no UI in this phase, so callers are the
 * batch job and whatever internal tooling reads the queue next. Nothing
 * here auto-merges: `approve` is the only path that ever creates or extends
 * a Case, and it always requires an explicit call with a decided candidate.
 */

export type CandidateStatus = 'pending' | 'approved' | 'rejected';

export interface CandidateRow {
  id: string;
  episodeAId: number;
  episodeBId: number;
  confidence: number;
  reasons: string[];
  status: CandidateStatus;
  caseId: string | null;
  createdAt: string;
  decidedAt: string | null;
}

interface CandidateDbRow {
  id: string;
  episode_a_id: number;
  episode_b_id: number;
  confidence: number;
  reasons: string[];
  status: CandidateStatus;
  case_id: string | null;
  created_at: string;
  decided_at: string | null;
}

function toRow(row: CandidateDbRow): CandidateRow {
  return {
    id: row.id,
    episodeAId: row.episode_a_id,
    episodeBId: row.episode_b_id,
    confidence: row.confidence,
    reasons: row.reasons,
    status: row.status,
    caseId: row.case_id,
    createdAt: row.created_at,
    decidedAt: row.decided_at,
  };
}

function orderedPair(a: number, b: number): [number, number] {
  return a < b ? [a, b] : [b, a];
}

/**
 * Insert a batch of proposed candidates, skipping any pair that already has
 * a row (pending, approved, OR rejected) — this is what guarantees a
 * rejected pair is never re-proposed by a later matcher run.
 */
export async function proposeCandidates(supabase: SupabaseClient, candidates: MatchCandidate[]): Promise<number> {
  if (candidates.length === 0) return 0;
  const rows = candidates.map((c) => {
    const [episode_a_id, episode_b_id] = orderedPair(c.episodeAId, c.episodeBId);
    return { episode_a_id, episode_b_id, confidence: c.confidence, reasons: c.reasons };
  });
  const { data, error } = await supabase
    .from('case_match_candidates')
    .upsert(rows, { onConflict: 'episode_a_id,episode_b_id', ignoreDuplicates: true })
    .select('id');
  if (error) throw error;
  return (data as { id: string }[]).length;
}

/**
 * Pending candidates ordered for review: agreement-weighted first (a pair
 * with concurring community flags jumps the queue), then by confidence.
 * `agreementCounts` comes from `communityFlags.ts` — kept as a parameter
 * rather than a join so this module has no dependency direction on that one.
 */
export async function listPendingQueue(
  supabase: SupabaseClient,
  agreementCounts: Map<string, number>,
): Promise<CandidateRow[]> {
  const { data, error } = await supabase
    .from('case_match_candidates')
    .select('*')
    .eq('status', 'pending')
    .order('confidence', { ascending: false });
  if (error) throw error;
  const rows = (data as CandidateDbRow[]).map(toRow);
  return rows.sort((a, b) => {
    const aAgree = agreementCounts.get(`${a.episodeAId}:${a.episodeBId}`) ?? 0;
    const bAgree = agreementCounts.get(`${b.episodeAId}:${b.episodeBId}`) ?? 0;
    if (aAgree !== bAgree) return bAgree - aAgree;
    return b.confidence - a.confidence;
  });
}

/**
 * Approve a candidate: creates a new Case if neither episode is linked to
 * one yet, or extends the existing Case if one side already is. Writes to
 * `case_match_episodes` (this pipeline's own bridge — never `case_programmes`,
 * which stays reserved for real ingested tv_programmes rows).
 */
export async function approveCandidate(
  supabase: SupabaseClient,
  candidateId: string,
  caseSlugIfNew: string,
  caseTitleIfNew: string,
): Promise<{ caseId: string }> {
  const { data: candidateData, error: candidateError } = await supabase
    .from('case_match_candidates')
    .select('*')
    .eq('id', candidateId)
    .single();
  if (candidateError) throw candidateError;
  const candidate = toRow(candidateData as CandidateDbRow);

  const { data: existingLinks, error: linkError } = await supabase
    .from('case_match_episodes')
    .select('case_id, tvmaze_episode_id')
    .in('tvmaze_episode_id', [candidate.episodeAId, candidate.episodeBId]);
  if (linkError) throw linkError;
  const links = existingLinks as { case_id: string; tvmaze_episode_id: number }[];

  let caseId = links[0]?.case_id ?? null;
  if (!caseId) {
    const { data: newCase, error: caseError } = await supabase
      .from('cases')
      .insert({ slug: caseSlugIfNew, title: caseTitleIfNew })
      .select('id')
      .single();
    if (caseError) throw caseError;
    caseId = (newCase as { id: string }).id;
  }

  const linkedEpisodeIds = new Set(links.map((l) => l.tvmaze_episode_id));
  const toLink = [candidate.episodeAId, candidate.episodeBId].filter((id) => !linkedEpisodeIds.has(id));
  if (toLink.length > 0) {
    const { error: insertError } = await supabase
      .from('case_match_episodes')
      .upsert(
        toLink.map((tvmaze_episode_id) => ({ case_id: caseId, tvmaze_episode_id })),
        { onConflict: 'case_id,tvmaze_episode_id', ignoreDuplicates: true },
      );
    if (insertError) throw insertError;
  }

  const { error: updateError } = await supabase
    .from('case_match_candidates')
    .update({ status: 'approved', case_id: caseId, decided_at: new Date().toISOString() })
    .eq('id', candidateId);
  if (updateError) throw updateError;

  return { caseId };
}

/** Rejecting records the negative decision permanently — proposeCandidates skips this pair on every future run. */
export async function rejectCandidate(supabase: SupabaseClient, candidateId: string): Promise<void> {
  const { error } = await supabase
    .from('case_match_candidates')
    .update({ status: 'rejected', decided_at: new Date().toISOString() })
    .eq('id', candidateId);
  if (error) throw error;
}
