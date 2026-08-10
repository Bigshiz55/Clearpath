'use client';

/**
 * VERD1CT RUSH — the game surface.
 *
 * One tap, one decision, next thing. No question numbers, no rating scales, no
 * instructions to read. Everything on screen is something you might watch or a
 * reason you would switch it off, and choosing is what teaches the engine.
 *
 * THE SHAPE OF A RADIAL ROUND: the question is in the middle of the wheel and
 * the six answers are the wedges around it. Nothing to read above, nothing to
 * scroll to below — the whole decision fits inside one circle, under one thumb.
 * The other formats (a duel, four cards, one poster) keep the question above,
 * because there is no hub to put it in.
 *
 * ALL SEQUENCING LIVES IN THE PURE GAME (`lib/dnagame/game.ts`) — this file
 * renders whatever round it is handed and reports the decision back. That is
 * why nine formats do not mean nine screens: a round declares its layout, its
 * prompt, how many picks it takes and whether picking means rejecting, and the
 * four layouts below cover all of them.
 *
 * The felt qualities are deliberate. Selection snaps and the next round arrives
 * inside ~140ms, because speed is most of the fun. The score is the other half:
 * it counts up in fives, pops the points it just paid, and rewards answering
 * quickly — see `lib/dnagame/score.ts` for what it is actually measuring, which
 * is information, never agreement. Micro-reactions fire rarely — after a
 * pattern, never after a tap — since a comment on every decision is the thing
 * that made the old interview unbearable.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { dnaKnown, readAllFamilies } from '@/lib/dnagame/families';
import {
  MIN_DECISIONS,
  choose,
  createGame,
  lastPoints,
  meaningfulDecisions,
  reactToTitle,
  startGame,
  traitsCaptured,
  type GameState,
} from '@/lib/dnagame/game';
import { STREAK_VISIBLE, streakMultiplier } from '@/lib/dnagame/score';
import type { Choice } from '@/lib/dnagame/rounds';
import type { TraitProfile } from '@/lib/voice/quickdna/traits';
import { Wheel, type WheelSlot } from './Wheel';
import { RushReveal } from './RushReveal';

type Screen = 'ready' | 'playing' | 'reveal';

/** Selection snap to next round. Fast enough to feel instant, slow enough to see. */
const ADVANCE_MS = 140;

/** How long the points pop stays up. Long enough to read, short enough to stack. */
const POP_MS = 700;

const RESUME_KEY = 'watchverdict:verdictrush:v1';

/**
 * Occasional, earned, and never after a plain tap. Each line needs a pattern
 * behind it, so the game reads as observant rather than chatty.
 */
function microReaction(state: GameState): string | null {
  const p = state.profile;
  const n = state.decisions.length;
  if (n === 0 || n % 7 !== 0) return null;
  const at = (k: keyof typeof p) => p[k]?.pref ?? 50;
  const sure = (k: keyof typeof p) => (p[k]?.evidence ?? 0) > 0.6;

  if (sure('supernatural') && at('supernatural') < 30) return 'Ghosts are officially dead.';
  if (sure('investigation') && at('investigation') > 72) return 'Investigations are clearly your thing.';
  if (sure('darkness') && at('darkness') > 70 && sure('patience') && at('patience') < 35) {
    return 'Dark is fine. Slow is not.';
  }
  if (sure('subtitles') && at('subtitles') > 70) return 'Subtitles, no problem.';
  if (sure('comedy') && at('comedy') < 30) return 'Comedy is a side dish.';
  if (sure('action') && at('action') > 75) return 'You want it moving.';
  return null;
}

