'use client';

/**
 * DNA SHOWDOWN — the game surface.
 *
 * WHAT THIS SCREEN HAS TO DO, in order of how badly it was failing:
 *
 *   SHOW THE LEARNING. The old header read "38% → 38%" — a global average over
 *   twenty-eight axes, which cannot visibly move from a single answer, so it
 *   sat there telling the player that twenty taps had accomplished nothing
 *   while the engine was in fact learning. Replaced by per-cluster meters that
 *   move because one good answer really does resolve one part of somebody.
 *
 *   HAVE RHYTHM. Twelve identical screens is what makes a calibration feel like
 *   a survey. Every moment band here is derived from what the planner actually
 *   did (`moments.ts`), so "CLOSE CALL" appears only when the engine genuinely
 *   predicts near-equal appeal. Labels that fire at random get spotted in three
 *   rounds and poison everything else on the screen.
 *
 *   SAY SOMETHING. Periodically the game stops asking and tells the player what
 *   it thinks it has worked out, with a real way to disagree. "Not quite" is the
 *   most valuable tap in the product.
 *
 * ALL INTELLIGENCE LIVES IN THE PURE ENGINE (`lib/showdown/`). This file renders
 * what it is handed and reports back; it never decides what to ask, and it must
 * never flatten the engine's semantics — the answers are genuinely five, not
 * three plus a skip:
 *
 *   LEFT / RIGHT   a comparative preference
 *   NEITHER        negative evidence about what the two films SHARE
 *   BOTH           its mirror
 *   HAVEN'T SEEN   a statement about recognition that moves no belief at all
 *
 * ONLY VERIFIED TITLES ARE DEALT. `/api/showdown/catalogue` proves each title's
 * identity before the game may use it; anything it cannot verify is excluded, so
 * the anime-artwork-beside-Making-a-Murderer class of failure cannot recur —
 * see `lib/showdown/identity.ts`.
 *
 * DOUBLE-SUBMISSION is guarded by a ref rather than state, because two taps
 * inside one React batch would both read the same stale `busy` and both commit.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { loadDna, saveDna, type StoredDna } from '@/lib/tastedna/persist';
import { saveTonight } from '@/lib/showdown/handoff';
import { recordShowdownSession } from '@/lib/actions/showdown';
import { sessionPayload } from '@/lib/showdown/canonical';
import type { ShowdownMode } from '@/lib/showdown/evidence';
import { TITLES } from '@/lib/voice/quickdna/definition';
import { dnaKnown } from '@/lib/tastedna/families';
import { recordExposure, suppressedTitles, trimHistory } from '@/lib/showdown/exposure';
import { poolExclusions } from '@/lib/showdown/identity';
import type { FollowUp, Intensity } from '@/lib/showdown/followup';
import { GUT_CALL, followUpPrompt, type ReasonChip } from '@/lib/showdown/reasons';
import { momentFor } from '@/lib/showdown/moments';
import { discoveryEvidenceLine, type Discovery } from '@/lib/showdown/discovery';
import {
  TARGET_DECISIONS,
  addIntensity,
  addReason,
  answer as applyAnswer,
  answerDiscovery,
  attributionOf,
  createSession,
  discoveryFor,
  exposedThisSession,
  followUpFor,
  markUnseen,
  pairForDecision,
  skipFollowUp,
  startSession,
  type ShowdownState,
  type Verdict,
} from '@/lib/showdown/session';
import { calibrationFor, answerCalibration, skipCalibration, timeoutRound } from '@/lib/showdown/session';
import { planRound } from '@/lib/showdown/arc';
import { ColdOpen } from './ColdOpen';
import { RoundStage } from './RapidBurst';
import { CalibrationCard } from './CalibrationCard';
import { PosterTile } from './PosterTile';
import { ShowdownResults } from './ShowdownResults';
import { LearningStrip } from './LearningStrip';
import { DiscoveryCard } from './DiscoveryCard';

/** Snap to the next matchup. Fast enough to feel instant, slow enough to read. */
const ADVANCE_MS = 150;

const RESUME_KEY = 'watchverdict:showdown:v2';

/**
 * `open` is new and is the default.
 *
 * The game used to mount straight into `playing`, so a player's first sight of
 * it was a progress rail reading 0/12. An opening is not chrome in front of the
 * game — it is the five seconds that decide whether somebody plays it.
 */
