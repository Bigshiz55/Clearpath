'use client';

/**
 * THE TONIGHT MACHINE — the surface.
 *
 * One component renders whatever move the orchestrator hands it. There is no
 * screen sequence here and no step counter: the engine decides what comes next,
 * so an act is a THING THAT MIGHT HAPPEN rather than a page in a flow. That is
 * the difference between a game and a questionnaire with cinematic styling.
 *
 * WHAT THIS FILE IS NOT ALLOWED TO DO. It never decides what to ask, never
 * writes a belief, and never invents a number. Every percentage comes from
 * `dnaKnown()`, every explanation comes from recorded evidence, and when the
 * session learned nothing permanent the Reveal says exactly that rather than
 * inflating a bar to look productive.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { dnaKnown } from '@/lib/tastedna/families';
import { loadDna, saveDna, type StoredDna } from '@/lib/tastedna/persist';
import { traitBelief, traitConfidence } from '@/lib/voice/quickdna/traits';
import {
  answerMove,
  chosenTitle,
  createTonight,
  evidencedCount,
  learnedNothing,
  startTonight,
  type TonightState,
} from '@/lib/tonight/orchestrator';
import {
  emitTonight,
  moveAnswered,
  moveShown,
  sessionEnded,
  sessionStarted,
} from '@/lib/tonight/analytics';
import { StimulusCard } from './StimulusCard';
import { TwistCard } from './TwistCard';

/** Snap between moves. Fast enough to feel instant, slow enough to register. */
const ADVANCE_MS = 140;
const RESUME_KEY = 'watchverdict:tonight:v1';

