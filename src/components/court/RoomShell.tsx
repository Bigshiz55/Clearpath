'use client';

/**
 * THE VERDICT ROOM, FROM THE INSIDE.
 *
 * ── WHAT THIS REPLACES ────────────────────────────────────────────────────
 * `CourtRoom`'s shell was `<main className="container-page max-w-2xl">` and
 * every stage inside it was `rounded-2xl border border-white/10 bg-white/[0.03]
 * p-4`. Five identical grey cards, stacked in a 672px column, on a black page.
 * The entrance was rebuilt into a room you walk into and then the door opened
 * onto a settings wizard — which is worse than never having built the entrance,
 * because it makes the entrance read as marketing.
 *
 * ── THE IDEA, AND WHY IT IS NOT JUST "MORE GRADIENT" ──────────────────────
 * At the door, the room is behind glass and out of focus, because you are not
 * in it yet. Inside, the SAME room is the ground you are standing on: the
 * atmosphere stays, the furniture goes, and the real controls take the place
 * the drawn ones held. The visual grammar carries — one key light, one floor,
 * one horizon, the same brand wash — while the content becomes real.
 *
 * So this deliberately does NOT reuse `ShadowRoom` wholesale. That component
 * draws illustrated posters, silhouetted people and a mocked-up verdict board,
 * and every one of those is a thing the interior has for real. Rendering the
 * drawing behind the real one would be a lie with a parallax effect on it.
 * What carries over is only PLANE 0 — light, floor, horizon — plus the stage
 * rail, which at the door was an illustration of progress and in here is the
 * genuine article, driven by `state.status`.
 *
 * ── LEGIBILITY IS THE CONSTRAINT, NOT ATMOSPHERE ──────────────────────────
 * The entrance can afford a bright room because the only thing on top of it is
 * a headline and two buttons. In here there are name fields, ballots, veto
 * counts and a verdict. So the interior atmosphere runs at roughly a third of
 * the entrance's intensity, every panel carries its own opaque-enough ground,
 * and the drift animations are longer and shallower. Atmosphere that costs
 * anyone a read of the veto count is not premium, it is broken.
 *
 * ── WHAT IT DOES NOT TOUCH ────────────────────────────────────────────────
 * The room engine. Stage transitions, scoring, veto rules, polling, sync and
 * every RPC are exactly as they were; this file renders around them and knows
 * only which of five stages is current, so it can light one node on a rail.
 */

import { useEffect, useRef, useState } from 'react';
import { WatchVerdictWordmark } from '@/components/WatchVerdictWordmark';

/** The five stages a session moves through, in order. */
export const ROOM_STAGES = ['join', 'tonight', 'shortlist', 'react', 'verdict'] as const;
export type RoomStageKey = (typeof ROOM_STAGES)[number];

const STAGE_LABEL: Record<RoomStageKey, string> = {
  join: 'Join',
  tonight: 'Set tonight',
  shortlist: 'Shortlist',
  react: 'React',
  verdict: 'Verd1ct',
};

/** Short enough for a 320px screen, where the full labels cannot all fit. */
const STAGE_SHORT: Record<RoomStageKey, string> = {
  join: 'Join',
  tonight: 'Tonight',
  shortlist: 'List',
  react: 'React',
  verdict: 'Verd1ct',
};

export interface RoomPerson {
  id: string;
  name: string;
  host?: boolean;
  /** Has this person finished what the current stage asks of them? */
  ready?: boolean;
}

/**
 * PLANE 0, AND ONLY PLANE 0.
 *
 * Two slow washes, a key light, a floor and a horizon — the same five elements
 * the entrance opens with, at a third of the strength. Pointer parallax is a
 * fine-pointer, full-motion affordance: a touch screen has no hover to answer
 * and under reduced motion the honest answer is a still image.
 *
 * `fixed` rather than `absolute`: the interior scrolls (a shortlist can be
 * long) and a room that scrolls away with the content is a background image.
 * The room stays where the room is.
 */