export function VerdictRush({ seedProfile = {} }: { seedProfile?: TraitProfile }) {
  const router = useRouter();
  const [screen, setScreen] = useState<Screen>('ready');
  const [state, setState] = useState<GameState>(() => createGame(0, seedProfile));
  const [picked, setPicked] = useState<string[]>([]);
  const [reaction, setReaction] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);
  /** The "+N" that flies off the score. Keyed so identical scores still re-fire. */
  const [pop, setPop] = useState<{ points: number; key: number } | null>(null);

  const stateRef = useRef(state);
  stateRef.current = state;
  const busy = useRef(false);
  const roundShownAt = useRef(0);
  const startedAt = useRef(0);

  const round = state.current;
  const readings = useMemo(() => readAllFamilies(state.profile), [state.profile]);
  const known = useMemo(() => dnaKnown(state.profile), [state.profile]);
  const score = state.score ?? 0;
  const streak = state.streak ?? 0;

  const applyState = useCallback((next: GameState) => {
    stateRef.current = next;
    setState(next);
    setPicked([]);
    roundShownAt.current = Date.now();
    const earned = lastPoints(next);
    if (earned > 0) {
      setPop({ points: earned, key: next.decisions.length });
      window.setTimeout(() => {
        setPop((p) => (p && p.key === next.decisions.length ? null : p));
      }, POP_MS);
    }
    const line = microReaction(next);
    if (line) {
      setReaction(line);
      window.setTimeout(() => setReaction(null), 900);
    }
    if (!next.current) {
      setElapsed(Date.now() - startedAt.current);
      setScreen('reveal');
    }
  }, []);

  /** Commit a set of choices, with the snap-then-advance beat. */
  const commit = useCallback(
    (ids: string[]) => {
      if (busy.current) return;
      const current = stateRef.current;
      if (!current.current) return;
      busy.current = true;
      setPicked(ids);
      if (navigator.vibrate) navigator.vibrate(8);
      const responseMs = Date.now() - roundShownAt.current;
      window.setTimeout(() => {
        applyState(choose(current, ids, Date.now(), responseMs));
        busy.current = false;
      }, ADVANCE_MS);
    },
    [applyState],
  );

  /** A tap on one option; multi-pick rounds wait until the quota is met. */
  const tap = useCallback(
    (choice: Choice) => {
      const current = stateRef.current.current;
      if (!current || busy.current) return;
      if (current.picks === 1) {
        commit([choice.id]);
        return;
      }
      setPicked((prev) => {
        const next = prev.includes(choice.id) ? prev.filter((x) => x !== choice.id) : [...prev, choice.id];
        if (next.length === current.picks) commit(next);
        return next;
      });
    },
    [commit],
  );

  const react = useCallback(
    (r: 'yes' | 'no' | 'pass') => {
      if (busy.current) return;
      const current = stateRef.current;
      busy.current = true;
      if (navigator.vibrate) navigator.vibrate(8);
      const responseMs = Date.now() - roundShownAt.current;
      window.setTimeout(() => {
        applyState(reactToTitle(current, r, Date.now(), responseMs));
        busy.current = false;
      }, ADVANCE_MS);
    },
    [applyState],
  );

  // Resume rather than restart — nothing learned should be lost to a reload.
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(RESUME_KEY);
      if (!raw) return;
      const saved = JSON.parse(raw) as GameState;
      if (saved && Array.isArray(saved.decisions)) setState(saved);
    } catch {
      /* unreadable — start fresh */
    }
  }, []);

  useEffect(() => {
    if (screen !== 'playing') return;
    try {
      sessionStorage.setItem(RESUME_KEY, JSON.stringify(state));
    } catch {
      /* private mode */
    }
  }, [state, screen]);

  const begin = useCallback(() => {
    const now = Date.now();
    startedAt.current = now;
    roundShownAt.current = now;
    const started = startGame(stateRef.current, now);
    stateRef.current = started;
    setState(started);
    setScreen('playing');
  }, []);

  if (screen === 'reveal') {
    return (
      <RushReveal
        state={state}
        elapsedMs={elapsed}
        onShowPicks={() => router.push('/app')}
        onPlayAgain={() => {
          try {
            sessionStorage.removeItem(RESUME_KEY);
          } catch {
            /* ignore */
          }
          setState(createGame(0, state.profile));
          setScreen('ready');
        }}
      />
    );
  }

  if (screen === 'ready') {
    const returning = Object.keys(seedProfile).length > 0 || state.decisions.length > 0;
    return (
      <div className="mx-auto flex min-h-[80vh] w-full max-w-lg flex-col items-center justify-center gap-6 px-5 text-center">
        <Wheel readings={readings} known={known} compact />
        <h1 className="text-4xl font-black tracking-tight text-white sm:text-5xl">Verd1ct Rush</h1>
        <p className="text-slate-300">Can we figure out your taste in 90 seconds?</p>
        <button
          type="button"
          data-testid="rush-start"
          onClick={begin}
          className="btn-primary w-full max-w-xs px-8 py-4 text-base font-bold"
        >
          {returning ? 'Level up my DNA' : 'Build my Verd1ct DNA'}
        </button>
      </div>
    );
  }

  if (!round) return null;
  const multi = round.picks > 1;
  const inWheel = round.layout === 'wheel';

  /**
   * One question, two homes. In the hub it is the whole screen's instruction,
   * set inside a circle a little under half the wheel across; above a duel or a
   * card grid it can breathe. Same element, same test hooks, so nothing
   * downstream has to care which layout dealt.
   */
  const prompt = (
    <h2
      data-testid="rush-prompt"
      data-round-type={round.type}
      data-layout={round.layout}
      data-picks={round.picks}
      className={
        inWheel
          ? `text-balance px-1 text-[1.15rem] font-black uppercase leading-[1.05] tracking-tight sm:text-2xl ${
              round.negative ? 'text-rose-300' : 'text-white'
            }`
          : `text-center text-2xl font-black uppercase tracking-tight sm:text-3xl ${
              round.negative ? 'text-rose-300' : 'text-white'
            }`
      }
    >
      {round.prompt}
      {multi && (
        <span className="mt-1 block text-sm font-bold text-slate-400">
          {picked.length}/{round.picks}
        </span>
      )}
    </h2>
  );

  return (
    <div className="mx-auto flex min-h-[80vh] w-full max-w-lg flex-col gap-3 px-4 py-5">
      <div className="flex items-end justify-between">
        <div className="relative">
          <span
            data-testid="rush-score"
            data-score={score}
            className="block text-3xl font-black tabular-nums leading-none text-amber-300 sm:text-4xl"
          >
            {score.toLocaleString()}
          </span>
          <span className="text-[0.6rem] font-bold uppercase tracking-widest text-slate-500">
            Points
          </span>
          {pop && (
            <span
              key={pop.key}
              data-testid="rush-pop"
              aria-hidden
              // Beside the score, not above it: the score sits at the top of the
              // viewport, so a pop that rises from above is clipped off-screen.
              className="pointer-events-none absolute left-full top-0 ml-2 whitespace-nowrap text-lg font-black tabular-nums text-emerald-300 motion-safe:animate-rush-pop"
            >
              +{pop.points}
            </span>
          )}
        </div>

        <div className="flex items-center gap-3 text-right">
          {streak >= STREAK_VISIBLE && (
            <span
              data-testid="rush-streak"
              data-streak={streak}
              className="rounded-full bg-amber-500/15 px-2 py-1 text-xs font-black tabular-nums text-amber-300"
            >
              🔥 ×{streakMultiplier(streak).toFixed(2).replace(/\.?0+$/, '')}
            </span>
          )}
          <div className="flex flex-col text-[0.6rem] font-bold uppercase tracking-widest text-slate-500">
            <span data-testid="rush-known" data-known={Math.round(known * 100)} className="text-slate-300">
              {Math.round(known * 100)}% known
            </span>
            <span data-testid="rush-decisions" data-count={state.decisions.length}>
              {state.decisions.length} decisions
            </span>
          </div>
        </div>
      </div>

      {/* Screen-reader announcement of the score, which is otherwise pure spectacle. */}
      <span className="sr-only" aria-live="polite">
        {score} points
      </span>

      {!inWheel && prompt}

      {reaction && (
        <p data-testid="rush-reaction" className="text-center text-sm font-semibold text-emerald-300">
          {reaction}
        </p>
      )}

      {inWheel && (
        <div className="flex flex-1 items-center justify-center">
          <Wheel
            readings={readings}
            known={known}
            center={prompt}
            slots={round.choices.map<WheelSlot>((c) => ({
              familyId: c.family,
              label: c.label,
              selected: picked.includes(c.id),
              negative: round.negative,
              onSelect: () => tap(c),
            }))}
          />
        </div>
      )}

      {round.layout === 'duel' && (
        <div className="grid flex-1 grid-rows-2 gap-3">
          {round.choices.map((c) => (
            <button
              key={c.id}
              type="button"
              data-testid={`rush-choice-${c.id}`}
              onClick={() => tap(c)}
              className={`flex items-center justify-center rounded-2xl px-5 py-8 text-xl font-bold motion-safe:transition-colors motion-safe:duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-white ${
                picked.includes(c.id) ? 'bg-white text-slate-950' : 'bg-white/10 text-white active:bg-white/25'
              }`}
            >
              {c.label}
            </button>
          ))}
        </div>
      )}

      {round.layout === 'cards' && (
        <div className="grid grid-cols-2 gap-3">
          {round.choices.map((c) => (
            <button
              key={c.id}
              type="button"
              data-testid={`rush-choice-${c.id}`}
              onClick={() => tap(c)}
              className={`min-h-[6rem] rounded-2xl px-4 py-5 text-base font-bold motion-safe:transition-colors motion-safe:duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-white ${
                picked.includes(c.id) ? 'bg-white text-slate-950' : 'bg-white/10 text-white active:bg-white/25'
              }`}
            >
              {c.label}
            </button>
          ))}
        </div>
      )}

      {round.layout === 'poster' && round.choices[0] && (
        <div className="flex flex-1 flex-col justify-center gap-5">
          <p
            data-testid="rush-title"
            data-title-id={round.choices[0].id}
            className="text-center text-3xl font-black text-white sm:text-4xl"
          >
            {round.choices[0].label}
          </p>
          <div className="grid grid-cols-3 gap-2">
            <button type="button" data-testid="rush-love" onClick={() => react('yes')} className="btn-primary min-h-[3.5rem] text-sm font-bold">
              Love it
            </button>
            <button type="button" data-testid="rush-nope" onClick={() => react('no')} className="min-h-[3.5rem] rounded-xl bg-white/10 text-sm font-bold text-white active:bg-white/25">
              Nope
            </button>
            <button type="button" data-testid="rush-pass" onClick={() => react('pass')} className="min-h-[3.5rem] rounded-xl bg-white/5 text-sm font-semibold text-slate-300 active:bg-white/15">
              Haven&rsquo;t seen
            </button>
          </div>
        </div>
      )}

      <p className="mt-auto text-center text-xs text-slate-500">
        {meaningfulDecisions(state)} signals · {traitsCaptured(state)} traits ·{' '}
        {Math.max(0, MIN_DECISIONS - state.decisions.length)} to go
      </p>
    </div>
  );
}
