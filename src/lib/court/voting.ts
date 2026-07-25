/**
 * COURT VOTING (pure, no I/O) — the four actions, veto tokens, hidden ballots,
 * consensus scoring and the Final Three round.
 *
 * The four actions are deliberately NOT collapsed:
 *   WATCH IT — actively wants it
 *   MAYBE    — would accept it
 *   VETO     — hard removal; costs one of two tokens
 *   SEEN IT  — remove and replace, with NO negative signal about the title
 *
 * Ballots are hidden until you cast your own, so nobody anchors on the room.
 */

export type VoteAction = 'watch_it' | 'maybe' | 'veto' | 'seen_it';

export const VETO_TOKENS_PER_MEMBER = 2;

export interface Vote {
  memberId: string;
  candidateKey: string;
  action: VoteAction;
  /** Guest jurors are advisory only and are scored separately. */
  guest?: boolean;
}

export interface MemberRef {
  id: string;
  name: string;
  guest?: boolean;
}

// ---------------------------------------------------------------- tokens ----

/** Tokens left for a member: two per court, spent only by a VETO. */
export function vetoTokensLeft(memberId: string, votes: Vote[]): number {
  const spent = votes.filter((v) => v.memberId === memberId && v.action === 'veto').length;
  return Math.max(0, VETO_TOKENS_PER_MEMBER - spent);
}

export interface VoteAttempt {
  allowed: boolean;
  reason?: string;
}

/**
 * May this member cast this vote? Guards double-voting, spent tokens, and
 * voting on a candidate that is no longer active. Called before every write,
 * which is what makes concurrent submissions safe.
 */
export function canVote(
  memberId: string,
  candidateKey: string,
  action: VoteAction,
  ctx: { votes: Vote[]; activeKeys: string[] },
): VoteAttempt {
  if (!ctx.activeKeys.includes(candidateKey)) {
    return { allowed: false, reason: 'That title is no longer in the running.' };
  }
  if (ctx.votes.some((v) => v.memberId === memberId && v.candidateKey === candidateKey)) {
    return { allowed: false, reason: 'You have already voted on this title.' };
  }
  if (action === 'veto' && vetoTokensLeft(memberId, ctx.votes) === 0) {
    return { allowed: false, reason: 'You have used both of your vetoes. You can still vote Maybe or say why in chat.' };
  }
  return { allowed: true };
}

// ------------------------------------------------------------ visibility ----

export interface BallotView {
  /** Has THIS member voted on this candidate? */
  youVoted: boolean;
  yourAction: VoteAction | null;
  /** Tallies are withheld until you vote. */
  revealed: boolean;
  tally: { watch_it: number; maybe: number; veto: number; seen_it: number } | null;
  /** Who has voted — never WHAT they chose, until reveal. */
  votedMemberIds: string[];
  stillDeciding: string[];
}

/** What one member may see about one candidate right now. */
export function ballotView(
  memberId: string,
  candidateKey: string,
  members: MemberRef[],
  votes: Vote[],
): BallotView {
  const forCandidate = votes.filter((v) => v.candidateKey === candidateKey);
  const mine = forCandidate.find((v) => v.memberId === memberId) ?? null;
  const votedMemberIds = forCandidate.map((v) => v.memberId);
  const stillDeciding = members.filter((m) => !votedMemberIds.includes(m.id)).map((m) => m.id);

  if (!mine) {
    // Not yet voted: you can see WHO has voted, never what they chose.
    return {
      youVoted: false, yourAction: null, revealed: false, tally: null,
      votedMemberIds, stillDeciding,
    };
  }
  const tally = { watch_it: 0, maybe: 0, veto: 0, seen_it: 0 };
  for (const v of forCandidate) tally[v.action] += 1;
  return { youVoted: true, yourAction: mine.action, revealed: true, tally, votedMemberIds, stillDeciding };
}

// -------------------------------------------------------------- scoring -----

/**
 * Configurable weights — documented, not hard-coded at the call site.
 * Hard constraints and valid vetoes are GATES applied before this, never
 * penalties folded into the number.
 */
export interface ScoringWeights {
  dna: number;
  liveVotes: number;
  tonight: number;
  quality: number;
}

export const DEFAULT_WEIGHTS: ScoringWeights = {
  dna: 0.5,       // combined saved DNA of private members
  liveVotes: 0.25, // live private-member voting
  tonight: 0.15,   // tonight's temporary preferences
  quality: 0.1,    // quality, availability and confidence signals
};

export interface CandidateSignals {
  key: string;
  /** 0–100 combined private-member DNA fit. */
  dnaFit: number;
  /** 0–100 fit against tonight's temporary preferences. */
  tonightFit: number;
  /** 0–100 quality/availability/confidence composite. */
  quality: number;
}

/** Live-vote component 0–100 from PRIVATE members only. */
export function liveVoteScore(candidateKey: string, votes: Vote[]): number {
  const relevant = votes.filter((v) => v.candidateKey === candidateKey && !v.guest);
  if (relevant.length === 0) return 50; // neutral before anyone votes
  let score = 0;
  for (const v of relevant) {
    if (v.action === 'watch_it') score += 100;
    else if (v.action === 'maybe') score += 55;
    else if (v.action === 'seen_it') score += 50; // neutral: not a dislike
    // veto contributes 0 — though a veto also gates the title out entirely
  }
  return Math.round(score / relevant.length);
}