function RoomAtmosphere() {
  const ref = useRef<HTMLDivElement>(null);
  const [tilt, setTilt] = useState({ x: 0, y: 0 });

  useEffect(() => {
    const fine = window.matchMedia('(pointer: fine)');
    const still = window.matchMedia('(prefers-reduced-motion: reduce)');
    if (!fine.matches || still.matches) return;
    let frame = 0;
    const onMove = (e: PointerEvent) => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        setTilt({
          x: (e.clientX / Math.max(1, window.innerWidth) - 0.5) * 2,
          y: (e.clientY / Math.max(1, window.innerHeight) - 0.5) * 2,
        });
      });
    };
    window.addEventListener('pointermove', onMove, { passive: true });
    return () => {
      window.removeEventListener('pointermove', onMove);
      if (frame) cancelAnimationFrame(frame);
    };
  }, []);

  /* MARGINS, NOT `translate`, for anything centred that also moves. A Tailwind
     `-translate-x-1/2` and an inline transform are the same declaration and the
     later one wins outright — the bug that put the entrance's verdict board
     250px off its mark. Nothing here is centred with a translate utility. */
  const shift = (rate: number) => ({
    transform: `translate3d(${(-tilt.x * rate).toFixed(1)}px, ${(-tilt.y * rate * 0.5).toFixed(1)}px, 0)`,
  });

  return (
    <div
      ref={ref}
      aria-hidden
      data-testid="room-atmosphere"
      className="pointer-events-none fixed inset-0 -z-10 overflow-hidden"
    >
      {/* The ground the whole room stands on. Without this the panels sit on
          the app's flat near-black and the "room" is a claim the pixels do not
          support — measured against the first pass, where the atmosphere was so
          restrained it was indistinguishable from having none. */}
      <div className="absolute inset-0 bg-[radial-gradient(1100px_620px_at_78%_-12%,rgba(47,107,255,0.16),transparent),radial-gradient(900px_520px_at_-6%_4%,rgba(255,20,147,0.08),transparent)]" />
      <div className="absolute inset-0" style={shift(4)}>
        <div className="wv-room-drift absolute left-[16%] top-[-6%] -ml-[34vh] h-[68vh] w-[68vh] rounded-full bg-[radial-gradient(circle,rgba(79,134,255,0.2),transparent_64%)] blur-3xl" />
        <div
          className="wv-room-drift absolute right-[6%] top-[14%] -mr-[14vh] h-[56vh] w-[56vh] rounded-full bg-[radial-gradient(circle,rgba(255,20,147,0.14),transparent_64%)] blur-3xl"
          style={{ animationDelay: '-17s' }}
        />
        <div className="absolute left-1/2 top-[-14%] -ml-[43vw] h-[46vh] w-[86vw] bg-[radial-gradient(ellipse_at_top,rgba(190,215,255,0.13),transparent_70%)] blur-2xl sm:-ml-[31vw] sm:w-[62vw]" />
        {/* The floor. Without a ground plane the panels float in a void and the
            whole screen reads as a diagram rather than a place. */}
        <div className="absolute inset-x-0 bottom-0 h-[42%] bg-[linear-gradient(to_bottom,transparent,rgba(12,18,38,0.55)_40%,rgba(6,9,20,0.92))]" />
        <div className="absolute inset-x-0 bottom-[28%] h-px bg-[linear-gradient(to_right,transparent,rgba(150,180,255,0.2)_28%,rgba(255,120,190,0.16)_62%,transparent)]" />
      </div>
    </div>
  );
}

/**
 * WHERE THE ROOM HAS GOT TO.
 *
 * Five nodes, driven by the real `state.status` rather than by a counter this
 * component keeps — so it cannot drift from the room, and a late joiner who
 * arrives during REACT sees the room's actual position rather than the start.
 *
 * A LIST, NOT A ROW OF DIVS. Screen readers get an ordered list with the
 * current step marked `aria-current="step"` and the finished ones labelled, so
 * "where am I and what is left" is answerable without the visual.
 */