type Screen = 'open' | 'playing' | 'results';

/**
 * THE PROMPT IS THE ARCHITECTURE, VISIBLE.
 *
 * The old screen asked "Tonight — which one are you watching?" and wrote the
 * answer into permanent Taste DNA. That line was the defect: it elicits a MOOD
 * and the engine booked it as an IDENTITY. The two questions are separate modes
 * writing separate ledgers, and the wording is what tells the player which one
 * they are answering.
 */
const PROMPT: Record<ShowdownMode, string> = {
  dna: 'Which would you rather watch?',
  tonight: 'Tonight — which one are you watching?',
};

interface CatalogueResponse {
  posters: Record<string, string>;
  verified: string[];
  unverified: Array<{ id: string; reason: string }>;
}

export function Showdown({ seed, mode = 'dna' }: { seed?: Partial<StoredDna>; mode?: ShowdownMode }) {
  const router = useRouter();
  const [dna, setDna] = useState<StoredDna>(() => ({
    profile: seed?.profile ?? {},
    usedChoiceIds: [],
    usedTitleIds: [],
    plays: seed?.plays ?? 0,
    decisions: seed?.decisions ?? 0,
  }));
  const [state, setState] = useState<ShowdownState | null>(null);
  const [screen, setScreen] = useState<Screen>('open');
  const [picked, setPicked] = useState<string | null>(null);
  const [followUp, setFollowUp] = useState<FollowUp>(null);
  const [discovery, setDiscovery] = useState<Discovery | null>(null);
  const [posters, setPosters] = useState<Record<string, string>>({});

  const busy = useRef(false);
  const shownAt = useRef(0);

  /**
   * VERIFY THE CATALOGUE BEFORE DEALING FROM IT.
   *
   * The game genuinely cannot start until it knows which titles it is allowed
   * to show — dealing first and filtering later is how a player ends up staring
   * at somebody else's poster. `poolExclusions` distinguishes "checked and
   * wrong" from "could not check": a total failure means TMDB is unavailable,
   * and the game plays on with typographic tiles rather than an empty screen.
   */
  useEffect(() => {
    let live = true;
    const stored = loadDna();
    setDna(stored);
    const now = Date.now();
    shownAt.current = now;

    const begin = (excluded: string[], art: Record<string, string>) => {
      if (!live) return;
      setPosters(art);
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
        /* unreadable — fall through to a fresh session */
      }
      setState(
        startSession(
          createSession(
            {
              profile: stored.profile,
              /* Cross-session exposure plus this run's exclusions, in one list.
                 The engine's no-repeat set is the only mechanism either needs. */
              seenTitleIds: [
                ...suppressedTitles(stored.usedTitleIds, TITLES.length),
                ...excluded,
              ],
              openingKnown: dnaKnown(stored.profile),
            },
            now,
            mode,
          ),
          now,
        ),
      );
    };

    fetch('/api/showdown/catalogue')
      .then((r) => (r.ok ? r.json() : null))
      .then((d: CatalogueResponse | null) => {
        if (!d) return begin([], {});
        const { exclude } = poolExclusions({ verified: d.verified.map((id) => ({ id })), unverified: d.unverified });
        begin(exclude, d.posters ?? {});
      })
      .catch(() => begin([], {}));

    return () => {
      live = false;
    };
  }, [mode]);

  // Persist the in-flight session so a refresh cannot cost a decision.
  useEffect(() => {
    if (screen !== 'playing' || !state) return;
    try {
      sessionStorage.setItem(RESUME_KEY, JSON.stringify(state));
    } catch {
      /* private mode — the session simply will not resume */
    }
  }, [state, screen]);

  /**
   * Fold what this session learned into the durable store, and cross into
   * permanent Taste DNA.
   */
  const persist = useCallback((next: ShowdownState, completed: boolean) => {
    /* TONIGHT CARRIES NOTHING FORWARD. The engine already guarantees the
       profile is untouched in tonight mode, and refusing the write here means
       that stays true even if a future edit to the engine let one through. */
    if (next.mode !== 'dna') return;

    if (completed && next.decisions.length > 0) {
      void recordShowdownSession({
        mode: 'dna',
        decisions: sessionPayload(next.decisions, attributionOf),
      }).catch(() => {
        /* guest, offline, or transient — the local profile stands */
      });
    }

    setDna((prior) => {
      const merged: StoredDna = {
        ...prior,
        profile: next.profile,
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
   * Hand a finished decision to the engine and see what it wants next.
   *
   * Three outcomes, in priority order: a clarifying question about the round
   * just answered, a discovery it is ready to state, or straight on. The great
   * majority of rounds are the third.
   */
  const commit = useCallback(
    (next: ShowdownState) => {
      const asked = followUpFor(next);
      if (asked) {
        setState(next);
        setFollowUp(asked);
        return;
      }
      const found = discoveryFor(next);
      if (found) {
        setState(next);
        setDiscovery(found);
        return;
      }
      advance(next);
    },
    [advance],
  );

  const decide = useCallback(
    (verdict: Verdict) => {
      if (busy.current || !state?.current) return;
      const current = state;
      busy.current = true;
      setPicked(
        verdict === 'left'
          ? current.current!.left.id
          : verdict === 'right'
            ? current.current!.right.id
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

  const unseen = useCallback(() => {
    if (busy.current || !state?.current) return;
    const current = state;
    busy.current = true;
    window.setTimeout(() => {
      /* Retires both titles, changes no belief, and — since this build — does
         NOT consume a round. An unrecognised pair is not a question, so the
         player does not pay for it. */
      advance(markUnseen(current, Date.now()));
      busy.current = false;
    }, ADVANCE_MS);
  }, [state, advance]);

  const answerWhy = useCallback(
    (chip: ReasonChip) => {
      if (!state) return;
      setFollowUp(null);
      const next = addReason(state, chip);
      const found = discoveryFor(next);
      if (found) {
        setState(next);
        setDiscovery(found);
        return;
      }
      advance(next);
    },
    [state, advance],
  );

  const answerIntensity = useCallback(
    (intensity: Intensity) => {
      if (!state) return;
      setFollowUp(null);
      advance(addIntensity(state, intensity));
    },
    [state, advance],
  );

  const resolveDiscovery = useCallback(
    (verdict: 'confirm' | 'correct') => {
      if (!state || !discovery) return;
      setDiscovery(null);
      advance(answerDiscovery(state, discovery, verdict));
    },
    [state, discovery, advance],
  );

  // Keyboard: the whole game is playable without a pointer.
  useEffect(() => {
    if (screen !== 'playing') return;
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const k = e.key.toLowerCase();
      if (discovery) {
        if (k === '1' || k === 'y') { e.preventDefault(); resolveDiscovery('confirm'); }
        else if (k === '2' || k === 'n') { e.preventDefault(); resolveDiscovery('correct'); }
        return;
      }
      if (followUp?.kind === 'why') {
        const n = Number(k);
        if (n >= 1 && n <= followUp.chips.length) { e.preventDefault(); answerWhy(followUp.chips[n - 1]!); }
        else if (k === '0' || k === 'g') { e.preventDefault(); answerWhy(GUT_CALL); }
        return;
      }
      if (followUp?.kind === 'intensity') {
        if (k === '1') { e.preventDefault(); answerIntensity('must'); }
        else if (k === '2') { e.preventDefault(); answerIntensity('keen'); }
        else if (k === '3') { e.preventDefault(); answerIntensity('relative'); }
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
  }, [screen, decide, unseen, followUp, discovery, answerWhy, answerIntensity, resolveDiscovery]);

  const lastDecision = state?.decisions[state.decisions.length - 1];
  const answeredPair = followUp && lastDecision ? pairForDecision(lastDecision) : null;
  const shown = answeredPair ?? state?.current ?? null;
  const winnerId =
    answeredPair && lastDecision
      ? lastDecision.verdict === 'left'
        ? answeredPair.left.id
        : lastDecision.verdict === 'right'
          ? answeredPair.right.id
          : null
      : null;

  const moment = useMemo(() => {
    if (!state?.current || followUp || discovery) return null;
    return momentFor({
      matchup: state.current,
      profile: state.profile,
      decisionIndex: state.decisions.length,
      total: TARGET_DECISIONS,
    });
  }, [state, followUp, discovery]);

  if (screen === 'results' && state) {
    return (
      <ShowdownResults
        state={state}
        openingKnown={state.openingKnown}
        mode={mode}
        onPlayAgain={() => {
          const now = Date.now();
          shownAt.current = now;
          setState(
            startSession(
              createSession({
                profile: dna.profile,
                seenPairs: state.seenPairs,
                unseenTitles: state.unseenTitles,
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
          setDiscovery(null);
          setScreen('playing');
        }}
        onContinue={() => {
          if (mode === 'tonight' && state.decisions.length > 0) {
            saveTonight({ lean: state.lean, at: Date.now(), decisions: state.decisions.length });
          }
          router.push(mode === 'tonight' ? '/app/watch' : '/app');
        }}
      />
    );
  }

  /* THE OPENING, BEFORE ANYTHING ELSE — including before the catalogue has
     finished verifying. The reveal animation and the player reading the promise
     are the same few hundred milliseconds the verification needs, so the wait
     costs nothing and the game appears to start instantly. */
  if (screen === 'open') {
    return (
      <ColdOpen
        posterPaths={Object.values(posters).filter(Boolean).slice(0, 5)}
        returning={dnaKnown(dna.profile) > 0.05}
        onStart={() => setScreen('playing')}
      />
    );
  }

  /* THE CATALOGUE IS STILL BEING VERIFIED. A held frame rather than a spinner:
     the game is about to be fast, and a spinner promises the opposite. */
  if (!state) {
    return (
      <div
        data-testid="showdown-loading"
        className="mx-auto flex min-h-[100dvh] w-full max-w-2xl flex-col items-center justify-center gap-3 px-6"
      >
        <p className="text-sm font-black uppercase tracking-[0.3em] text-slate-500">DNA Showdown</p>
        <p className="text-lg font-bold text-slate-400">Loading your matchups…</p>
      </div>
    );
  }

  if (!shown && !discovery) return null;

  const done = state.decisions.length;
  const progress = Math.min(1, done / TARGET_DECISIONS);

  /* DECLARATIVE, LIKE `discovery`. `calibrationFor` already refuses when a
     follow-up is pending, when the round is too early, and when the axis was
     asked — so asking it every render is safe and there is no second copy of
     the interruption budget to keep in step. */
  const calibration = followUp === null && discovery === null ? calibrationFor(state) : null;
  const round = planRound(done, TARGET_DECISIONS);

  return (
    /* A CENTRED COMPOSITION, NOT A STRETCHED ONE. Letting the poster row take
       every spare pixel produced two 600px slabs; pinning it to 2:3 and leaving
       the remainder as one dead band at the bottom is the same mistake wearing
       different trousers. The whole stack centres instead, so the leftover
       height becomes symmetric breathing room around a composed screen. */
    /* THE PAIR IS THE PAGE. Measured at 390x844 the poster row occupied 259px of
       844 — 31% of the viewport — because the stack centred itself and let the
       row shrink to whatever the meters and buttons left over. `justify-center`
       is what did it: a centred column distributes slack around everything
       instead of giving it to the one element that matters. Now the column
       fills the height and the pair is the only thing allowed to grow. */
    <div className="mx-auto flex h-[100dvh] w-full max-w-md flex-col gap-3 px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 lg:max-w-5xl lg:gap-4">
      {/* HEADER — a rail, not a percentage. The old "38% → 38%" told the player
          their answers had achieved nothing; a rail says how far through they
          are, which is the only thing a counter can honestly claim. */}
      {/* THE PROGRESS CUE, SUBORDINATED.
          It was a label, a rail and a "0/12" counter across the top — three
          pieces of chrome competing with the decision for the player's first
          glance, and the counter in particular reads as a test with a number of
          questions left rather than a game with rounds in it. What survives is
          the rail alone, hairline, edge to edge, carrying no digits. The count
          stays on the element as data so tests and the E2E can still assert
          progress without it being shown to anybody. */}
      <header className="shrink-0" aria-label={`Round ${done + 1} of ${TARGET_DECISIONS}`}>
        <div className="h-[3px] w-full overflow-hidden rounded-full bg-white/[0.07]">
          <div
            data-testid="showdown-progress"
            data-decisions={done}
            data-total={TARGET_DECISIONS}
            className="h-full rounded-full bg-amber-300/80 transition-all duration-500"
            style={{ width: `${Math.max(2, progress * 100)}%` }}
          />
        </div>
      </header>

      {calibration ? (
        /* THE 1-10 MOMENT. Ahead of the matchup because it OWNS the screen —
           it is the game admitting it could not work an axis out, and burying
           that under two posters would make it read as another form field. */
        <CalibrationCard
          question={calibration}
          onAnswer={(value) => setState((prev) => (prev ? answerCalibration(prev, calibration, value) : prev))}
          onSkip={() => setState((prev) => (prev ? skipCalibration(prev, calibration) : prev))}
        />
      ) : discovery ? (
        <DiscoveryCard
          discovery={discovery}
          evidence={discoveryEvidenceLine(discovery, state.decisions, TITLES)}
          onConfirm={() => resolveDiscovery('confirm')}
          onCorrect={() => resolveDiscovery('correct')}
        />
      ) : (
        <>
          {/* MOMENT + PROMPT share one line-height so the layout never jumps
              between a labelled round and a plain one. */}
          <div className="flex shrink-0 flex-col items-center gap-1">
            {followUp?.kind === 'why' && (
              /* THE DECISION, STATED BACK. Nothing on the old screen referred to
                 the choice the player had just made, which is what made it read
                 as a survey interrupting a game rather than a reaction to it. */
              <p data-testid="showdown-why-lead" className="text-sm font-bold text-amber-300">
                {followUpPrompt(shown?.[picked === shown?.left.id ? 'left' : 'right']?.title ?? null, followUp.chips).lead}
              </p>
            )}
            <p
              data-testid="showdown-moment"
              data-moment={moment?.kind ?? ''}
              className={`h-4 text-[0.6rem] font-black uppercase tracking-[0.3em] transition-all duration-200 ${
                moment ? 'text-amber-300 opacity-100' : 'opacity-0'
              }`}
            >
              {moment?.label ?? '—'}
            </p>
            <h2
              data-testid="showdown-prompt"
              data-followup={followUp?.kind ?? ''}
              className="text-balance text-center text-lg font-black uppercase tracking-tight text-white sm:text-2xl"
            >
              {followUp?.kind === 'why'
                ? followUpPrompt(shown?.[picked === shown?.left.id ? 'left' : 'right']?.title ?? null, followUp.chips).question
                : followUp?.kind === 'intensity'
                  ? `How much do you want ${followUp.title.title}?`
                  : PROMPT[mode]}
            </h2>
          </div>

          {shown && (
            /* POSTER-SHAPED, NOT COLUMN-SHAPED.
               These tiles used to fill whatever vertical space was going, which
               on a tall phone made two 600px slabs that owned the entire
               viewport and pushed the learning meters and the moment band into
               the margins. A poster is 2:3; rendering it as 1:3.5 makes the
               screen read as a form with pictures on it. Capping the ratio and
               centring the row gives the space back to the parts of the screen
               that are actually saying something. */
            <RoundStage
              /* THE CLOCK STOPS FOR A QUESTION. A follow-up rendered inside a
                 rapid round left the drained ring sitting above it at zero —
                 urgency chrome attached to a prompt that has no time limit, and
                 the one moment in the burst where the player is meant to think.
                 The pair stays put; only the frame drops back to cinematic. */
              round={followUp ? { phase: 'cinematic' as const, timeLimitMs: null, entering: false } : round}
              roundKey={String(done)}
              onExpire={() => setState((prev) => (prev ? timeoutRound(prev, Date.now()) : prev))}
            >
              <div className="grid h-full w-full grid-cols-2 items-stretch gap-3 lg:gap-8" data-testid="showdown-pair">
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
            </RoundStage>
          )}

          {/* THE LEARNING, DIRECTLY UNDER THE FILMS — but not always.
              It is feedback on the tap that was just made, so it belongs where
              the eye already is. Two cases where it was making the screen worse:
              on round one there is nothing to report and a row of empty meters
              is the single most diagnostic-looking thing in the game, and during
              the burst it competes with a countdown for the same attention while
              stealing height from posters that are supposed to be arriving fast.
              Shown when it has something to say, absent when it does not. */}
          {done > 0 && round.phase !== 'rapid' && (
            <div className="shrink-0">
              <LearningStrip profile={state.profile} />
            </div>
          )}

          {followUp?.kind === 'why' ? (
            /* CHIPS BUILT FROM THIS PAIR, never a fixed list. Every one names an
               axis these two titles genuinely diverge on, phrased in the
               winner's direction — so a tap is a single-axis observation rather
               than a click on whichever generic word looked closest. */
            <div className="shrink-0" data-testid="showdown-why">
              {/* YES TO THE NAMED GUESS, then the ways to disagree. "No,
                  something else" about a stated hypothesis is a better
                  observation than declining to pick from a list — the game has
                  committed to a guess and the player is correcting it. */}
              <div className="flex flex-col gap-2">
                {followUp.chips[0] && (
                  <button
                    type="button"
                    data-testid="showdown-why-chip"
                    data-chip={followUp.chips[0].id}
                    onClick={() => answerWhy(followUp.chips[0]!)}
                    className="min-h-[52px] rounded-xl bg-amber-300 px-3 text-base font-black text-ink-900 transition active:scale-[0.98] focus:outline-none focus-visible:ring-2 focus-visible:ring-white"
                  >
                    Yes, that was it
                  </button>
                )}
                {followUp.chips.length > 1 && (
                  <div className="grid grid-cols-2 gap-2">
                    {followUp.chips.slice(1).map((chip) => (
                      <button
                        key={chip.id}
                        type="button"
                        data-testid="showdown-why-chip"
                        data-chip={chip.id}
                        onClick={() => answerWhy(chip)}
                        className="min-h-[46px] rounded-xl bg-white/[0.07] px-2 text-sm font-bold text-white ring-1 ring-white/10 transition active:scale-[0.98] focus:outline-none focus-visible:ring-2 focus-visible:ring-white"
                      >
                        No — {chip.label.toLowerCase()}
                      </button>
                    ))}
                  </div>
                )}
              </div>
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
            <div className="flex shrink-0 flex-col gap-2" data-testid="showdown-intensity">
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  data-testid="showdown-intensity-must"
                  onClick={() => answerIntensity('must')}
                  className="min-h-[46px] rounded-xl bg-emerald-400/15 px-2 text-sm font-bold text-emerald-100 ring-1 ring-emerald-300/30 transition active:scale-[0.98] focus:outline-none focus-visible:ring-2 focus-visible:ring-white"
                >
                  Watching that tonight
                </button>
                <button
                  type="button"
                  data-testid="showdown-intensity-keen"
                  onClick={() => answerIntensity('keen')}
                  className="min-h-[46px] rounded-xl bg-white/10 px-2 text-sm font-bold text-white ring-1 ring-white/10 transition active:scale-[0.98] focus:outline-none focus-visible:ring-2 focus-visible:ring-white"
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
            /* FOUR ANSWERS, NOT THREE PLUS A SKIP. "Neither" is negative evidence
               about what the two films SHARE, "Both" is its mirror, and "Haven't
               seen" is about recognition and teaches nothing at all. Collapsing
               any two into one ambiguous control corrupts the profile. */
            <div className="grid shrink-0 grid-cols-3 gap-2">
              <button
                type="button"
                data-testid="showdown-neither"
                onClick={() => decide('neither')}
                disabled={picked !== null}
                className="min-h-[48px] rounded-xl bg-white/[0.07] px-2 text-sm font-bold text-white ring-1 ring-white/10 transition active:scale-[0.98] active:bg-white/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-white disabled:opacity-50"
              >
                Neither
              </button>
              <button
                type="button"
                data-testid="showdown-both"
                onClick={() => decide('both')}
                disabled={picked !== null}
                className="min-h-[48px] rounded-xl bg-white/[0.07] px-2 text-sm font-bold text-white ring-1 ring-white/10 transition active:scale-[0.98] active:bg-white/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-white disabled:opacity-50"
              >
                Both
              </button>
              <button
                type="button"
                data-testid="showdown-unseen"
                onClick={unseen}
                disabled={picked !== null}
                className="min-h-[48px] rounded-xl px-2 text-xs font-semibold text-slate-400 ring-1 ring-white/10 transition active:bg-white/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-white disabled:opacity-50"
              >
                Not seen either
              </button>
            </div>
          )}
        </>
      )}

    </div>
  );
}