export interface ScoredCandidate {
  key: string;
  score: number;
  breakdown: { dna: number; liveVotes: number; tonight: number; quality: number };
  /** True when a private member has vetoed it — a gate, not a penalty. */
  vetoed: boolean;
  vetoedBy: string[];
  /** True when a private member marked it seen — removed, but not disliked. */
  seenBy: string[];
}

export function scoreCandidate(
  signals: CandidateSignals,
  votes: Vote[],
  weights: ScoringWeights = DEFAULT_WEIGHTS,
): ScoredCandidate {
  const live = liveVoteScore(signals.key, votes);
  const forCandidate = votes.filter((v) => v.candidateKey === signals.key && !v.guest);
  const breakdown = {
    dna: signals.dnaFit * weights.dna,
    liveVotes: live * weights.liveVotes,
    tonight: signals.tonightFit * weights.tonight,
    quality: signals.quality * weights.quality,
  };
  return {
    key: signals.key,
    score: Math.round(breakdown.dna + breakdown.liveVotes + breakdown.tonight + breakdown.quality),
    breakdown,
    vetoed: forCandidate.some((v) => v.action === 'veto'),
    vetoedBy: forCandidate.filter((v) => v.action === 'veto').map((v) => v.memberId),
    seenBy: forCandidate.filter((v) => v.action === 'seen_it').map((v) => v.memberId),
  };
}

/** Guest-jury sentiment, reported SEPARATELY and never mixed into the score. */
export function guestSentiment(candidateKey: string, votes: Vote[]): { watchItPercent: number; count: number } | null {
  const guests = votes.filter((v) => v.candidateKey === candidateKey && v.guest);
  if (guests.length === 0) return null;
  const positive = guests.filter((v) => v.action === 'watch_it').length;
  return { watchItPercent: Math.round((positive / guests.length) * 100), count: guests.length };
}

// ---------------------------------------------------------- final three -----

export interface FinalThreeDecision {
  ready: boolean;
  reason: string;
  finalists: ScoredCandidate[];
}

/**
 * Promote to the Final Three only when the room has genuinely decided enough:
 * every private member has had a chance to vote on the active candidates, at
 * least three survive without a veto, and the top three are distinguishable
 * from the fourth. Otherwise we say why we are still deliberating.
 */
export function finalThree(
  candidates: CandidateSignals[],
  members: MemberRef[],
  votes: Vote[],
  weights: ScoringWeights = DEFAULT_WEIGHTS,
): FinalThreeDecision {
  const scored = candidates.map((c) => scoreCandidate(c, votes, weights));
  const survivors = scored.filter((s) => !s.vetoed && s.seenBy.length === 0).sort((a, b) => b.score - a.score);

  if (survivors.length < 3) {
    return { ready: false, reason: `Only ${survivors.length} title${survivors.length === 1 ? '' : 's'} remain without a veto.`, finalists: survivors };
  }

  const privateMembers = members.filter((m) => !m.guest);
  const activeKeys = candidates.map((c) => c.key);
  const notFinished = privateMembers.filter((m) => {
    const voted = votes.filter((v) => v.memberId === m.id && activeKeys.includes(v.candidateKey)).length;
    return voted < activeKeys.length;
  });
  if (notFinished.length > 0) {
    return {
      ready: false,
      reason: `${notFinished.length} member${notFinished.length === 1 ? ' is' : 's are'} still voting.`,
      finalists: survivors.slice(0, 3),
    };
  }

  // The top three must be distinguishable from the fourth, otherwise the cut
  // would be arbitrary and the room would rightly not trust it.
  const fourth = survivors[3];
  if (fourth && survivors[2]!.score === fourth.score) {
    return { ready: false, reason: 'Third and fourth place are tied — keep voting to separate them.', finalists: survivors.slice(0, 3) };
  }

  return { ready: true, reason: 'Three clear finalists.', finalists: survivors.slice(0, 3) };
}

/**
 * Break a final tie WITHOUT ever letting guest jurors decide it: private DNA
 * first, then tonight's fit, then private live votes, then quality. Returns the
 * winner and the human-readable rule that decided it.
 */
export function breakTie(
  tied: ScoredCandidate[],
  signals: Map<string, CandidateSignals>,
  votes: Vote[],
): { winner: ScoredCandidate; rule: string } {
  const rules: { rule: string; value: (c: ScoredCandidate) => number }[] = [
    { rule: 'strongest combined DNA fit', value: (c) => signals.get(c.key)?.dnaFit ?? 0 },
    { rule: "closest fit to tonight's preferences", value: (c) => signals.get(c.key)?.tonightFit ?? 0 },
    { rule: 'most positive votes from the private court', value: (c) => liveVoteScore(c.key, votes.filter((v) => !v.guest)) },
    { rule: 'strongest quality and availability evidence', value: (c) => signals.get(c.key)?.quality ?? 0 },
  ];
  let pool = [...tied];
  for (const r of rules) {
    const best = Math.max(...pool.map(r.value));
    const narrowed = pool.filter((c) => r.value(c) === best);
    if (narrowed.length === 1) return { winner: narrowed[0]!, rule: r.rule };
    pool = narrowed;
  }
  // Fully tied on every private signal — deterministic, and stated as such.
  return { winner: pool.sort((a, b) => a.key.localeCompare(b.key))[0]!, rule: 'every signal was level, so the earliest candidate was taken' };
}
