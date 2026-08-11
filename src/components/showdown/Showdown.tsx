'use client';

/**
 * DNA SHOWDOWN — the game surface.
 *
 * Two films, one tap, next matchup. Everything on screen is either a film or a
 * way to answer, because the moment a calibration screen grows explanatory copy
 * it stops being a game and becomes the questionnaire this replaced.
 *
 * ALL INTELLIGENCE LIVES IN THE PURE ENGINE (`lib/showdown/`). This file
 * renders whatever matchup it is handed and reports the verdict back; it does
 * not decide what to ask, and it must never flatten the engine's semantics —
 * in particular the four outcomes are genuinely four, not three plus a skip:
 *
 *   LEFT / RIGHT  — a comparative preference.
 *   NEITHER       — negative evidence about what the two films SHARE.
 *   HAVEN'T SEEN  — a statement about recognition that moves no belief at all.
 *
 * Conflating the last two is the single easiest way to corrupt the profile,
 * which is why they are separate controls with separate wording rather than one
 * ambiguous "skip".
 *
 * DOUBLE-SUBMISSION is guarded by a ref rather than state, because two taps
 * inside one React batch would both read the same stale `busy` from state and
 * both commit. `session.test.ts` pins the engine side; the ref is what stops
 * the UI ever calling it twice for one decision.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { dnaKnown } from '@/lib/tastedna/families';
import { loadDna, saveDna, type StoredDna } from '@/lib/tastedna/persist';
import {
  TARGET_DECISIONS,
  answer as applyAnswer,
  createSession,
  markUnseen,
  startSession,
  type ShowdownState,
  type Verdict,
} from '@/lib/showdown/session';
import { PosterTile } from './PosterTile';
import { ShowdownResults } from './ShowdownResults';

/** Snap to the next matchup. Fast enough to feel instant, slow enough to read. */
const ADVANCE_MS = 160;

const RESUME_KEY = 'watchverdict:showdown:v1';

type Screen = 'playing' | 'results';

