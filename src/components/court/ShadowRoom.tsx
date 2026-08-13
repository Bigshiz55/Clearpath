'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * THE ROOM BEHIND THE ROOM.
 *
 * A ghosted, out-of-focus rendering of the Verdict Room the visitor is about
 * to open — sitting twenty feet back behind glass. Its whole job is to make
 * the entrance say "that is what is in there" before anyone clicks anything.
 *
 * ── IT IS BUILT FROM THE REAL ROOM, NOT FROM IMAGINATION ──────────────────
 * Every element here is a lightweight, faithful representation of something
 * `CourtRoom` actually renders once a room is open:
 *
 *   the two plates         the shortlist, standing off against each other
 *   the decision marker    the room's one call
 *   the avatar ring        `State.participants`, with `ready` as the pulse
 *   the vote rail          VotingFloor's real choices: Watch it / Maybe / Veto
 *   the token chip         the real veto allowance (VETO_TOKENS_PER_MEMBER)
 *   the in-play strip      the court size split, "in play" vs "in reserve"
 *   the far panel          the verdict board: ranks and per-member scores
 *
 * Nothing here previews a workflow the product does not have.
 *
 * ── AND IT CLAIMS NOTHING ─────────────────────────────────────────────────
 * The plates are ABSTRACT. No title, no real poster, no name. At the entrance
 * nobody has nominated anything yet, so putting a recognisable film back there
 * would be the interface asserting a candidate that does not exist. They are
 * shaped and lit like posters because that is what will stand there; they are
 * blank because the room is not open yet.
 *
 * ── DEPTH IS BUILT, NOT FAKED WITH OPACITY ────────────────────────────────
 * Four planes, each with its own scale, blur, brightness and parallax rate:
 * ambient → verdict board → stage → rail. The nearer a plane is, the sharper
 * and faster it moves. One flat rectangle at 20% opacity is what this is
 * deliberately not.
 *
 * ── ACCESSIBILITY ─────────────────────────────────────────────────────────
 * `aria-hidden` and `pointer-events-none` throughout: it is atmosphere, and
 * every fact it hints at is also stated in real, focusable UI in the
 * foreground. It carries no text a reader could need.
 */

/** Pointer parallax, in px, at the plane's own rate. Desktop pointers only. */
const PARALLAX = { ambient: 6, board: 12, stage: 22, rail: 30 };

