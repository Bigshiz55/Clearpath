import { describe, it, expect } from 'vitest';
import {
  buildPool, replaceCandidate, selectVaried, totalShown, isWatchable,
  ACTIVE_SLOTS, MAX_CANDIDATES, COURT_SIZES, DEFAULT_COURT_SIZE, type PoolCandidate,
} from './pool';
import {
  canVote, vetoTokensLeft, ballotView, liveVoteScore, scoreCandidate, guestSentiment,
  finalThree, breakTie, DEFAULT_WEIGHTS, VETO_TOKENS_PER_MEMBER,
  type Vote, type MemberRef, type CandidateSignals,
} from './voting';

const cand = (over: Partial<PoolCandidate> & { key: string }): PoolCandidate => ({
  title: over.key, genre: 'Thriller', decade: 2020, tone: 'tense',
  popularity: 50, fit: 70, availableOn: ['Netflix'], reason: 'Matches the room',
  ...over,
});

/** 14 genuinely varied eligible candidates. */
function eligiblePool(): PoolCandidate[] {
  const genres = ['Thriller', 'Comedy', 'Drama', 'Mystery', 'Sci-Fi', 'Documentary', 'Action'];
  const tones = ['tense', 'light', 'sombre'];
  return Array.from({ length: 14 }, (_, i) =>
    cand({
      key: `movie-${i}`,
      genre: genres[i % genres.length]!,
      decade: 1990 + (i % 4) * 10,
      tone: tones[i % tones.length]!,
      fit: 95 - i,
      popularity: 90 - i,
    }),
  );
}

describe('candidate pool — six active, six reserve, twelve maximum', () => {
  it('opens with exactly six active and six in reserve', () => {
    const p = buildPool(eligiblePool());
    expect(p.active).toHaveLength(ACTIVE_SLOTS);
    expect(p.reserve).toHaveLength(6);
    expect(totalShown(p)).toBe(MAX_CANDIDATES);
  });

  it('never exceeds twelve candidates across a whole session', () => {
    let p = buildPool(eligiblePool());
    for (const key of p.active.map((c) => c.key)) {
      p = replaceCandidate(p, key, 'veto').state;
    }
    expect(totalShown(p)).toBeLessThanOrEqual(MAX_CANDIDATES);
  });

  it('enforces variety — the opening six do not repeat a genre', () => {
    const p = buildPool(eligiblePool());
    const genres = p.active.map((c) => c.genre);
    expect(new Set(genres).size).toBe(genres.length);
  });

  it('does not fill the tray with near-duplicates when variety exists', () => {
    const duplicates = Array.from({ length: 10 }, (_, i) =>
      cand({ key: `dup-${i}`, genre: 'Thriller', decade: 2020, tone: 'tense', fit: 90 - i }),
    );
    const varied = [cand({ key: 'c1', genre: 'Comedy', tone: 'light', fit: 60 }), cand({ key: 'd1', genre: 'Drama', tone: 'sombre', fit: 55 })];
    const chosen = selectVaried([...duplicates, ...varied], 4);
    // The lower-fitting but distinct titles must be preferred over duplicates.
    expect(chosen.map((c) => c.key)).toContain('c1');
    expect(chosen.map((c) => c.key)).toContain('d1');
  });

  it('a veto promotes the next reserve into the SAME slot immediately', () => {
    const p = buildPool(eligiblePool());
    const target = p.active[2]!;
    const nextUp = p.reserve[0]!;
    const r = replaceCandidate(p, target.key, 'veto');
    expect(r.promoted?.key).toBe(nextUp.key);
    expect(r.state.active[2]!.key).toBe(nextUp.key); // same position — no reshuffle
    expect(r.state.active).toHaveLength(ACTIVE_SLOTS);
    expect(r.state.reserve).toHaveLength(5);
    expect(r.state.removed).toEqual([{ key: target.key, reason: 'veto' }]);
  });

  it('"seen it" replaces WITHOUT recording a negative reason', () => {
    const p = buildPool(eligiblePool());
    const r = replaceCandidate(p, p.active[0]!.key, 'seen_it');
    expect(r.state.removed[0]!.reason).toBe('seen_it');
    expect(r.promoted).not.toBeNull();
  });

  it('removing the same key twice is a no-op — safe under simultaneous vetoes', () => {
    const p = buildPool(eligiblePool());
    const key = p.active[0]!.key;
    const first = replaceCandidate(p, key, 'veto');
    const second = replaceCandidate(first.state, key, 'veto');
    expect(second.state).toBe(first.state); // untouched
    expect(second.promoted).toBeNull();
    expect(second.state.removed).toHaveLength(1); // not double-counted
  });

  it('an exhausted reserve shrinks the tray honestly rather than inventing titles', () => {
    let p = buildPool(eligiblePool().slice(0, 7)); // 6 active + 1 reserve
    p = replaceCandidate(p, p.active[0]!.key, 'veto').state;
    expect(p.reserve).toHaveLength(0);
    const r = replaceCandidate(p, p.active[0]!.key, 'veto');
    expect(r.promoted).toBeNull();
    expect(r.reserveExhausted).toBe(true);
    expect(r.state.active).toHaveLength(5);
  });

  it('a candidate with no available service is not watchable', () => {
    expect(isWatchable(cand({ key: 'x', availableOn: [] }))).toBe(false);
    expect(isWatchable(cand({ key: 'y', availableOn: ['Hulu'] }))).toBe(true);
  });
});