function StageRail({ stage }: { stage: RoomStageKey }) {
  const at = ROOM_STAGES.indexOf(stage);
  return (
    <nav aria-label="Room progress" data-testid="room-rail" className="min-w-0">
      <ol className="flex items-center gap-1 sm:gap-1.5">
        {ROOM_STAGES.map((s, i) => {
          const done = i < at;
          const now = i === at;
          return (
            /* THE CURRENT STAGE GETS MORE OF THE LINE. Five equal columns at
               320px truncate every label to "TONI…" / "VERD…"; giving the one
               you are standing in half again as much space means the label that
               actually matters is always readable, and the others degrade to
               hints — which is what they are. */
            <li
              key={s}
              className={`flex min-w-0 items-center gap-1 sm:gap-1.5 ${now ? 'flex-[1.6] sm:flex-1' : 'flex-1'}`}
            >
              <span
                data-testid="room-rail-node"
                data-stage={s}
                data-state={now ? 'current' : done ? 'done' : 'ahead'}
                {...(now ? { 'aria-current': 'step' as const } : {})}
                className={`flex min-w-0 flex-1 flex-col gap-1 rounded-md px-1 py-1 transition ${
                  now ? 'bg-white/[0.06]' : ''
                }`}
              >
                <span
                  aria-hidden
                  className={`h-[3px] w-full rounded-full transition-colors duration-500 ${
                    now
                      ? 'bg-gradient-to-r from-brand-300 to-fuchsia-300'
                      : done
                        ? 'bg-brand-400/45'
                        : 'bg-white/12'
                  }`}
                />
                <span
                  className={`truncate text-[9.5px] font-black uppercase tracking-[0.1em] transition-colors sm:text-[10px] sm:tracking-[0.14em] ${
                    now ? 'text-brand-100' : done ? 'text-slate-400' : 'text-slate-600'
                  }`}
                >
                  <span className="sm:hidden">{STAGE_SHORT[s]}</span>
                  <span className="hidden sm:inline">{STAGE_LABEL[s]}</span>
                  {done && <span className="sr-only"> (done)</span>}
                </span>
              </span>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

/**
 * WHO IS IN THE ROOM, VISIBLE FROM EVERY STAGE.
 *
 * Presence used to exist only on the JOIN screen and inside the lobby's group
 * panel, so from SHORTLIST onward the room silently emptied — you could be
 * four people deciding together and see no evidence of the other three. The
 * strip is real `participants` data, never a placeholder, and it renders
 * nothing at all when there is nobody but you.
 *
 * `ready` gets a ring rather than a tick: a tick reads as "correct", and
 * finishing your ballot is not a right answer.
 */
function PresenceStrip({ people }: { people: readonly RoomPerson[] }) {
  if (people.length === 0) return null;
  const shown = people.slice(0, 5);
  const extra = people.length - shown.length;
  return (
    <div data-testid="room-presence" className="flex items-center gap-1.5">
      <div className="flex -space-x-1.5">
        {shown.map((p) => (
          <span
            key={p.id}
            title={p.ready ? `${p.name} — ready` : p.name}
            data-testid="room-presence-face"
            data-ready={p.ready ? '1' : '0'}
            className={`grid h-7 w-7 place-items-center rounded-full border-2 border-ink-950 text-[11px] font-black uppercase ${
              p.host ? 'bg-gold-500/85 text-ink-950' : 'bg-brand-500/75 text-white'
            } ${p.ready ? 'ring-2 ring-emerald-400/70' : ''}`}
          >
            {p.name.trim().charAt(0) || '?'}
          </span>
        ))}
      </div>
      {extra > 0 && (
        <span className="text-[11px] font-bold text-slate-400">+{extra}</span>
      )}
      <span className="sr-only">
        {people.length} {people.length === 1 ? 'person' : 'people'} in the room
        {people.some((p) => p.ready) ? `, ${people.filter((p) => p.ready).length} ready` : ''}
      </span>
    </div>
  );
}

/**
 * A PLANE IN THE ROOM, not a card on a page.
 *
 * The difference is small in CSS and total in effect: a card announces its own
 * edges on every side, and five of them stacked read as a form. A plane is lit
 * from the top, sits on the floor, and lets the room show through — so the
 * eye reads one space containing several things rather than several things.
 *
 * `tone` is the only variant, and it exists because two moments in the room are
 * genuinely different in kind: `decisive` is where the room's verdict lands,
 * and `warn` is where something needs attention. Everything else is `default`.
 */
export function RoomPanel({
  children,
  className = '',
  tone = 'default',
  ...rest
}: {
  children: React.ReactNode;
  className?: string;
  tone?: 'default' | 'decisive' | 'warn';
} & React.HTMLAttributes<HTMLElement>) {
  const skin =
    tone === 'decisive'
      ? 'border-brand-400/30 bg-[linear-gradient(160deg,rgba(79,134,255,0.13),rgba(10,12,20,0.72))] shadow-[0_28px_70px_-40px_rgba(79,134,255,0.6)]'
      : tone === 'warn'
        ? 'border-amber-400/30 bg-[linear-gradient(160deg,rgba(255,190,90,0.12),rgba(14,11,8,0.72))]'
        : 'border-white/10 bg-[linear-gradient(160deg,rgba(255,255,255,0.055),rgba(8,10,18,0.66))]';
  return (
    <section
      {...rest}
      className={`relative overflow-hidden rounded-2xl border backdrop-blur-[2px] ${skin} ${className}`}
    >
      {/* The light falling on the top edge. One line, and it is what makes the
          panel read as lit rather than filled. */}
      <span
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-px bg-[linear-gradient(to_right,transparent,rgba(255,255,255,0.22),transparent)]"
      />
      {children}
    </section>
  );
}

/**
 * The room. Header, rail, presence, and the floor everything stands on.
 *
 * `wide` is the lobby's three-column desktop mode and is preserved exactly —
 * it was a real layout decision about a screen carrying three ≤640px columns,
 * and nothing here has a better opinion about it.
 */
export function RoomShell({
  children,
  stage,
  people = [],
  code,
  onChat,
  unread = 0,
  status,
  wide = false,
}: {
  children: React.ReactNode;
  stage: RoomStageKey;
  people?: readonly RoomPerson[];
  /** The room code, shown so the host can read it out without leaving. */
  code?: string;
  onChat?: () => void;
  unread?: number;
  /** The live/reconnecting chip, rendered by the caller — it owns the wording. */
  status?: React.ReactNode;
  wide?: boolean;
}) {
  return (
    <div className="relative min-h-dvh pb-24 sm:pb-10">
      <RoomAtmosphere />

      <header className="container-page pt-[calc(env(safe-area-inset-top)+1.5rem)]">
        <div className="flex min-h-14 flex-wrap items-center justify-between gap-x-3 gap-y-2">
          {/* AT 320 THE IDENTITY LINE OVERFLOWED BY 46px. Measured: wordmark +
              "Verdict Room" + the code chip came to 366px inside a 320px
              viewport, and `inline-flex` does not wrap. The label is the part
              that can go — the wordmark already says whose room this is and the
              page title carries the rest — so it stands down below `sm` and the
              code, which is the thing a host reads out loud, keeps its place. */}
          <span className="inline-flex min-w-0 flex-wrap items-baseline gap-x-1.5 gap-y-1 text-base">
            <WatchVerdictWordmark />
            <span className="hidden whitespace-nowrap font-semibold text-slate-400 sm:inline">Verdict Room</span>
            {code && (
              <span
                data-testid="room-code"
                className="ml-1 whitespace-nowrap rounded-md border border-white/12 bg-white/[0.05] px-1.5 py-0.5 font-mono text-[11px] font-bold tracking-[0.14em] text-slate-300"
              >
                {code}
              </span>
            )}
          </span>
          <span className="flex items-center gap-2">
            <PresenceStrip people={people} />
            {status}
            {onChat && (
              <button
                onClick={onChat}
                data-testid="open-chat"
                className={`relative min-h-[44px] rounded-xl border border-white/12 px-3 text-sm font-semibold text-slate-200 transition hover:bg-white/5 ${wide ? 'xl:hidden' : ''}`}
              >
                Group chat
                {unread > 0 && (
                  <span
                    data-testid="chat-unread"
                    className="absolute -right-1 -top-1 grid h-5 min-w-5 place-items-center rounded-full bg-brand-500 px-1 text-[10px] font-black text-white"
                  >
                    {unread}
                  </span>
                )}
              </button>
            )}
          </span>
        </div>

        {/* The rail sits under the identity rather than beside it: at 320px a
            five-node rail and a wordmark cannot share a line without one of
            them being unreadable, and the rail is the one that has to be read
            at a glance. */}
        <div className="mt-3 border-t border-white/[0.07] pt-2.5">
          <StageRail stage={stage} />
        </div>
      </header>

      <main
        className={`relative mx-auto w-full pb-6 pt-4 ${
          wide ? 'max-w-2xl px-4 sm:px-6 xl:max-w-[1760px]' : 'container-page max-w-3xl'
        }`}
      >
        {children}
      </main>
    </div>
  );
}
