'use client';

/**
 * THE BURST — the gear change, on screen.
 *
 * `arc.ts` decides WHICH rounds are rapid. This is what those rounds look and
 * feel like, and the design brief is one sentence: exciting, not stressful.
 *
 * ── WHAT MAKES IT EXCITING ────────────────────────────────────────────────
 * The pace change has to be legible in the first frame or it is just a normal
 * round with a timer bolted on. So the burst announces itself, the cards DEAL
 * IN from the sides rather than fading, and the ring drains in the periphery
 * where it creates urgency without becoming the thing you stare at.
 *
 * ── AND WHAT KEEPS IT FROM BEING STRESSFUL ────────────────────────────────
 *   The clock is a RING, not a number. Digits counting down are a test; a
 *   shrinking arc reads as momentum.
 *   Nothing is red until the last second, and even then it is amber.
 *   There is no failure state and no sound.
 *   Running out is FREE — `timeoutRound` folds no evidence at all — so a player
 *   who hesitates loses nothing but the round. That is the promise the whole
 *   mechanic rests on, and it is enforced in the session, not here.
 *
 * ── REDUCED MOTION IS A REAL MODE ─────────────────────────────────────────
 * The deal-in and the pulse are removed; the ring still drains, because it is
 * information rather than decoration and a player who cannot see the time
 * remaining is worse off, not calmer.
 *
 * THE CLOCK IS OWNED HERE, NOT IN THE SESSION. A pure state machine must not
 * hold a timer, and the component that unmounts is the one that should cancel
 * it. `onExpire` fires exactly once — guarded by a ref, because a re-render
 * during the final tick would otherwise schedule a second call and skip two
 * rounds.
 */

import { useEffect, useRef, useState } from 'react';

const TICK_MS = 50;

export function RapidBurst({
  timeLimitMs,
  entering,
  roundKey,
  onExpire,
  children,
}: {
  timeLimitMs: number;
  /** First round of the burst — the screen says so, once. */
  entering: boolean;
  /** Changes every round; restarts the clock and replays the deal-in. */
  roundKey: string;
  onExpire: () => void;
  children: React.ReactNode;
}) {
  const [remaining, setRemaining] = useState(timeLimitMs);
  const fired = useRef(false);

  useEffect(() => {
    fired.current = false;
    setRemaining(timeLimitMs);
    const startedAt = Date.now();
    const id = window.setInterval(() => {
      const left = Math.max(0, timeLimitMs - (Date.now() - startedAt));
      setRemaining(left);
      if (left <= 0 && !fired.current) {
        fired.current = true; // exactly once, whatever React does around it
        window.clearInterval(id);
        onExpire();
      }
    }, TICK_MS);
    return () => window.clearInterval(id);
    // `roundKey` is the reset signal; `onExpire` is stable per round.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roundKey, timeLimitMs]);

  const fraction = Math.max(0, Math.min(1, remaining / timeLimitMs));
  const urgent = fraction <= 0.2;

  // A ring drawn with one stroke-dashoffset — no library, no layout thrash.
  const R = 22;
  const C = 2 * Math.PI * R;

  return (
    <section
      data-testid="showdown-rapid"
      data-remaining-ms={Math.round(remaining)}
      className="flex min-h-0 flex-1 flex-col gap-3"
    >
      <div className="flex shrink-0 items-center justify-center gap-3">
        <svg viewBox="0 0 52 52" className="h-11 w-11 -rotate-90" aria-hidden>
          <circle cx="26" cy="26" r={R} fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth="4" />
          <circle
            cx="26"
            cy="26"
            r={R}
            fill="none"
            stroke={urgent ? '#fbbf24' : '#e2e8f0'}
            strokeWidth="4"
            strokeLinecap="round"
            strokeDasharray={C}
            strokeDashoffset={C * (1 - fraction)}
          />
        </svg>
        <div className="flex flex-col">
          <p
            data-testid="showdown-rapid-label"
            className={`text-sm font-black uppercase tracking-[0.3em] ${urgent ? 'text-amber-300' : 'text-white'}`}
          >
            Rapid fire
          </p>
          {/* THE ONLY INSTRUCTION, AND IT IS ALSO THE REASSURANCE. */}
          <p className="text-[0.7rem] font-semibold text-slate-400">
            {entering ? 'Go with your gut — no penalty for running out' : 'Gut call'}
          </p>
        </div>
      </div>

      <div
        key={roundKey}
        className="flex min-h-0 flex-1 items-center justify-center rapid-deal motion-reduce:animate-none"
      >
        {children}
      </div>

      <style jsx>{`
        .rapid-deal {
          animation: rapid-deal-in 260ms cubic-bezier(0.2, 0.8, 0.2, 1) both;
        }
        @keyframes rapid-deal-in {
          from {
            opacity: 0;
            transform: translateY(14px) scale(0.97);
          }
          to {
            opacity: 1;
            transform: none;
          }
        }
        @media (prefers-reduced-motion: reduce) {
          .rapid-deal {
            animation: none;
          }
        }
      `}</style>
    </section>
  );
}

/**
 * THE STAGE FOR ONE ROUND — rapid or cinematic, decided by `arc.ts`.
 *
 * One wrapper rather than two branches at the call site, so the matchup itself
 * is written once and cannot drift between the two phases. The pair is the same
 * pair; only the frame around it changes.
 */
export function RoundStage({
  round,
  roundKey,
  onExpire,
  children,
}: {
  round: { phase: 'cinematic' | 'rapid'; timeLimitMs: number | null; entering: boolean };
  roundKey: string;
  onExpire: () => void;
  children: React.ReactNode;
}) {
  if (round.phase === 'rapid' && round.timeLimitMs != null) {
    return (
      <RapidBurst
        timeLimitMs={round.timeLimitMs}
        entering={round.entering}
        roundKey={roundKey}
        onExpire={onExpire}
      >
        {children}
      </RapidBurst>
    );
  }
  return <div className="flex min-h-0 flex-1 items-center justify-center">{children}</div>;
}
