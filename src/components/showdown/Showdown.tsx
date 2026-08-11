'use client';

/**
 * DNA SHOWDOWN — the surface.
 *
 * Two posters, one tap. Everything interesting is upstream: the planner decides
 * which two, and the bridge decides what the answer means. This file renders
 * whatever round it is handed and reports the verdict.
 *
 * WHAT IT IS NOT ALLOWED TO DO. It never decides what a verdict means, never
 * writes a belief, and never invents a number. Every answer goes to the server
 * action, which builds canonical preference events through the pure bridge —
 * there is no local taste store here and no second model of the user.
 *
 * The layout is the one proven on the previous build: a fixed viewport height
 * with a compressible middle and pinned controls, because `min-h-[100dvh]` lets
 * a container grow past the screen and pushes the answers below the fold at
 * 200% zoom, where nobody thinks to look for them.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { deriveDna, understanding } from '@/lib/preference/engine';
import type { PreferenceEvent } from '@/lib/preference/types';
import { nextMatchup, pairKey, type Matchup, type ShowdownTitle } from '@/lib/showdown/matchup';
import { toPreferenceEvents, type Verdict } from '@/lib/showdown/verdict';
import { INTENTS, mergeLeans, type SessionLean } from '@/lib/showdown/session';
import { recordShowdownVerdict } from '@/lib/actions/showdown';
import { PosterTile } from './PosterTile';

/** Long enough to register the tap, short enough to feel instant. */
const ADVANCE_MS = 130;
/** Rounds after which the game offers to stop. Not a hard script — see below. */
const TARGET_ROUNDS = 12;

type Phase = 'intent' | 'playing' | 'done';