export function TonightMachine() {
  const router = useRouter();
  const [state, setState] = useState<TonightState>(() => startTonight(createTonight(), 0));
  const [dna, setDna] = useState<StoredDna | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const busy = useRef(false);
  /*
   * Session identity and start time, for the event stream.
   *
   * Both are refs rather than state: they are metadata about the session, not
   * inputs to it, and putting them in state would re-render the surface every
   * time analytics noticed something. Generated on mount, so no clock or
   * randomness is read during the pure engine's work.
   */
  const sessionId = useRef<string>('');
  const startedAt = useRef<number>(0);
  const ended = useRef(false);
  const lastShown = useRef<string>('');
  /** Latest state, for listeners that outlive a render. */
  const stateRef = useRef<TonightState>(state);
  stateRef.current = state;

  const known = useMemo(() => dnaKnown(state.profile), [state.profile]);

  /** Seed from real Taste DNA, preferring an interrupted session. */
  useEffect(() => {
    const stored = loadDna();
    setDna(stored);
    try {
      const raw = sessionStorage.getItem(RESUME_KEY);
      if (raw) {
        const saved = JSON.parse(raw) as TonightState;
        if (saved && Array.isArray(saved.interactions) && saved.current) {
          setState(saved);
          return;
        }
      }
    } catch {
      /* unreadable — start fresh from stored DNA */
    }
    setState(startTonight(createTonight({ profile: stored.profile }), Date.now()));
  }, []);

  /**
   * The event stream: one id per session, then one `move_shown` per move.
   *
   * Driven off state rather than emitted inside the state updater — an updater
   * runs twice under StrictMode, so a side effect in there double-counts every
   * move it touches. The signature ref makes this idempotent for the same
   * reason a re-render must not look like a new screen to the player.
   */
  useEffect(() => {
    if (!sessionId.current) {
      sessionId.current = `tn_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
      startedAt.current = Date.now();
      emitTonight(sessionStarted(state, sessionId.current));
    }
    const move = state.current;
    const signature = `${move?.kind ?? 'none'}:${state.interactions.length}`;
    if (signature !== lastShown.current) {
      lastShown.current = signature;
      if (move && move.kind !== 'done') emitTonight(moveShown(state, sessionId.current));
      if (move?.kind === 'done' && !ended.current) {
        ended.current = true;
        emitTonight(
          sessionEnded(state, sessionId.current, 'completed', Date.now() - startedAt.current),
        );
      }
    }
  }, [state]);

  /**
   * Leaving is a result too.
   *
   * A session abandoned in the third act is the most interesting thing that can
   * happen and the easiest to never find out about. `pagehide` fires where
   * `beforeunload` does not on mobile Safari, which is most of the audience for
   * a phone-first game.
   */
  useEffect(() => {
    const leave = () => {
      if (ended.current) return;
      ended.current = true;
      emitTonight(
        sessionEnded(stateRef.current, sessionId.current, 'left', Date.now() - startedAt.current),
      );
    };
    window.addEventListener('pagehide', leave);
    return () => {
      window.removeEventListener('pagehide', leave);
    };
  }, []);

  /**
   * Claim the viewport while the session runs.
   *
   * The answer buttons sit on the bottom edge, where the global feedback FAB is
   * pinned — it covered the primary control and would have eaten the tap. The
   * flag is cleared on unmount so leaving mid-session never strands the app
   * without its chrome.
   */
  useEffect(() => {
    document.body.dataset.wvImmersive = 'true';
    return () => {
      delete document.body.dataset.wvImmersive;
    };
  }, []);

  // Every move is written immediately: a refresh must never cost an answer.
  useEffect(() => {
    try {
      sessionStorage.setItem(RESUME_KEY, JSON.stringify(state));
    } catch {
      /* private mode */
    }
  }, [state]);

  /**
   * Commit an answer.
   *
   * The ref guard is what stops a double tap inside one React batch committing
   * twice; the engine's idempotency key is the second line of defence for a
   * retried write. Persistence happens after the state moves, so the next move
   * is never waiting on a disk write.
   */
  const answer = useCallback((subject: string, value: string) => {
    if (busy.current) return;
    busy.current = true;
    setState((current) => {
      const next = answerMove(current, { subject, value }, Date.now());
      // Reports what the ENGINE recorded, so an ignored retry produces no
      // event. Emitting on the tap would inflate answer counts by however
      // impatient players are.
      const event = moveAnswered(current, next, sessionId.current, Date.now() - startedAt.current);
      if (event) emitTonight(event);
      // Fold into durable DNA by replacement, so a retry cannot double-count.
      try {
        const prior = loadDna();
        const merged: StoredDna = {
          ...prior,
          profile: next.profile,
          decisions: prior.decisions + 1,
          plays: next.current?.kind === 'done' ? prior.plays + 1 : prior.plays,
        };
        saveDna(merged);
        setDna(merged);
      } catch {
        /* a failed write must never lose the answer in front of the player */
      }
      return next;
    });
    window.setTimeout(() => {
      busy.current = false;
    }, ADVANCE_MS);
  }, []);

  const move = state.current;
  if (!move) return null;

  const pct = Math.round(known * 100);
  const openingPct = Math.round(state.openingKnown * 100);

  // ── ACT 5: THE REVEAL ────────────────────────────────────────────────────
  if (move.kind === 'done') {
    const nothing = learnedNothing(state);
    const chosen = chosenTitle(state);
    const permanent = state.interactions.filter(
      (i) => i.scope === 'permanent' && i.applied.length > 0,
    );
    const tonightOnly = state.interactions.filter((i) => i.scope === 'session');
    // Only claim a trait we are actually confident about.
    const settled = Object.keys(state.profile)
      .filter((k) => traitConfidence(state.profile, k as never) > 0.45)
      .slice(0, 3);

    return (
      <div className="mx-auto flex min-h-[100dvh] w-full max-w-lg flex-col gap-6 px-5 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-8">
        <div>
          <h1
            data-testid="tonight-reveal"
            data-known={pct}
            data-opening={openingPct}
            data-evidenced={evidencedCount(state)}
            className="text-3xl font-black uppercase tracking-tight text-white sm:text-4xl"
          >
            {nothing ? 'Nothing learned yet' : 'Your DNA just got sharper'}
          </h1>
          <p className="mt-2 text-sm text-slate-400">
            {nothing ? (
              // No permanent evidence: say so, and do not move the number.
              'You hadn’t seen the titles we put up, so nothing permanent changed. Play again and we’ll aim at things you’re more likely to know.'
            ) : (
              <>
                <span className="font-bold tabular-nums text-amber-300">
                  {openingPct}% → {pct}%
                </span>{' '}
                known · {permanent.length} pieces of evidence
              </>
            )}
          </p>
        </div>

        {settled.length > 0 && !nothing && (
          <div>
            <h2 className="text-xs font-bold uppercase tracking-widest text-slate-500">
              What we learned
            </h2>
            <ul className="mt-2 flex flex-col gap-2" data-testid="tonight-learned">
              {settled.map((k) => (
                <li
                  key={k}
                  className="rounded-xl border border-emerald-400/30 bg-emerald-500/10 px-3 py-2 text-sm font-semibold text-emerald-100"
                >
                  {traitBelief(state.profile, k as never).pref >= 50
                    ? 'You lean toward'
                    : 'You lean away from'}{' '}
                  {k.replace(/([A-Z])/g, ' $1').toLowerCase()}
                </li>
              ))}
            </ul>
          </div>
        )}

        {tonightOnly.length > 0 && (
          <div>
            <h2 className="text-xs font-bold uppercase tracking-widest text-slate-500">
              True tonight only
            </h2>
            <p className="mt-1 text-sm text-slate-400" data-testid="tonight-session-only">
              {tonightOnly.length} answers shaped tonight&rsquo;s picks without changing your
              permanent taste.
            </p>
          </div>
        )}

        {chosen && (
          <div>
            <h2 className="text-xs font-bold uppercase tracking-widest text-slate-500">Tonight</h2>
            <p className="mt-1 text-lg font-bold text-white" data-testid="tonight-choice">
              {chosen.title}{' '}
              <span className="text-sm font-normal text-slate-400">({chosen.year})</span>
            </p>
          </div>
        )}

        <div className="mt-auto flex flex-col gap-3">
          <button
            type="button"
            data-testid="tonight-continue"
            onClick={() => router.push('/app')}
            className="btn-primary min-h-[52px] py-4 text-base font-bold"
          >
            Show me what I&rsquo;d watch
          </button>
          <button
            type="button"
            data-testid="tonight-again"
            onClick={() => {
              try {
                sessionStorage.removeItem(RESUME_KEY);
              } catch {
                /* ignore */
              }
              setState(
                startTonight(createTonight({ profile: dna?.profile ?? state.profile }), Date.now()),
              );
            }}
            className="min-h-[52px] rounded-xl py-3 text-sm font-semibold text-slate-300 hover:bg-white/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-white"
          >
            Play again
          </button>
        </div>
      </div>
    );
  }

  const header = (
    <header className="flex items-end justify-between gap-3">
      <h1 className="text-sm font-black uppercase tracking-[0.2em] text-slate-400">Tonight</h1>
      <p
        data-testid="tonight-progress"
        data-interactions={state.interactions.length}
        data-known={pct}
        className="text-right text-[0.65rem] font-bold uppercase tracking-widest text-slate-500"
      >
        Taste DNA <span className="tabular-nums text-amber-300">{pct}%</span>
      </p>
    </header>
  );

  // ── ACT 1: SET THE NIGHT ─────────────────────────────────────────────────
  if (move.kind === 'context') {
    const options =
      move.field === 'intent'
        ? (move.intents ?? []).map((i) => ({ value: i.id, label: i.label }))
        : move.field === 'company'
          ? [
              { value: 'alone', label: 'On my own' },
              { value: 'together', label: 'With someone' },
            ]
          : move.field === 'attention'
            ? [
                { value: 'full', label: 'Full attention' },
                { value: 'background', label: 'In the background' },
              ]
            : [
                { value: 'short', label: 'Something short' },
                { value: 'open', label: 'No time limit' },
              ];

    const question =
      move.field === 'intent'
        ? 'What kind of night is this?'
        : move.field === 'company'
          ? 'Watching alone?'
          : move.field === 'attention'
            ? 'How much attention?'
            : 'How long have you got?';

    return (
      <div className="mx-auto flex h-[100dvh] w-full max-w-2xl flex-col gap-5 px-5 pb-[max(1rem,env(safe-area-inset-bottom))] pt-5">
        {header}
        <h2
          data-testid="tonight-question"
          data-field={move.field}
          className="text-balance text-2xl font-black leading-tight tracking-tight text-white sm:text-4xl"
        >
          {question}
        </h2>
        {/* Scrolls inside itself rather than pushing the page taller: at 200%
            zoom a growing container put the answers below the fold, where a
            player has no reason to look for them.

            Centred with AUTO MARGINS, not `content-center`. Centred alignment
            inside a scroll container overflows equally in both directions and
            the start edge cannot be scrolled back to — the top options become
            permanently unreachable. Auto margins centre while there is room and
            collapse to zero when there is not. */}
        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
          <div className="my-auto grid shrink-0 gap-3 sm:grid-cols-2">
            {options.map((o) => (
              <button
                key={o.value}
                type="button"
                data-testid={`tonight-option-${o.value}`}
                onClick={() => answer(move.field, o.value)}
                className="min-h-[64px] rounded-2xl bg-white/[0.07] px-5 text-left text-lg font-bold text-white ring-1 ring-white/10 transition active:bg-white/20 hover:bg-white/[0.12] focus:outline-none focus-visible:ring-2 focus-visible:ring-white"
              >
                {o.label}
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // ── ACT 2: THE REACTION REEL ─────────────────────────────────────────────
  if (move.kind === 'stimulus') {
    return (
      <div className="mx-auto flex h-[100dvh] w-full max-w-2xl flex-col gap-4 px-5 pb-[max(1rem,env(safe-area-inset-bottom))] pt-5">
        {header}
        <StimulusCard stimulus={move.stimulus} />
        <div className="grid shrink-0 grid-cols-2 gap-3">
          <button
            type="button"
            data-testid="tonight-pull"
            onClick={() => answer(move.stimulus.title.id, 'pull')}
            className="btn-primary min-h-[56px] text-base font-bold"
          >
            That, tonight
          </button>
          <button
            type="button"
            data-testid="tonight-keep"
            onClick={() => answer(move.stimulus.title.id, 'keep')}
            className="min-h-[56px] rounded-xl bg-white/10 text-base font-bold text-white ring-1 ring-white/10 transition active:bg-white/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-white"
          >
            Keep it in play
          </button>
          <button
            type="button"
            data-testid="tonight-cut"
            onClick={() => answer(move.stimulus.title.id, 'cut')}
            className="min-h-[52px] rounded-xl text-sm font-bold text-rose-200 ring-1 ring-rose-400/25 transition active:bg-rose-500/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-white"
          >
            Cut it
          </button>
          <button
            type="button"
            data-testid="tonight-unseen"
            onClick={() => answer(move.stimulus.title.id, 'unseen')}
            className="min-h-[52px] rounded-xl text-sm font-semibold text-slate-400 ring-1 ring-white/10 transition active:bg-white/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-white"
          >
            Never heard of it
          </button>
        </div>
      </div>
    );
  }

  // ── ACT 3: THE TWIST ─────────────────────────────────────────────────────
  if (move.kind === 'twist') {
    return (
      <div className="mx-auto flex h-[100dvh] w-full max-w-2xl flex-col gap-5 px-5 pb-[max(1rem,env(safe-area-inset-bottom))] pt-5">
        {header}
        <TwistCard twist={move.twist} anchor={move.anchor} />
        <div className="grid shrink-0 grid-cols-2 gap-3">
          <button
            type="button"
            data-testid="tonight-twist-stay"
            onClick={() => answer(move.twist.id, 'stayed')}
            className="btn-primary min-h-[60px] text-base font-bold"
          >
            {move.twist.stillYes}
          </button>
          <button
            type="button"
            data-testid="tonight-twist-leave"
            onClick={() => answer(move.twist.id, 'left')}
            className="min-h-[60px] rounded-xl bg-white/10 text-base font-bold text-white ring-1 ring-white/10 transition active:bg-white/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-white"
          >
            {move.twist.stillNo}
          </button>
        </div>
      </div>
    );
  }

  // ── ACT 4: THE FINAL CUT ─────────────────────────────────────────────────
  return (
    <div className="mx-auto flex h-[100dvh] w-full max-w-2xl flex-col gap-4 px-5 pb-[max(1rem,env(safe-area-inset-bottom))] pt-5">
      {header}
      <h2 className="shrink-0 text-balance text-xl font-black leading-tight tracking-tight text-white sm:text-3xl">
        If these were queued up, what are you pressing play on?
      </h2>
      {/* Centred on a tall phone, where three cards top-anchored left half the
          screen empty above the escape hatch and read as a list that had failed
          to load the rest — and scrollable on a short one, where the third card
          and "None of these" were simply off the bottom of the screen.

          The scrolling lives on the wrapper and the centring on the list's auto
          margins: a centred flex child inside its own scroll container clips
          past the start edge, and no amount of scrolling brings it back. At
          200% zoom that made a finalist unclickable — the act container, not
          the card, received the tap. */}
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
        <ul className="my-auto flex shrink-0 flex-col gap-3" data-testid="tonight-finalists">
          {move.finalists.map((f) => (
            <li key={f.title.id}>
              <button
                type="button"
                data-testid={`tonight-final-${f.title.id}`}
                onClick={() => answer(f.title.id, f.title.id)}
                className="w-full rounded-2xl bg-white/[0.07] p-4 text-left ring-1 ring-white/10 transition active:bg-white/20 hover:bg-white/[0.12] focus:outline-none focus-visible:ring-2 focus-visible:ring-white"
              >
                <span className="block text-lg font-black text-white">
                  {f.title.title}{' '}
                  <span className="text-sm font-normal text-slate-400">({f.title.year})</span>
                </span>
                <span className="mt-0.5 block text-xs font-semibold text-emerald-300">
                  {f.because}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </div>
      {flash && <p className="text-center text-sm font-semibold text-amber-300">{flash}</p>}
      <button
        type="button"
        data-testid="tonight-reject-all"
        onClick={() => {
          // Not a restart: one targeted recovery, then fresh candidates.
          setFlash('Right — let’s aim somewhere else.');
          answer('reject-all', 'reject-all');
        }}
        className="min-h-[52px] shrink-0 rounded-xl text-sm font-semibold text-slate-400 ring-1 ring-white/10 transition active:bg-white/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-white"
      >
        None of these
      </button>
    </div>
  );
}