describe('veto tokens — two per member', () => {
  const ctx = (votes: Vote[]) => ({ votes, activeKeys: ['a', 'b', 'c'] });

  it('starts at two and decrements only on a veto', () => {
    expect(vetoTokensLeft('m1', [])).toBe(VETO_TOKENS_PER_MEMBER);
    const votes: Vote[] = [
      { memberId: 'm1', candidateKey: 'a', action: 'veto' },
      { memberId: 'm1', candidateKey: 'b', action: 'watch_it' },
      { memberId: 'm1', candidateKey: 'c', action: 'seen_it' },
    ];
    expect(vetoTokensLeft('m1', votes)).toBe(1);
  });

  it('blocks a third veto but still permits Maybe', () => {
    const votes: Vote[] = [
      { memberId: 'm1', candidateKey: 'a', action: 'veto' },
      { memberId: 'm1', candidateKey: 'b', action: 'veto' },
    ];
    const blocked = canVote('m1', 'c', 'veto', ctx(votes));
    expect(blocked.allowed).toBe(false);
    expect(blocked.reason).toMatch(/used both of your vetoes/i);
    expect(canVote('m1', 'c', 'maybe', ctx(votes)).allowed).toBe(true);
  });

  it('"seen it" never consumes a token', () => {
    const votes: Vote[] = [{ memberId: 'm1', candidateKey: 'a', action: 'seen_it' }];
    expect(vetoTokensLeft('m1', votes)).toBe(2);
  });

  it('prevents a duplicate vote on the same candidate', () => {
    const votes: Vote[] = [{ memberId: 'm1', candidateKey: 'a', action: 'watch_it' }];
    const r = canVote('m1', 'a', 'maybe', ctx(votes));
    expect(r.allowed).toBe(false);
    expect(r.reason).toMatch(/already voted/i);
  });

  it('rejects a vote on a candidate that has already been removed', () => {
    const r = canVote('m1', 'gone', 'watch_it', { votes: [], activeKeys: ['a'] });
    expect(r.allowed).toBe(false);
    expect(r.reason).toMatch(/no longer in the running/i);
  });
});

describe('hidden ballots', () => {
  const members: MemberRef[] = [{ id: 'm1', name: 'A' }, { id: 'm2', name: 'B' }, { id: 'm3', name: 'C' }];
  const votes: Vote[] = [
    { memberId: 'm2', candidateKey: 'a', action: 'watch_it' },
    { memberId: 'm3', candidateKey: 'a', action: 'veto' },
  ];

  it('before you vote you see WHO voted but never WHAT they chose', () => {
    const v = ballotView('m1', 'a', members, votes);
    expect(v.youVoted).toBe(false);
    expect(v.revealed).toBe(false);
    expect(v.tally).toBeNull();
    expect(v.votedMemberIds.sort()).toEqual(['m2', 'm3']);
    expect(v.stillDeciding).toEqual(['m1']);
  });

  it('after you vote the distribution is revealed', () => {
    const mine: Vote[] = [...votes, { memberId: 'm1', candidateKey: 'a', action: 'maybe' }];
    const v = ballotView('m1', 'a', members, mine);
    expect(v.revealed).toBe(true);
    expect(v.yourAction).toBe('maybe');
    expect(v.tally).toEqual({ watch_it: 1, maybe: 1, veto: 1, seen_it: 0 });
    expect(v.stillDeciding).toEqual([]);
  });
});