export function Showdown({ pool, poolNote }: { pool: readonly ShowdownTitle[]; poolNote?: string | null }) {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>('intent');
  const [lean, setLean] = useState<SessionLean>({});
  const [asked, setAsked] = useState<string[]>([]);
  const [seen, setSeen] = useState<string[]>([]);
  /**
   * The canonical events this session produced, kept only to derive the local
   * progress read-out. The SERVER copy is authoritative; this is a mirror for
   * the reveal, never a second store that anything reads back as taste.
   */
  const [events, setEvents] = useState<PreferenceEvent[]>([]);
  const [round, setRound] = useState(0);
  const busy = useRef(false);
  const shownAt = useRef<number>(0);
  const sessionId = useRef<string>('');

  useEffect(() => {
    sessionId.current = `sd_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
  }, []);

  /** The engine's own view of what this session taught, from real events. */
  const state = useMemo(() => deriveDna(events, Date.now()), [events]);
  const learned = useMemo(() => Math.round(understanding(state) * 100), [state]);

  const matchup: Matchup | null = useMemo(() => {
    if (phase !== 'playing') return null;
    return nextMatchup({ pool, state, seen, askedPairs: asked });
  }, [phase, pool, state, seen, asked]);

  // The session ends when the planner runs dry or the budget is spent. Both are
  // real outcomes: padding to a round number turns a minute into a chore.
  useEffect(() => {
    if (phase === 'playing' && (matchup === null || round >= TARGET_ROUNDS)) setPhase('done');
  }, [phase, matchup, round]);

  useEffect(() => {
    shownAt.current = Date.now();
  }, [matchup]);

  /** Claim the viewport: the answers sit where the global feedback FAB lives. */
  useEffect(() => {
    document.body.dataset.wvImmersive = 'true';
    return () => {
      delete document.body.dataset.wvImmersive;
    };
  }, []);

  const answer = useCallback(
    (verdict: Verdict) => {
      if (busy.current || !matchup) return;
      busy.current = true;
      const roundId = `${round}:${pairKey(matchup.left.key, matchup.right.key)}`;
      const dwellMs = Math.max(0, Date.now() - shownAt.current);

      // Mirror locally through the SAME pure bridge the server uses, so the
      // progress the player sees can never disagree with what was written.
      const drafts = toPreferenceEvents({
        left: matchup.left,
        right: matchup.right,
        verdict,
        kind: matchup.kind,
        testing: matchup.testing,
        sessionId: sessionId.current,
        roundId,
        at: Date.now(),
        dwellMs,
      });
      if (drafts.length > 0) setEvents((prev) => [...prev, ...(drafts as PreferenceEvent[])]);

      setAsked((prev) => [...prev, pairKey(matchup.left.key, matchup.right.key)]);
      setSeen((prev) => [...prev, matchup.left.key, matchup.right.key]);
      setRound((r) => r + 1);

      // The authoritative write. Fire-and-forget: a slow network must never
      // hold up the next round, and the action is idempotent on the event id.
      void recordShowdownVerdict({
        sessionId: sessionId.current,
        roundId,
        left: matchup.left,
        right: matchup.right,
        verdict,
        kind: matchup.kind,
        testing: matchup.testing,
        dwellMs,
      }).catch(() => undefined);

      window.setTimeout(() => {
        busy.current = false;
      }, ADVANCE_MS);
    },
    [matchup, round],
  );

  // ── TONIGHT ──────────────────────────────────────────────────────────────
  if (phase === 'intent') {
    return (
      <div className="mx-auto flex h-[100dvh] w-full max-w-2xl flex-col gap-5 px-5 pb-[max(1rem,env(safe-area-inset-bottom))] pt-5">
        <Header learned={learned} round={0} />
        <h1
          data-testid="showdown-intent"
          className="text-balance text-2xl font-black leading-tight tracking-tight text-white sm:text-4xl"
        >
          What are you after tonight?
        </h1>
        <p className="text-sm text-slate-400">
          This shapes tonight&rsquo;s picks only — it never changes your permanent taste.
        </p>
        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
          <div className="my-auto grid shrink-0 gap-3 sm:grid-cols-2">
            {INTENTS.map((i) => (
              <button
                key={i.id}
                type="button"
                data-testid={`showdown-intent-${i.id}`}
                onClick={() => {
                  setLean(mergeLeans([i.lean]));
                  setPhase('playing');
                }}
                className="min-h-[60px] rounded-2xl bg-white/[0.07] px-5 text-left text-lg font-bold text-white ring-1 ring-white/10 transition active:bg-white/20 hover:bg-white/[0.12] focus:outline-none focus-visible:ring-2 focus-visible:ring-white"
              >
                {i.label}
              </button>
            ))}
          </div>
        </div>
        <button
          type="button"
          data-testid="showdown-skip-intent"
          onClick={() => setPhase('playing')}
          className="min-h-[52px] shrink-0 rounded-xl text-sm font-semibold text-slate-400 ring-1 ring-white/10 transition active:bg-white/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-white"
        >
          Just show me films
        </button>
      </div>
    );
  }

  // ── THE REVEAL ───────────────────────────────────────────────────────────
  if (phase === 'done' || !matchup) {
    const permanent = events.length;
    return (
      <div className="mx-auto flex min-h-[100dvh] w-full max-w-lg flex-col gap-6 px-5 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-8">
        <div>
          <h1
            data-testid="showdown-reveal"
            data-events={permanent}
            data-learned={learned}
            className="text-3xl font-black uppercase tracking-tight text-white sm:text-4xl"
          >
            {permanent === 0 ? 'Nothing learned yet' : 'Your Taste DNA just grew'}
          </h1>
          <p className="mt-2 text-sm text-slate-400">
            {permanent === 0 ? (
              // No events is a real outcome, and the number must not move.
              'You hadn’t seen the titles we put up, so nothing permanent changed. Play again and we’ll aim at things you’re more likely to know.'
            ) : (
              <>
                <span className="font-bold tabular-nums text-amber-300">{permanent}</span> pieces of
                evidence went into the same Taste DNA your recommendations read.
              </>
            )}
          </p>
        </div>

        {Object.keys(lean).length > 0 && (
          <div>
            <h2 className="text-xs font-bold uppercase tracking-widest text-slate-500">Tonight only</h2>
            <p className="mt-1 text-sm text-slate-400" data-testid="showdown-session-only">
              Your mood shaped what we&rsquo;ll show you next, without changing your permanent taste.
            </p>
          </div>
        )}

        <div className="mt-auto flex flex-col gap-3">
          <button
            type="button"
            data-testid="showdown-continue"
            onClick={() => router.push('/app/watch')}
            className="btn-primary min-h-[52px] py-4 text-base font-bold"
          >
            Show me what I&rsquo;d watch
          </button>
          <button
            type="button"
            data-testid="showdown-again"
            onClick={() => {
              setPhase('playing');
              setRound(0);
            }}
            className="min-h-[52px] rounded-xl py-3 text-sm font-semibold text-slate-300 hover:bg-white/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-white"
          >
            Play again
          </button>
        </div>
      </div>
    );
  }

  // ── THE MATCHUP ──────────────────────────────────────────────────────────
  return (
    <div className="mx-auto flex h-[100dvh] w-full max-w-3xl flex-col gap-3 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-4">
      <Header learned={learned} round={round} />
      <p
        data-testid="showdown-question"
        data-kind={matchup.kind}
        data-testing={matchup.testing.join(',')}
        className="shrink-0 text-balance text-lg font-black leading-tight tracking-tight text-white sm:text-2xl"
      >
        {matchup.kind === 'twist'
          ? 'Almost the same film. Which one?'
          : 'Tonight — which one are you pressing play on?'}
      </p>
      <div className="grid min-h-0 flex-1 grid-cols-2 gap-3" data-testid="showdown-matchup">
        <PosterTile title={matchup.left} side="left" onPick={() => answer('left')} />
        <PosterTile title={matchup.right} side="right" onPick={() => answer('right')} />
      </div>
      <div className="grid shrink-0 grid-cols-2 gap-3">
        <button
          type="button"
          data-testid="showdown-neither"
          onClick={() => answer('neither')}
          className="min-h-[52px] rounded-xl text-sm font-bold text-rose-200 ring-1 ring-rose-400/25 transition active:bg-rose-500/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-white"
        >
          Neither
        </button>
        <button
          type="button"
          data-testid="showdown-unseen"
          onClick={() => answer('unseen')}
          className="min-h-[52px] rounded-xl text-sm font-semibold text-slate-400 ring-1 ring-white/10 transition active:bg-white/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-white"
        >
          Haven&rsquo;t seen either
        </button>
      </div>
      {poolNote && <p className="shrink-0 text-center text-xs text-slate-500">{poolNote}</p>}
    </div>
  );
}

function Header({ learned, round }: { learned: number; round: number }) {
  return (
    <header className="flex shrink-0 items-end justify-between gap-3">
      <h2 className="text-sm font-black uppercase tracking-[0.2em] text-slate-400">Showdown</h2>
      <p
        data-testid="showdown-progress"
        data-round={round}
        data-learned={learned}
        className="text-right text-[0.65rem] font-bold uppercase tracking-widest text-slate-500"
      >
        Taste DNA <span className="tabular-nums text-amber-300">{learned}%</span>
      </p>
    </header>
  );
}