export function ShadowRoom({ className = '' }: { className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [tilt, setTilt] = useState({ x: 0, y: 0 });

  useEffect(() => {
    // Parallax is a FINE-POINTER, FULL-MOTION affordance. On a touch screen
    // there is no hover to respond to, and under reduced motion the honest
    // answer is a still image.
    const fine = window.matchMedia('(pointer: fine)');
    const still = window.matchMedia('(prefers-reduced-motion: reduce)');
    if (!fine.matches || still.matches) return;

    let frame = 0;
    const onMove = (e: PointerEvent) => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        const r = ref.current?.getBoundingClientRect();
        if (!r) return;
        // -1..1 from the centre, so the room leans with the pointer.
        setTilt({
          x: ((e.clientX - r.left) / r.width - 0.5) * 2,
          y: ((e.clientY - r.top) / r.height - 0.5) * 2,
        });
      });
    };
    window.addEventListener('pointermove', onMove, { passive: true });
    return () => {
      window.removeEventListener('pointermove', onMove);
      if (frame) cancelAnimationFrame(frame);
    };
  }, []);

  const shift = (rate: number) => ({
    transform: `translate3d(${(-tilt.x * rate).toFixed(1)}px, ${(-tilt.y * rate * 0.5).toFixed(1)}px, 0)`,
  });

  return (
    <div
      ref={ref}
      aria-hidden
      data-testid="shadow-room"
      className={`pointer-events-none absolute inset-0 overflow-hidden ${className}`}
    >
      {/* ── PLANE 0 · AMBIENT ────────────────────────────────────────────
          The room's own light, before any object in it. Two slow cool/warm
          pools so the space reads as lit rather than merely dark. */}
      <div className="absolute inset-0" style={shift(PARALLAX.ambient)}>
        <div className="wv-vr-drift absolute left-[18%] top-[8%] h-[70vh] w-[70vh] -translate-x-1/2 rounded-full bg-[radial-gradient(circle,rgba(79,134,255,0.20),transparent_62%)] blur-3xl" />
        <div
          className="wv-vr-drift absolute right-[10%] top-[26%] h-[58vh] w-[58vh] translate-x-1/4 rounded-full bg-[radial-gradient(circle,rgba(255,20,147,0.14),transparent_62%)] blur-3xl"
          style={{ animationDelay: '-11s' }}
        />
      </div>

      {/* ── PLANE 1 · THE VERDICT BOARD, FURTHEST BACK ───────────────────
          The board the room ends on: ranked rows, each with per-member score
          pips. Small, high up, heavily blurred — you are meant to recognise
          the SHAPE of a result, not read one. */}
      <div
        className="absolute left-1/2 top-[5%] hidden w-[min(760px,70%)] -translate-x-1/2 opacity-[0.75] blur-[2.5px] sm:block sm:blur-[3px]"
        style={{ ...shift(PARALLAX.board), perspective: '900px' }}
      >
        <div
          className="rounded-2xl border border-white/[0.07] bg-white/[0.025] p-4 shadow-[0_40px_120px_-40px_rgba(0,0,0,0.9)] backdrop-blur-sm"
          style={{ transform: 'rotateX(14deg)' }}
        >
          <div className="mb-3 h-1.5 w-24 rounded-full bg-white/25" />
          {[0, 1, 2].map((row) => (
            <div key={row} className="mb-2 flex items-center gap-3">
              <span className="grid h-5 w-5 flex-none place-items-center rounded-md bg-white/10 text-[10px] font-black text-white/50">
                {row + 1}
              </span>
              <span
                className="h-2.5 rounded-full bg-white/22"
                style={{ width: `${52 - row * 9}%` }}
              />
              <span className="ml-auto flex flex-none gap-1">
                {[0, 1, 2, 3].map((pip) => (
                  <span
                    key={pip}
                    className={`h-1.5 w-1.5 rounded-full ${
                      pip <= 2 - row ? 'bg-emerald-300/60' : 'bg-white/12'
                    }`}
                  />
                ))}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* ── PLANE 2 · THE STAGE ──────────────────────────────────────────
          Two plates facing each other with the room's decision between them.
          The left one carries the winning-side glow — the room has leaned,
          which is the single most legible thing about the whole picture. */}
      <div
        className="absolute inset-x-0 top-[22%] flex items-center justify-center gap-[7vw] sm:top-[22%] sm:gap-[6vw]"
        style={{ ...shift(PARALLAX.stage), perspective: '1200px' }}
      >
        <Plate side="left" leading />
        <DecisionMarker />
        <Plate side="right" />
      </div>

      {/* ── PLANE 3 · THE PEOPLE ─────────────────────────────────────────
          Participants around the stage. One is mid-pulse: `ready` is a real
          field on `State.participants`, and a room that is waiting on someone
          is the normal state of this screen. */}
      <div className="absolute inset-0" style={shift(PARALLAX.stage + 4)}>
        {SEATS.map((s, i) => (
          <span
            key={i}
            className={`absolute grid place-items-center rounded-full border border-white/12 bg-white/[0.06] backdrop-blur-sm ${
              s.ready ? 'wv-vr-ready' : ''
            }`}
            style={{ left: s.left, top: s.top, width: s.size, height: s.size, opacity: s.opacity }}
          >
            <span className="h-1/3 w-1/3 rounded-full bg-white/45" />
          </span>
        ))}
      </div>

      {/* ── PLANE 4 · THE RAIL, NEAREST ──────────────────────────────────
          VotingFloor's own controls and the court-size split, at the front of
          the space: sharpest, and the fastest to move. */}
      <div
        className="absolute inset-x-0 bottom-[14%] flex flex-col items-center gap-3 opacity-[0.85] blur-[1px] lg:left-auto lg:right-[6%] lg:w-[46%] lg:items-center"
        style={shift(PARALLAX.rail)}
      >
        <div className="flex items-center gap-2 rounded-2xl border border-white/[0.08] bg-white/[0.04] px-3 py-2 backdrop-blur-md">
          {VOTE_RAIL.map((v) => (
            <span key={v.label} className={`h-8 rounded-lg px-4 ${v.tone}`} style={{ width: v.width }} />
          ))}
          <span className="ml-1 h-6 w-16 rounded-full border border-red-400/30 bg-red-500/10" />
        </div>
        <div className="flex items-center gap-1.5">
          {Array.from({ length: 9 }).map((_, i) => (
            <span
              key={i}
              className={`h-1.5 rounded-full ${i < 5 ? 'w-7 bg-white/25' : 'w-5 bg-white/10'}`}
            />
          ))}
        </div>
      </div>

      {/* ── THE GLASS ────────────────────────────────────────────────────
          What actually puts the room BEHIND something. A vertical scrim that
          deepens toward the foreground copy, plus a left-weighted wash so the
          identity and the CTA always land on their own darkness rather than
          on a poster edge. */}
      <div className="absolute inset-0 bg-[linear-gradient(to_bottom,rgba(4,6,12,0.62),rgba(4,6,12,0.20)_34%,rgba(4,6,12,0.55)_62%,rgba(4,6,12,0.86))] sm:bg-[linear-gradient(to_bottom,rgba(4,6,12,0.55),rgba(4,6,12,0.12)_40%,rgba(4,6,12,0.72))]" />
      <div className="absolute inset-0 sm:bg-[linear-gradient(to_right,rgba(4,6,12,0.86),rgba(4,6,12,0.36)_40%,transparent_68%)] lg:bg-[linear-gradient(to_right,rgba(4,6,12,0.90),rgba(4,6,12,0.34)_32%,transparent_58%)]" />
    </div>
  );
}

/** Where the room's people stand, and who it is still waiting on. */
const SEATS = [
  { left: '14%', top: '34%', size: 48, opacity: 0.8, ready: false },
  { left: '24%', top: '64%', size: 38, opacity: 0.75, ready: true },
  { left: '76%', top: '28%', size: 42, opacity: 0.72, ready: false },
  { left: '87%', top: '58%', size: 34, opacity: 0.6, ready: false },
  { left: '52%', top: '78%', size: 32, opacity: 0.55, ready: false },
] as const;

/** The three real choices on a VotingFloor card, as light. */
const VOTE_RAIL = [
  { label: 'watch', tone: 'bg-emerald-400/45', width: 96 },
  { label: 'maybe', tone: 'bg-amber-300/38', width: 78 },
  { label: 'veto', tone: 'bg-red-400/38', width: 70 },
] as const;

/**
 * A candidate standing on the stage. Poster-proportioned and poster-lit, with
 * the sheen of a real card catching the room's light — and blank, because no
 * title has been nominated at the door.
 */
function Plate({ side, leading = false }: { side: 'left' | 'right'; leading?: boolean }) {
  const rotate = side === 'left' ? 'rotateY(17deg)' : 'rotateY(-17deg)';
  return (
    <div
      className={`relative aspect-[2/3] w-[36vw] max-w-[360px] flex-none rounded-2xl border sm:w-[25vw] ${
        leading ? 'border-white/[0.26]' : 'border-white/[0.14]'
      }`}
      style={{
        transform: `${rotate} translateZ(0)`,
        background: leading
          ? 'linear-gradient(155deg, rgba(96,126,200,0.85), rgba(24,32,58,0.95) 55%, rgba(10,14,26,0.98))'
          : 'linear-gradient(155deg, rgba(64,80,124,0.6), rgba(16,20,36,0.92) 58%, rgba(8,10,20,0.96))',
        boxShadow: leading
          ? '0 60px 150px -45px rgba(79,134,255,0.75), inset 0 1px 0 rgba(255,255,255,0.18)'
          : '0 50px 120px -50px rgba(0,0,0,0.95), inset 0 1px 0 rgba(255,255,255,0.08)',
        filter: leading ? 'blur(1px)' : 'blur(2.5px) brightness(0.82)',
      }}
    >
      {/* The light that says "this side is winning" without a word on it. */}
      {leading && (
        <span className="wv-vr-sheen absolute inset-0 overflow-hidden rounded-2xl">
          <span className="absolute inset-y-0 -left-1/3 w-1/3 bg-gradient-to-r from-transparent via-white/[0.10] to-transparent" />
        </span>
      )}
      {/* The block where a title sits on a real card. Shape only. */}
      <span className="absolute inset-x-4 bottom-4 space-y-2">
        <span className="block h-3 w-3/4 rounded-full bg-white/30" />
        <span className="block h-2.5 w-1/2 rounded-full bg-white/16" />
      </span>
    </div>
  );
}

/** The room's one call, hanging between the two plates. */
function DecisionMarker() {
  return (
    <div className="relative flex-none">
      <span className="wv-vr-pulse absolute inset-0 -m-6 rounded-full bg-[radial-gradient(circle,rgba(255,20,147,0.28),transparent_66%)] blur-2xl" />
      <span className="relative grid h-16 w-16 place-items-center rounded-full border border-white/15 bg-white/[0.06] backdrop-blur-md sm:h-20 sm:w-20">
        <span className="h-7 w-[3px] rounded-full bg-gradient-to-b from-white/70 via-white/40 to-transparent" />
      </span>
    </div>
  );
}
