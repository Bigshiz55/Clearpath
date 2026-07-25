'use client';

import { useState } from 'react';
import { VotingFloor, type FloorCandidate } from '@/components/court/VotingFloor';
import { CourtSizePicker } from '@/components/court/CourtSizePicker';
import { buildPool, replaceCandidate, COURT_SIZES, DEFAULT_COURT_SIZE, type CourtSize, type PoolCandidate, type PoolState } from '@/lib/court/pool';
import { canVote, VETO_TOKENS_PER_MEMBER, type Vote, type VoteAction } from '@/lib/court/voting';

/**
 * VOTING FLOOR harness (MOBILE_HARNESS=1). Runs the REAL pool and voting
 * engines in the browser against fixture candidates, so the whole interaction —
 * hidden ballots, veto confirmation, token spend, instant replacement, tray
 * behaviour — is verifiable without Supabase credentials. Not a mockup: every
 * state change goes through the same pure functions the server uses.
 */

const GENRES = ['Mystery', 'Comedy', 'Thriller', 'Drama', 'Sci-Fi', 'Documentary', 'Action', 'Romance'];
// 20 fixtures so even a Deep court (16) can be filled from real supply.
const FIXTURES: PoolCandidate[] = Array.from({ length: 20 }, (_, i) => ({
  key: `movie-${i + 1}`,
  title: i === 0 ? 'A Deliberately Very Long Fixture Title That Must Wrap Cleanly' : `Fixture Title ${i + 1}`,
  genre: GENRES[i % GENRES.length]!,
  decade: 1990 + (i % 4) * 10,
  tone: ['tense', 'light', 'sombre'][i % 3]!,
  popularity: 90 - i,
  fit: 95 - i * 2,
  availableOn: i === 3 ? [] : ['Netflix'],
  reason: `Picked for this court: strong ${GENRES[i % GENRES.length]!.toLowerCase()} fit and it clears tonight's runtime limit.`,
}));

const MEMBERS = ['you', 'heather', 'amy'];

export default function CourtVoteHarness() {
  const [size, setSize] = useState<CourtSize>(DEFAULT_COURT_SIZE);
  const [pool, setPool] = useState<PoolState>(() => buildPool(FIXTURES, DEFAULT_COURT_SIZE));
  const [votes, setVotes] = useState<Vote[]>([
    // Two other members have already voted on the first title, so the
    // hidden-ballot state is visible immediately.
    { memberId: 'heather', candidateKey: 'movie-1', action: 'watch_it' },
    { memberId: 'amy', candidateKey: 'movie-1', action: 'maybe' },
  ]);

  const tokensLeft = Math.max(0, VETO_TOKENS_PER_MEMBER - votes.filter((v) => v.memberId === 'you' && v.action === 'veto').length);

  const candidates: FloorCandidate[] = pool.active.map((c) => {
    const forCandidate = votes.filter((v) => v.candidateKey === c.key);
    const mine = forCandidate.find((v) => v.memberId === 'you') ?? null;
    const tally = mine
      ? forCandidate.reduce<Partial<Record<VoteAction, number>>>((acc, v) => ({ ...acc, [v.action]: (acc[v.action] ?? 0) + 1 }), {})
      : null;
    return {
      key: c.key, title: c.title, posterUrl: null, genre: c.genre,
      runtimeMinutes: 100 + (c.decade % 50), availableOn: c.availableOn, reason: c.reason,
      youVoted: Boolean(mine), yourAction: mine?.action ?? null, tally,
      votedBy: forCandidate.map((v) => v.memberId),
    };
  });

  async function onVote(key: string, action: VoteAction) {
    const check = canVote('you', key, action, { votes, activeKeys: pool.active.map((c) => c.key) });
    if (!check.allowed) return { ok: false, error: check.reason };
    setVotes((prev) => [...prev, { memberId: 'you', candidateKey: key, action }]);
    if (action === 'veto' || action === 'seen_it') {
      setPool((prev) => replaceCandidate(prev, key, action === 'veto' ? 'veto' : 'seen_it').state);
    }
    return { ok: true };
  }

  // Changing the size rebuilds the court from the same supply. Votes are
  // cleared because a ballot on a title that is no longer in play is a lie.
  function changeSize(next: CourtSize) {
    if (next === size) return;
    setSize(next);
    setPool(buildPool(FIXTURES, next));
    setVotes([]);
  }

  const started = votes.some((v) => v.memberId === 'you');

  return (
    <main className="container-page py-6" data-testid="court-vote-harness">
      <h1 className="mb-4 text-xl font-black text-white">Court — voting floor</h1>
      <div className="mb-5">
        <CourtSizePicker value={size} onChange={changeSize} warnOnChange={started} />
        <p data-testid="court-size-summary" className="mt-2 text-xs text-slate-400">
          {COURT_SIZES[size].label}: {COURT_SIZES[size].total} titles, {COURT_SIZES[size].active} in play.
        </p>
      </div>
      <VotingFloor
        candidates={candidates}
        memberCount={MEMBERS.length}
        vetoTokensLeft={tokensLeft}
        reserveCount={pool.reserve.length}
        onVote={onVote}
      />
    </main>
  );
}
