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
 * `CourtRoom` runs five stages — JOIN → SET TONIGHT → SHORTLIST → REACT →
 * VERDICT — and the room is laid out in DEPTH rather than in sequence, so one
 * glance carries the shape of a whole session:
 *
 *   furthest   VERDICT     the board the room ends on: a winner, everyone's
 *                          score for it, and the titles that got vetoed
 *   far-right  ALL FIVE    the progression rail, lit at the stage the rest
 *                          of this picture is standing in
 *   mid        SHORTLIST   the nominated titles, standing off against
 *                          each other, one leading and one struck out
 *   mid-near   JOIN/REACT  the people who joined, and what they just did
 *   nearest    REACT       VotingFloor's own three keys and the veto tokens
 *
 * Nothing here previews a workflow the product does not have.
 *
 * ── IT IS A DEMO STATE, AND IT CLAIMS NOTHING ─────────────────────────────
 * The artwork on the plates is DRAWN, not borrowed: three original poster
 * compositions that exist nowhere but in this file. No real title, no real
 * poster, no real person, no name, no number, no tally that could be read as
 * a fact about anyone's crew. Every legible surface is either abstract
 * geometry or an original illustration, because at the door nobody has
 * nominated anything and no vote has been cast. The room is dressed, not
 * populated.
 *
 * ── DEPTH IS BUILT, NOT FAKED WITH OPACITY ────────────────────────────────
 * Five planes, each with its own scale, blur, brightness and parallax rate:
 * ambient → board → stage-rail → stage → near. The nearer a plane is, the
 * sharper it is and the faster it moves under the pointer. One flat rectangle
 * at 20% opacity is what this is deliberately not.
 *
 * ── ACCESSIBILITY ─────────────────────────────────────────────────────────
 * `aria-hidden` and `pointer-events-none` throughout: it is atmosphere, and
 * every fact it hints at is also stated in real, focusable UI in the
 * foreground. It carries no text a reader could need. Under
 * `prefers-reduced-motion` the global rule in globals.css collapses every
 * duration here, and every keyframe is authored so that its resting state is
 * the fully-visible one — a still room, never a half-drawn one.
 */