export function Showdown({ seed }: { seed?: Partial<StoredDna> }) {
  const router = useRouter();
  const [dna, setDna] = useState<StoredDna>(() => ({
    profile: seed?.profile ?? {},
    usedChoiceIds: [],
    usedTitleIds: [],
    plays: seed?.plays ?? 0,
    decisions: seed?.decisions ?? 0,
  }));
  const [state, setState] = useState<ShowdownState>(() =>
    startSession(createSession({ profile: seed?.profile ?? {} }), 0),
  );
  const [screen, setScreen] = useState<Screen>('playing');
  const [picked, setPicked] = useState<string | null>(null);

  const busy = useRef(false);
  const shownAt = useRef(0);
  const startedAt = useRef(0);

  const known = useMemo(() => dnaKnown(state.profile), [state.profile]);
  const opening = state.openingKnown;

  /**
   * Start from whatever this person's Taste DNA already is — a returning player
   * must not be re-asked what earlier sessions settled — and prefer an
   * interrupted session over a fresh one so a refresh never costs a decision.
   */
  useEffect(() => {
    const stored = loadDna();
    setDna(stored);
    const now = Date.now();
    startedAt.current = now;
    shownAt.current = now;

    try {
      const raw = sessionStorage.getItem(RESUME_KEY);
      if (raw) {
        const saved = JSON.parse(raw) as ShowdownState;
        if (saved && Array.isArray(saved.decisions) && saved.current) {
          setState(saved);
          return;
        }
      }
    } catch {
      /* unreadable — fall through to a fresh session seeded from stored DNA */
    }

    setState(
      startSession(
        createSession({
          profile: stored.profile,
          openingKnown: dnaKnown(stored.profile),
        }),
        now,
      ),
    );
  }, []);

  // Persist the in-flight session every time it moves, so a refresh, a phone
  // call or a dead battery cannot cost a decision already made.
  useEffect(() => {
    if (screen !== 'playing') return;
    try {
      sessionStorage.setItem(RESUME_KEY, JSON.stringify(state));
    } catch {
      /* private mode — the session simply will not resume */
    }
  }, [state, screen]);

  /**
   * Fold what this session learned into the durable Taste DNA store.
   *
   * Idempotent by construction: it writes the profile the session currently
   * holds rather than applying deltas, so running it twice for the same state
   * cannot double-count. A storage failure is swallowed — losing the carry is
   * bad, but losing the session in front of the player would be worse.
   */
  const persist = useCallback((next: ShowdownState, completed: boolean) => {
    setDna((prior) => {
      const merged: StoredDna = {
        ...prior,
        profile: next.profile,
        plays: prior.plays + (completed ? 1 : 0),
        decisions: prior.decisions + next.decisions.length,
      };
      saveDna(merged);
      return merged;
    });
  }, []);

  const advance = useCallback(
    (next: ShowdownState) => {
      setState(next);
      setPicked(null);
      shownAt.current = Date.now();
      if (!next.current) {
        persist(next, true);
        try {
          sessionStorage.removeItem(RESUME_KEY);
        } catch {
          /* ignore */
        }
        setScreen('results');
      }
    },
    [persist],
  );

  const decide = useCallback(
    (verdict: Verdict) => {
      if (busy.current) return;
      const current = state;
      if (!current.current) return;
      busy.current = true;
      setPicked(verdict === 'left' ? current.current.left.id : verdict === 'right' ? current.current.right.id : 'neither');
      if (navigator.vibrate) navigator.vibrate(8);
      const responseMs = Date.now() - shownAt.current;
      window.setTimeout(() => {
        advance(applyAnswer(current, verdict, Date.now(), responseMs));
        busy.current = false;
      }, ADVANCE_MS);
    },
    [state, advance],
  );

  const unseen = useCallback(() => {
    if (busy.current) return;
    const current = state;
    if (!current.current) return;
    busy.current = true;
    window.setTimeout(() => {
      // Advances the session and retires both titles, but changes no belief.
      advance(markUnseen(current, Date.now()));
      busy.current = false;
    }, ADVANCE_MS);
  }, [state, advance]);

  // Keyboard: the whole game is playable without a pointer.
  useEffect(() => {
    if (screen !== 'playing') return;
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const k = e.key.toLowerCase();
      if (k === '1' || k === 'arrowleft') { e.preventDefault(); decide('left'); }
      else if (k === '2' || k === 'arrowright') { e.preventDefault(); decide('right'); }
      else if (k === 'n') { e.preventDefault(); decide('neither'); }
      else if (k === 's') { e.preventDefault(); unseen(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [screen, decide, unseen]);

  if (screen === 'results') {
    return (
      <ShowdownResults
        state={state}
        openingKnown={opening}
        onPlayAgain={() => {
          const now = Date.now();
          startedAt.current = now;
          shownAt.current = now;
          setState(
            startSession(
              createSession({
                profile: dna.profile,
                seenPairs: state.seenPairs,
                unseenTitles: state.unseenTitles,
                openingKnown: dnaKnown(dna.profile),
              }),
              now,
            ),
          );
          setScreen('playing');
        }}
        onContinue={() => router.push('/app')}
      />
    );
  }

  const matchup = state.current;
  if (!matchup) return null;

  const done = state.decisions.length;
  const pct = Math.round(known * 100);

  return (
    <div className="mx-auto flex min-h-[100dvh] w-full max-w-5xl flex-col gap-3 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-4">
      <header className="flex items-end justify-between gap-3">
        <div>
          <h1 className="text-sm font-black uppercase tracking-[0.2em] text-slate-400">
            DNA Showdown
          </h1>
          <p
            data-testid="showdown-progress"
            data-decisions={done}
            data-known={pct}
            data-opening={Math.round(opening * 100)}
            className="mt-0.5 text-2xl font-black tabular-nums leading-none text-white"
          >
            {done}
            <span className="text-base font-bold text-slate-500">/{TARGET_DECISIONS}</span>
          </p>
        </div>
        <div className="text-right">
          <p className="text-[0.6rem] font-bold uppercase tracking-widest text-slate-500">
            Taste DNA
          </p>
          <p className="text-lg font-black tabular-nums leading-none text-amber-300">
            {Math.round(opening * 100)}% → {pct}%
          </p>
        </div>
      </header>

      <h2
        data-testid="showdown-prompt"
        className="text-center text-lg font-black uppercase tracking-tight text-white sm:text-2xl"
      >
        Tonight — which one are you watching?
      </h2>

      <div className="grid min-h-0 flex-1 grid-cols-2 gap-3 sm:gap-5">
        <PosterTile
          title={matchup.left}
          hotkey="1"
          picked={picked === matchup.left.id}
          dimmed={picked !== null && picked !== matchup.left.id}
          disabled={picked !== null}
          onPick={() => decide('left')}
        />
        <PosterTile
          title={matchup.right}
          hotkey="2"
          picked={picked === matchup.right.id}
          dimmed={picked !== null && picked !== matchup.right.id}
          disabled={picked !== null}
          onPick={() => decide('right')}
        />
      </div>

      {/*
        TWO CONTROLS, NOT ONE. "Neither" is a taste statement and teaches the
        engine; "Haven't seen either" is about recognition and teaches it
        nothing. A single ambiguous "skip" would silently corrupt the profile.
      */}
      <div className="grid shrink-0 grid-cols-2 gap-3 pt-1">
        <button
          type="button"
          data-testid="showdown-neither"
          onClick={() => decide('neither')}
          disabled={picked !== null}
          className="min-h-[52px] rounded-xl bg-white/10 px-3 text-sm font-bold text-white ring-1 ring-white/10 transition active:bg-white/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-white disabled:opacity-50"
        >
          Neither
        </button>
        <button
          type="button"
          data-testid="showdown-unseen"
          onClick={unseen}
          disabled={picked !== null}
          className="min-h-[52px] rounded-xl px-3 text-sm font-semibold text-slate-400 ring-1 ring-white/10 transition active:bg-white/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-white disabled:opacity-50"
        >
          Haven&rsquo;t seen either
        </button>
      </div>
    </div>
  );
}
