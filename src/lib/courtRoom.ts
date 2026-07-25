/**
 * COURT ROOM ENGINE (pure, no I/O). The decision core of the rebuilt group
 * experience: reaction semantics, non-average group ranking, staged readiness,
 * appeal recalculation, and the modern status language. WatchVerd1ct itself is
 * the intelligence — there is no judge character anywhere in this module.
 *
 * Reaction meanings (never collapsed into generic likes):
 *   FOR   — actively wants to watch it tonight.
 *   MAYBE — would accept it.
 *   PASS  — not tonight (NEVER a permanent dislike).
 *   VETO  — strong objection: the title cannot win while the veto stands.
 */

import { householdVerdict } from '@/lib/householdVerdict';

export type Reaction = 'for' | 'maybe' | 'pass' | 'veto';

export interface CandidateInput {
  key: string; // "movie-123"
  title: string;
  /** Predicted fit per participant (0–100), from DNA/tonight scoring. */
  fits: { name: string; score: number }[];
  /** Reactions cast so far, by participant name. */
  reactions: { name: string; reaction: Reaction; reason?: string }[];
  /** Whether the room can actually watch it (service overlap). */
  available?: boolean;
}

export interface RankedCandidate {
  key: string;
  title: string;
  /** Final group score 0–100 (floor-weighted base ± reaction adjustments). */
  groupScore: number;
  /** Floor-weighted base before reactions. */
  baseScore: number;
  vetoed: boolean;
  vetoedBy: string[];
  perMember: { name: string; score: number }[];
  forCount: number;
  passCount: number;
  /** Why it ranks where it does — plain language, no invented facts. */
  reasons: string[];
}

const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(n)));

/** Rank the shortlist for the group. NEVER a plain average: the base score is
 *  the floor-weighted household verdict, FOR lifts, PASS drags, and a VETO
 *  hard-blocks the title from winning while it stands. */
export function groupRank(candidates: CandidateInput[]): RankedCandidate[] {
  const ranked = candidates.map((c) => {
    const hh = householdVerdict(c.fits.map((f) => ({ name: f.name, match: f.score })));
    const vetoes = c.reactions.filter((r) => r.reaction === 'veto');
    const forCount = c.reactions.filter((r) => r.reaction === 'for').length;
    const passCount = c.reactions.filter((r) => r.reaction === 'pass').length;
    const n = Math.max(1, c.fits.length);

    // Reactions move the score, bounded so they refine — not replace — fit.
    let score = hh.score + (forCount / n) * 12 - (passCount / n) * 14;
    if (c.available === false) score -= 20;
    // The group score can never exceed the best individual fit: showing "100"
    // for a 94/88 room reads as fabricated precision and destroys trust.
    const ceiling = Math.max(...c.fits.map((f) => f.score));
    score = clamp(Math.min(score, ceiling));

    const reasons: string[] = [];
    if (forCount === n && n > 1) reasons.push('Everyone was positive');
    else if (forCount > 0) reasons.push(`${forCount} of ${n} actively want it`);
    if (hh.call === 'strong') reasons.push('Strong fit for the whole group');
    if (hh.call === 'warning') reasons.push(hh.explanation[0] ?? 'Strong mismatch for one person');
    if (passCount > 0) reasons.push(`${passCount} said not tonight`);
    if (vetoes.length > 0) reasons.push(`Vetoed by ${vetoes.map((v) => v.name).join(', ')}`);
    if (c.available === false) reasons.push('Not on a shared service');

    return {
      key: c.key,
      title: c.title,
      groupScore: score,
      baseScore: hh.score,
      vetoed: vetoes.length > 0,
      vetoedBy: vetoes.map((v) => v.name),
      perMember: c.fits.map((f) => ({ name: f.name, score: f.score })),
      forCount,
      passCount,
      reasons,
    };
  });

  // Vetoed titles sink below every non-vetoed title regardless of score.
  return ranked.sort((a, b) => (a.vetoed === b.vetoed ? b.groupScore - a.groupScore : a.vetoed ? 1 : -1));
}

/** The winner: the highest-ranked NON-vetoed candidate (null when everything
 *  is vetoed — the room must resolve a veto or broaden the shortlist). */
export function winnerOf(ranked: RankedCandidate[]): RankedCandidate | null {
  return ranked.find((r) => !r.vetoed) ?? null;
}

/** APPEAL: exclude the current winner (and past winners), keep everything else
 *  — participants, reactions, shortlist — and return the next ruling. */
export function appeal(candidates: CandidateInput[], excludedKeys: string[]): RankedCandidate | null {
  const excluded = new Set(excludedKeys);
  return winnerOf(groupRank(candidates.filter((c) => !excluded.has(c.key))));
}

// ---------------------------------------------------------------------------
// Staged readiness — no rigid "2+ to start" gate on every action.
// ---------------------------------------------------------------------------

export interface RoomSnapshot {
  participantCount: number;
  candidateCount: number;
  reactedCount: number;
  stage: 'open' | 'reacting' | 'verdict';
}

export const roomReady = (s: RoomSnapshot) => s.participantCount >= 2;
export const shortlistReady = (s: RoomSnapshot) => s.candidateCount >= 3;
export const verdictReady = (s: RoomSnapshot) => s.participantCount > 0 && s.reactedCount >= s.participantCount;

/** The one primary next action, in modern language. Never a disabled mystery
 *  button — the label always says what unlocks progress. */
export function nextActionLabel(s: RoomSnapshot): string {
  if (s.stage === 'verdict') return 'See your group’s Verd1ct';
  if (s.stage === 'reacting') {
    return verdictReady(s)
      ? 'Everyone has reacted — reveal the Verd1ct'
      : `${s.reactedCount} of ${s.participantCount} have reacted`;
  }
  if (!roomReady(s)) return 'Invite at least one more person';
  if (!shortlistReady(s)) return 'Add titles or build our shortlist';
  return `${s.candidateCount} titles ready — start choosing`;
}

/** Participant status — explicit, never a bare mystery number. */
export function participantStatus(p: { ready?: boolean; pickCount?: number }): string {
  if (p.ready) return 'Ready';
  if ((p.pickCount ?? 0) > 0) return `${p.pickCount} pick${p.pickCount === 1 ? '' : 's'} added`;
  return 'Still choosing';
}

/** Honest partial-participation note (empty when everyone responded). */
export function partialNote(s: RoomSnapshot): string {
  if (s.reactedCount >= s.participantCount) return '';
  return `Verd1ct based on ${s.reactedCount} of ${s.participantCount} participants`;
}