/** Pointer parallax, in px, at the plane's own rate. Desktop pointers only. */
const PARALLAX = { ambient: 5, board: 11, rail: 16, stage: 24, near: 34 };

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
          The room's own light before any object in it, and a floor. The
          floor matters more than it sounds: without a ground plane the
          objects float in a void and the whole picture reads as a diagram.
          With one, they are standing somewhere. */}
      {/* NOTE ON POSITIONING, because it bit this file twice: a Tailwind
          `-translate-x-1/2` and an inline/animated `transform` are the SAME
          declaration, and the later one wins outright. Anything that both
          moves under parallax (or animates) and needs centring is offset with
          margins instead, so the two never compete. */}
      <div className="absolute inset-0" style={shift(PARALLAX.ambient)}>
        <div className="wv-vr-drift absolute left-[18%] top-[4%] -ml-[39vh] h-[78vh] w-[78vh] rounded-full bg-[radial-gradient(circle,rgba(79,134,255,0.26),transparent_62%)] blur-3xl" />
        <div
          className="wv-vr-drift absolute right-[8%] top-[20%] -mr-[16vh] h-[64vh] w-[64vh] rounded-full bg-[radial-gradient(circle,rgba(255,20,147,0.20),transparent_62%)] blur-3xl"
          style={{ animationDelay: '-11s' }}
        />
        {/* The key light over the stage — the room has a source. */}
        <div className="absolute left-1/2 top-[-16%] -ml-[43vw] h-[52vh] w-[86vw] bg-[radial-gradient(ellipse_at_top,rgba(190,215,255,0.16),transparent_70%)] blur-2xl sm:-ml-[31vw] sm:w-[62vw]" />
        {/* The floor. A horizon line and a pool of reflected light under it. */}
        <div className="absolute inset-x-0 bottom-0 h-[46%] bg-[linear-gradient(to_bottom,transparent,rgba(12,18,38,0.55)_38%,rgba(6,9,20,0.92))]" />
        <div className="absolute inset-x-0 bottom-[30%] h-px bg-[linear-gradient(to_right,transparent,rgba(150,180,255,0.22)_28%,rgba(255,120,190,0.18)_62%,transparent)]" />
      </div>

      {/* ── PLANE 1 · THE VERDICT BOARD, FURTHEST BACK ───────────────────
          Stage five, seen from the door. The shape of a finished session: one
          title carried, everyone's score for it as a row of bars, and the
          titles the room struck out. Heavily blurred and small — you are meant
          to recognise the SHAPE of a result, never to read one.

          DESKTOP ONLY, and not out of laziness: below `lg` the band of screen
          that is free above the foreground is exactly deep enough for the
          stage, and stacking a second object into it produced two half-hidden
          things instead of one whole one. */}
      <div
        className="absolute right-[7%] top-[3%] hidden w-[min(340px,26%)] opacity-[0.82] blur-[2.2px] lg:block"
        style={{ ...shift(PARALLAX.board), perspective: '1000px' }}
      >
        <VerdictBoard />
      </div>

      {/* ── PLANE 2 · HOW FAR THE ROOM HAS GOT ───────────────────────────
          The five stages as a rail, between the board and the stage.

          Stage two — "set tonight" — is the one stage with no object of its
          own here, and deliberately: its real UI is a set of answer chips, and
          a set of BLANK answer chips behind glass is indistinguishable from a
          screen that has not finished loading. It is carried by its node on
          this rail instead of by a shape that would undo the point of the
          whole pass. */}
      <div className="absolute inset-0 hidden md:block" style={shift(PARALLAX.rail)}>
        <StageProgression />
      </div>

      {/* ── PLANE 3 · THE STAGE ──────────────────────────────────────────
          Stage three, then stage four resolving into stage five, stacked in
          the order the room actually moves through them: the shortlist, the
          gavel, the keys. Three nominated titles — one struck out, one still
          contending, one leading and lit. The room has leaned, which is the
          single most legible thing in the whole picture.

          It shifts RIGHT from `lg`, because from `lg` the foreground splits
          into two columns and the left one holds the identity: the stage
          plays in the space the copy leaves, rather than under it. */}
      <div
        className="absolute inset-x-0 top-[14%] sm:top-[7%] lg:left-[15%] lg:top-[8%]"
        style={shift(PARALLAX.stage)}
      >
        {/* The whole shortlist fits on a phone rather than two of it hanging
            off the edges as slivers: at 390 the three plates measure 351px
            across, so the struck one and the contender both read. */}
        <div className="flex items-center justify-center gap-[2vw] sm:gap-[2.5vw]">
          <PosterPlate art="tide" place="left" />
          <PosterPlate art="ember" place="centre" />
          <PosterPlate art="dusk" place="right" struck />
        </div>
        <DecisionMoment />
        {/* THE RAIL, NEAREST. VotingFloor's own three keys, the veto
            allowance, and how far the room has swung — at the front of the
            space, sharpest, and the fastest thing to move. It rides the stage
            plane and adds the DIFFERENCE up to the near rate, because nested
            transforms compose. */}
        <div
          className="mt-5 hidden justify-end pr-[4%] sm:flex lg:mt-6 lg:justify-center lg:pr-0"
          style={shift(PARALLAX.near - PARALLAX.stage)}
        >
          <VoteRail />
        </div>
      </div>

      {/* ── PLANE 3b · THE PEOPLE ────────────────────────────────────────
          Stage one, and stage four as it happens. `ready` and the reaction
          each participant just cast are real fields on `State.participants`;
          a room part-way through, waiting on somebody, is the normal state of
          this screen. They are unnamed silhouettes because at the door there
          is nobody in the room to name.

          Two arrangements rather than one with things hidden: a phone's free
          band is a different shape from a desktop's, and a seat placed for one
          lands on the copy in the other. */}
      <div className="absolute inset-0" style={shift(PARALLAX.stage + 5)}>
        <div className="absolute inset-0 lg:hidden">
          {SEATS_NEAR.map((s) => (
            <Seat key={s.id} {...s} />
          ))}
        </div>
        <div className="absolute inset-0 hidden lg:block">
          {SEATS_WIDE.map((s) => (
            <Seat key={s.id} {...s} />
          ))}
        </div>
      </div>

      {/* ── THE GLASS ────────────────────────────────────────────────────
          What actually puts the room BEHIND something. A vertical scrim that
          deepens toward the foreground copy, plus a left-weighted wash so the
          identity and the CTA always land on their own darkness rather than
          on a poster edge. The mobile pair is stronger at top and bottom and
          deliberately thinner through the middle, because the middle is the
          only band a phone has to show the room in. */}
      <div className="absolute inset-0 bg-[linear-gradient(to_bottom,rgba(4,6,12,0.72),rgba(4,6,12,0.16)_36%,rgba(4,6,12,0.52)_64%,rgba(4,6,12,0.92))] sm:bg-[linear-gradient(to_bottom,rgba(4,6,12,0.55),rgba(4,6,12,0.10)_40%,rgba(4,6,12,0.74))]" />
      <div className="absolute inset-0 sm:bg-[linear-gradient(to_right,rgba(4,6,12,0.86),rgba(4,6,12,0.32)_40%,transparent_68%)] lg:bg-[linear-gradient(to_right,rgba(4,6,12,0.84),rgba(4,6,12,0.26)_30%,transparent_54%)]" />
      {/* A vignette, so the composition ends rather than being cut off. Kept
          light: at 0.72 it swallowed the verdict board, which sits high in
          the frame where the falloff is strongest. */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_52%,rgba(3,5,11,0.5))]" />
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
   THE VERDICT BOARD — stage five
   ──────────────────────────────────────────────────────────────────────── */