describe('scoring model — configurable, with gates not penalties', () => {
  const signals: CandidateSignals = { key: 'a', dnaFit: 80, tonightFit: 60, quality: 90 };

  it('uses the documented default weights (50/25/15/10)', () => {
    expect(DEFAULT_WEIGHTS).toEqual({ dna: 0.5, liveVotes: 0.25, tonight: 0.15, quality: 0.1 });
    const s = scoreCandidate(signals, [], DEFAULT_WEIGHTS);
    // dna 40 + live 12.5 (neutral 50) + tonight 9 + quality 9 = 70.5 → 71
    expect(s.score).toBe(71);
    expect(s.breakdown.dna).toBe(40);
  });

  it('weights are configurable, not hard-coded', () => {
    const dnaHeavy = scoreCandidate(signals, [], { dna: 1, liveVotes: 0, tonight: 0, quality: 0 });
    expect(dnaHeavy.score).toBe(80);
  });

  it('a veto is recorded as a gate flag, and gating is not a mere penalty', () => {
    const s = scoreCandidate(signals, [{ memberId: 'm1', candidateKey: 'a', action: 'veto' }]);
    expect(s.vetoed).toBe(true);
    expect(s.vetoedBy).toEqual(['m1']);
  });

  it('"seen it" is neutral — it does not drag the title down like a dislike', () => {
    expect(liveVoteScore('a', [{ memberId: 'm1', candidateKey: 'a', action: 'seen_it' }])).toBe(50);
    expect(liveVoteScore('a', [{ memberId: 'm1', candidateKey: 'a', action: 'veto' }])).toBe(0);
    expect(liveVoteScore('a', [{ memberId: 'm1', candidateKey: 'a', action: 'watch_it' }])).toBe(100);
  });

  it('GUEST votes never enter the score and are reported separately', () => {
    const withGuests: Vote[] = [
      { memberId: 'p1', candidateKey: 'a', action: 'maybe' },
      { memberId: 'g1', candidateKey: 'a', action: 'watch_it', guest: true },
      { memberId: 'g2', candidateKey: 'a', action: 'watch_it', guest: true },
      { memberId: 'g3', candidateKey: 'a', action: 'veto', guest: true },
    ];
    // Private-only live score: one "maybe" = 55, unaffected by three guests.
    expect(liveVoteScore('a', withGuests)).toBe(55);
    expect(guestSentiment('a', withGuests)).toEqual({ watchItPercent: 67, count: 3 });
    expect(guestSentiment('a', [{ memberId: 'p1', candidateKey: 'a', action: 'maybe' }])).toBeNull();
  });
});

describe('Final Three', () => {
  const members: MemberRef[] = [{ id: 'm1', name: 'A' }, { id: 'm2', name: 'B' }];
  const sig = (key: string, dnaFit: number): CandidateSignals => ({ key, dnaFit, tonightFit: 50, quality: 50 });
  const five = [sig('a', 95), sig('b', 85), sig('c', 75), sig('d', 40), sig('e', 30)];
  const allVotes = (): Vote[] =>
    members.flatMap((m) => five.map((c) => ({ memberId: m.id, candidateKey: c.key, action: 'maybe' as const })));

  it('is not ready while members are still voting', () => {
    const partial = allVotes().slice(0, 3);
    const d = finalThree(five, members, partial);
    expect(d.ready).toBe(false);
    expect(d.reason).toMatch(/still voting/i);
  });

  it('is not ready when fewer than three survive a veto', () => {
    const votes: Vote[] = [
      ...allVotes(),
      { memberId: 'm1', candidateKey: 'a', action: 'veto' },
      { memberId: 'm1', candidateKey: 'b', action: 'veto' },
      { memberId: 'm2', candidateKey: 'c', action: 'veto' },
    ];
    const d = finalThree([sig('a', 90), sig('b', 80), sig('c', 70)], members, votes);
    expect(d.ready).toBe(false);
    expect(d.reason).toMatch(/remain without a veto/i);
  });

  it('promotes the three strongest once everyone has voted', () => {
    const d = finalThree(five, members, allVotes());
    expect(d.ready).toBe(true);
    expect(d.finalists.map((f) => f.key)).toEqual(['a', 'b', 'c']);
  });

  it('waits when third and fourth are indistinguishable', () => {
    const tiedSet = [sig('a', 95), sig('b', 85), sig('c', 70), sig('d', 70)];
    const votes = members.flatMap((m) => tiedSet.map((c) => ({ memberId: m.id, candidateKey: c.key, action: 'maybe' as const })));
    const d = finalThree(tiedSet, members, votes);
    expect(d.ready).toBe(false);
    expect(d.reason).toMatch(/tied/i);
  });
});

