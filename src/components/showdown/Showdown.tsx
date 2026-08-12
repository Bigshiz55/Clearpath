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
import { saveTonight } from '@/lib/showdown/handoff';
import { recordShowdownSession } from '@/lib/actions/showdown';
import { sessionPayload } from '@/lib/showdown/canonical';
import type { ShowdownMode } from '@/lib/showdown/evidence';
import { TITLES } from '@/lib/voice/quickdna/definition';
import { recordExposure, suppressedTitles, trimHistory } from '@/lib/showdown/exposure';
import type { FollowUp, Intensity } from '@/lib/showdown/followup';
import { GUT_CALL, type ReasonChip } from '@/lib/showdown/reasons';
import {
  TARGET_DECISIONS,
  addIntensity,
  addReason,
  answer as applyAnswer,
  attributionOf,
  createSession,
  exposedThisSession,
  followUpFor,
  markUnseen,
  pairForDecision,
  skipFollowUp,
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

/**
 * THE PROMPT IS THE ARCHITECTURE, VISIBLE.
 *
 * The old screen asked "Tonight — which one are you watching?" and wrote the
 * answer into permanent Taste DNA. That single line was the defect: it elicits
 * a MOOD and the engine booked it as an IDENTITY. The two questions are now
 * separate modes writing separate ledgers, and the wording is what tells the
 * player which one they are answering.
 *
 * The two runs are otherwise identical — same posters, same four controls, same
 * planner, same 160ms advance — because the game is good and only the
 * bookkeeping was wrong.
 */
const PROMPT: Record<ShowdownMode, string> = {
  // Stable and mood-independent. "Rather watch" beats "is better" — it is how
  // people actually talk, and asking which film is objectively better invites a
  // critic's answer rather than a personal one.
  dna: 'Which would you rather watch?',
  tonight: 'Tonight — which one are you watching?',
};

export function Showdown({ seed, mode = 'dna' }: { seed?: Partial<StoredDna>; mode?: ShowdownMode }) {
  const router = useRouter();
  const [dna, setDna] = useState<StoredDna>(() => ({
    profile: seed?.profile ?? {},
    usedChoiceIds: [],
    usedTitleIds: [],
    plays: seed?.plays ?? 0,
    decisions: seed?.decisions ?? 0,
  }));
  const [state, setState] = useState<ShowdownState>(() =>
    startSession(createSession({ profile: seed?.profile ?? {} }, 0, mode), 0),
  );
  const [screen, setScreen] = useState<Screen>('playing');
  const [picked, setPicked] = useState<string | null>(null);
  /**
   * THE SECOND QUESTION OF THE ROUND, when there is one.
   *
   * Non-null holds the game on the pair just answered instead of advancing, so
   * the follow-up is asked with both posters still on screen. It is the engine's
   * decision, not the UI's — this component renders whichever follow-up
   * `followUpFor` returns and never invents one.
   */
  const [followUp, setFollowUp] = useState<FollowUp>(null);

  const busy = useRef(false);
  const shownAt = useRef(0);
  const startedAt = useRef(0);

  const known = useMemo(() => dnaKnown(state.profile), [state.profile]);

  /* POSTERS, RESOLVED SERVER-SIDE AND ONCE.
     The catalogue is fixed, so the endpoint is cached for a day and shared by
     every player. Failure is silent by design: `posters` stays empty, every
     tile renders the typographic treatment it renders today, and the game is
     still fully playable. Artwork is worth a fetch; it is not worth a blocking
     one. */
  const [posters, setPosters] = useState<Record<string, string>>({});
  useEffect(() => {
    let live = true;
    fetch('/api/showdown/posters')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (live && d?.posters) setPosters(d.posters as Record<string, string>); })
      .catch(() => { /* typographic tiles — see above */ });
    return () => { live = false; };
  }, []);
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
          /* WHY THE SAME FILMS USED TO COME BACK. `usedTitleIds` has existed on
             the stored DNA since the first build and nothing ever wrote to it
             or read it, so every session was dealt from the whole catalogue
             again — and a deterministic planner opening from a similar profile
             deals a similar opening. Seeding the session's no-repeat set from
             the durable history is the whole fix; `suppressedTitles` decides
             how much of that history to honour without starving the pool. */
          seenTitleIds: suppressedTitles(stored.usedTitleIds, TITLES.length),
          openingKnown: dnaKnown(stored.profile),
        }, now, mode),
        now,
      ),
    );
    /* `mode` is a route-level prop and never changes for a mounted game, so
       this still runs exactly once — it is declared because the effect reads
       it, and an undeclared read is how a stale-closure bug hides. */
  }, [mode]);

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
    /* TONIGHT CARRIES NOTHING FORWARD.
       The engine already guarantees `next.profile` is unchanged in tonight
       mode, so writing it would be harmless today — and that is exactly the
       kind of reasoning that rots. Refusing the write here means the stored
       DNA is untouched even if some future edit to the engine started letting
       a tonight answer through. Play counters are also left alone: a mood run
       is not a calibration and must not read as one. */
    if (next.mode !== 'dna') return;

    /* THE CROSSING INTO PERMANENT TASTE DNA, and until now nothing called it.
       `recordShowdownSession` — the validated server action that writes
       `preference_events` — had no caller anywhere in the app, so a signed-in
       player's calibration reached localStorage and stopped there. The pure
       chain from a tap to a rank delta was proved in `downstream.test.ts` and
       never actually run. It fires ONLY on a completed run: half a session is a
       worse profile than none, because the planner front-loads the broad sweep
       and the fine distinctions arrive last.

       FIRE AND FORGET, DELIBERATELY. A guest gets `Not signed in.` and that is
       a normal outcome, not an error; a network failure costs the canonical
       write and keeps the local one. Neither may block or interrupt the results
       screen the player is already looking at. */
    if (completed && next.decisions.length > 0) {
      void recordShowdownSession({
        mode: 'dna',
        decisions: sessionPayload(next.decisions, attributionOf),
      }).catch(() => {
        /* guest, offline, or a transient failure — the local profile stands */
      });
    }

    setDna((prior) => {
      const merged: StoredDna = {
        ...prior,
        profile: next.profile,
        /* EXPOSURE OUTLIVES THE SESSION, which is the point. Written here
           rather than in the engine because the engine is pure and this is the
           durable store; `recordExposure` keeps it oldest-first so position is
           recency, and `trimHistory` stops it growing without bound. */
        usedTitleIds: trimHistory(recordExposure(prior.usedTitleIds, exposedThisSession(next))),
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

  /**
   * Hand a finished decision to the engine and see whether it wants to ask
   * anything else. Most rounds it does not, and those advance in 160ms exactly
   * as before — the follow-up path must never become the common path.
   */
  const commit = useCallback(
    (next: ShowdownState) => {
      const asked = followUpFor(next);
      if (asked) {
        setState(next);
        setFollowUp(asked);
        return;
      }
      advance(next);
    },
    [advance],
  );

  const decide = useCallback(
    (verdict: Verdict) => {
      if (busy.current) return;
      const current = state;
      if (!current.current) return;
      busy.current = true;
      setPicked(
        verdict === 'left'
          ? current.current.left.id
          : verdict === 'right'
            ? current.current.right.id
            : verdict,
      );
      if (navigator.vibrate) navigator.vibrate(8);
      const responseMs = Date.now() - shownAt.current;
      window.setTimeout(() => {
        commit(applyAnswer(current, verdict, Date.now(), responseMs));
        busy.current = false;
      }, ADVANCE_MS);
    },
    [state, commit],
  );

  /* ANSWERING THE SECOND QUESTION. Each of the three routes advances, so the
     game cannot stall on a follow-up however it is dismissed. */
  const answerWhy = useCallback(
    (chip: ReasonChip) => {
      setFollowUp(null);
      advance(addReason(state, chip));
    },
    [state, advance],
  );

  const answerIntensity = useCallback(
    (intensity: Intensity) => {
      setFollowUp(null);
      advance(addIntensity(state, intensity));
    },
    [state, advance],
  );

  const dismissFollowUp = useCallback(() => {
    setFollowUp(null);
    advance(skipFollowUp(state));
  }, [state, advance]);

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

  // Keyboard: the whole game is playable without a pointer, follow-ups included.
  useEffect(() => {
    if (screen !== 'playing') return;
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const k = e.key.toLowerCase();
      if (followUp?.kind === 'why') {
        const n = Number(k);
        if (n >= 1 && n <= followUp.chips.length) {
          e.preventDefault();
          answerWhy(followUp.chips[n - 1]!);
        } else if (k === '0' || k === 'g') {
          e.preventDefault();
          answerWhy(GUT_CALL);
        } else if (k === 'escape') {
          e.preventDefault();
          dismissFollowUp();
        }
        return;
      }
      if (followUp?.kind === 'intensity') {
        if (k === '1') { e.preventDefault(); answerIntensity('must'); }
        else if (k === '2') { e.preventDefault(); answerIntensity('keen'); }
        else if (k === '3') { e.preventDefault(); answerIntensity('relative'); }
        else if (k === 'escape') { e.preventDefault(); dismissFollowUp(); }
        return;
      }
      if (k === '1' || k === 'arrowleft') { e.preventDefault(); decide('left'); }
      else if (k === '2' || k === 'arrowright') { e.preventDefault(); decide('right'); }
      else if (k === 'n') { e.preventDefault(); decide('neither'); }
      else if (k === 'b') { e.preventDefault(); decide('both'); }
      else if (k === 's') { e.preventDefault(); unseen(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [screen, decide, unseen, followUp, answerWhy, answerIntensity, dismissFollowUp]);

  if (screen === 'results') {
    return (
      <ShowdownResults
        state={state}
        openingKnown={opening}
        mode={mode}
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
                // Back-to-back runs suppress the whole history, not a trimmed
                // window: nothing from ten seconds ago may come back.
                seenTitleIds: [
                  ...state.seenTitleIds,
                  ...suppressedTitles(dna.usedTitleIds, TITLES.length),
                ],
                openingKnown: dnaKnown(dna.profile),
              }),
              now,
            ),
          );
          setFollowUp(null);
          setScreen('playing');
        }}
        onContinue={() => {
          /* THE HANDOFF. A tonight run carries its lean forward so the next
             screen is actually shaped by what was just answered; a dna run
             carries nothing here because its evidence is already in the
             durable stores (localStorage for a guest, preference_events for a
             signed-in user) and the destination reads those, not the URL. */
          if (mode === 'tonight' && state.decisions.length > 0) {
            saveTonight({ lean: state.lean, at: Date.now(), decisions: state.decisions.length });
          }
          router.push(mode === 'tonight' ? '/app/watch' : '/app');
        }}
      />
    );
  }

  /* WHICH PAIR IS ON SCREEN.
     A follow-up is asked ABOUT THE ROUND JUST ANSWERED, but the engine has
     already dealt the next matchup by then — `answer` does not wait, because
     the pick stands whether or not the second question is answered. So while a
     follow-up is open the posters come from the recorded decision, not from
     `state.current`, and the player sees the two films they are being asked
     about rather than the two coming next. */
  const lastDecision = state.decisions[state.decisions.length - 1];
  const answeredPair = followUp && lastDecision ? pairForDecision(lastDecision) : null;
  const shown = answeredPair ?? state.current;
  if (!shown) return null;
  const winnerId =
    answeredPair && lastDecision
      ? lastDecision.verdict === 'left'
        ? answeredPair.left.id
        : lastDecision.verdict === 'right'
          ? answeredPair.right.id
          : null
      : null;

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
            {mode === 'dna' ? 'Taste DNA' : 'Tonight'}
          </p>
          <p className="text-lg font-black tabular-nums leading-none text-amber-300">
            {Math.round(opening * 100)}% → {pct}%
          </p>
        </div>
      </header>

      <h2
        data-testid="showdown-prompt"
        data-followup={followUp?.kind ?? ''}
        className="text-center text-lg font-black uppercase tracking-tight text-white sm:text-2xl"
      >
        {followUp?.kind === 'why'
          ? 'Why that one?'
          : followUp?.kind === 'intensity'
            ? `How much do you want ${followUp.title.title}?`
            : PROMPT[mode]}
      </h2>

      <div className="grid min-h-0 flex-1 grid-cols-2 gap-3 sm:gap-5">
        <PosterTile
          posterPath={posters[shown.left.id] ?? null}
          title={shown.left}
          hotkey="1"
          picked={picked === shown.left.id || winnerId === shown.left.id}
          dimmed={
            (picked !== null && picked !== shown.left.id) ||
            (winnerId !== null && winnerId !== shown.left.id)
          }
          disabled={picked !== null || followUp !== null}
          onPick={() => decide('left')}
        />
        <PosterTile
          posterPath={posters[shown.right.id] ?? null}
          title={shown.right}
          hotkey="2"
          picked={picked === shown.right.id || winnerId === shown.right.id}
          dimmed={
            (picked !== null && picked !== shown.right.id) ||
            (winnerId !== null && winnerId !== shown.right.id)
          }
          disabled={picked !== null || followUp !== null}
          onPick={() => decide('right')}
        />
      </div>

      {followUp?.kind === 'why' ? (
        /*
          THE CHIPS ARE BUILT FROM THIS PAIR, never from a fixed list. Every one
          names an axis these two films genuinely diverge on, phrased in the
          winner's direction — so a tap is a single-axis observation rather than
          a click on whichever generic word looked closest.
        */
        <div className="shrink-0 pt-1" data-testid="showdown-why">
          <div className="grid grid-cols-2 gap-2">
            {followUp.chips.map((chip, i) => (
              <button
                key={chip.id}
                type="button"
                data-testid="showdown-why-chip"
                data-chip={chip.id}
                onClick={() => answerWhy(chip)}
                className="min-h-[46px] rounded-xl bg-amber-400/15 px-2 text-sm font-bold text-amber-100 ring-1 ring-amber-300/30 transition active:bg-amber-400/25 focus:outline-none focus-visible:ring-2 focus-visible:ring-white"
              >
                <span className="mr-1 text-[0.65rem] font-black text-amber-300/70">{i + 1}</span>
                {chip.label}
              </button>
            ))}
          </div>
          {/* ALWAYS AN EXIT. Forcing a reason nobody holds is how a profile
              fills up with confident nonsense; this records nothing at all. */}
          <button
            type="button"
            data-testid="showdown-why-gut"
            onClick={() => answerWhy(GUT_CALL)}
            className="mt-2 min-h-[44px] w-full rounded-xl px-3 text-sm font-semibold text-slate-400 ring-1 ring-white/10 transition active:bg-white/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-white"
          >
            {GUT_CALL.label}
          </button>
        </div>
      ) : followUp?.kind === 'intensity' ? (
        /*
          THE ONE QUESTION A HEAD-TO-HEAD CANNOT ANSWER. Winning a comparison is
          not wanting something — a person can prefer one of two films they
          would never watch. The third option says exactly that, and it is the
          honest answer most of the time, which is what makes the other two
          worth recording.
        */
        <div className="flex shrink-0 flex-col gap-2 pt-1" data-testid="showdown-intensity">
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              data-testid="showdown-intensity-must"
              onClick={() => answerIntensity('must')}
              className="min-h-[46px] rounded-xl bg-emerald-400/15 px-2 text-sm font-bold text-emerald-100 ring-1 ring-emerald-300/30 transition active:bg-emerald-400/25 focus:outline-none focus-visible:ring-2 focus-visible:ring-white"
            >
              Watching that tonight
            </button>
            <button
              type="button"
              data-testid="showdown-intensity-keen"
              onClick={() => answerIntensity('keen')}
              className="min-h-[46px] rounded-xl bg-white/10 px-2 text-sm font-bold text-white ring-1 ring-white/10 transition active:bg-white/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-white"
            >
              Would happily watch
            </button>
          </div>
          <button
            type="button"
            data-testid="showdown-intensity-relative"
            onClick={() => answerIntensity('relative')}
            className="min-h-[44px] w-full rounded-xl px-3 text-sm font-semibold text-slate-400 ring-1 ring-white/10 transition active:bg-white/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-white"
          >
            Just better than the other one
          </button>
        </div>
      ) : (
        /*
          FOUR ANSWERS, NOT THREE PLUS A SKIP. "Neither" is negative evidence
          about what the two films SHARE, "Both" is its mirror, and "Haven't
          seen either" is about recognition and teaches nothing at all.
          Collapsing any two of them into one ambiguous control is the single
          easiest way to corrupt the profile.
        */
        <div className="grid shrink-0 grid-cols-3 gap-2 pt-1">
          <button
            type="button"
            data-testid="showdown-neither"
            onClick={() => decide('neither')}
            disabled={picked !== null}
            className="min-h-[52px] rounded-xl bg-white/10 px-2 text-sm font-bold text-white ring-1 ring-white/10 transition active:bg-white/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-white disabled:opacity-50"
          >
            Neither
          </button>
          <button
            type="button"
            data-testid="showdown-both"
            onClick={() => decide('both')}
            disabled={picked !== null}
            className="min-h-[52px] rounded-xl bg-white/10 px-2 text-sm font-bold text-white ring-1 ring-white/10 transition active:bg-white/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-white disabled:opacity-50"
          >
            Both
          </button>
          <button
            type="button"
            data-testid="showdown-unseen"
            onClick={unseen}
            disabled={picked !== null}
            className="min-h-[52px] rounded-xl px-2 text-xs font-semibold text-slate-400 ring-1 ring-white/10 transition active:bg-white/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-white disabled:opacity-50"
          >
            Not seen either
          </button>
        </div>
      )}
    </div>
  );
}