/**
 * How a finished room looks from twenty feet away: the title it carried, a
 * row of per-member scores under it, and the ones it struck out. The winner
 * tile is a ghost — lit and shaped like a result, carrying no result.
 */
function VerdictBoard() {
  return (
    <div
      className="rounded-2xl border border-white/[0.16] bg-[linear-gradient(160deg,rgba(28,36,64,0.88),rgba(9,12,26,0.8))] p-4 shadow-[0_50px_140px_-30px_rgba(0,0,0,0.95),inset_0_1px_0_rgba(255,255,255,0.14)] backdrop-blur-md"
      style={{ transform: 'rotateX(15deg)' }}
    >
      {/* The verdict header: the gavel mark and the room's title bar. */}
      <div className="mb-3 flex items-center gap-2">
        <span className="grid h-5 w-5 place-items-center rounded-md bg-[linear-gradient(140deg,rgba(255,20,147,0.95),rgba(124,58,237,0.85))]">
          <GavelGlyph size={11} />
        </span>
        <span className="h-1.5 w-20 rounded-full bg-white/55" />
        <span className="ml-auto h-1.5 w-10 rounded-full bg-white/22" />
      </div>

      {/* THE CARRIED TITLE. Poster ghost, two title bars, and everyone's
          score for it as a small histogram — the real shape of the reveal. */}
      <div className="flex items-stretch gap-3 rounded-xl border border-emerald-300/35 bg-emerald-400/[0.10] p-2.5">
        {/* `relative` is load-bearing: PosterArt is `absolute inset-0`, and
            without a positioned parent it escapes and paints the whole board. */}
        <span
          data-testid="shadow-board-thumb"
          className="relative h-[52px] w-9 flex-none overflow-hidden rounded-md border border-white/20"
        >
          <PosterArt art="ember" muted />
        </span>
        <span className="flex flex-1 flex-col justify-center gap-2">
          <span className="block h-2.5 w-[62%] rounded-full bg-white/70" />
          <span className="block h-2 w-[38%] rounded-full bg-white/30" />
        </span>
        <span className="flex flex-none items-end gap-1 pb-0.5">
          {[16, 26, 21, 30, 24].map((h, i) => (
            <span
              key={i}
              className="w-1.5 rounded-sm bg-[linear-gradient(to_top,rgba(52,211,153,0.45),rgba(110,255,205,0.95))]"
              style={{ height: h }}
            />
          ))}
        </span>
      </div>

      {/* WHAT THE ROOM STRUCK OUT. Real vocabulary: a veto removes a title
          for everyone, and the board keeps showing it, crossed. */}
      {[0, 1].map((row) => (
        <div key={row} className="mt-2 flex items-center gap-3 opacity-80">
          <span className="h-6 w-4 flex-none rounded-[3px] border border-white/16 bg-white/[0.08]" />
          <span className="relative h-2 flex-1" style={{ maxWidth: `${58 - row * 14}%` }}>
            <span className="absolute inset-0 rounded-full bg-white/28" />
            <span className="absolute inset-x-0 top-1/2 h-[1.5px] -translate-y-1/2 bg-red-300/85" />
          </span>
          <span className="ml-auto h-4 w-4 flex-none rounded-full border border-red-400/45 bg-red-500/20" />
        </div>
      ))}
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
   THE PROGRESSION — all five stages, as a rail
   ──────────────────────────────────────────────────────────────────────── */

/**
 * The five stages as a rail on the right edge — JOIN, SET TONIGHT, SHORTLIST,
 * REACT, VERDICT. No labels: it is atmosphere, and blurred words behind glass
 * are the visual signature of a mock-up. The lit node is the fourth, which is
 * exactly where the rest of this composition is standing.
 */
function StageProgression() {
  return (
    <div className="absolute right-[3.5%] top-[24%] flex flex-col items-center gap-0 opacity-70 blur-[0.6px] lg:right-[4%]">
      {[0, 1, 2, 3, 4].map((i) => (
        <span key={i} className="flex flex-col items-center">
          {i > 0 && (
            <span className={`h-9 w-px ${i <= 3 ? 'bg-white/25' : 'bg-white/8'}`} />
          )}
          <span
            className={`grid place-items-center rounded-full ${
              i === 3
                ? 'wv-vr-pulse h-3.5 w-3.5 bg-[radial-gradient(circle,rgba(255,90,180,0.95),rgba(255,20,147,0.25))] shadow-[0_0_18px_rgba(255,20,147,0.6)]'
                : i < 3
                  ? 'h-2 w-2 bg-white/45'
                  : 'h-2 w-2 border border-white/25 bg-transparent'
            }`}
          />
        </span>
      ))}
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
   THE STAGE — stage three, and the moment it resolves
   ──────────────────────────────────────────────────────────────────────── */

/**
 * A nominated title standing on the stage. It is poster-shaped, poster-lit and
 * — the point of this pass — poster-ARTED: the illustration inside is drawn
 * here, so the plate reads as a piece of cinema rather than as a rectangle
 * still waiting for its image. The leading plate is nearest, sharpest and lit;
 * the flanks are further back, turned away and dimmer; the struck one carries
 * the room's veto.
 */
function PosterPlate({
  art,
  place,
  struck = false,
}: {
  art: ArtKey;
  place: 'left' | 'centre' | 'right';
  struck?: boolean;
}) {
  // Each plate carries its OWN `perspective()` inside its transform, so the
  // projection origin is the plate's own centre and `translateZ` only pushes
  // it back. A `perspective` on the shared parent would project every plate
  // from the CONTAINER's centre instead, sliding the flanks outward until they
  // hung off the edges of a phone — which is exactly what it did.
  const centre = place === 'centre';
  const depth =
    place === 'centre'
      ? { rotate: -4, scale: 1, blur: 0.5, bright: 1, z: 0 }
      : place === 'left'
        ? { rotate: 24, scale: 0.9, blur: 1.9, bright: 0.86, z: -90 }
        : { rotate: -24, scale: 0.84, blur: 2.4, bright: 0.74, z: -130 };

  return (
    <div
      data-testid="shadow-poster"
      className={`relative flex-none overflow-hidden rounded-2xl border ${
        centre
          ? 'w-[38vw] max-w-[186px] border-white/[0.3] sm:w-[24vw] sm:max-w-[250px] lg:w-[17vw] lg:max-w-[238px]'
          : 'w-[30vw] max-w-[146px] border-white/[0.12] sm:w-[18vw] sm:max-w-[194px] lg:w-[13vw] lg:max-w-[184px]'
      }`}
      style={{
        aspectRatio: '2 / 3',
        // ORDER MATTERS, and getting it wrong is invisible in code review:
        // with `rotateY` first, `translateZ` runs in the ROTATED frame and
        // gains a sideways component of z·sin(θ) — which slid the flanks
        // 50–70px outward until, on a phone, they hung off both edges as
        // slivers. Depth first, then turn.
        transform: `perspective(1400px) translateZ(${depth.z}px) rotateY(${depth.rotate}deg) scale(${depth.scale})`,
        filter: `blur(${depth.blur}px) brightness(${depth.bright})`,
        boxShadow: centre
          ? '0 70px 170px -45px rgba(79,134,255,0.8), 0 0 90px -20px rgba(255,20,147,0.35), inset 0 1px 0 rgba(255,255,255,0.22)'
          : '0 50px 120px -50px rgba(0,0,0,0.95), inset 0 1px 0 rgba(255,255,255,0.08)',
      }}
    >
      <PosterArt art={art} />

      {/* The card furniture every real poster card carries: a gradient foot,
          a title block and — on the leading plate only — the room's running
          reaction on it. Bars, never words. */}
      <span className="absolute inset-x-0 bottom-0 h-1/2 bg-[linear-gradient(to_top,rgba(4,6,14,0.94),rgba(4,6,14,0.55)_42%,transparent)]" />
      <span className={`absolute inset-x-0 bottom-0 space-y-2 ${centre ? 'p-4' : 'p-3'}`}>
        <span className="block h-2.5 w-[78%] rounded-full bg-white/55" />
        <span className="block h-2 w-[46%] rounded-full bg-white/22" />
        {centre && (
          <span className="flex items-center gap-1.5 pt-1.5">
            {[0, 1, 2, 3, 4].map((i) => (
              <span
                key={i}
                className={`h-1.5 flex-1 rounded-full ${
                  i < 3 ? 'bg-emerald-300/75' : i === 3 ? 'bg-amber-300/50' : 'bg-white/14'
                }`}
              />
            ))}
          </span>
        )}
      </span>

      {/* Winner-side energy crossing the leading plate. */}
      {centre && (
        <span className="wv-vr-sheen absolute inset-0 overflow-hidden rounded-2xl">
          <span className="absolute inset-y-0 -left-1/3 w-1/3 bg-gradient-to-r from-transparent via-white/[0.14] to-transparent" />
        </span>
      )}

      {/* A vetoed title stays on the board, crossed out, for everyone. */}
      {struck && (
        <>
          <span className="absolute inset-0 bg-[rgba(52,8,18,0.5)]" />
          <span className="absolute left-[-12%] top-1/2 h-[3px] w-[124%] origin-center -rotate-[26deg] bg-red-300/85 shadow-[0_0_16px_rgba(248,113,113,0.8)]" />
        </>
      )}
    </div>
  );
}

/**
 * THE MOMENT OF DECISION — where stage four becomes stage five.
 *
 * A gavel inside a ring that is most of the way round: the room converging.
 * The arc is a fixed, decorative fraction, not a count of anything; there is
 * nobody in the room yet to count.
 */
function DecisionMoment() {
  return (
    <div data-testid="shadow-decision" className="relative -mt-14 flex justify-center sm:-mt-10">
      {/* Centred with margins, not translate: `wv-vr-pulse` animates
          `transform`, which would win and knock the glow off the gavel. */}
      <span className="wv-vr-pulse absolute left-1/2 top-1/2 -ml-[88px] -mt-[88px] h-44 w-44 rounded-full bg-[radial-gradient(circle,rgba(255,20,147,0.34),transparent_66%)] blur-2xl" />
      <span className="relative grid h-16 w-16 place-items-center rounded-full border border-white/18 bg-[rgba(10,13,26,0.62)] backdrop-blur-md sm:h-[76px] sm:w-[76px]">
        <svg
          viewBox="0 0 100 100"
          className="absolute inset-0 h-full w-full -rotate-90"
          fill="none"
          focusable="false"
          aria-hidden
        >
          <defs>
            <linearGradient id="wv-vr-arc" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#4f86ff" />
              <stop offset="60%" stopColor="#a855f7" />
              <stop offset="100%" stopColor="#ff1493" />
            </linearGradient>
          </defs>
          <circle cx="50" cy="50" r="44" stroke="rgba(255,255,255,0.10)" strokeWidth="3" />
          <circle
            cx="50"
            cy="50"
            r="44"
            stroke="url(#wv-vr-arc)"
            strokeWidth="3.5"
            strokeLinecap="round"
            strokeDasharray="276"
            strokeDashoffset="74"
          />
        </svg>
        <GavelGlyph size={26} />
      </span>
    </div>
  );
}

/** The mark the verdict lands with. Drawn, so it renders identically anywhere. */
function GavelGlyph({ size = 24 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      focusable="false"
      aria-hidden
      className="relative text-white/85"
    >
      <rect
        x="12.6"
        y="2.6"
        width="8.4"
        height="5.2"
        rx="1.5"
        transform="rotate(45 12.6 2.6)"
        fill="currentColor"
        opacity="0.92"
      />
      <path d="M10.6 9.4 4.2 15.8a2 2 0 1 0 2.8 2.8l6.4-6.4" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" opacity="0.75" />
      <path d="M13.6 19.9h7.6" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" opacity="0.5" />
    </svg>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
   THE POSTER ARTWORK
   ──────────────────────────────────────────────────────────────────────── */

type ArtKey = 'ember' | 'tide' | 'dusk';

/**
 * THREE ORIGINAL POSTER COMPOSITIONS.
 *
 * These are drawn here rather than fetched, and they depict nothing that
 * exists: a figure under a low sun, a figure in the rain under a lit sign, a
 * figure in a doorway. That is deliberate on two counts. They cannot be
 * mistaken for a claim about a real title, and they give the plates the one
 * thing a gradient rectangle can never have — a subject. A blank plate reads
 * as a skeleton loader; a plate with a horizon and a person standing on it
 * reads as a poster.
 */
function PosterArt({ art, muted = false }: { art: ArtKey; muted?: boolean }) {
  const id = `wv-art-${art}${muted ? '-m' : ''}`;
  return (
    <svg
      viewBox="0 0 200 300"
      preserveAspectRatio="xMidYMid slice"
      className="absolute inset-0 h-full w-full"
      focusable="false"
      aria-hidden
      style={muted ? { opacity: 0.9 } : undefined}
    >
      <defs>
        <linearGradient id={`${id}-sky`} x1="0" y1="0" x2="0" y2="1">
          {art === 'ember' && (
            <>
              <stop offset="0%" stopColor="#2a1430" />
              <stop offset="46%" stopColor="#7a2f3c" />
              <stop offset="72%" stopColor="#d9762f" />
              <stop offset="100%" stopColor="#160c18" />
            </>
          )}
          {art === 'tide' && (
            <>
              <stop offset="0%" stopColor="#071a33" />
              <stop offset="42%" stopColor="#1d5c92" />
              <stop offset="56%" stopColor="#5fb6e0" />
              <stop offset="100%" stopColor="#061428" />
            </>
          )}
          {art === 'dusk' && (
            <>
              <stop offset="0%" stopColor="#14102a" />
              <stop offset="58%" stopColor="#2b1f52" />
              <stop offset="100%" stopColor="#070512" />
            </>
          )}
        </linearGradient>
        <radialGradient id={`${id}-glow`} cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#ffd9a3" stopOpacity="0.95" />
          <stop offset="100%" stopColor="#ff8a3d" stopOpacity="0" />
        </radialGradient>
        <linearGradient id={`${id}-wet`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#9fe0ff" stopOpacity="0.32" />
          <stop offset="100%" stopColor="#9fe0ff" stopOpacity="0" />
        </linearGradient>
      </defs>

      <rect width="200" height="300" fill={`url(#${id}-sky)`} />

      {art === 'ember' && (
        <>
          {/* A low sun, a ridge, and one figure walking out of frame. */}
          <circle cx="118" cy="176" r="54" fill={`url(#${id}-glow)`} />
          <circle cx="118" cy="176" r="27" fill="#ffcf8a" opacity="0.92" />
          <path d="M0 206 44 182 82 200 124 170 164 194 200 176v124H0z" fill="#180d16" />
          <path d="M0 232 52 214 96 230 148 206 200 224v76H0z" fill="#0b0610" />
          <g fill="#050308">
            <ellipse cx="86" cy="222" rx="4.4" ry="5" />
            <rect x="83.6" y="226" width="4.8" height="15" rx="2" />
            <path d="M83.8 240 79 254h3.6l3.6-9 3.6 9h3.6l-4.8-14z" />
          </g>
          <path d="M0 258h200v42H0z" fill="#04030a" opacity="0.55" />
        </>
      )}

      {art === 'tide' && (
        <>
          {/* A city on the far bank at night, rain, and one figure on the wet
              street with the light coming back up at them. */}
          <g fill="#0a2f52" opacity="0.95">
            <rect x="4" y="96" width="20" height="62" />
            <rect x="28" y="112" width="14" height="46" />
            <rect x="48" y="82" width="24" height="76" />
            <rect x="126" y="88" width="22" height="70" />
            <rect x="152" y="106" width="16" height="52" />
            <rect x="172" y="94" width="24" height="64" />
          </g>
          <g fill="#9fe0ff" opacity="0.55">
            {[
              [8, 104], [16, 118], [8, 132], [32, 120], [36, 136],
              [54, 92], [62, 106], [54, 120], [64, 134],
              [130, 96], [140, 110], [132, 124], [158, 114], [178, 102], [188, 118],
            ].map(([x, y], i) => (
              <rect key={i} x={x} y={y} width="4" height="6" rx="1" />
            ))}
          </g>
          {/* The horizon: the far bank's light, and the water taking it. */}
          <rect x="0" y="150" width="200" height="18" fill="#8fd8ff" opacity="0.42" />
          <rect x="0" y="152" width="200" height="5" fill="#eafaff" opacity="0.75" />
          <g stroke="#d6ecff" strokeWidth="1.1" opacity="0.3">
            {Array.from({ length: 26 }).map((_, i) => {
              const x = (i * 37) % 214;
              const y = (i * 53) % 158;
              return <line key={i} x1={x} y1={y} x2={x - 10} y2={y + 30} />;
            })}
          </g>
          {/* Wet ground, with the far light running back along it. */}
          <path d="M0 168h200v132H0z" fill="#071a2e" />
          <path d="M0 168h200v132H0z" fill={`url(#${id}-wet)`} />
          <g fill="#020a15">
            <ellipse cx="104" cy="146" rx="5.4" ry="6" />
            <path d="M95.5 153h17l4.5 34H91z" />
            <rect x="98.5" y="187" width="5" height="21" rx="2.4" />
            <rect x="105" y="187" width="5" height="21" rx="2.4" />
          </g>
          {/* Rim light down one side of the figure, and its reflection. */}
          <path d="M112.5 153h1.8l4.2 34h-2.4z" fill="#bfe9ff" opacity="0.5" />
          <path d="M94 210h22l-5 46h-12z" fill="#8fd8ff" opacity="0.2" />
          <rect x="0" y="228" width="200" height="72" fill="#03080f" opacity="0.62" />
        </>
      )}

      {art === 'dusk' && (
        <>
          {/* A doorway of light in a dark interior; a figure about to step in. */}
          <rect x="0" y="0" width="200" height="300" fill="#0a0718" opacity="0.5" />
          <rect x="66" y="70" width="72" height="150" rx="3" fill="#f0d7ff" opacity="0.16" />
          <rect x="74" y="80" width="56" height="132" rx="2" fill="#e9c9ff" opacity="0.34" />
          <path d="M74 212h56l34 88H40z" fill="#e9c9ff" opacity="0.12" />
          <g fill="#05030d">
            <ellipse cx="102" cy="126" rx="7" ry="7.8" />
            <path d="M91 136h22l6 48H85z" />
            <rect x="95" y="184" width="6" height="28" rx="3" />
            <rect x="104" y="184" width="6" height="28" rx="3" />
          </g>
          <defs>
            <radialGradient id={`${id}-vig`} cx="50%" cy="45%" r="62%">
              <stop offset="55%" stopColor="#000" stopOpacity="0" />
              <stop offset="100%" stopColor="#000" stopOpacity="0.75" />
            </radialGradient>
          </defs>
          <rect x="0" y="0" width="200" height="300" fill={`url(#${id}-vig)`} />
        </>
      )}

      {/* A cool tint over everything, so all three plates sit in the SAME
          light. Without it each illustration carries its own white point and
          they read as three stickers rather than three posters on one wall. */}
      <rect width="200" height="300" fill="#0a1020" opacity="0.14" />
    </svg>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
   THE PEOPLE — stage one, reacting through stage four
   ──────────────────────────────────────────────────────────────────────── */

type SeatState = 'reacting-yes' | 'reacting-no' | 'ready' | 'thinking';

type SeatSpec = {
  id: string;
  left: string;
  top: string;
  size: number;
  state: SeatState;
  /** Depth cue: how far back the seat stands. */
  back?: boolean;
};

/**
 * A phone and a tablet: three people, out at the edges of the one band of
 * screen the foreground leaves open, and small enough to sit beside the stage
 * rather than on it.
 */
const SEATS_NEAR: SeatSpec[] = [
  { id: 'a', left: '1%', top: '31%', size: 44, state: 'reacting-yes' },
  { id: 'b', left: '87%', top: '16%', size: 38, state: 'ready' },
  { id: 'c', left: '80%', top: '38%', size: 28, state: 'thinking', back: true },
];

/**
 * A desktop: six, arranged around the stage at four different depths, in the
 * space the two foreground columns leave between and above them.
 */
const SEATS_WIDE: SeatSpec[] = [
  { id: 'a', left: '46%', top: '52%', size: 58, state: 'reacting-yes' },
  { id: 'b', left: '88%', top: '30%', size: 48, state: 'ready' },
  { id: 'c', left: '78%', top: '56%', size: 38, state: 'thinking', back: true },
  { id: 'd', left: '33%', top: '19%', size: 44, state: 'reacting-no' },
  { id: 'e', left: '95%', top: '13%', size: 30, state: 'thinking', back: true },
  { id: 'f', left: '63%', top: '69%', size: 42, state: 'ready', back: true },
];

/**
 * A participant. The upgrade from the previous pass is not decoration: a dot
 * is a placeholder, whereas a head and a pair of shoulders is a person, and
 * the difference is what separates a wireframe from a room. They stay
 * anonymous — no name, no initial, no face — because at the entrance the room
 * has no members yet.
 */
function Seat({ left, top, size, state, back = false }: Omit<SeatSpec, 'id'>) {
  const ring =
    state === 'reacting-yes'
      ? 'border-emerald-300/55'
      : state === 'reacting-no'
        ? 'border-red-300/45'
        : state === 'ready'
          ? 'border-white/20'
          : 'border-white/12';

  return (
    <span
      data-testid="shadow-seat"
      className="absolute"
      style={{
        left,
        top,
        width: size,
        height: size,
        filter: back ? 'blur(2.2px) brightness(0.6)' : 'blur(0.8px) brightness(0.92)',
        opacity: back ? 0.7 : 0.92,
      }}
    >
      <span
        className={`absolute inset-0 grid place-items-center overflow-hidden rounded-full border bg-[linear-gradient(160deg,rgba(255,255,255,0.13),rgba(255,255,255,0.03))] backdrop-blur-sm ${ring}`}
      >
        <svg viewBox="0 0 40 40" className="h-full w-full" focusable="false" aria-hidden>
          <circle cx="20" cy="15.5" r="6.4" fill="rgba(255,255,255,0.5)" />
          <path d="M6.5 40c1.8-8 7.2-12 13.5-12s11.7 4 13.5 12z" fill="rgba(255,255,255,0.42)" />
        </svg>
      </span>

      {/* WHAT THEY JUST DID. The three keys on a VotingFloor card are Watch
          it, Maybe and Veto; a reaction bubble is that key, coming back. */}
      {(state === 'reacting-yes' || state === 'reacting-no') && (
        <span
          data-testid="shadow-reaction"
          className={`wv-vr-react absolute -right-1 -top-1 grid place-items-center rounded-full border shadow-lg ${
            state === 'reacting-yes'
              ? 'border-emerald-300/70 bg-emerald-500/55'
              : 'border-red-300/70 bg-red-500/60'
          }`}
          style={{ width: Math.max(16, size * 0.36), height: Math.max(16, size * 0.36) }}
        >
          <svg viewBox="0 0 24 24" className="h-[62%] w-[62%]" fill="none" focusable="false" aria-hidden>
            {state === 'reacting-yes' ? (
              <path d="M5 12.5 10 17.5 19 7" stroke="rgba(255,255,255,0.95)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
            ) : (
              <path d="M6.5 6.5 17.5 17.5M17.5 6.5 6.5 17.5" stroke="rgba(255,255,255,0.95)" strokeWidth="3" strokeLinecap="round" />
            )}
          </svg>
        </span>
      )}

      {/* The room waiting on somebody: a soft outward pulse, not a spinner. */}
      {state === 'ready' && (
        <span className="wv-vr-ready absolute inset-0 rounded-full" />
      )}
    </span>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
   THE RAIL — stage four's controls, nearest the glass
   ──────────────────────────────────────────────────────────────────────── */

/**
 * VotingFloor's three keys — Watch it, Maybe, Veto — the veto allowance beside
 * them, and how far the room has swung. Glyphs rather than labels: blurred
 * text behind glass is the one thing that would make this read as a mock-up
 * instead of a room.
 */
function VoteRail() {
  return (
    <div className="flex flex-col items-center gap-3">
      <div className="flex items-center gap-2 rounded-2xl border border-white/[0.14] bg-[rgba(12,16,32,0.62)] px-3 py-2.5 shadow-[0_30px_70px_-30px_rgba(0,0,0,0.9)] backdrop-blur-md">
        <VoteKey tone="yes" />
        <VoteKey tone="maybe" />
        <VoteKey tone="no" />
        {/* The real veto allowance: two tokens per member. */}
        <span className="ml-1 flex items-center gap-1 rounded-full border border-red-400/30 bg-red-500/10 px-2.5 py-1.5">
          <span className="h-1.5 w-1.5 rounded-full bg-red-300/80" />
          <span className="h-1.5 w-1.5 rounded-full bg-red-300/30" />
        </span>
      </div>

      {/* WHERE THE ROOM SITS. A bar leaning to the leading side, with the
          seats under it — the same swing the lit plate is showing, felt at
          the front of the space. */}
      {/* Narrower than the key row above it on purpose: at 1280 a 300px bar
          reached back far enough to graze the CTA's caption. */}
      <div className="w-[min(260px,60vw)]">
        <span className="block h-1.5 overflow-hidden rounded-full bg-white/12">
          <span className="wv-vr-consensus block h-full rounded-full bg-[linear-gradient(to_right,rgba(52,211,153,0.9),rgba(125,211,252,0.75))]" />
        </span>
        <span className="mt-2 flex items-center justify-center gap-1.5">
          {[0, 1, 2, 3, 4].map((i) => (
            <span
              key={i}
              className={`h-1.5 rounded-full ${i < 3 ? 'w-6 bg-white/40' : 'w-4 bg-white/14'}`}
            />
          ))}
        </span>
      </div>
    </div>
  );
}

/** One key on the voting floor, drawn as light rather than as a word. */
function VoteKey({ tone }: { tone: 'yes' | 'maybe' | 'no' }) {
  const skin =
    tone === 'yes'
      ? 'border-emerald-400/45 bg-emerald-500/20 text-emerald-100'
      : tone === 'maybe'
        ? 'border-amber-400/40 bg-amber-500/16 text-amber-100'
        : 'border-red-400/40 bg-red-500/16 text-red-100';
  return (
    <span className={`grid h-9 w-[52px] place-items-center rounded-lg border ${skin} sm:w-[68px]`}>
      <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" focusable="false" aria-hidden>
        {tone === 'yes' && (
          <path d="M5 12.5 10 17.5 19 7" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
        )}
        {tone === 'maybe' && (
          <path d="M4 13c2.6-4 5.4-4 8 0s5.4 4 8 0" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" />
        )}
        {tone === 'no' && (
          <path d="M6.5 6.5 17.5 17.5M17.5 6.5 6.5 17.5" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" />
        )}
      </svg>
    </span>
  );
}