describe('tie-breaking never lets guests decide', () => {
  const signals = new Map<string, CandidateSignals>([
    ['a', { key: 'a', dnaFit: 70, tonightFit: 90, quality: 50 }],
    ['b', { key: 'b', dnaFit: 70, tonightFit: 40, quality: 99 }],
  ]);
  const tied = [
    { key: 'a', score: 80, breakdown: { dna: 0, liveVotes: 0, tonight: 0, quality: 0 }, vetoed: false, vetoedBy: [], seenBy: [] },
    { key: 'b', score: 80, breakdown: { dna: 0, liveVotes: 0, tonight: 0, quality: 0 }, vetoed: false, vetoedBy: [], seenBy: [] },
  ];

  it('falls through DNA to tonight fit, and explains the rule used', () => {
    const r = breakTie(tied, signals, []);
    expect(r.winner.key).toBe('a');
    expect(r.rule).toMatch(/tonight/i);
  });

  it('a landslide of GUEST votes cannot flip the tie', () => {
    const guestHeavy: Vote[] = Array.from({ length: 20 }, (_, i) => ({
      memberId: `g${i}`, candidateKey: 'b', action: 'watch_it' as const, guest: true,
    }));
    const r = breakTie(tied, signals, guestHeavy);
    expect(r.winner.key).toBe('a'); // unchanged by the guest jury
  });
});

describe('court sizes — Quick 8 / Standard 12 / Deep 16', () => {
  const many = () =>
    Array.from({ length: 20 }, (_, i) =>
      cand({
        key: `m-${i}`,
        genre: ['Thriller','Comedy','Drama','Mystery','Sci-Fi','Doc','Action','Romance'][i % 8]!,
        decade: 1990 + (i % 4) * 10,
        tone: ['tense','light','sombre'][i % 3]!,
        fit: 99 - i,
      }),
    );

  it('Standard is the default and yields 12 total, 6 active', () => {
    const p = buildPool(many());
    expect(p.size).toBe('standard');
    expect(p.active).toHaveLength(6);
    expect(totalShown(p)).toBe(12);
  });

  it('Quick yields 8 total with 4 active', () => {
    const p = buildPool(many(), 'quick');
    expect(p.active).toHaveLength(4);
    expect(totalShown(p)).toBe(8);
  });

  it('Deep yields 16 total with 8 active', () => {
    const p = buildPool(many(), 'deep');
    expect(p.active).toHaveLength(8);
    expect(totalShown(p)).toBe(16);
  });

  it('each size caps its own total across the whole session', () => {
    for (const [size, total] of [['quick', 8], ['standard', 12], ['deep', 16]] as const) {
      let p = buildPool(many(), size);
      for (const key of [...p.active.map((c) => c.key)]) {
        p = replaceCandidate(p, key, 'veto').state;
      }
      expect(totalShown(p), size).toBeLessThanOrEqual(total);
      expect(p.size).toBe(size); // size survives replacement
    }
  });

  it('COURT_SIZES matches the documented option set', () => {
    expect(COURT_SIZES.quick.total).toBe(8);
    expect(COURT_SIZES.standard.total).toBe(12);
    expect(COURT_SIZES.deep.total).toBe(16);
    expect(DEFAULT_COURT_SIZE).toBe('standard');
  });
});
